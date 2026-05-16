import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { emitSemanticBannerIfDegraded } from "../bin-session-start.js";

describe("bin-session-start banner", () => {
  let home: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "viki-banner-"));
    mkdirSync(join(home, ".viki"), { recursive: true });
  });
  afterEach(() => { rmSync(home, { recursive: true, force: true }); });

  it("emits banner when no warmup state exists", () => {
    const events: any[] = [];
    emitSemanticBannerIfDegraded(home, (e) => events.push(e));
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("hook-session-start.semantic-not-ready");
    expect(events[0].repairCommand).toContain("viki repair-semantic");
  });

  it("emits banner when last attempt failed and no last-success", () => {
    writeFileSync(
      join(home, ".viki", ".warmup-state.json"),
      JSON.stringify({ status: "failed", started_at: "2026-05-16T00:00:00Z", pid: 1, model: "x", error: "..." }),
    );
    const events: any[] = [];
    emitSemanticBannerIfDegraded(home, (e) => events.push(e));
    expect(events).toHaveLength(1);
    expect(events[0].reason).toBe("failed");
  });

  it("stays silent when last-success exists", () => {
    writeFileSync(
      join(home, ".viki", ".warmup-last-success.json"),
      JSON.stringify({
        status: "ready", started_at: "2026-05-15T00:00:00Z", completed_at: "2026-05-15T00:01:00Z",
        pid: 1, model: "x", cwd: "/p", node_modules_root: "/p/node_modules",
      }),
    );
    const events: any[] = [];
    emitSemanticBannerIfDegraded(home, (e) => events.push(e));
    expect(events).toHaveLength(0);
  });
});
