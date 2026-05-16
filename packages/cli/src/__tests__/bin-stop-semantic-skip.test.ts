/**
 * Isolated test for the "semantic-skipped" emit path in runStopPipeline.
 *
 * Kept in a separate file so that the three vi.mock() calls below (warmup-state,
 * stop-narrative-scan, @viki/adapters) do NOT affect the pre-existing tests in
 * bin-stop.test.ts — those tests relied on the real adapters for coverage.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { runStopPipeline, type StopHookInput } from "../bin-stop.js";

// --- Three mocks that must stay isolated to this file ---

// Mock warmup-state so tests can control readiness without touching os.homedir()
vi.mock("../warmup-state.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../warmup-state.js")>();
  return {
    ...original,
    describeSemanticReadiness: vi.fn(() => ({
      ready: true,
      reason: "ready_via_state",
      state: null,
      lastSuccess: null,
    })),
  };
});

// Mock stop-narrative-scan to avoid SQLite I/O
vi.mock("../stop-narrative-scan.js", () => ({
  runStopNarrativeScan: vi.fn(),
  readLastInjected: vi.fn(() => []),
  lastInjectedFilePath: vi.fn((dir: string, sid: string) => `${dir}/${sid}.last-injected.json`),
}));

// Mock @viki/adapters to avoid SQLite I/O in narrative-scan step
vi.mock("@viki/adapters", async (importOriginal) => {
  const original = await importOriginal<typeof import("@viki/adapters")>();
  const fakeDb = {
    prepare: vi.fn(() => ({ all: vi.fn(() => []), run: vi.fn() })),
    close: vi.fn(),
  };
  const FakeDualLayerStore = vi.fn(() => ({ findActive: vi.fn(() => []), close: vi.fn() }));
  const FakeSqliteEventLog = vi.fn(() => ({ append: vi.fn(), close: vi.fn() }));
  return {
    ...original,
    openDb: vi.fn(() => fakeDb),
    DualLayerStore: FakeDualLayerStore,
    SqliteEventLog: FakeSqliteEventLog,
    syncRuleVectors: vi.fn(),
  };
});

// --- Supporting mocks required to make runStopPipeline runnable at all ---

vi.mock("../commands/analyze.js", () => ({
  executeAnalyze: vi.fn().mockResolvedValue("analyze done"),
}));
vi.mock("../commands/calibrate.js", () => ({
  executeCalibrate: vi.fn().mockResolvedValue({ dryRun: false }),
}));
vi.mock("../commands/compile.js", () => ({
  executeCompile: vi.fn().mockResolvedValue({
    markdown: { path: "CLAUDE.md", blockLineCount: 5 },
    skills: { written: [], removed: [] },
  }),
}));
vi.mock("../commands/scan-errors.js", () => ({
  executeScanErrors: vi.fn().mockResolvedValue(""),
}));
vi.mock("../commands/recent-entries.js", () => ({
  getRecentEntries: vi.fn().mockResolvedValue([]),
}));
vi.mock("../harvest-writer.js", () => ({
  appendHarvest: vi.fn(),
  getHarvestPath: vi.fn((cwd: string) => `${cwd}/.viki/last-harvest.md`),
}));
vi.mock("../scan-cursor.js", () => ({
  readCursor: vi.fn(() => -1),
  writeCursor: vi.fn(),
  clearCursor: vi.fn(),
  readSeen: vi.fn(() => new Set<string>()),
  writeSeen: vi.fn(),
}));

import { describeSemanticReadiness } from "../warmup-state.js";

describe("runStopPipeline — semantic-skipped event", () => {
  let transcriptPath: string;
  let testVikiHome: string;
  let originalVikiHome: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    transcriptPath = path.join(
      os.tmpdir(),
      `bin-stop-sem-skip-test-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`,
    );
    testVikiHome = fs.mkdtempSync(path.join(os.tmpdir(), "viki-home-sem-"));
    originalVikiHome = process.env.VIKI_HOME;
    process.env.VIKI_HOME = testVikiHome;
  });

  afterEach(() => {
    try { fs.unlinkSync(transcriptPath); } catch { /* ignore */ }
    if (originalVikiHome === undefined) delete process.env.VIKI_HOME;
    else process.env.VIKI_HOME = originalVikiHome;
    fs.rmSync(testVikiHome, { recursive: true, force: true });
  });

  it("emits semantic-skipped when warmup state is failed", async () => {
    // Override describeSemanticReadiness to return not-ready with reason "failed"
    vi.mocked(describeSemanticReadiness).mockReturnValueOnce({
      ready: false,
      reason: "failed",
      state: null,
      lastSuccess: null,
    });

    // Write a minimal valid transcript so parseSessionFile sees at least one turn
    // (lastTurn must be defined for the semantic gate branch to be reached).
    const userLine = JSON.stringify({
      type: "user",
      message: { role: "user", content: "hello" },
    });
    const assistantLine = JSON.stringify({
      type: "assistant",
      message: { role: "assistant", content: [{ type: "text", text: "hi" }] },
    });
    fs.writeFileSync(transcriptPath, `${userLine}\n${assistantLine}\n`, "utf-8");

    const emitted: Array<Record<string, unknown>> = [];
    const input: StopHookInput = {
      session_id: "skip-test",
      transcript_path: transcriptPath,
      cwd: process.cwd(),
      hook_event_name: "Stop",
    };
    await runStopPipeline(input, {
      emit: (e) => emitted.push(e as unknown as Record<string, unknown>),
    });

    const skipEvent = emitted.find((e) => e["kind"] === "hook-stop.semantic-skipped");
    expect(skipEvent).toBeDefined();
    expect(skipEvent?.["reason"]).toBe("failed");
  });
});
