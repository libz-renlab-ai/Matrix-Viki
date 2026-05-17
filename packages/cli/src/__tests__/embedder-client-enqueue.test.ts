import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { enqueueToDaemon } from "../embedder-client.js";

let tmpHome: string;
let tmpStatePath: string;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "viki-enqueue-"));
  fs.mkdirSync(path.join(tmpHome, ".viki"), { recursive: true });
  // Point the state path at the tmp home so describeDaemonReadiness reads
  // a non-existent file and returns ready=false.
  tmpStatePath = path.join(tmpHome, ".viki", ".embedder-state.json");
});

describe("enqueueToDaemon", () => {
  it("falls back to local outbox when daemon state file is missing", async () => {
    const result = await enqueueToDaemon(
      { kind: "session-end", payload: { test: 1 } },
      { home: tmpHome, statePath: tmpStatePath },
    );
    expect(result.ok).toBe(true);
    expect(result.reason).toBe("local");
    const outboxPath = path.join(tmpHome, ".viki", "outbox.jsonl");
    const raw = fs.readFileSync(outboxPath, "utf-8");
    expect(raw).toMatch(/session-end/);
    expect(raw).toMatch(/"test":1/);
  });

  it("falls back to local outbox when daemon state says not-ready", async () => {
    // Write a state file claiming the daemon is in "starting" status
    fs.writeFileSync(
      tmpStatePath,
      JSON.stringify({
        status: "starting",
        pid: 99999,
        port: 0,
        started_at: new Date().toISOString(),
        model: "x",
        members: [],
      }),
    );
    const result = await enqueueToDaemon(
      { kind: "stop", payload: { x: 2 } },
      { home: tmpHome, statePath: tmpStatePath },
    );
    expect(result.ok).toBe(true);
    expect(result.reason).toBe("local");
  });

  it("returns ok:true reason:local when fallback writes succeed", async () => {
    const result = await enqueueToDaemon(
      { kind: "pre-compact", payload: {} },
      { home: tmpHome, statePath: tmpStatePath },
    );
    expect(result.ok).toBe(true);
    expect(result.id).toBeDefined();
    expect(result.reason).toBe("local");
  });
});
