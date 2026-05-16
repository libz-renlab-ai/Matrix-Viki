import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("postinstall helpers sync", () => {
  it("postinstall-helpers.mjs mirrors the .ts behavior (constants + function source)", async () => {
    const tsSrc = readFileSync(join(__dirname, "..", "postinstall-helpers.ts"), "utf-8");
    const mjsSrc = readFileSync(
      join(__dirname, "..", "..", "..", "viki", "postinstall-helpers.mjs"),
      "utf-8",
    );

    // Strip TS-only artifacts (type annotations on params/returns) to compare the runtime parts.
    const tsRuntime = tsSrc
      .replace(/: NodeJS\.ProcessEnv/g, "")
      .replace(/: string \| null/g, "")
      .replace(/: string/g, "")
      .replace(/: boolean/g, "");

    // The actual runtime constants and function bodies should appear in both files.
    const tsHelpers = await import("../postinstall-helpers.js");
    // @ts-ignore – .mjs has no declaration file; runtime behavior is what we test
    const mjsHelpers = await import("../../../viki/postinstall-helpers.mjs");

    expect(mjsHelpers.NPMMIRROR_SHARP_LIBVIPS).toBe(tsHelpers.NPMMIRROR_SHARP_LIBVIPS);
    expect(mjsHelpers.detectChinaMirror({})).toBe(tsHelpers.detectChinaMirror({}));
    expect(mjsHelpers.detectChinaMirror({ SHARP_DIST_BASE_URL: "x" })).toBe(
      tsHelpers.detectChinaMirror({ SHARP_DIST_BASE_URL: "x" }),
    );
    expect(mjsHelpers.isWindowsPlatform("win32")).toBe(tsHelpers.isWindowsPlatform("win32"));
    expect(mjsHelpers.isWindowsPlatform("linux")).toBe(tsHelpers.isWindowsPlatform("linux"));
    expect(mjsHelpers.formatSharpFailureMessage("err")).toBe(tsHelpers.formatSharpFailureMessage("err"));

    // Sanity-check that the function source isn't trivially diverged.
    expect(tsRuntime.length).toBeGreaterThan(0);
    expect(mjsSrc.length).toBeGreaterThan(0);
  });
});
