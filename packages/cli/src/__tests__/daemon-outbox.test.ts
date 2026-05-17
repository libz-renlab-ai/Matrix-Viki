// packages/cli/src/__tests__/daemon-outbox.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  appendOutboxTask,
  readNextOutboxTask,
  advanceOutboxCursor,
  moveTaskToDlq,
  outboxPaths,
  type OutboxTask,
} from "../daemon-outbox.js";

let tmpHome: string;
function setupTmp(): void {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "viki-outbox-"));
  fs.mkdirSync(path.join(tmpHome, ".viki"), { recursive: true });
}

describe("daemon-outbox", () => {
  beforeEach(setupTmp);

  it("appends a task with auto-generated id + v:1 + enqueued_at + attempts:0", () => {
    const paths = outboxPaths(tmpHome);
    appendOutboxTask(paths, { kind: "session-end", payload: { foo: 1 } });
    const raw = fs.readFileSync(paths.outbox, "utf-8");
    const line = raw.trim();
    const obj = JSON.parse(line);
    expect(obj.v).toBe(1);
    expect(obj.kind).toBe("session-end");
    expect(obj.payload).toEqual({ foo: 1 });
    expect(obj.attempts).toBe(0);
    expect(typeof obj.id).toBe("string");
    expect(obj.id.length).toBeGreaterThan(10);
    expect(typeof obj.enqueued_at).toBe("string");
    expect(new Date(obj.enqueued_at).getTime()).toBeGreaterThan(0);
  });

  it("readNextOutboxTask returns null on empty outbox", () => {
    const paths = outboxPaths(tmpHome);
    const next = readNextOutboxTask(paths);
    expect(next).toBeNull();
  });

  it("readNextOutboxTask returns the first unprocessed task and its byte range", () => {
    const paths = outboxPaths(tmpHome);
    appendOutboxTask(paths, { kind: "session-end", payload: { n: 1 } });
    appendOutboxTask(paths, { kind: "stop", payload: { n: 2 } });
    const next = readNextOutboxTask(paths);
    expect(next).not.toBeNull();
    expect(next!.task.kind).toBe("session-end");
    expect(next!.task.payload).toEqual({ n: 1 });
    expect(next!.nextCursor).toBeGreaterThan(0);
  });

  it("advanceOutboxCursor persists cursor; next read returns the second task", () => {
    const paths = outboxPaths(tmpHome);
    appendOutboxTask(paths, { kind: "session-end", payload: { n: 1 } });
    appendOutboxTask(paths, { kind: "stop", payload: { n: 2 } });
    const first = readNextOutboxTask(paths)!;
    advanceOutboxCursor(paths, first.nextCursor);
    const second = readNextOutboxTask(paths);
    expect(second).not.toBeNull();
    expect(second!.task.kind).toBe("stop");
    expect(second!.task.payload).toEqual({ n: 2 });
  });

  it("readNextOutboxTask returns null after draining all tasks", () => {
    const paths = outboxPaths(tmpHome);
    appendOutboxTask(paths, { kind: "session-end", payload: { n: 1 } });
    const first = readNextOutboxTask(paths)!;
    advanceOutboxCursor(paths, first.nextCursor);
    const next = readNextOutboxTask(paths);
    expect(next).toBeNull();
  });

  it("skips malformed lines (logs but advances past them)", () => {
    const paths = outboxPaths(tmpHome);
    // Write a deliberately malformed line, then a valid one
    fs.appendFileSync(paths.outbox, "not-json\n", "utf-8");
    appendOutboxTask(paths, { kind: "session-end", payload: { n: 1 } });
    const next = readNextOutboxTask(paths);
    // Implementation choice: skip + advance past malformed. The valid task wins.
    expect(next).not.toBeNull();
    expect(next!.task.kind).toBe("session-end");
    // The cursor returned should be PAST both lines
    expect(next!.nextCursor).toBeGreaterThan("not-json\n".length);
  });

  it("moveTaskToDlq appends to DLQ file with attempts annotation", () => {
    const paths = outboxPaths(tmpHome);
    const task: OutboxTask = {
      v: 1,
      id: "test-id",
      kind: "session-end",
      payload: { n: 1 },
      enqueued_at: new Date().toISOString(),
      attempts: 3,
    };
    moveTaskToDlq(paths, task, "handler-threw-3x");
    const raw = fs.readFileSync(paths.dlq, "utf-8");
    const obj = JSON.parse(raw.trim());
    expect(obj.id).toBe("test-id");
    expect(obj.dlq_reason).toBe("handler-threw-3x");
  });

  it("multi-writer safe: concurrent appendOutboxTask calls produce N readable lines", async () => {
    const paths = outboxPaths(tmpHome);
    const N = 20;
    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        Promise.resolve().then(() =>
          appendOutboxTask(paths, { kind: "session-end", payload: { n: i } }),
        ),
      ),
    );
    const raw = fs.readFileSync(paths.outbox, "utf-8");
    const lines = raw.split("\n").filter((s) => s.length > 0);
    expect(lines.length).toBe(N);
    // Every line parses as a valid task
    for (const line of lines) {
      const obj = JSON.parse(line);
      expect(obj.v).toBe(1);
    }
  });
});
