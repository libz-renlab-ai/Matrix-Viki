# Stages 3-6 Sketch (Continuation Plan)

> **Status:** Sketch only. Stages 0-2 are committed and working. The work below extends the daemon-first architecture into algorithmic + frequency optimizations. Each stage produces working software on its own.

**Where we left off (2026-05-17):**

| Stage | Status | Commits |
|---|---|---|
| Spec | ✓ DONE | 4d59f79 |
| Stage 0 (止血) | ✓ DONE & verified | 53d6eac, 6ccc6ef, b0f1a10 |
| Stage 1 (outbox + worker + /enqueue) | ✓ DONE & verified | 949ecc8, 3a3ed70, 4f77c6a, 21c11a7, b76f763 |
| Stage 2 (thin clients) | PARTIAL — 2 of 5 done | 15a45dd, f1afb60 |
| Stages 3-6 | NOT STARTED | — |

**Remaining stage-2 work** (bin-stop / bin-session-start / bin-updater still have legacy patterns):
- `bin-stop`: trickier — it's the import root for `runStopPipeline` / `runFullRescanPipeline` (which the daemon now uses). Converting bin-stop to thin-client requires extracting those pipelines into a separate module that bin-stop and bin-embedder both import (or moving them entirely to a daemon-only package).
- `bin-session-start`: banner + updater spawn. Banner work is synchronous stderr that can't be deferred. Updater spawn could be enqueued.
- `bin-updater`: npm install can in principle run in the daemon as a long-running task, but the lock-file dance around update-state-lock complicates handoff.

These three are skipped here. The remaining leak risk from them is bounded by stage-0's watchdog (245s for bin-stop, 15s for the others).

---

## Stage 3: Incremental + Sample-Check Pipeline

**Goal:** session-end / pre-compact stop doing full rescan every time; instead run incremental + random sample-hash check; only escalate to full on drift detection. Add a once-per-24h cold-path full rescan as backstop.

**Files to modify:**
- `packages/cli/src/bin-stop.ts` — the `runFullRescanPipeline` function
- `packages/cli/src/bin-embedder.ts` — the `session-end` / `pre-compact` worker handlers

**Sketch:**
1. New helper `sampleAndCheckHashes(transcriptPath, n)`:
   - Read last `n` rows of `events_log` table (knowledge.db) that link to indexed transcript turns
   - For each: re-hash the source transcript turn; compare with stored hash
   - Return `{ checkedCount, mismatchCount, missingCount }`
2. New helper `shouldRunDailyCold(home)`:
   - Read `~/.viki/.last-full-rescan` (ISO timestamp)
   - Return true if > 24 hours ago
3. Worker handler change:
   ```ts
   "session-end": async (payload) => {
     // 1. Incremental
     await runStopPipeline({ ...payload, fullRescan: false });
     // 2. Sample check
     const drift = await sampleAndCheckHashes(payload.transcript_path, 10);
     if (drift.mismatchCount > 0) {
       await runFullRescanPipeline(payload as StopHookInput);
     } else if (await shouldRunDailyCold(home)) {
       // Cold path: kick off but don't await — daemon worker is single-threaded
       // so this'll just run next iteration
       appendOutboxTask(outPaths, { kind: "cold-full-rescan", payload });
     }
   }
   ```
4. New handler `"cold-full-rescan"` that calls `runFullRescanPipeline` and writes `~/.viki/.last-full-rescan`.

**Bundle impact:** none new (everything in daemon already).

**Risk:** if `sampleAndCheckHashes` finds false positives (e.g., transcript rewriting from Claude Code) it'd over-trigger full rescan. Mitigate by tolerating up to N mismatches before escalating.

---

## Stage 4: Model Idle Unload

**Goal:** daemon-loaded ONNX model unloads after 5 min idle; reloads on next `/embed` (3-4s penalty amortized over hours of idle time).

**Files to modify:**
- `packages/cli/src/bin-embedder.ts` — `embedder` lifecycle

**Sketch:**
1. Wrap embedder in a holder:
   ```ts
   interface EmbedderHolder { current: XenovaRuleEmbedder | null; lastUsedAt: number; }
   ```
2. `/embed` route: if `holder.current === null`, `await loadEmbedder()`; update `lastUsedAt`.
3. New `model-idle-timer` (setInterval, 60s):
   - if `inFlight === 0` and `Date.now() - lastUsedAt > 5 * 60 * 1000` and `holder.current !== null`:
     - call dispose / release on the XenovaRuleEmbedder if it exists
     - `holder.current = null`
     - log `[embedder] model unloaded (idle 5min); RSS should drop to ~50MB`
4. The daemon process itself stays alive (idle-exit is 30 min); only the model frees.

**Bundle impact:** ~+10 LOC.

**Risk:** dispose semantics in `@xenova/transformers` aren't documented as cleanly releasing all native memory; may need explicit GC trigger or process-level memory check to confirm impact.

---

## Stage 5: Trigger Frequency Reduction

**Goal:** PreToolUse / PostToolUse / UserPromptSubmit only trigger work when the call carries signal.

**Files to modify:**
- `packages/cli/src/bin-pre-tool-use.ts`
- `packages/cli/src/bin-post-tool-use.ts`
- `packages/cli/src/bin-user-prompt-submit.ts`

**Sketch:**

```ts
// At top of bin-pre-tool-use handler:
const MUTATING_TOOLS = new Set(["Bash", "Edit", "Write", "MultiEdit", "NotebookEdit"]);
if (!MUTATING_TOOLS.has(input.tool_name)) {
  return { permissionDecision: "allow" };  // skip retriever entirely
}
```

```ts
// At top of bin-user-prompt-submit handler:
if (input.prompt.trim().length < 20) {
  return { /* empty injection envelope */ };
}
```

Plus daemon-side debouncing: in the `session-end` worker handler, before running, check `~/.viki/.last-session-end-<session_id>` and skip if last run was < 30s ago.

**Bundle impact:** ~+30 LOC.

**Risk:** users might rely on rules firing for read-only tools (e.g., "warn before Read of `.env`"). Make the whitelist configurable via `viki config set pretool-whitelist Read,Bash,...`.

---

## Stage 6: Daemon Semaphore + Cold Scheduler

**Goal:** cap concurrent `/embed` requests at 2; route worker-internal embed calls with higher priority; cold-path tasks only run when system load is low.

**Files to modify:**
- `packages/cli/src/bin-embedder.ts`

**Sketch (semaphore):**
1. `let activeEmbeds = 0;` near `inFlight`.
2. `/embed` route: if `activeEmbeds >= 2`, return 503 + `Retry-After: 1`. Otherwise increment, await, decrement.
3. Worker-internal embeds (in handlers) bypass the limit because they aren't routed through HTTP (the worker calls the embedder directly).

**Sketch (cold scheduler):**
1. New `daemon-cold-scheduler.ts` runs a setInterval(60s) inside the daemon:
   - Reads CPU load (`os.loadavg()` on POSIX; `wmic cpu get loadpercentage` on Windows)
   - If < 30% load, allows cold-queue tasks to run
   - Otherwise skip this tick
2. Cold queue is just outbox entries with `kind` starting with `"cold-"` — separate handler lookup path.

**Risk:** Windows CPU measurement via `wmic` is slow (~500ms). Use `os.cpus()` delta sampling instead.

---

## Acceptance Tests for Stages 3-6 Together

Beyond the existing spec §6 criteria:

- **Stage 3 acceptance:** transcript with 10 turns appended one-at-a-time triggers 10 incremental rescans + 1 cold full rescan after 24h. Drift simulation (modify a stored hash) escalates to full.
- **Stage 4 acceptance:** daemon RSS settles at < 100 MB after 6 minutes idle. First `/embed` after that has p99 latency under 6s (cold ONNX load).
- **Stage 5 acceptance:** running `viki bench tool-call` shows Read / Glob / Grep at < 5 ms median; Bash / Edit / Write retain full retriever latency budget (< 80 ms).
- **Stage 6 acceptance:** concurrent 10 `/embed` POSTs return 8x 200 + 2x 503; on a busy laptop (CPU > 50%) cold-path tasks are delayed until CPU drops.

---

## Pickup Procedure

When resuming this work:

1. Read this file + `2026-05-17-daemon-first-redesign.md` (the spec)
2. Confirm stage 0-2 commits are still in place (`git log --oneline | head -10`)
3. Verify `~/.viki/outbox.jsonl` exists and `bin-session-end.cjs` is ~200 KB (the thin-client version)
4. Pick stage 3, 4, 5, or 6 based on which is most painful right now (recommended order: 4 → 5 → 3 → 6, smallest to largest)
5. Follow the brainstorming → writing-plans → execute pattern, using stage 0/1 plans as templates

Each stage is independently shippable.
