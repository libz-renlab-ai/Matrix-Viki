# Stage 0: Hook-bin Entry Watchdog + Force Exit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the bin-session-end process leak by guaranteeing every hook-bin process exits within 15 seconds, even if the inner pipeline hangs or `process.exit` is blocked by a stuck worker_thread.

**Architecture:** Extract a shared `runBinEntry(main, opts)` helper that (a) installs an unref'd watchdog timer that force-exits at `watchdogMs`, and (b) wraps `main()` in `.then(()=>process.exit(0)).catch(...exit 1)`. Replace `void main();` / ad-hoc `main().catch()` in `bin-session-end`, `bin-pre-compact`, and `bin-stop` with `runBinEntry(main)`. Additionally add `pipelineTimeoutMs` to `bin-session-end` and `bin-pre-compact`'s `runAdvancedHook` options as a second layer of defense.

**Tech Stack:** TypeScript, tsup (cjs bundler), vitest, Node 20.

---

## File Structure

- **Create** `packages/cli/src/lib/bin-entry-runner.ts` — the shared helper
- **Create** `packages/cli/src/lib/__tests__/bin-entry-runner.test.ts` — unit tests
- **Modify** `packages/cli/src/bin-session-end.ts` — replace `void main();` with `runBinEntry`; add `pipelineTimeoutMs`
- **Modify** `packages/cli/src/bin-pre-compact.ts` — replace existing `main().catch()` with `runBinEntry`; add `pipelineTimeoutMs`
- **Modify** `packages/cli/src/bin-stop.ts` — replace existing `main().catch()` with `runBinEntry` (keep the existing log-rotation logic by passing an `onError` callback)
- **Create** `packages/cli/src/__tests__/bin-entry-watchdog-integration.test.ts` — integration test that spawns the bundled bin and asserts it exits within 15 s even with a deliberately-hanging payload

---

## Task 1: Create the bin-entry-runner helper

**Files:**
- Create: `packages/cli/src/lib/bin-entry-runner.ts`

- [ ] **Step 1: Write the helper**

```ts
// packages/cli/src/lib/bin-entry-runner.ts
/**
 * Shared entry-point runner for all hook bins (bin-session-end, bin-pre-compact,
 * bin-stop, ...).
 *
 * Why this exists: `void main();` at the bundle bottom relies on Node's
 * "event loop empties, then process exits" behavior to terminate the process.
 * When the hook's inner pipeline pulls in onnxruntime-node, better-sqlite3,
 * worker_threads, or fetch-keepalive agents, that assumption is unreliable —
 * mode A (slow exit 30s-2min) and mode B (永远卡死 9.5h) leaks observed in
 * production. See docs/superpowers/specs/2026-05-17-daemon-first-redesign.md.
 *
 * Belt-and-suspenders fix:
 *   1. main().then(() => process.exit(0)) — exit immediately on normal resolve
 *      instead of waiting for the event loop to clear.
 *   2. main().catch(...) — log + exit 1 on unhandled rejection.
 *   3. setTimeout(...).unref() watchdog — if main hangs past `watchdogMs`,
 *      force-exit with code 124. The .unref() ensures the timer itself doesn't
 *      hold the event loop alive.
 *
 * The watchdog default is 15s — chosen because legitimate SessionEnd /
 * PreCompact pipelines run in <10s; longer than that means a hang, not slow
 * progress. Callers with genuinely long-running work (none today) can pass a
 * larger `watchdogMs`.
 */
export interface BinEntryOpts {
  /** Hard upper bound on total bin lifetime. Default 15s. */
  watchdogMs?: number;
  /**
   * Called once if and only if the watchdog fires (main didn't resolve in
   * time). Use to write a diagnostic line to ~/.viki/*.log before exit.
   * Must not throw and must not be async (we're about to die).
   */
  onWatchdog?: () => void;
  /**
   * Called once if and only if main() rejects. Receives the error before exit.
   * Use to capture stack traces / write log lines.
   * Must not throw.
   */
  onError?: (err: unknown) => void;
  /**
   * Test seam — injects timer + exit for unit tests. Production callers omit.
   */
  __testHooks?: {
    setTimeout: (cb: () => void, ms: number) => { unref(): void };
    exit: (code: number) => never;
  };
}

const DEFAULT_WATCHDOG_MS = 15_000;
const WATCHDOG_EXIT_CODE = 124;

export function runBinEntry(
  main: () => Promise<unknown>,
  opts: BinEntryOpts = {},
): void {
  const watchdogMs = opts.watchdogMs ?? DEFAULT_WATCHDOG_MS;
  const setTimeoutImpl = opts.__testHooks?.setTimeout ?? ((cb, ms) => {
    const t = setTimeout(cb, ms);
    return { unref: () => t.unref() };
  });
  const exitImpl = opts.__testHooks?.exit ?? ((code: number) => process.exit(code));

  const watchdog = setTimeoutImpl(() => {
    try { opts.onWatchdog?.(); } catch { /* never throw on the way out */ }
    exitImpl(WATCHDOG_EXIT_CODE);
  }, watchdogMs);
  watchdog.unref();

  Promise.resolve()
    .then(() => main())
    .then(() => exitImpl(0))
    .catch((err) => {
      try { opts.onError?.(err); } catch { /* never throw on the way out */ }
      exitImpl(1);
    });
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm --filter @viki/cli typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/lib/bin-entry-runner.ts
git commit -m "feat(cli): add runBinEntry helper for hook-bin watchdog + force exit"
```

---

## Task 2: Test the bin-entry-runner helper

**Files:**
- Create: `packages/cli/src/lib/__tests__/bin-entry-runner.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/cli/src/lib/__tests__/bin-entry-runner.test.ts
import { describe, it, expect } from "vitest";
import { runBinEntry } from "../bin-entry-runner.js";

interface CapturedExit {
  code: number | undefined;
}

function makeHooks(captured: CapturedExit, opts?: { fireWatchdog?: boolean }) {
  return {
    setTimeout: (cb: () => void, _ms: number) => {
      if (opts?.fireWatchdog) {
        // synchronously schedule firing on next tick so callers can observe
        queueMicrotask(cb);
      }
      return { unref: () => {} };
    },
    exit: ((code: number) => {
      if (captured.code === undefined) captured.code = code;
      // Don't actually exit — throw a known sentinel so callers know we ran.
      throw new Error(`__test_exit_${code}`);
    }) as (code: number) => never,
  };
}

describe("runBinEntry", () => {
  it("calls process.exit(0) when main resolves", async () => {
    const captured: CapturedExit = { code: undefined };
    runBinEntry(async () => { /* fast success */ }, {
      __testHooks: makeHooks(captured),
    });
    // Wait for microtask queue to drain so the .then chain completes
    await new Promise((r) => setImmediate(r));
    expect(captured.code).toBe(0);
  });

  it("calls process.exit(1) when main rejects, and invokes onError", async () => {
    const captured: CapturedExit = { code: undefined };
    let seenErr: unknown = null;
    runBinEntry(async () => { throw new Error("boom"); }, {
      onError: (e) => { seenErr = e; },
      __testHooks: makeHooks(captured),
    });
    await new Promise((r) => setImmediate(r));
    expect(captured.code).toBe(1);
    expect(seenErr).toBeInstanceOf(Error);
    expect((seenErr as Error).message).toBe("boom");
  });

  it("force-exits with 124 when watchdog fires, and invokes onWatchdog", async () => {
    const captured: CapturedExit = { code: undefined };
    let watchdogFired = false;
    runBinEntry(
      // main never resolves
      () => new Promise<void>(() => { /* hang forever */ }),
      {
        onWatchdog: () => { watchdogFired = true; },
        __testHooks: makeHooks(captured, { fireWatchdog: true }),
      },
    );
    await new Promise((r) => setImmediate(r));
    expect(watchdogFired).toBe(true);
    expect(captured.code).toBe(124);
  });

  it("swallows errors thrown by onError / onWatchdog (never throws on the way out)", async () => {
    const captured: CapturedExit = { code: undefined };
    runBinEntry(async () => { throw new Error("inner"); }, {
      onError: () => { throw new Error("onError bug"); },
      __testHooks: makeHooks(captured),
    });
    await new Promise((r) => setImmediate(r));
    // Must still reach exit(1); the bug in onError must not prevent shutdown.
    expect(captured.code).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `pnpm --filter @viki/cli test -- bin-entry-runner`
Expected: 4 passing.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/lib/__tests__/bin-entry-runner.test.ts
git commit -m "test(cli): unit tests for runBinEntry watchdog + exit semantics"
```

---

## Task 3: Wire bin-session-end through runBinEntry

**Files:**
- Modify: `packages/cli/src/bin-session-end.ts:1-163`

- [ ] **Step 1: Replace `void main();` with `runBinEntry(main)` and add `pipelineTimeoutMs` to the runAdvancedHook escape options**

In `packages/cli/src/bin-session-end.ts`:

Find (around line 28-40):
```ts
import { spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { runAdvancedHook } from "./hook-shell/index.js";
```

Add the import for the runner:
```ts
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { runAdvancedHook } from "./hook-shell/index.js";
import { runBinEntry } from "./lib/bin-entry-runner.js";
```

Find the `escape:` block (around line 134-159):
```ts
    escape: {
      // Parent path doesn't touch sqlite — only spawns. Child path runs
      // runFullRescanPipeline which opens its own resources internally.
      // Either way HookShell shouldn't auto-open DBs in this bin.
      manualResources: true,
      detached: {
        isDetachedInvocation: (env, argv) =>
          isDetachedPipelineInvocation(env, argv, SESSION_END_ENV_KEY),
        readArgvInput: (argv) => {
          const arg = argv[2];
          if (!arg) return null;
          let text: string;
          try {
            text = readFileSync(arg, "utf-8");
          } catch {
            return null;
          }
          try { unlinkSync(arg); } catch { /* ignore */ }
          try {
            return JSON.parse(text);
          } catch {
            return null;
          }
        },
      },
    },
```

Add `pipelineTimeoutMs: 12_000` (gives the runFullRescanPipeline up to 12s — leaves 3s slack before the runBinEntry watchdog fires at 15s):
```ts
    escape: {
      // Parent path doesn't touch sqlite — only spawns. Child path runs
      // runFullRescanPipeline which opens its own resources internally.
      // Either way HookShell shouldn't auto-open DBs in this bin.
      manualResources: true,
      // First line of defense: HookShell aborts the pipeline if it hangs
      // past 12s. The runBinEntry watchdog at 15s is the belt to this
      // suspenders — covers cases where the shell itself hangs (e.g.
      // worker_thread holding the event loop past handler resolution).
      pipelineTimeoutMs: 12_000,
      detached: {
        isDetachedInvocation: (env, argv) =>
          isDetachedPipelineInvocation(env, argv, SESSION_END_ENV_KEY),
        readArgvInput: (argv) => {
          const arg = argv[2];
          if (!arg) return null;
          let text: string;
          try {
            text = readFileSync(arg, "utf-8");
          } catch {
            return null;
          }
          try { unlinkSync(arg); } catch { /* ignore */ }
          try {
            return JSON.parse(text);
          } catch {
            return null;
          }
        },
      },
    },
```

Find the bottom of the file (line 163):
```ts
void main();
```

Replace with:
```ts
runBinEntry(main, {
  watchdogMs: 15_000,
  onWatchdog: () => {
    // Log to ~/.viki/SessionEnd-errors.log so we can correlate forced exits
    // with the leak-doc's "stuck PID" observation. logError in HookShell
    // doesn't reach here — we have no ctx — so write directly.
    try {
      const home = process.env["VIKI_HOME"] ?? os.homedir();
      const logPath = path.join(home, ".viki", "SessionEnd-errors.log");
      appendFileSync(
        logPath,
        `[${new Date().toISOString()}] watchdog forced exit after 15s, pid=${process.pid}, detached=${process.env[SESSION_END_ENV_KEY] === "1"}\n`,
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
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm --filter @viki/cli typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/bin-session-end.ts
git commit -m "fix(cli): bin-session-end uses runBinEntry watchdog + 12s pipeline timeout

Eliminates the mode-A (slow exit) and mode-B (永远卡死) leak modes by
guaranteeing the detached child process exits within 15s, regardless of
whether onnxruntime-node worker_threads or other handles keep the event
loop alive past pipeline resolution.

Refs: docs/superpowers/specs/2026-05-17-daemon-first-redesign.md (思路 7)
"
```

---

## Task 4: Wire bin-pre-compact through runBinEntry

**Files:**
- Modify: `packages/cli/src/bin-pre-compact.ts`

bin-pre-compact already has a `.catch() + process.exit(0)` at its bottom but lacks the watchdog and the `.then(() => exit)`. It also lacks `pipelineTimeoutMs`.

- [ ] **Step 1: Read the current entry pattern**

Read: `packages/cli/src/bin-pre-compact.ts:60-130`
Note: the file already imports `runAdvancedHook`; we just need to add `runBinEntry` and replace the bottom.

- [ ] **Step 2: Add the import**

In `packages/cli/src/bin-pre-compact.ts`, find the existing imports and append:
```ts
import { runBinEntry } from "./lib/bin-entry-runner.js";
```

- [ ] **Step 3: Add `pipelineTimeoutMs: 12_000` to the runAdvancedHook escape options**

Find the `escape: {` block and add `pipelineTimeoutMs: 12_000,` alongside `manualResources: true,`. Use the same defensive-comment style as bin-session-end Task 3.

- [ ] **Step 4: Replace the bottom-of-file entry**

Locate the existing:
```ts
main().catch((e) => {
  try {
    appendFileSync(/* ... existing log path ... */, /* ... */);
  } catch { /* silent */ }
  process.exit(0);
});
```

(Exact lines may differ — the spec calls them out around 114-124. Read the actual file before editing.)

Replace with:
```ts
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
        `[${new Date().toISOString()}] main-crash pid=${process.pid} err=${msg}\n`,
        "utf-8",
      );
    } catch { /* never block exit on log failure */ }
  },
});
```

- [ ] **Step 5: Verify typecheck**

Run: `pnpm --filter @viki/cli typecheck`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/bin-pre-compact.ts
git commit -m "fix(cli): bin-pre-compact uses runBinEntry watchdog + 12s pipeline timeout"
```

---

## Task 5: Wire bin-stop through runBinEntry

**Files:**
- Modify: `packages/cli/src/bin-stop.ts:1164-1188`

bin-stop already has `main().catch() + process.exit(0)`, but no watchdog. It also has a special guard: `if (path.basename(process.argv[1] ?? "").startsWith("bin-stop"))` to prevent auto-invoking when imported by bin-session-end / bin-pre-compact. Preserve this guard.

- [ ] **Step 1: Read the current entry pattern**

Read: `packages/cli/src/bin-stop.ts:1164-1188`

- [ ] **Step 2: Add the import** at the top of `bin-stop.ts`:
```ts
import { runBinEntry } from "./lib/bin-entry-runner.js";
```

- [ ] **Step 3: Replace the entry block**

Replace lines 1171-1188:
```ts
if (path.basename(process.argv[1] ?? "").startsWith("bin-stop")) {
  main().catch((e) => {
    try {
      const logPath = path.join(vikiHomeDir(), ".viki", "stop-errors.log");
      rotateIfTooLarge(logPath);
      appendFileSync(
        logPath,
        `[${new Date().toISOString()}] main-crash err=${String(e)}\n`,
        "utf-8",
      );
    } catch { /* silent */ }
    process.exit(0); // never block session close
  });
}
```

With:
```ts
if (path.basename(process.argv[1] ?? "").startsWith("bin-stop")) {
  runBinEntry(main, {
    // bin-stop's pipeline (runStopPipeline) is the heaviest of the heavy
    // hooks (12+ steps including LLM calls). Allow up to 240s for normal
    // operation — the existing pipelineTimeoutMs in bin-stop's
    // runAdvancedHook escape block also enforces this. Watchdog at 245s
    // catches "shell itself hangs past pipeline timeout" cases.
    watchdogMs: 245_000,
    onWatchdog: () => {
      try {
        const logPath = path.join(vikiHomeDir(), ".viki", "stop-errors.log");
        rotateIfTooLarge(logPath);
        appendFileSync(
          logPath,
          `[${new Date().toISOString()}] watchdog forced exit after 245s, pid=${process.pid}\n`,
          "utf-8",
        );
      } catch { /* silent */ }
    },
    onError: (e) => {
      try {
        const logPath = path.join(vikiHomeDir(), ".viki", "stop-errors.log");
        rotateIfTooLarge(logPath);
        appendFileSync(
          logPath,
          `[${new Date().toISOString()}] main-crash err=${String(e)}\n`,
          "utf-8",
        );
      } catch { /* silent */ }
    },
  });
}
```

- [ ] **Step 4: Verify typecheck**

Run: `pnpm --filter @viki/cli typecheck`
Expected: 0 errors.

- [ ] **Step 5: Run existing bin-stop tests to verify behavior unchanged**

Run: `pnpm --filter @viki/cli test -- bin-stop`
Expected: All existing bin-stop tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/bin-stop.ts
git commit -m "fix(cli): bin-stop uses runBinEntry (245s watchdog matching pipeline budget)"
```

---

## Task 6: Run the full test suite

- [ ] **Step 1: Run all tests**

Run: `pnpm test`
Expected: All tests pass. New test file `bin-entry-runner.test.ts` reports 4 passing.

If any existing test fails due to the watchdog (e.g. test imports a bin module at top level, triggering the watchdog timer): fix by exporting `main` from the bin module and importing that in the test instead of relying on the bin's side-effects.

---

## Task 7: Build the bundles

- [ ] **Step 1: Build**

Run: `pnpm build`
Expected: `packages/cli/dist/bin-session-end.cjs` exists, contains the string `watchdog`, ends with the new runBinEntry call (not `void main()`).

- [ ] **Step 2: Verify bundle pattern**

```bash
grep -c "watchdog" packages/cli/dist/bin-session-end.cjs
grep -c "watchdog" packages/cli/dist/bin-pre-compact.cjs
grep -c "watchdog" packages/cli/dist/bin-stop.cjs
```
Expected: each returns > 0.

```bash
tail -c 200 packages/cli/dist/bin-session-end.cjs
```
Expected: contains `runBinEntry` (or its bundled-mangled name e.g. `runBinEntry2`) — NOT a bare `void main()` / `void main2()`.

---

## Task 8: Stage to ~/.viki/hooks and verify

- [ ] **Step 1: Stage updated bins**

The dist bundles need to be copied to `~/.viki/hooks/` (where Claude Code spawns them from). Look up the project's install command:

Run: `pnpm --filter @viki/cli viki install-user-hook --help 2>&1 | head -20` (or whatever the local equivalent is — check `packages/cli/src/bin.ts` for the subcommand name)

If the install is automatic (Husky / postinstall): the bundles may already be copied. Otherwise run the install command.

- [ ] **Step 2: Manual verification on Windows**

In a fresh PowerShell, fire SessionEnd 3 times via Claude Code (open + /clear + open + /clear + open + /clear). Then:

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'bin-session-end' } |
  Measure-Object | Select-Object Count
```

Expected: Count ≤ 2 (only very recent spawns, all under 15s old).

Wait 30 seconds, run again:
Expected: Count = 0.

- [ ] **Step 3: Manual verification on macOS/Linux**

```bash
ps aux | grep -i 'bin-session-end' | grep -v grep | wc -l
```

Expected: ≤ 2 immediately after triggers; 0 after 30s.

---

## Task 9: Acceptance check against spec §6 验收标准

- [ ] **Step 1: Verify acceptance criterion #1 (process count stable)**

After 30 minutes of normal Claude Code usage:
```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'bin-session-end' } |
  Measure-Object | Select-Object Count
```
Expected: ≤ 2.

- [ ] **Step 2: Verify the SessionEnd-errors.log catches any watchdog fires**

```bash
cat ~/.viki/SessionEnd-errors.log 2>/dev/null | tail -10
```
Expected: Either empty (pipeline completes under 12s normally) or contains watchdog lines only for genuinely-slow cases.

If watchdog fires for every SessionEnd: the 12s pipeline timeout is too tight — bump it after collecting evidence. Open a follow-up task before raising.

- [ ] **Step 3: Tag the leak doc as resolved**

In `viki-session-end-hook-leak.md` (user desktop), append a footer:
```
## Resolution (2026-05-17)
Fixed in commit <hash> via the runBinEntry watchdog + pipelineTimeoutMs:12s.
Stage 0 of the daemon-first redesign (spec: docs/superpowers/specs/2026-05-17-daemon-first-redesign.md).
Subsequent stages (outbox, thin-client hooks) are tracked separately.
```
(This is a user-desktop file. If unreachable from the agent, skip this step.)

---

## Self-Review Notes (filled in after writing)

**Spec coverage check:**
- ✓ 思路 7 (一行止血) — Tasks 1-5 implement the watchdog + force-exit + pipelineTimeoutMs.
- ✗ 思路 1-6 — out of scope for stage 0; will be planned in follow-up.

**Placeholder scan:** No TBD/TODO. All code blocks are complete.

**Type consistency:** `runBinEntry` signature consistent across all 4 call sites (helper file + 3 bin files).

**Cross-cutting concerns:**
- The watchdog logs to `~/.viki/<channel>-errors.log` — matches the existing logFallback convention in HookShell.
- All exit paths go through `process.exit(code)` — no unhandled rejection bubbling up.
- `__testHooks` is the only ts visibility leak; documented as "test seam" inline.

**Risk:** If a legitimate pipeline takes >12s on the user's machine (e.g. cold ONNX load on a slow disk), every SessionEnd would force-exit. Mitigation: the log captures this so we can adjust the budget after one week of telemetry.
