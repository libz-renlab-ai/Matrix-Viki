import { describe, expect, it } from "vitest";
import { classifyScope } from "../scope-classifier.js";

describe("classifyScope", () => {
  it("flags clear personal text as personal", () => {
    expect(classifyScope("Use my local .env for the staging DB").class).toBe("personal");
    expect(classifyScope("This is just for me, don't share").class).toBe("personal");
  });

  it("flags clear team text as shareable", () => {
    expect(classifyScope("Our team should always use dayjs not moment").class).toBe("shareable");
    expect(classifyScope("Standard operating procedure: review every PR").class).toBe("shareable");
    expect(classifyScope("Coding standard: 2-space indent").class).toBe("shareable");
  });

  it("returns uncertain on neutral text", () => {
    expect(classifyScope("Prefer composition over inheritance").class).toBe("uncertain");
  });

  it("returns uncertain when both personal and shareable signals hit", () => {
    const text = "My team should always use dayjs (this is personal to me too)";
    expect(classifyScope(text).class).toBe("uncertain");
  });

  it("includes signal-count reason", () => {
    const r = classifyScope("Our team must always commit");
    expect(r.reason).toContain("shareable-signal-hits=");
  });
});
