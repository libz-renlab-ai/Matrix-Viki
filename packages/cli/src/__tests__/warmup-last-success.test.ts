import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  writeWarmupState,
  writeWarmupLastSuccess,
  defaultWarmupStatePath,
  defaultWarmupLastSuccessPath,
  describeSemanticReadiness,
} from "../warmup-state.js";

describe("describeSemanticReadiness — sticky last-success", () => {
  let home: string;
  beforeEach(() => { home = mkdtempSync(join(tmpdir(), "viki-warmup-")); });
  afterEach(() => { rmSync(home, { recursive: true, force: true }); });

  it("returns ready=true when last-success exists, even if last attempt failed", () => {
    writeWarmupLastSuccess(defaultWarmupLastSuccessPath(home), {
      status: "ready",
      started_at: "2026-05-15T00:00:00Z",
      completed_at: "2026-05-15T00:01:00Z",
      pid: 1234,
      model: "Xenova/multilingual-e5-small",
      cwd: "D:/proj-A",
      node_modules_root: "D:/proj-A/node_modules",
    });
    writeWarmupState(defaultWarmupStatePath(home), {
      status: "failed",
      started_at: "2026-05-16T10:13:24Z",
      completed_at: "2026-05-16T10:13:25Z",
      pid: 5678,
      model: "Xenova/multilingual-e5-small",
      error: "sharp not found",
    });
    const r = describeSemanticReadiness(home);
    expect(r.ready).toBe(true);
    expect(r.reason).toBe("ready_via_last_success");
  });

  it("returns ready=false when only failure state exists", () => {
    writeWarmupState(defaultWarmupStatePath(home), {
      status: "failed",
      started_at: "2026-05-16T10:13:24Z",
      pid: 5678,
      model: "Xenova/multilingual-e5-small",
      error: "sharp not found",
    });
    const r = describeSemanticReadiness(home);
    expect(r.ready).toBe(false);
    expect(r.reason).toBe("failed");
  });

  it("returns ready=false when nothing recorded", () => {
    const r = describeSemanticReadiness(home);
    expect(r.ready).toBe(false);
    expect(r.reason).toBe("missing");
  });

  it("writes last-success file when warmup succeeds", () => {
    const successPath = defaultWarmupLastSuccessPath(home);
    expect(existsSync(successPath)).toBe(false);
    writeWarmupLastSuccess(successPath, {
      status: "ready",
      started_at: "2026-05-16T00:00:00Z",
      completed_at: "2026-05-16T00:01:00Z",
      pid: 1,
      model: "test",
      cwd: "/x",
      node_modules_root: "/x/node_modules",
    });
    expect(existsSync(successPath)).toBe(true);
  });
});
