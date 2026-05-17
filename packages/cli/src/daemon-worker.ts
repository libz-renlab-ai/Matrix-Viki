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

  /** Read effective attempts from the task. New tasks come in with task.attempts=0;
   * retried tasks carry the bumped counter in payload.__retry.attempts because
   * appendOutboxTask always resets task.attempts to 0 on a new line. */
  const readAttempts = (task: OutboxTask): number => {
    const retry = (task.payload as { __retry?: { attempts?: number } }).__retry;
    if (retry && typeof retry.attempts === "number") return retry.attempts;
    return task.attempts;
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
      const currentAttempts = readAttempts(task);
      const nextAttempts = currentAttempts + 1;
      if (nextAttempts >= maxAttempts) {
        moveTaskToDlq(opts.paths, { ...task, attempts: nextAttempts }, `handler-threw-${nextAttempts}x`);
      } else {
        // Re-append with bumped attempts tracked in payload.__retry. The
        // original line is consumed by advancing the cursor; the new line
        // becomes the next-or-eventual task. task.attempts on the new line
        // is 0 (appendOutboxTask sets it), so we encode the running count
        // in payload.__retry instead.
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
