import { describe, it, expect } from "vitest";
import { runSkeletonDemo } from "../commands/skeleton-demo.js";

describe("runSkeletonDemo", () => {
  const fixedNow = "2026-04-14T00:00:00Z";

  it("smart mode (default) → includes attribution block header", async () => {
    const out = await runSkeletonDemo({ env: {}, now: fixedNow });
    expect(out).toContain("✨ Viki");
    expect(out).toContain("本次操作归因");
    expect(out).toContain("[skeleton]");
  });

  it("smart mode does NOT include counterfactual line", async () => {
    const out = await runSkeletonDemo({
      env: { VIKI_VISIBILITY: "smart" },
      now: fixedNow,
    });
    expect(out).not.toContain("如果没有 Viki");
  });

  it("silent mode → empty output", async () => {
    const out = await runSkeletonDemo({
      env: { VIKI_VISIBILITY: "silent" },
      now: fixedNow,
    });
    expect(out).toBe("");
  });

  it("verbose mode → includes counterfactual + raw JSON", async () => {
    const out = await runSkeletonDemo({
      env: { VIKI_VISIBILITY: "verbose" },
      now: fixedNow,
    });
    expect(out).toContain("如果没有 Viki");
    expect(out).toContain("Walking Skeleton");
    expect(out).toContain('"source"');
  });

  it("unknown mode falls back to default (verbose)", async () => {
    const out = await runSkeletonDemo({
      env: { VIKI_VISIBILITY: "dev" },
      now: fixedNow,
    });
    expect(out).toContain("✨ Viki");
    expect(out).toContain("如果没有 Viki");
  });
});
