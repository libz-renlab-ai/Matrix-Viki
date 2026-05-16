import { describe, it, expect } from "vitest";
import {
  parseRepairSemanticArgs,
  formatRepairResult,
} from "../commands/repair-semantic.js";

describe("repair-semantic command", () => {
  it("parses --skip-rebuild flag", () => {
    expect(parseRepairSemanticArgs(["--skip-rebuild"])).toEqual({ skipRebuild: true, dryRun: false, home: undefined });
  });

  it("parses --dry-run flag", () => {
    expect(parseRepairSemanticArgs(["--dry-run"])).toEqual({ skipRebuild: false, dryRun: true, home: undefined });
  });

  it("defaults both flags to false", () => {
    expect(parseRepairSemanticArgs([])).toEqual({ skipRebuild: false, dryRun: false, home: undefined });
  });

  it("formats success result", () => {
    const out = formatRepairResult({ ok: true, ranRebuild: true, ranWarmup: true, error: null, dryRun: false });
    expect(out).toContain("✅");
    expect(out).toContain("semantic ready");
    expect(out).not.toContain("(dry-run)");
    expect(out).not.toContain("would run");
  });

  it("formats failure result with original error", () => {
    const out = formatRepairResult({ ok: false, ranRebuild: true, ranWarmup: true, error: "sharp module crash", dryRun: false });
    expect(out).toContain("❌");
    expect(out).toContain("sharp module crash");
  });

  it("formats dry-run result with 'would run' labels", () => {
    const out = formatRepairResult({ ok: true, ranRebuild: true, ranWarmup: true, error: null, dryRun: true });
    expect(out).toContain("(dry-run preview)");
    expect(out).toContain("would run");
    expect(out).not.toContain(": ran");
  });

  it("parses --home=<path>", () => {
    const opts = parseRepairSemanticArgs(["--home=/tmp/sandbox"]);
    expect(opts.home).toBe("/tmp/sandbox");
  });
});
