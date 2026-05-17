// packages/cli/src/__tests__/daemon-worker.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendOutboxTask, outboxPaths } from "../daemon-outbox.js";
import { startWorker, type WorkerHandle } from "../daemon-worker.js";

let tmpHome: string;
let worker: WorkerHandle | null = null;

function setupTmp(): void {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "viki-worker-"));
  fs.mkdirSync(path.join(tmpHome, ".viki"), { recursive: true });
}

async function stopWorker(): Promise<void> {
  if (worker) {
    await worker.stop();
    worker = null;
  }
}

describe("daemon-worker", () => {
  beforeEach(setupTmp);
  // Always cleanup — without this an assertion failure leaves the worker
  // loop running, which makes vitest hang waiting for the test process to
  // exit naturally (the unref'd timer doesn't keep the event loop alive,
  // but the loop itself is a recurring Promise chain that does).
  afterEach(stopWorker);

  it("dispatches a task to its kind handler then advances cursor", async () => {
    const paths = outboxPaths(tmpHome);
    appendOutboxTask(paths, { kind: "test-echo", payload: { msg: "hello" } });
    let seenPayload: unknown = null;
    worker = startWorker({
      paths,
      handlers: {
        "test-echo": async (payload) => { seenPayload = payload; },
      },
      pollIntervalMs: 10,
    });
    worker.notify();
    await new Promise((r) => setTimeout(r, 100));
    expect(seenPayload).toEqual({ msg: "hello" });
    // Cursor advanced past the task
    const cursor = parseInt(fs.readFileSync(paths.cursor, "utf-8").trim(), 10);
    expect(cursor).toBeGreaterThan(0);
    await stopWorker();
  });

  it("DLQs a task whose kind has no handler", async () => {
    const paths = outboxPaths(tmpHome);
    appendOutboxTask(paths, { kind: "unknown-kind", payload: {} });
    worker = startWorker({
      paths,
      handlers: {}, // no handler for unknown-kind
      pollIntervalMs: 10,
    });
    worker.notify();
    await new Promise((r) => setTimeout(r, 100));
    const dlq = fs.readFileSync(paths.dlq, "utf-8");
    expect(dlq).toMatch(/unknown-kind/);
    expect(dlq).toMatch(/no-handler/);
    await stopWorker();
  });

  it("retries a failing handler up to 3 times, then DLQs", async () => {
    const paths = outboxPaths(tmpHome);
    appendOutboxTask(paths, { kind: "always-fail", payload: { n: 1 } });
    let attempts = 0;
    worker = startWorker({
      paths,
      handlers: {
        "always-fail": async () => {
          attempts++;
          throw new Error("boom");
        },
      },
      pollIntervalMs: 10,
    });
    worker.notify();
    await new Promise((r) => setTimeout(r, 200));
    expect(attempts).toBeGreaterThanOrEqual(3);
    const dlq = fs.readFileSync(paths.dlq, "utf-8");
    expect(dlq).toMatch(/always-fail/);
    expect(dlq).toMatch(/handler-threw/);
    await stopWorker();
  });

  it("drains a batch of N tasks in enqueue order", async () => {
    const paths = outboxPaths(tmpHome);
    const N = 5;
    for (let i = 0; i < N; i++) {
      appendOutboxTask(paths, { kind: "test-echo", payload: { i } });
    }
    const seen: number[] = [];
    worker = startWorker({
      paths,
      handlers: {
        "test-echo": async (payload) => { seen.push((payload as { i: number }).i); },
      },
      pollIntervalMs: 10,
    });
    worker.notify();
    await new Promise((r) => setTimeout(r, 200));
    expect(seen).toEqual([0, 1, 2, 3, 4]);
    await stopWorker();
  });

  it("stop() resolves only after the current task finishes", async () => {
    const paths = outboxPaths(tmpHome);
    appendOutboxTask(paths, { kind: "slow", payload: {} });
    let finished = false;
    worker = startWorker({
      paths,
      handlers: {
        "slow": async () => {
          await new Promise((r) => setTimeout(r, 50));
          finished = true;
        },
      },
      pollIntervalMs: 10,
    });
    worker.notify();
    await new Promise((r) => setTimeout(r, 10));
    await worker.stop();
    expect(finished).toBe(true);
    worker = null;
  });
});
