import { describe, it, expect } from "vitest";
import { runBinEntry } from "../bin-entry-runner.js";

interface CapturedExit {
  code: number | undefined;
}

function makeHooks(captured: CapturedExit, opts?: { fireWatchdog?: boolean }) {
  return {
    setTimeout: (cb: () => void, _ms: number) => {
      if (opts?.fireWatchdog) {
        queueMicrotask(cb);
      }
      return { unref: () => {} };
    },
    exit: ((code: number) => {
      // Record the FIRST exit only — production code may chain a second exit
      // from the catch branch after the success-path exit, but in tests we
      // want to assert on the first one.
      if (captured.code === undefined) captured.code = code;
      // Don't throw — production exitImpl is `never`, but in tests we let the
      // promise chain unwind naturally. Throwing here pollutes vitest output
      // with stack traces from the deliberately-faked "never".
    }) as (code: number) => never,
  };
}

describe("runBinEntry", () => {
  it("calls process.exit(0) when main resolves", async () => {
    const captured: CapturedExit = { code: undefined };
    runBinEntry(async () => { /* fast success */ }, {
      __testHooks: makeHooks(captured),
    });
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

  it("swallows errors thrown by onError (never throws on the way out)", async () => {
    const captured: CapturedExit = { code: undefined };
    runBinEntry(async () => { throw new Error("inner"); }, {
      onError: () => { throw new Error("onError bug"); },
      __testHooks: makeHooks(captured),
    });
    await new Promise((r) => setImmediate(r));
    expect(captured.code).toBe(1);
  });

  it("swallows errors thrown by onWatchdog (never throws on the way out)", async () => {
    const captured: CapturedExit = { code: undefined };
    runBinEntry(
      () => new Promise<void>(() => { /* hang forever */ }),
      {
        onWatchdog: () => { throw new Error("onWatchdog bug"); },
        __testHooks: makeHooks(captured, { fireWatchdog: true }),
      },
    );
    await new Promise((r) => setImmediate(r));
    expect(captured.code).toBe(124);
  });
});
