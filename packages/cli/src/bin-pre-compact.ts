#!/usr/bin/env node
/**
 * PreCompact Hook entry — Stage 2 thin client.
 *
 * Fires when Claude Code is about to compact the transcript. Pre-stage-2,
 * this bin spawned a detached child of itself that ran runFullRescanPipeline
 * inline, with the same leak modes as bin-session-end.
 *
 * Stage 2: hook is a pure thin client. One non-blocking action:
 *   POST /enqueue {kind: "pre-compact", payload: input}. The daemon's
 *   outbox worker drains it and runs runFullRescanPipeline inside the
 *   daemon process. If the daemon is unreachable, enqueueToDaemon falls
 *   back to appending directly to ~/.viki/outbox.jsonl.
 *
 * Result: bundle drops from 7.45 MB → ~200 KB (no pipeline imports). Hook
 * process holds zero ONNX / sqlite / worker_threads references — leak
 * class structurally eliminated.
 *
 * Belt-and-suspenders defenses (from stage 0) remain:
 *   - pipelineTimeoutMs (5s — plenty for one HTTP POST)
 *   - runBinEntry watchdog (15s)
 */
import { appendFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { StopHookInput } from "./bin-stop.js";
import { runAdvancedHook } from "./hook-shell/index.js";
import type { AdvancedHookOptions } from "./hook-shell/index.js";
import { enqueueToDaemon } from "./embedder-client.js";
import { runBinEntry } from "./lib/bin-entry-runner.js";

function normalizePreCompactInput(v: unknown): StopHookInput | null {
  if (typeof v !== "object" || v === null) return null;
  const obj = v as Record<string, unknown>;
  if (typeof obj.session_id !== "string") return null;
  if (typeof obj.cwd !== "string") return null;
  return {
    session_id: obj.session_id,
    transcript_path: typeof obj.transcript_path === "string" ? obj.transcript_path : "",
    cwd: obj.cwd,
    hook_event_name: typeof obj.hook_event_name === "string" ? obj.hook_event_name : "PreCompact",
  };
}

async function main(): Promise<void> {
  await runAdvancedHook<StopHookInput, void, AdvancedHookOptions<StopHookInput, void>>({
    channel: "PreCompact",
    parseInput: normalizePreCompactInput,
    handler: async (ctx) => {
      if (ctx.env.VIKI_DISABLED === "1") {
        return;
      }
      try {
        await enqueueToDaemon(
          { kind: "pre-compact", payload: ctx.input as unknown as Record<string, unknown> },
          { timeoutMs: 1_500 },
        );
      } catch (err) {
        ctx.logError("enqueue-pre-compact", err);
      }
    },
    escape: {
      manualResources: true,
      pipelineTimeoutMs: 5_000,
    },
  });
}

runBinEntry(main, {
  watchdogMs: 15_000,
  onWatchdog: () => {
    try {
      const home = process.env["VIKI_HOME"] ?? os.homedir();
      const logPath = path.join(home, ".viki", "PreCompact-errors.log");
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
      const logPath = path.join(home, ".viki", "PreCompact-errors.log");
      const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
      appendFileSync(
        logPath,
        `[${new Date().toISOString()}] pre-compact-crash pid=${process.pid} err=${msg}\n`,
        "utf-8",
      );
    } catch { /* never block exit on log failure */ }
  },
});
