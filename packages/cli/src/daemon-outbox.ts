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
