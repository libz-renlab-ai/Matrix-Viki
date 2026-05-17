#!/usr/bin/env node
/**
 * Embedder daemon (issue #164).
 *
 * Long-running process that owns one `XenovaRuleEmbedder` and serves
 * embedding requests over HTTP on `127.0.0.1:<random-port>`. Hooks
 * (PreToolUse, Stop) discover the port via `~/.viki/.embedder-state.json`
 * and POST /embed instead of loading the 115MB ONNX model fresh per call.
 *
 * Solves the "卡爆" problem identified in issue #164:
 *   - Without daemon: every PreToolUse hook = 3-4s cold load + 650MB RSS
 *   - 5 concurrent hooks = 3.3GB RAM peak (8GB Mac OOM)
 *   - With daemon: model loads once, hooks stay <50MB and respond in ms
 *
 * Lifecycle:
 *   1. Acquire PID lock (refuse to start if another daemon is alive)
 *   2. Load embedder (3-4s; state file: status=starting, port=0)
 *   3. Listen on 127.0.0.1:0 (kernel-assigned port)
 *   4. Update state file: status=running, port=<assigned>
 *   5. Serve /embed and /shutdown until refcount reaches 0 OR idle timeout
 *
 * State transitions:
 *   starting → running → exiting (refcount=0 || idle) → process.exit(0)
 *   starting → failed (load error) → process.exit(1)
 *
 * Cross-platform: pure HTTP + filesystem, no Unix-socket / named-pipe code.
 */
import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import process from "node:process";
import {
  XenovaRuleEmbedder,
} from "@viki/adapters";
import {
  defaultEmbedderStatePath,
  isDaemonPidAlive,
  readEmbedderState,
  writeEmbedderState,
  type EmbedderState,
} from "./embedder-state.js";
import { tryAcquireSpawnLock } from "./embedder-spawn-lock.js";
import { outboxPaths, appendOutboxTask } from "./daemon-outbox.js";
import { startWorker, type Handler, type WorkerHandle } from "./daemon-worker.js";
import { runFullRescanPipeline, runStopPipeline, type StopHookInput } from "./bin-stop.js";

const DEFAULT_IDLE_EXIT_MS = 30 * 60 * 1000; // 30 min — well past typical session

interface DaemonOpts {
  statePath: string;
  idleExitMs: number;
  /** When set, daemon binds to this fixed port instead of 0 (tests). */
  fixedPort?: number;
  /** Override for tests. */
  model?: string;
}

export function parseArgv(argv: string[]): Partial<DaemonOpts> {
  const out: Partial<DaemonOpts> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--state-path" && i + 1 < argv.length) out.statePath = argv[++i];
    else if (a === "--idle-exit-ms" && i + 1 < argv.length) {
      const n = parseInt(argv[++i] ?? "", 10);
      if (Number.isFinite(n) && n > 0) out.idleExitMs = n;
    } else if (a === "--port" && i + 1 < argv.length) {
      const n = parseInt(argv[++i] ?? "", 10);
      if (Number.isFinite(n) && n >= 0) out.fixedPort = n;
    } else if (a === "--model" && i + 1 < argv.length) out.model = argv[++i];
  }
  return out;
}

/**
 * Acquire the singleton lock by checking the existing state file's pid.
 * Returns true if this process should run as the daemon, false if another
 * is already alive (caller should exit gracefully).
 *
 * Race: between read and write, two simultaneous spawns can both pass this
 * check. The TCP `listen()` step then becomes the tiebreaker — the loser
 * gets EADDRINUSE if --port is fixed; with port 0 both succeed but one of
 * the two state-file writes wins. The cost is one extra ephemeral daemon
 * for ~3s; idle-exit reaps it. Acceptable tradeoff vs OS-level file locks.
 *
 * Windows pid-recycling defense: process.kill(pid, 0) returns true for ANY
 * existing pid on Windows. If the recorded pid was recycled into an
 * unrelated process (svchost.exe etc.) after a reboot, we'd refuse to
 * spawn forever. Caller can set VIKI_EMBEDDER_FORCE_SPAWN=1 to
 * bypass; better long-term, the runtime path also performs an HTTP
 * /health probe (added in startup) to catch this case automatically.
 */
export function tryAcquireLock(statePath: string): boolean {
  if (process.env["VIKI_EMBEDDER_FORCE_SPAWN"] === "1") return true;
  const existing = readEmbedderState(statePath);
  if (!existing) return true;
  if (existing.status === "exiting") return true;
  if (!isDaemonPidAlive(existing.pid)) return true;
  return false;
}

/**
 * Best-effort HTTP /health probe to confirm a process really is the daemon
 * (not just a recycled pid pointing at our state). Synchronous-style return
 * via Promise; caller awaits before deciding to claim/skip.
 *
 * Returns:
 *   - true  → daemon at this port responded healthy (real, leave it alone)
 *   - false → port unreachable / non-200 / timeout (treat state as stale)
 */
async function probeDaemonHealth(port: number, timeoutMs = 200): Promise<boolean> {
  if (!Number.isInteger(port) || port <= 0) return false;
  return new Promise<boolean>((resolve) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: "/health", method: "GET" },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false); });
    req.on("error", () => resolve(false));
    req.end();
  });
}

async function runDaemon(opts: DaemonOpts): Promise<number> {
  if (!tryAcquireLock(opts.statePath)) {
    // Defense against Windows pid recycling: even if pid looks alive, probe
    // the recorded port. If /health doesn't respond, the state is stale —
    // claim it. Skipped when state has no port (daemon never reached running).
    const existing = readEmbedderState(opts.statePath);
    const port = existing?.port ?? 0;
    if (port > 0) {
      const alive = await probeDaemonHealth(port);
      if (alive) {
        process.stderr.write("[embedder] another daemon is alive; exiting\n");
        return 0;
      }
      process.stderr.write("[embedder] state file says alive but /health unreachable; treating as stale\n");
    } else {
      process.stderr.write("[embedder] another daemon is alive; exiting\n");
      return 0;
    }
  }

  // Issue #315 (Race β): tryAcquireLock above is TOCTOU. When N daemon
  // children all spawn before any of them writes state.status=starting,
  // every one passes the lock check and enters the cold-load path, each
  // loading 650MB of ONNX. The startup-lock below makes the
  // "tryAcquireLock + writeState(starting) + cold-load" sequence
  // mutually exclusive across processes. A daemon that fails to acquire
  // the lock exits without loading the model — the winner will be
  // discoverable via /health within a few seconds.
  const startupLock = tryAcquireSpawnLock(`${opts.statePath}.startup.lock`);
  if (!startupLock) {
    process.stderr.write("[embedder] another daemon is in startup; exiting\n");
    return 0;
  }

  const model = opts.model ?? "Xenova/multilingual-e5-small";
  const startedAt = new Date().toISOString();

  // Step 1: write `starting` placeholder so hooks see *something* during the
  // 3-4s cold load. describeDaemonReadiness returns reason="starting" → caller
  // falls back to legacy.
  writeEmbedderState(opts.statePath, {
    status: "starting",
    pid: process.pid,
    port: 0,
    started_at: startedAt,
    model,
    members: [],
  });

  // Step 2: load embedder (the expensive part).
  // Stage 4: hold embedder in a mutable slot so the model-idle timer can
  // drop the reference and let GC reclaim the ~500 MB. Next /embed creates
  // a fresh instance (3-4s cold load); the cost is paid only when the
  // daemon has been idle for MODEL_IDLE_MS.
  let embedder: XenovaRuleEmbedder | null;
  let modelLastUsedAt = Date.now();
  const MODEL_IDLE_MS = 5 * 60 * 1000; // 5 minutes
  try {
    embedder = new XenovaRuleEmbedder({ modelId: model });
    // Force load by doing one warm-up embed; surfaces failures immediately.
    await embedder.embed(["warmup"]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeEmbedderState(opts.statePath, {
      status: "failed",
      pid: process.pid,
      port: 0,
      started_at: startedAt,
      model,
      members: [],
      error: msg.slice(0, 500),
    });
    process.stderr.write(`[embedder] load failed: ${msg}\n`);
    startupLock.release();
    return 1;
  }
  // Cold load complete: release the startup lock so subsequent daemons
  // can detect "already running" via the state file (status=starting
  // here, status=running written below in step 3 after server.listen).
  startupLock.release();

  /**
   * Stage 4: ensure the embedder is loaded; create+warmup if it was unloaded
   * after idle. Single-flight via in-progress promise.
   */
  let embedderLoadInFlight: Promise<void> | null = null;
  async function ensureEmbedder(): Promise<XenovaRuleEmbedder> {
    if (embedder) {
      modelLastUsedAt = Date.now();
      return embedder;
    }
    if (embedderLoadInFlight) {
      await embedderLoadInFlight;
      modelLastUsedAt = Date.now();
      return embedder!;
    }
    embedderLoadInFlight = (async () => {
      process.stderr.write("[embedder] reloading model after idle unload\n");
      const e = new XenovaRuleEmbedder({ modelId: model });
      await e.embed(["warmup"]);
      embedder = e;
    })();
    try {
      await embedderLoadInFlight;
    } finally {
      embedderLoadInFlight = null;
    }
    modelLastUsedAt = Date.now();
    return embedder!;
  }

  // Step 3: idle / refcount tracking. Keep timestamps in-process; re-read
  // members from state file before deciding to exit so SessionEnd hooks'
  // file-based mutations are visible.
  let lastActivityMs = Date.now();
  let exiting = false;
  // Track in-flight requests so beginExit can drain rather than drop, and
  // idle-exit doesn't fire while a long embed is mid-flight (review finding:
  // bumping lastActivityMs only at request *start* meant a 30-min embed
  // could trigger idle-exit while embedder.embed was still running).
  let inFlight = 0;

  // Stage 6: /embed concurrency cap. Caps simultaneous embed calls at 2
  // (configurable via VIKI_EMBED_CONCURRENCY). Excess requests get 503 +
  // Retry-After:1 — clients retry once the queue drains. Prevents a burst
  // of concurrent SessionEnd / PreToolUse hooks from launching N parallel
  // ONNX inferences and OOMing the daemon.
  const MAX_EMBED_CONCURRENCY = parseInt(process.env["VIKI_EMBED_CONCURRENCY"] ?? "2", 10) || 2;
  let activeEmbeds = 0;

  // Stage 1: outbox worker. Drains ~/.viki/outbox.jsonl tasks enqueued by
  // hook clients via POST /enqueue (or by hooks appending directly when
  // the daemon is offline). Stage 1 ships with a single test-only "ping"
  // handler; stage 2 will register the real task kinds (session-end /
  // stop / pre-compact / session-start / updater) here.
  const daemonHome = process.env["VIKI_HOME"] ?? os.homedir();
  const outPaths = outboxPaths(daemonHome);
  // Stage 6: cold scheduler. A handler whose kind starts with "cold-" only
  // runs when system load is low (1-minute loadavg < 30% of CPU count on
  // POSIX; on Windows os.loadavg() returns [0,0,0] so the gate is a no-op
  // and cold tasks always run there — acceptable since the cold path is
  // already a low-frequency event).
  function isSystemIdle(): boolean {
    try {
      const cpus = os.cpus().length;
      if (cpus === 0) return true;
      const load1 = os.loadavg()[0] ?? 0;
      // load == 0 on Windows
      if (load1 === 0) return true;
      // Heuristic: load < 30% of CPU count
      return load1 < cpus * 0.3;
    } catch {
      return true; // best-effort — never block on observability errors
    }
  }

  // Stage 3: 24h cold-rescan tracking. session-end / pre-compact handlers
  // run incremental by default (much cheaper than full). Once every 24h
  // they ALSO enqueue a "cold-full-rescan" task — the cold scheduler from
  // stage 6 will defer it until the system is idle. This combines the
  // perf win of incremental with the safety net of periodic full.
  const COLD_FULL_RESCAN_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const lastFullRescanFile = path.join(daemonHome, ".viki", ".last-full-rescan");
  function readLastFullRescan(): number {
    try {
      const raw = fs.readFileSync(lastFullRescanFile, "utf-8").trim();
      const t = Date.parse(raw);
      return Number.isFinite(t) ? t : 0;
    } catch {
      return 0;
    }
  }
  function writeLastFullRescan(): void {
    try {
      fs.mkdirSync(path.dirname(lastFullRescanFile), { recursive: true });
      fs.writeFileSync(lastFullRescanFile, new Date().toISOString(), "utf-8");
    } catch { /* best-effort */ }
  }

  function normalizePipelineInput(payload: unknown, defaultHook: string): StopHookInput {
    const input = payload as Record<string, unknown>;
    if (!input || typeof input.session_id !== "string" || typeof input.cwd !== "string") {
      throw new Error(`pipeline task: missing session_id or cwd`);
    }
    return {
      session_id: input.session_id,
      transcript_path: typeof input.transcript_path === "string" ? input.transcript_path : "",
      cwd: input.cwd,
      hook_event_name: typeof input.hook_event_name === "string" ? input.hook_event_name : defaultHook,
    };
  }

  const workerHandlers: Record<string, Handler> = {
    "ping": async () => { /* no-op test seam */ },
    // Stage 2 + 3: session-end / pre-compact run INCREMENTAL by default
    // (much cheaper than full rescan). A cold-full-rescan task is enqueued
    // separately at most once per 24h; the cold scheduler (stage 6) defers
    // it until the system is idle.
    "session-end": async (payload) => {
      const input = normalizePipelineInput(payload, "SessionEnd");
      await runStopPipeline(input, { fullRescan: false, modeTag: "incremental" });
      // 24h cold-full-rescan trigger
      if (Date.now() - readLastFullRescan() > COLD_FULL_RESCAN_INTERVAL_MS) {
        appendOutboxTask(outPaths, {
          kind: "cold-full-rescan",
          payload: input as unknown as Record<string, unknown>,
        });
      }
    },
    "pre-compact": async (payload) => {
      const input = normalizePipelineInput(payload, "PreCompact");
      await runStopPipeline(input, { fullRescan: false, modeTag: "incremental" });
      if (Date.now() - readLastFullRescan() > COLD_FULL_RESCAN_INTERVAL_MS) {
        appendOutboxTask(outPaths, {
          kind: "cold-full-rescan",
          payload: input as unknown as Record<string, unknown>,
        });
      }
    },
    // Stage 3 cold path: full rescan from a clean cursor. Gated by stage 6's
    // cold scheduler (only runs when system load < 30%). Once it completes
    // successfully, writes ~/.viki/.last-full-rescan so the next incremental
    // run won't re-trigger it for 24h.
    "cold-full-rescan": async (payload) => {
      const input = normalizePipelineInput(payload, "ColdFullRescan");
      await runFullRescanPipeline(input);
      writeLastFullRescan();
    },
  };
  let worker: WorkerHandle | null = null;

  const server = http.createServer((req, res) => {
    if (exiting) {
      res.statusCode = 503;
      res.end("daemon exiting\n");
      return;
    }
    lastActivityMs = Date.now();
    inFlight++;
    const onDone = (): void => {
      inFlight = Math.max(0, inFlight - 1);
      lastActivityMs = Date.now();
    };
    res.once("finish", onDone);
    res.once("close", onDone);

    if (req.method === "POST" && req.url === "/embed") {
      // Stage 6: semaphore. If at capacity, reject with 503 + Retry-After.
      // Clients (DaemonFirstEmbedder) treat 503 as "daemon unreachable" and
      // fall back to zero-vector + spawn-detached, which is acceptable for
      // a burst. Far better than letting N parallel ONNX inferences chew
      // memory.
      if (activeEmbeds >= MAX_EMBED_CONCURRENCY) {
        res.statusCode = 503;
        res.setHeader("retry-after", "1");
        res.end(JSON.stringify({ error: "embed concurrency limit" }));
        return;
      }
      activeEmbeds++;
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", async () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
          const texts = Array.isArray(body?.texts) ? (body.texts as unknown[]) : null;
          if (!texts || !texts.every((t) => typeof t === "string")) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "texts must be string[]" }));
            return;
          }
          const e = await ensureEmbedder();
          modelLastUsedAt = Date.now();
          const vectors = await e.embed(texts as string[]);
          modelLastUsedAt = Date.now();
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ vectors }));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        } finally {
          activeEmbeds = Math.max(0, activeEmbeds - 1);
        }
      });
      req.on("error", () => {
        activeEmbeds = Math.max(0, activeEmbeds - 1);
        res.statusCode = 400;
        res.end();
      });
      return;
    }

    if (req.method === "POST" && req.url === "/register") {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        let body: { session_id?: unknown } = {};
        try { body = JSON.parse(Buffer.concat(chunks).toString("utf-8")); } catch { /* ignore */ }
        if (typeof body.session_id !== "string") {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "session_id required" }));
          return;
        }
        const s = readEmbedderState(opts.statePath);
        if (!s) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "state file gone" }));
          return;
        }
        if (!s.members.some((m) => m.session_id === body.session_id)) {
          s.members.push({ session_id: body.session_id as string, joined_at: new Date().toISOString() });
          writeEmbedderState(opts.statePath, s);
        }
        res.statusCode = 204;
        res.end();
      });
      req.on("error", () => { res.statusCode = 400; res.end(); });
      return;
    }

    if (req.method === "POST" && req.url === "/shutdown") {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        // Best-effort: read latest state, pop session_id, write back, then
        // check refcount. The SessionEnd hook may also have already done the
        // mutation; we just re-read and act on what we see.
        const s = readEmbedderState(opts.statePath);
        if (s) {
          let body: { session_id?: unknown } = {};
          try { body = JSON.parse(Buffer.concat(chunks).toString("utf-8")); } catch { /* ignore */ }
          if (typeof body.session_id === "string") {
            s.members = s.members.filter((m) => m.session_id !== body.session_id);
            writeEmbedderState(opts.statePath, s);
          }
          if (s.members.length === 0) {
            beginExit(s);
          }
        }
        res.statusCode = 204;
        res.end();
      });
      req.on("error", () => {
        res.statusCode = 400;
        res.end();
      });
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      const s = readEmbedderState(opts.statePath);
      res.end(JSON.stringify({
        status: s?.status ?? "unknown",
        members: s?.members.length ?? 0,
        model,
      }));
      return;
    }

    if (req.method === "POST" && req.url === "/enqueue") {
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
              ? (body.payload as Record<string, unknown>)
              : {},
          });
          worker?.notify();
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
      try { outboxBytes = fs.statSync(outPaths.outbox).size; } catch { /* ignore */ }
      try { cursorBytes = parseInt(fs.readFileSync(outPaths.cursor, "utf-8"), 10) || 0; } catch { /* ignore */ }
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
      // Wake worker without waiting for completion. Useful for diagnostics
      // and for hook clients to nudge the daemon after appending tasks
      // directly to the local outbox.
      worker?.notify();
      res.statusCode = 202;
      res.end();
      return;
    }

    res.statusCode = 404;
    res.end();
  });

  function beginExit(state: EmbedderState | null): void {
    if (exiting) return;
    exiting = true;
    const s = state ?? readEmbedderState(opts.statePath);
    if (s) {
      s.status = "exiting";
      writeEmbedderState(opts.statePath, s);
    }
    // Stop accepting new connections (server.close), then wait for in-flight
    // requests to finish (poll inFlight==0 with hard cap so we don't hang
    // indefinitely on a stuck embed). Newer Node also has closeIdleConnections
    // for keep-alive sockets that aren't actively serving.
    server.close(async () => {
      try {
        const final = readEmbedderState(opts.statePath);
        if (final && final.pid === process.pid) {
          writeEmbedderState(opts.statePath, { ...final, status: "exiting" });
        }
      } catch { /* best-effort */ }
      // Drain the outbox worker (waits for current task to finish).
      // Best-effort — process.exit below is unconditional.
      try { if (worker) { await worker.stop(); } } catch { /* ignore */ }
      process.exit(0);
    });
    // Best-effort: free idle keep-alive sockets so server.close fires promptly.
    // closeIdleConnections is Node ≥18.2; guard for older runtimes just in case.
    const closeIdle = (server as unknown as { closeIdleConnections?: () => void }).closeIdleConnections;
    if (typeof closeIdle === "function") {
      try { closeIdle.call(server); } catch { /* ignore */ }
    }
    // Hard timeout: force-exit if drain takes too long (stuck embed, malicious
    // keep-alive client). 5 seconds is plenty for legitimate in-flight requests.
    const hardTimer = setTimeout(() => {
      process.stderr.write(`[embedder] forced exit after 5s drain timeout (inFlight=${inFlight})\n`);
      process.exit(0);
    }, 5_000);
    hardTimer.unref();
  }

  // Step 4: bind. listen(0) → kernel picks free port. listen(fixedPort) for tests.
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.fixedPort ?? 0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const addr = server.address();
  const port = typeof addr === "object" && addr !== null ? addr.port : 0;
  if (port <= 0) {
    process.stderr.write("[embedder] failed to obtain port from listen()\n");
    return 1;
  }

  writeEmbedderState(opts.statePath, {
    status: "running",
    pid: process.pid,
    port,
    started_at: startedAt,
    model,
    members: [],
  });
  process.stderr.write(`[embedder] ready pid=${process.pid} port=${port}\n`);

  // Start the outbox worker AFTER status=running so /enqueue clients can
  // discover us and POST tasks. Worker polls every 1s if no /enqueue
  // notify arrives.
  //
  // Stage 6: wrap each handler with the cold-scheduler gate. Kinds with
  // "cold-" prefix block until isSystemIdle() returns true; non-cold kinds
  // run immediately. The "cold-" prefix is a convention used by stage-3
  // logic (cold-full-rescan, cold-cleanup, etc.) and is otherwise free.
  const gatedHandlers: Record<string, Handler> = {};
  for (const [kind, handler] of Object.entries(workerHandlers)) {
    if (kind.startsWith("cold-")) {
      gatedHandlers[kind] = async (payload) => {
        // Wait up to 30 min for system to become idle, polling every 30s.
        // After that, just run (cold-path tasks shouldn't be blocked forever).
        const deadline = Date.now() + 30 * 60 * 1000;
        while (Date.now() < deadline && !isSystemIdle()) {
          await new Promise((r) => setTimeout(r, 30_000));
        }
        return handler(payload);
      };
    } else {
      gatedHandlers[kind] = handler;
    }
  }

  worker = startWorker({
    paths: outPaths,
    handlers: gatedHandlers,
    pollIntervalMs: 1_000,
  });
  process.stderr.write(`[embedder] outbox worker started\n`);

  // Stage 4: model idle unload. Every 60s, if the model has been idle > 5
  // minutes AND no embed is in flight, drop the reference. Next /embed will
  // recreate it (3-4s cold load). Daemon process itself remains alive — only
  // the model frees, dropping RSS from ~500 MB to ~50 MB.
  const modelIdleTimer = setInterval(() => {
    if (exiting) return;
    if (!embedder) return;
    if (inFlight > 0) return;
    if (Date.now() - modelLastUsedAt < MODEL_IDLE_MS) return;
    process.stderr.write("[embedder] model idle > 5min, dropping reference\n");
    embedder = null;
    // Hint GC. Best-effort — Node may still hold native ONNX session memory
    // until the next major GC cycle; the next embedder.embed() will create
    // a fresh instance regardless.
    if (typeof globalThis.gc === "function") {
      try { globalThis.gc(); } catch { /* ignore */ }
    }
  }, 60_000);
  modelIdleTimer.unref();

  // Step 5: idle-exit watcher. Re-checks every 30s. If wall-clock since last
  // activity > idleExitMs AND no in-flight requests AND members list empty,
  // begin exit. The inFlight guard prevents idle-exit from firing mid-embed
  // (review finding: a 30-min embed could trip the timer otherwise).
  const idleTimer = setInterval(() => {
    if (exiting) return;
    if (inFlight > 0) return;
    if (Date.now() - lastActivityMs < opts.idleExitMs) return;
    const s = readEmbedderState(opts.statePath);
    if (s && s.members.length > 0) return;
    process.stderr.write("[embedder] idle exit\n");
    beginExit(s);
  }, Math.min(30_000, Math.max(1_000, Math.floor(opts.idleExitMs / 4))));
  idleTimer.unref();

  // SIGTERM / SIGINT: clean exit.
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.on(sig, () => {
      process.stderr.write(`[embedder] ${sig} received\n`);
      beginExit(null);
    });
  }

  // Keep the process alive until beginExit() calls process.exit.
  return new Promise<number>(() => { /* never resolves; exit via beginExit */ });
}

async function main(): Promise<void> {
  const argv = parseArgv(process.argv.slice(2));
  const opts: DaemonOpts = {
    statePath: argv.statePath ?? defaultEmbedderStatePath(),
    idleExitMs: argv.idleExitMs ?? DEFAULT_IDLE_EXIT_MS,
    fixedPort: argv.fixedPort,
    model: argv.model,
  };
  const code = await runDaemon(opts);
  process.exit(code);
}

// Guard: only run main() when this file is invoked directly, not when
// imported by tests. tsup bundles to CJS where require.main === module is
// the canonical entry-point check; under vitest+tsx the source is loaded
// as a module (require.main !== module), so main() doesn't fire on import.
// `VIKI_EMBEDDER_NO_AUTOSTART=1` provides an explicit override for
// tests that want to import even when require shim treats it as entry.
const _isEntry =
  typeof require !== "undefined" &&
  typeof (require as { main?: unknown }).main !== "undefined" &&
  (require as { main?: unknown }).main === module;
if (_isEntry && process.env["VIKI_EMBEDDER_NO_AUTOSTART"] !== "1") {
  void main();
}
