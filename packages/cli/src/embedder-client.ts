/**
 * Embedder daemon HTTP client (issue #164).
 *
 * Short-lived hooks (PreToolUse, Stop) use this to talk to the long-running
 * `bin-embedder.cjs` daemon instead of loading the 115MB ONNX model fresh
 * every invocation. Returns null on any failure so callers can fall back
 * to the in-process embedder + legacy substring matcher.
 *
 * Contract: never throws. Caller treats null as "daemon unreachable —
 * fall back". 200ms default timeout keeps the hook critical path bounded.
 */
import http from "node:http";
import os from "node:os";
import {
  defaultEmbedderStatePath,
  describeDaemonReadiness,
  type DaemonReadiness,
} from "./embedder-state.js";
import { appendOutboxTask, outboxPaths } from "./daemon-outbox.js";

export interface EmbedderClientOptions {
  /** Override state file path (tests). */
  statePath?: string;
  /** Per-request timeout in ms. Default 1000ms.
   *  Tuning history on Windows hook process:
   *    200ms (original) → ~30% NULL-vector failures (cold daemon recovery)
   *    500ms            → ~20% NULL-vector failures (GC pauses still cross)
   *    1000ms (current) → 0% in 5-run smoke; preserves headroom for
   *                       occasional ONNX inference outliers
   *  Direct daemon probes are 45ms; fresh hook + worst-case daemon idle
   *  recovery is the long tail this guards. Still well under Claude Code's
   *  multi-second per-hook budget. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 1000;

/**
 * Try to embed via the daemon. Returns vectors[] on success, null on any
 * failure (daemon missing, network error, timeout, non-200, parse error).
 */
export async function embedViaDaemon(
  texts: string[],
  opts: EmbedderClientOptions = {},
): Promise<number[][] | null> {
  if (texts.length === 0) return [];
  const statePath = opts.statePath ?? defaultEmbedderStatePath();
  const readiness = describeDaemonReadiness(statePath);
  if (!readiness.ready || !readiness.state) return null;

  const port = readiness.state.port;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const body = JSON.stringify({ texts });

  return new Promise<number[][] | null>((resolve) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/embed",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body).toString(),
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(null);
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
            if (Array.isArray(parsed?.vectors)) {
              resolve(parsed.vectors as number[][]);
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
        res.on("error", () => resolve(null));
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(null);
    });
    req.on("error", () => resolve(null));
    req.write(body);
    req.end();
  });
}

/**
 * POST /register — used by SessionStart to register a session with the daemon.
 * Increments the refcount; daemon won't idle-exit while at least one session
 * is registered. Best-effort; returns true if acknowledged, false otherwise.
 *
 * Polls for a starting daemon to become ready, up to `pollMs` total. Useful
 * because SessionStart spawns the daemon detached and needs to register
 * immediately after; the daemon takes ~3-4s to load the model.
 */
export async function postRegister(
  sessionId: string,
  opts: EmbedderClientOptions & { pollMs?: number; pollIntervalMs?: number } = {},
): Promise<boolean> {
  const statePath = opts.statePath ?? defaultEmbedderStatePath();
  // 10s default — multilingual-e5-small ONNX cold-load measured 3-4s on a
  // fast SSD, but slow disk / first-time download / Windows AV scanning the
  // tarball can push past 5s. Generous polling avoids silent miss where
  // SessionStart's session never registers.
  const pollDeadline = Date.now() + (opts.pollMs ?? 10_000);
  const interval = opts.pollIntervalMs ?? 200;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  while (Date.now() < pollDeadline) {
    const readiness = describeDaemonReadiness(statePath);
    if (readiness.ready && readiness.state) {
      const ok = await postRegisterOnce(sessionId, readiness.state.port, timeoutMs);
      if (ok) return true;
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  return false;
}

function postRegisterOnce(sessionId: string, port: number, timeoutMs: number): Promise<boolean> {
  const body = JSON.stringify({ session_id: sessionId });
  return new Promise<boolean>((resolve) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/register",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body).toString(),
        },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode === 204 || res.statusCode === 200);
      },
    );
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false); });
    req.on("error", () => resolve(false));
    req.write(body);
    req.end();
  });
}

/**
 * POST /shutdown — used by SessionEnd hook to drop refcount.
 * Best-effort; returns true if daemon acknowledged, false otherwise.
 */
export async function postShutdown(
  sessionId: string,
  opts: EmbedderClientOptions = {},
): Promise<boolean> {
  const statePath = opts.statePath ?? defaultEmbedderStatePath();
  const readiness: DaemonReadiness = describeDaemonReadiness(statePath);
  if (!readiness.state) return false;
  const port = readiness.state.port;
  if (!Number.isInteger(port) || port <= 0) return false;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const body = JSON.stringify({ session_id: sessionId });
  return new Promise<boolean>((resolve) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/shutdown",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body).toString(),
        },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200 || res.statusCode === 204);
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
    req.write(body);
    req.end();
  });
}

/**
 * POST /enqueue — used by thin-client hooks (stage 2) to hand a task to
 * the daemon's outbox worker. Best-effort: if the daemon is unreachable,
 * append directly to the local outbox.jsonl so the next daemon to start
 * will drain it.
 *
 * Returns:
 *   - { ok: true, id, reason: "daemon" }  → daemon accepted (HTTP 202)
 *   - { ok: true, id, reason: "local" }   → wrote to local outbox; the
 *                                           next daemon will drain
 *   - { ok: false, reason }                → both paths failed (very rare)
 */
export interface EnqueueResult {
  ok: boolean;
  id?: string;
  reason: "daemon" | "local" | "failed";
}

export async function enqueueToDaemon(
  task: { kind: string; payload: Record<string, unknown> },
  opts: EmbedderClientOptions & { home?: string } = {},
): Promise<EnqueueResult> {
  const statePath = opts.statePath ?? defaultEmbedderStatePath();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const home = opts.home ?? process.env["VIKI_HOME"] ?? os.homedir();

  const readiness = describeDaemonReadiness(statePath);
  if (readiness.ready && readiness.state) {
    const id = await postEnqueueOnce(readiness.state.port, task, timeoutMs);
    if (id) return { ok: true, id, reason: "daemon" };
  }

  // Daemon unreachable — local outbox fallback. The next daemon to start
  // will drain (its worker reads ~/.viki/outbox.jsonl from byte 0).
  try {
    const paths = outboxPaths(home);
    const t = appendOutboxTask(paths, task);
    return { ok: true, id: t.id, reason: "local" };
  } catch (err) {
    return {
      ok: false,
      reason: "failed",
    };
  }
}

function postEnqueueOnce(
  port: number,
  task: { kind: string; payload: Record<string, unknown> },
  timeoutMs: number,
): Promise<string | null> {
  const body = JSON.stringify(task);
  return new Promise<string | null>((resolve) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/enqueue",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body).toString(),
        },
      },
      (res) => {
        if (res.statusCode !== 202) {
          res.resume();
          resolve(null);
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
            resolve(typeof parsed.id === "string" ? parsed.id : null);
          } catch {
            resolve(null);
          }
        });
        res.on("error", () => resolve(null));
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(null);
    });
    req.on("error", () => resolve(null));
    req.write(body);
    req.end();
  });
}
