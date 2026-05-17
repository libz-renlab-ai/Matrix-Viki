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
 * progress. Callers with genuinely long-running work (bin-stop) pass a
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
