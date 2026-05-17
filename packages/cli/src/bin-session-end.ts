#!/usr/bin/env node
/**
 * SessionEnd Hook entry — Stage 2 thin client.
 *
 * Pre-stage-2 history: this bin used a "detached self-spawn" pattern —
 * foreground process wrote a tmp payload + spawned a detached child of
 * itself, which then ran the full-rescan pipeline (ONNX + sqlite +
 * worker_threads, 7.8 MB bundle). The child relied on Node's event-loop
 * cleanup to exit, which leaked: mode A (slow exit 30s-2min) and mode B
 * (永远卡死 9.5h). See viki-session-end-hook-leak.md.
 *
 * Stage 2: hook is a pure thin client. Two best-effort, non-blocking
 * actions:
 *   1. POST /shutdown to drop this session's daemon refcount.
 *   2. POST /enqueue {kind: "session-end", payload: input}. The daemon's
 *      outbox worker drains it and runs `runFullRescanPipeline` inside
 *      the daemon process (where ONNX is already loaded). If the daemon
 *      is unreachable, enqueueToDaemon falls back to appending directly
 *      to ~/.viki/outbox.jsonl; the next daemon to start drains it.
 *
 * Result: this bin never imports runFullRescanPipeline or any pipeline
 * dependency. Bundle drops from 7.8 MB → ~50 KB. Leak class eliminated —
 * hook process holds no ONNX / sqlite / worker_threads references.
 *
 * Belt-and-suspenders defenses (from stage 0) remain:
 *   - runAdvancedHook's pipelineTimeoutMs (5s — plenty for two HTTP POSTs)
 *   - runBinEntry watchdog (15s force-exit)
 */
import { appendFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { runAdvancedHook } from "./hook-shell/index.js";
import type { AdvancedHookOptions } from "./hook-shell/index.js";
import type { StopHookInput } from "./bin-stop.js";
import { enqueueToDaemon, postShutdown } from "./embedder-client.js";
import { runBinEntry } from "./lib/bin-entry-runner.js";

/**
 * Validator + normalizer. HookShell requires a real type guard via
 * `parseInput`. Inputs missing `transcript_path` (subagent / vitest
 * sessions never persist a transcript) are normalized to "".
 */
function normalizeStopHookInput(v: unknown): StopHookInput | null {
  if (typeof v !== "object" || v === null) return null;
  const obj = v as Record<string, unknown>;
  if (typeof obj.session_id !== "string") return null;
  if (typeof obj.cwd !== "string") return null;
  const transcript_path =
    typeof obj.transcript_path === "string" ? obj.transcript_path : "";
  const hook_event_name =
    typeof obj.hook_event_name === "string" ? obj.hook_event_name : "SessionEnd";
  return {
    session_id: obj.session_id,
    transcript_path,
    cwd: obj.cwd,
    hook_event_name,
  };
}

async function main(): Promise<void> {
  await runAdvancedHook<StopHookInput, void, AdvancedHookOptions<StopHookInput, void>>({
    channel: "SessionEnd",
    parseInput: normalizeStopHookInput,
    handler: async (ctx) => {
      // Issue #343 PR-1: master kill switch.
      if (ctx.env.VIKI_DISABLED === "1") {
        return;
      }

      // 1. Best-effort daemon refcount drop. Fire-and-forget — never block.
      try {
        void postShutdown(ctx.input.session_id).catch(() => { /* best-effort */ });
      } catch { /* best-effort */ }

      // 2. Enqueue the session-end task. Daemon will drain via its outbox
      // worker; if daemon is offline, enqueueToDaemon writes directly to
      // ~/.viki/outbox.jsonl (the next daemon to start drains it).
      try {
        await enqueueToDaemon(
          { kind: "session-end", payload: ctx.input as unknown as Record<string, unknown> },
          { timeoutMs: 1_500 },
        );
      } catch (err) {
        ctx.logError("enqueue-session-end", err);
      }
    },
    escape: {
      // Hook never opens sqlite / runs pipeline — only two HTTP POSTs.
      manualResources: true,
      // 5s is generous for two ~50ms HTTP POSTs; force-aborts if the
      // daemon is wedged.
      pipelineTimeoutMs: 5_000,
    },
  });
}

runBinEntry(main, {
  // 15s upper bound on total bin lifetime. Stage 2 path should normally
  // resolve in <100ms; anything beyond 15s indicates a hung HTTP POST.
  watchdogMs: 15_000,
  onWatchdog: () => {
    try {
      const home = process.env["VIKI_HOME"] ?? os.homedir();
      const logPath = path.join(home, ".viki", "SessionEnd-errors.log");
      appendFileSync(
        logPath,
        `[${new Date().toISOString()}] watchdog forced exit after 15s, pid=${process.pid}\n`,
        "utf-8",
      );
    } catch { /* never block exit on log failure */ }
  },
  onError: (err) => {
    try {
      const home = process.env["VIKI_HOME"] ?? os.homedir();
      const logPath = path.join(home, ".viki", "SessionEnd-errors.log");
      const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
      appendFileSync(
        logPath,
        `[${new Date().toISOString()}] main-crash pid=${process.pid} err=${msg}\n`,
        "utf-8",
      );
    } catch { /* never block exit on log failure */ }
  },
});
