import { describe, it, expect } from "vitest";
import {
  parseRepairSemanticArgs,
  formatRepairResult,
} from "../commands/repair-semantic.js";

describe("repair-semantic command", () => {
  it("parses --skip-rebuild flag", () => {
    expect(parseRepairSemanticArgs(["--skip-rebuild"])).toEqual({ skipRebuild: true, dryRun: false });
  });

  it("parses --dry-run flag", () => {
    expect(parseRepairSemanticArgs(["--dry-run"])).toEqual({ skipRebuild: false, dryRun: true });
  });

  it("defaults both flags to false", () => {
    expect(parseRepairSemanticArgs([])).toEqual({ skipRebuild: false, dryRun: false });
  });

  it("formats success result", () => {
    const out = formatRepairResult({ ok: true, ranRebuild: true, ranWarmup: true, error: null });
    expect(out).toContain("✅");
    expect(out).toContain("semantic ready");
  });

  it("formats failure result with original error", () => {
    const out = formatRepairResult({ ok: false, ranRebuild: true, ranWarmup: true, error: "sharp module crash" });
    expect(out).toContain("❌");
    expect(out).toContain("sharp module crash");
  });
});
