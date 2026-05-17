# Stage 1: Daemon Outbox + Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add a persistent append-only outbox (`~/.viki/outbox.jsonl`) + an in-daemon worker loop that drains it. Surface `POST /enqueue` on the daemon, plus a client helper `enqueueToDaemon` for hooks to call. After this stage the daemon can accept "task envelopes" from hooks; stage 2 will swap the heavy hooks to use it.

**Architecture:** Three components, all in `packages/cli/src/`:
1. **`daemon-outbox.ts`** — pure file primitives: append, read-since-cursor, advance-cursor, dead-letter. No daemon coupling.
2. **`daemon-worker.ts`** — long-running loop in the daemon process: reads outbox, dispatches tasks to handler functions, advances cursor. Pluggable dispatch table.
3. **`bin-embedder.ts`** — add `/enqueue`, `/queue-status`, `/drain` HTTP routes; start the worker after `status=running`.
4. **`embedder-client.ts`** — add `enqueueToDaemon(task, opts)` client function. If daemon unreachable, append directly to `outbox.jsonl` so the next daemon to start can drain it.

**Critical invariants:**
- Multi-writer safe: any hook process can `appendFileSync` to `outbox.jsonl` with `O_APPEND`; Node's `fs.appendFileSync` is atomic at the OS level for small payloads.
- Cursor advances only AFTER task handler resolves successfully + side effects are flushed.
- Schema versioned: each entry includes `v: 1`; future versions can be migrated by the worker on read.
- DLQ: a task that fails 3 times moves to `outbox-dlq.jsonl` for human inspection; cursor advances past it.

**Tech Stack:** TypeScript, vitest, Node 20 `node:fs`, no new third-party deps.

---

## File Structure

- **Create** `packages/cli/src/daemon-outbox.ts` — outbox file primitives
- **Create** `packages/cli/src/__tests__/daemon-outbox.test.ts` — unit tests
- **Create** `packages/cli/src/daemon-worker.ts` — worker loop
- **Create** `packages/cli/src/__tests__/daemon-worker.test.ts` — unit tests
- **Modify** `packages/cli/src/bin-embedder.ts` — add 3 routes + start worker
- **Modify** `packages/cli/src/embedder-client.ts` — add `enqueueToDaemon`
- **Create** `packages/cli/src/__tests__/embedder-client-enqueue.test.ts` — client tests

---

## Task 1: Outbox file primitives

**Files:**
- Create: `packages/cli/src/daemon-outbox.ts`
- Create: `packages/cli/src/__tests__/daemon-outbox.test.ts`

The outbox is `~/.viki/outbox.jsonl`. Each line is a JSON object with shape:
```ts
{
  v: 1;                              // schema version
  id: string;                        // ulid
  kind: "session-end" | "stop" | "pre-compact" | "session-start" | "updater" | "ingest";
  payload: Record<string, unknown>;  // kind-specific
  enqueued_at: string;               // ISO 8601
  attempts: number;                  // 0 on first read; bumped on retry
}
```

Cursor file `~/.viki/outbox-cursor` holds the byte offset (UTF-8 byte position) of the next-to-process line.

DLQ file `~/.viki/outbox-dlq.jsonl` holds tasks that failed 3 attempts.

- [ ] **Step 1: Write the test file** (TDD — failing first)

```ts
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
```

- [ ] **Step 2: Run test to confirm failure**

Run: `npx vitest run daemon-outbox`
Expected: 8 tests fail with "Cannot find module ../daemon-outbox.js".

- [ ] **Step 3: Implement the module**

```ts
// packages/cli/src/daemon-outbox.ts
import fs from "node:fs";
import path from "node:path";
import { ulid } from "ulid";

export interface OutboxTask {
  readonly v: 1;
  readonly id: string;
  readonly kind: string;
  readonly payload: Record<string, unknown>;
  readonly enqueued_at: string;
  readonly attempts: number;
}

export interface OutboxPaths {
  readonly outbox: string;
  readonly cursor: string;
  readonly dlq: string;
}

export function outboxPaths(home: string): OutboxPaths {
  const dotViki = path.join(home, ".viki");
  return {
    outbox: path.join(dotViki, "outbox.jsonl"),
    cursor: path.join(dotViki, "outbox-cursor"),
    dlq: path.join(dotViki, "outbox-dlq.jsonl"),
  };
}

export interface AppendOpts {
  kind: string;
  payload: Record<string, unknown>;
}

/**
 * Append a new task. Multi-writer safe: relies on OS `O_APPEND` semantics
 * — Node's `fs.appendFileSync` is atomic for small writes on POSIX and
 * Win32. Each task is a single line of JSON terminated by `\n`.
 */
export function appendOutboxTask(paths: OutboxPaths, opts: AppendOpts): OutboxTask {
  const task: OutboxTask = {
    v: 1,
    id: ulid(),
    kind: opts.kind,
    payload: opts.payload,
    enqueued_at: new Date().toISOString(),
    attempts: 0,
  };
  fs.mkdirSync(path.dirname(paths.outbox), { recursive: true });
  fs.appendFileSync(paths.outbox, JSON.stringify(task) + "\n", "utf-8");
  return task;
}

function readCursorBytes(paths: OutboxPaths): number {
  try {
    const raw = fs.readFileSync(paths.cursor, "utf-8").trim();
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * Read the next unprocessed task starting from the cursor's byte offset.
 * Returns null if the outbox has no task past the cursor.
 *
 * Malformed lines are skipped (advancing the returned `nextCursor` past
 * them) — the caller is responsible for persisting the new cursor only
 * after the returned task is successfully processed.
 */
export function readNextOutboxTask(paths: OutboxPaths): { task: OutboxTask; nextCursor: number } | null {
  let buf: Buffer;
  try {
    buf = fs.readFileSync(paths.outbox);
  } catch {
    return null;
  }
  let cursor = readCursorBytes(paths);
  while (cursor < buf.length) {
    const nlIdx = buf.indexOf(0x0A, cursor);
    if (nlIdx === -1) return null; // partial last line — wait for completion
    const lineBuf = buf.subarray(cursor, nlIdx);
    const lineEnd = nlIdx + 1;
    const line = lineBuf.toString("utf-8");
    cursor = lineEnd;
    if (line.trim().length === 0) continue;
    try {
      const obj = JSON.parse(line) as OutboxTask;
      if (obj && typeof obj === "object" && obj.v === 1 && typeof obj.kind === "string") {
        return { task: obj, nextCursor: lineEnd };
      }
    } catch {
      // malformed — skip
    }
  }
  return null;
}

/** Persist the cursor (byte offset of next-to-process line). Atomic via tmp rename. */
export function advanceOutboxCursor(paths: OutboxPaths, nextCursor: number): void {
  fs.mkdirSync(path.dirname(paths.cursor), { recursive: true });
  const tmp = paths.cursor + ".tmp";
  fs.writeFileSync(tmp, String(nextCursor), "utf-8");
  fs.renameSync(tmp, paths.cursor);
}

/** Move a task to the DLQ for later inspection. The outbox cursor must still be advanced separately. */
export function moveTaskToDlq(paths: OutboxPaths, task: OutboxTask, reason: string): void {
  fs.mkdirSync(path.dirname(paths.dlq), { recursive: true });
  const entry = { ...task, dlq_reason: reason, dlq_at: new Date().toISOString() };
  fs.appendFileSync(paths.dlq, JSON.stringify(entry) + "\n", "utf-8");
}
```

- [ ] **Step 4: Run test to confirm pass**

Run: `npx vitest run daemon-outbox`
Expected: 8 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/daemon-outbox.ts packages/cli/src/__tests__/daemon-outbox.test.ts
git commit -m "feat(cli): daemon-outbox file primitives (append / read / cursor / DLQ)"
```

---

## Task 2: Worker loop

**Files:**
- Create: `packages/cli/src/daemon-worker.ts`
- Create: `packages/cli/src/__tests__/daemon-worker.test.ts`

The worker takes a dispatch table (handlers per kind), an outbox path bundle, and a `notify()` channel. On each iteration:
1. Read next task from outbox.
2. If null, sleep until notified or until 5s timeout (poll fallback).
3. If task found: look up handler by kind; if no handler, DLQ + advance.
4. Run handler with `task.payload`; on success advance cursor.
5. On error: re-append the task with `attempts + 1` and advance the cursor (the failed task becomes a new tail entry); when attempts ≥ 3, DLQ instead of re-append.

- [ ] **Step 1: Test file**

```ts
// packages/cli/src/__tests__/daemon-worker.test.ts
import { describe, it, expect, beforeEach } from "vitest";
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
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `npx vitest run daemon-worker`
Expected: 5 tests fail with module-not-found.

- [ ] **Step 3: Implement**

```ts
// packages/cli/src/daemon-worker.ts
import {
  type OutboxPaths,
  type OutboxTask,
  appendOutboxTask,
  readNextOutboxTask,
  advanceOutboxCursor,
  moveTaskToDlq,
} from "./daemon-outbox.js";

export type Handler = (payload: Record<string, unknown>) => Promise<unknown>;

export interface WorkerOpts {
  paths: OutboxPaths;
  handlers: Record<string, Handler>;
  /** Poll interval when no task is available + no notify pending. Default 1000ms. */
  pollIntervalMs?: number;
  /** Max attempts before DLQ. Default 3. */
  maxAttempts?: number;
  /** Hook for diagnostics — called whenever a task fails. */
  onFailure?: (task: OutboxTask, err: unknown) => void;
}

export interface WorkerHandle {
  notify(): void;
  stop(): Promise<void>;
}

const DEFAULT_POLL_MS = 1000;
const DEFAULT_MAX_ATTEMPTS = 3;

export function startWorker(opts: WorkerOpts): WorkerHandle {
  const pollMs = opts.pollIntervalMs ?? DEFAULT_POLL_MS;
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  let running = true;
  let notifyResolve: (() => void) | null = null;
  let currentTask: Promise<void> = Promise.resolve();

  const waitForNotifyOrPoll = (): Promise<void> => {
    return new Promise<void>((resolve) => {
      notifyResolve = resolve;
      const t = setTimeout(() => {
        notifyResolve = null;
        resolve();
      }, pollMs);
      // unref so the timer doesn't keep the daemon alive if it's exiting
      if ((t as { unref?: () => void }).unref) {
        (t as { unref: () => void }).unref();
      }
    });
  };

  const processOne = async (): Promise<boolean> => {
    const next = readNextOutboxTask(opts.paths);
    if (!next) return false;
    const { task, nextCursor } = next;
    const handler = opts.handlers[task.kind];
    if (!handler) {
      moveTaskToDlq(opts.paths, task, "no-handler");
      advanceOutboxCursor(opts.paths, nextCursor);
      return true;
    }
    try {
      await handler(task.payload);
      advanceOutboxCursor(opts.paths, nextCursor);
    } catch (err) {
      try { opts.onFailure?.(task, err); } catch { /* ignore */ }
      const nextAttempts = task.attempts + 1;
      if (nextAttempts >= maxAttempts) {
        moveTaskToDlq(opts.paths, { ...task, attempts: nextAttempts }, `handler-threw-${nextAttempts}x`);
      } else {
        // Re-append with bumped attempts; the original line stays in outbox but
        // is consumed by advancing the cursor.
        appendOutboxTask(opts.paths, { kind: task.kind, payload: { ...task.payload, __retry: { attempts: nextAttempts, last_id: task.id } } });
      }
      advanceOutboxCursor(opts.paths, nextCursor);
    }
    return true;
  };

  const loop = async (): Promise<void> => {
    while (running) {
      let progressed = false;
      try {
        progressed = await processOne();
      } catch {
        // Defensive — processOne should never throw to here
      }
      if (!progressed) {
        await waitForNotifyOrPoll();
      }
    }
  };

  currentTask = loop();

  return {
    notify(): void {
      if (notifyResolve) {
        const r = notifyResolve;
        notifyResolve = null;
        r();
      }
    },
    async stop(): Promise<void> {
      running = false;
      if (notifyResolve) {
        const r = notifyResolve;
        notifyResolve = null;
        r();
      }
      await currentTask;
    },
  };
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npx vitest run daemon-worker`
Expected: 5 passing.

The retry semantics note in the implementation: a failing handler causes the task to be **re-appended at the tail of the outbox** with `attempts+1`, and the original entry is consumed by advancing the cursor. This keeps the worker forward-progressing — it doesn't get stuck re-reading the same bad task. The new entry's `payload.__retry` field tracks history.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/daemon-worker.ts packages/cli/src/__tests__/daemon-worker.test.ts
git commit -m "feat(cli): daemon-worker loop with retry + DLQ semantics"
```

---

## Task 3: Add /enqueue + /queue-status + /drain HTTP routes

**Files:**
- Modify: `packages/cli/src/bin-embedder.ts`

After the daemon enters `status=running` (just after writing the running state file), start the worker. Initial dispatch table is empty (handlers will be added by stage 2 when thin-client hooks call /enqueue with their kinds). For stage 1, register a no-op handler for `"ping"` that just succeeds, so /enqueue is usable for tests.

- [ ] **Step 1: Read current bin-embedder.ts around the listen + run state write**

Read: `packages/cli/src/bin-embedder.ts:360-410`

- [ ] **Step 2: Add imports + worker startup + 3 routes**

In the imports section of `bin-embedder.ts`, add:
```ts
import { outboxPaths, appendOutboxTask } from "./daemon-outbox.js";
import { startWorker, type WorkerHandle, type Handler } from "./daemon-worker.js";
```

After the `status=running` write (around line 381), add:
```ts
// Start the outbox worker. Stage 1 registers no real handlers — the worker
// runs but does nothing useful until stage 2 swaps in handlers for
// "session-end" / "stop" / "pre-compact" / "session-start" / "updater"
// (the kinds that thin-client hooks will enqueue).
const home = rt.env?.VIKI_HOME ?? require("node:os").homedir();
const outPaths = outboxPaths(home);
const stageOneHandlers: Record<string, Handler> = {
  // Test seam — lets /enqueue + /drain be exercised by integration tests
  // before real handlers exist.
  "ping": async () => { /* no-op */ },
};
const worker = startWorker({
  paths: outPaths,
  handlers: stageOneHandlers,
  pollIntervalMs: 1_000,
});
process.stderr.write(`[embedder] outbox worker started\n`);
```

(Note: `rt` doesn't exist in bin-embedder.ts yet — it's a single-function file. We use `os.homedir()` directly + `process.env.VIKI_HOME` for override, matching the helper.)

In the HTTP request handler (currently around line 207-321), add three new route branches BEFORE the `res.statusCode = 404` fallthrough:

```ts
if (req.method === "POST" && req.url === "/enqueue") {
  if (exiting) {
    res.statusCode = 503;
    res.end("daemon exiting\n");
    return;
  }
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
      if (!body || typeof body !== "object" || typeof body.kind !== "string") {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "kind required" }));
        return;
      }
      const task = appendOutboxTask(outPaths, {
        kind: body.kind,
        payload: typeof body.payload === "object" && body.payload !== null
          ? body.payload as Record<string, unknown>
          : {},
      });
      worker.notify();
      res.statusCode = 202;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ id: task.id, enqueued_at: task.enqueued_at }));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  });
  req.on("error", () => { res.statusCode = 400; res.end(); });
  return;
}

if (req.method === "GET" && req.url === "/queue-status") {
  let outboxBytes = 0;
  let cursorBytes = 0;
  try { outboxBytes = require("node:fs").statSync(outPaths.outbox).size; } catch { /* ignore */ }
  try { cursorBytes = parseInt(require("node:fs").readFileSync(outPaths.cursor, "utf-8"), 10) || 0; } catch { /* ignore */ }
  res.statusCode = 200;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({
    pending_bytes: Math.max(0, outboxBytes - cursorBytes),
    outbox_size: outboxBytes,
    cursor: cursorBytes,
  }));
  return;
}

if (req.method === "POST" && req.url === "/drain") {
  // Wake the worker immediately. Doesn't wait for drain to complete — just
  // signals.
  worker.notify();
  res.statusCode = 202;
  res.end();
  return;
}
```

In the `beginExit` function (around line 323), add `await worker.stop()` before `process.exit(0)`. Convert beginExit's `server.close(callback)` to `server.close(async () => { await worker.stop(); ...; process.exit(0); })`.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @viki/cli typecheck`
Expected: 0 errors.

- [ ] **Step 4: Spin up the daemon manually + smoke-test /enqueue**

In one terminal:
```bash
VIKI_EMBEDDER_FORCE_SPAWN=1 npx tsx packages/cli/src/bin-embedder.ts --idle-exit-ms 60000
```
Look for `[embedder] outbox worker started`.

In another terminal:
```bash
# Read the port from state file
PORT=$(cat ~/.viki/.embedder-state.json | jq -r .port)
curl -X POST "http://127.0.0.1:$PORT/enqueue" -H "content-type: application/json" -d '{"kind":"ping","payload":{}}'
# Expect: 202 {"id":"...","enqueued_at":"..."}
curl "http://127.0.0.1:$PORT/queue-status"
# Expect: 200 {"pending_bytes":0,"outbox_size":N,"cursor":N}  (worker drained immediately)
```

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/bin-embedder.ts
git commit -m "feat(cli): embedder daemon serves /enqueue /queue-status /drain"
```

---

## Task 4: Add `enqueueToDaemon` client helper

**Files:**
- Modify: `packages/cli/src/embedder-client.ts`
- Create: `packages/cli/src/__tests__/embedder-client-enqueue.test.ts`

`enqueueToDaemon(task, opts)` returns `Promise<{ ok: true; id: string } | { ok: false; reason: string }>`. If the daemon is reachable, it POSTs `/enqueue`. If unreachable, it appends to the local outbox (so the next daemon to start will drain it) and triggers a detached daemon spawn.

- [ ] **Step 1: Read current embedder-client.ts** to find the right place to insert

Read: `packages/cli/src/embedder-client.ts:1-50`

- [ ] **Step 2: Add the helper at the end of the file** (above any default-export if present)

```ts
import { appendOutboxTask, outboxPaths } from "./daemon-outbox.js";

export interface EnqueueOpts {
  /** Override timeout for the HTTP POST. Default 1000 ms — hot path. */
  timeoutMs?: number;
  /** Override home directory. Default os.homedir() / process.env.VIKI_HOME. */
  home?: string;
}

export interface EnqueueResult {
  ok: boolean;
  id?: string;
  reason?: string;
}

export async function enqueueToDaemon(
  task: { kind: string; payload: Record<string, unknown> },
  opts: EnqueueOpts = {},
): Promise<EnqueueResult> {
  const home = opts.home ?? process.env["VIKI_HOME"] ?? require("node:os").homedir();
  const timeoutMs = opts.timeoutMs ?? 1000;

  // Try daemon HTTP first
  const state = readEmbedderState(defaultEmbedderStatePath());
  if (state && state.status === "running" && state.port > 0) {
    try {
      const id = await postEnqueueViaDaemon(state.port, task, timeoutMs);
      return { ok: true, id };
    } catch {
      // fall through to local append
    }
  }

  // Daemon unreachable — append to local outbox so it'll be drained when
  // a daemon starts. Best-effort spawn.
  try {
    const paths = outboxPaths(home);
    const t = appendOutboxTask(paths, task);
    tryDetachedSpawn();
    return { ok: true, id: t.id, reason: "local-outbox" };
  } catch (err) {
    return { ok: false, reason: `local-outbox-failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function postEnqueueViaDaemon(
  port: number,
  task: { kind: string; payload: Record<string, unknown> },
  timeoutMs: number,
): Promise<string> {
  const http = await import("node:http");
  return new Promise<string>((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(task), "utf-8");
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/enqueue",
        method: "POST",
        headers: { "content-type": "application/json", "content-length": body.length },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          if (res.statusCode === 202) {
            try {
              const parsed = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
              resolve(typeof parsed.id === "string" ? parsed.id : "");
            } catch (e) {
              reject(e);
            }
          } else {
            reject(new Error(`status ${res.statusCode}`));
          }
        });
      },
    );
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error("timeout")); });
    req.on("error", reject);
    req.end(body);
  });
}
```

(Note: `tryDetachedSpawn` and `readEmbedderState` are already exported / used by `DaemonFirstEmbedder` — reuse them. If they're private, expose via an internal helper without breaking the existing API surface.)

- [ ] **Step 3: Test file**

```ts
// packages/cli/src/__tests__/embedder-client-enqueue.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { enqueueToDaemon } from "../embedder-client.js";

let tmpHome: string;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "viki-enqueue-"));
  fs.mkdirSync(path.join(tmpHome, ".viki"), { recursive: true });
});

describe("enqueueToDaemon", () => {
  it("when daemon is not running, falls back to local outbox append", async () => {
    // No state file → daemon not running
    const result = await enqueueToDaemon(
      { kind: "session-end", payload: { test: 1 } },
      { home: tmpHome },
    );
    expect(result.ok).toBe(true);
    expect(result.reason).toBe("local-outbox");
    const outboxPath = path.join(tmpHome, ".viki", "outbox.jsonl");
    const raw = fs.readFileSync(outboxPath, "utf-8");
    expect(raw).toMatch(/session-end/);
    expect(raw).toMatch(/\"test\":1/);
  });

  // More tests would require an HTTP mock — defer to stage 2 integration tests
});
```

- [ ] **Step 4: Run + commit**

Run: `npx vitest run embedder-client-enqueue`
Expected: 1 passing.

```bash
git add packages/cli/src/embedder-client.ts packages/cli/src/__tests__/embedder-client-enqueue.test.ts
git commit -m "feat(cli): enqueueToDaemon client (HTTP first, local-outbox fallback)"
```

---

## Task 5: Full test suite + smoke build

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass except the same 10 pre-existing failures from stage 0 verification (compile / find-viki-root / init-static-user-skills / extract-pipeline / sqlite-knowledge-store-v6). New tests pass.

- [ ] **Step 2: Build the bundles**

Run: `pnpm build`
Expected: success.

- [ ] **Step 3: Verify bin-embedder bundle includes the outbox + worker code**

```bash
grep -c "outbox" packages/cli/dist/bin-embedder.cjs
grep -c "startWorker" packages/cli/dist/bin-embedder.cjs
```
Expected: > 0 for both.

---

## Self-Review

**Spec coverage:**
- 思路 3 (信箱): ✓ Tasks 1-2 implement outbox + worker.
- 思路 1 (信差/工人分离): half-done. Stage 1 builds the workshop; stage 2 hires the messengers.

**Type consistency:** `OutboxTask` shape consistent across daemon-outbox.ts, daemon-worker.ts, the /enqueue route, and the client.

**Risks:**
- The worker's "re-append on failure" approach means a single bad task can pollute the outbox tail forever if the bug never resolves. Mitigated by max-attempts → DLQ.
- Cursor file corruption (partial write during crash) would replay all outbox tasks. Mitigated by atomic rename (`.tmp` → final).
- Multi-daemon scenario: only one daemon should drain at a time (singleton lock already enforced via pid + startup lock). If a stale daemon writes cursor while a new daemon also writes, last-writer-wins; only one cursor entry survives. Acceptable for personal-machine use.
