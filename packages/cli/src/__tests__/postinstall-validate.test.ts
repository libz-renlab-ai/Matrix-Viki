import { describe, it, expect } from "vitest";
import {
  detectChinaMirror,
  formatSharpFailureMessage,
  isWindowsPlatform,
  NPMMIRROR_SHARP_LIBVIPS,
} from "../postinstall-helpers.js";

describe("postinstall helpers", () => {
  it("detectChinaMirror returns the npmmirror URL when env unset", () => {
    expect(detectChinaMirror({})).toBe(NPMMIRROR_SHARP_LIBVIPS);
  });

  it("detectChinaMirror returns null when env already set", () => {
    expect(detectChinaMirror({ SHARP_DIST_BASE_URL: "https://github.com/..." })).toBe(null);
  });

  it("isWindowsPlatform respects the platform argument", () => {
    expect(isWindowsPlatform("win32")).toBe(true);
    expect(isWindowsPlatform("linux")).toBe(false);
    expect(isWindowsPlatform("darwin")).toBe(false);
  });

  it("formatSharpFailureMessage includes the repair command and mirror url", () => {
    const msg = formatSharpFailureMessage("Cannot find module ../build/Release/sharp-win32-x64.node");
    expect(msg).toMatch(/viki repair-semantic/);
    expect(msg).toMatch(/SHARP_DIST_BASE_URL/);
    expect(msg).toContain("Cannot find module");
  });
});
