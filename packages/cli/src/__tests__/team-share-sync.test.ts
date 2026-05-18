import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runTeamShare, deriveRuleId, parseTeamShareArgs } from "../commands/team-share.js";
import { runTeamSync } from "../commands/team-sync.js";
import type { KbAdapter } from "../commands/team-sync.js";

class FakeKb implements KbAdapter {
  public entries = new Map<string, any>();
  getById(id: string) { return this.entries.get(id); }
  add(e: any) { this.entries.set(e.id, e); }
  delete(id: string) { this.entries.delete(id); }
}

describe("team-share", () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "viki-team-share-"));
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it("blocks secret with --scope=team override", async () => {
    const r = await runTeamShare({
      cwd,
      text: "Use API key AKIAIOSFODNN7EXAMPLE",
      scope: "team",
      author: "alice",
      ruleId: "leaked",
      now: "2026-05-17T00:00:00Z",
    });
    expect(r.action.kind).toBe("blocked_by_secret");
    expect(r.written_path).toBeUndefined();
  });

  it("writes team file when --scope=team and no secrets", async () => {
    const r = await runTeamShare({
      cwd,
      text: "Use dayjs not moment",
      scope: "team",
      author: "alice",
      ruleId: "use-dayjs",
      now: "2026-05-17T00:00:00Z",
    });
    expect(r.action.kind).toBe("promote_to_l2");
    expect(r.written_path).toBe(join(cwd, ".viki", "team", "alice", "use-dayjs.json"));
    const written = JSON.parse(readFileSync(r.written_path!, "utf-8"));
    expect(written.rule_id).toBe("use-dayjs");
    expect(written.author).toBe("alice");
    expect(written.claims).toHaveLength(1);
  });

  it("appends claim + preserves original_author when rule exists from another author", async () => {
    // alice creates first
    await runTeamShare({
      cwd,
      text: "Use dayjs not moment",
      scope: "team",
      author: "alice",
      ruleId: "use-dayjs",
      now: "2026-05-17T00:00:00Z",
    });
    // bob shares the same rule_id
    const r2 = await runTeamShare({
      cwd,
      text: "Always use dayjs",
      scope: "team",
      author: "bob",
      ruleId: "use-dayjs",
      now: "2026-05-17T01:00:00Z",
    });
    expect(r2.written_path).toBeDefined();
    const written = JSON.parse(readFileSync(r2.written_path!, "utf-8"));
    expect(written.author).toBe("alice"); // lineage preserved
    expect(written.claims).toHaveLength(2);
    expect(written.claims[1].author).toBe("bob");
    expect(written.current.content).toBe("Always use dayjs");
  });

  it("rejects unsafe rule_id", async () => {
    await expect(
      runTeamShare({
        cwd,
        text: "Use dayjs",
        scope: "team",
        author: "alice",
        ruleId: "../etc/passwd",
      }),
    ).rejects.toThrow(/illegal characters/);
  });

  it("deriveRuleId is stable for the same input", () => {
    expect(deriveRuleId("hello")).toBe(deriveRuleId("hello"));
    expect(deriveRuleId("a")).not.toBe(deriveRuleId("b"));
    expect(deriveRuleId("x").length).toBe(16);
  });

  it("parseTeamShareArgs handles long-form and equals-form", () => {
    const a = parseTeamShareArgs(["--text=hello", "--rule-id=r1", "--scope=team"]);
    expect(a.text).toBe("hello");
    expect(a.ruleId).toBe("r1");
    expect(a.scope).toBe("team");
    const b = parseTeamShareArgs(["--text", "world", "--author", "alice"]);
    expect(b.text).toBe("world");
    expect(b.author).toBe("alice");
  });

  it("uncertain text held — no team-file write", async () => {
    const r = await runTeamShare({
      cwd,
      text: "Prefer composition over inheritance", // neutral
      author: "alice",
      ruleId: "comp-over-inh",
    });
    expect(r.action.kind).toBe("uncertain_held");
    expect(r.written_path).toBeUndefined();
  });
});

describe("team-sync", () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "viki-team-sync-"));
    mkdirSync(join(cwd, ".viki", "team", "alice"), { recursive: true });
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it("dry-run returns merged summary, does NOT apply", async () => {
    await runTeamShare({
      cwd,
      text: "Use dayjs not moment",
      scope: "team",
      author: "alice",
      ruleId: "use-dayjs",
      now: "2026-05-17T00:00:00Z",
    });
    const kb = new FakeKb();
    const r = await runTeamSync({ cwd, kbStore: kb });
    expect(r.merged).toHaveLength(1);
    expect(r.merged[0]!.rule_id).toBe("use-dayjs");
    expect(r.applied).toBeUndefined();
    expect(kb.entries.size).toBe(0);
  });

  it("--apply inserts alive rule into KB", async () => {
    await runTeamShare({
      cwd,
      text: "Use dayjs not moment",
      scope: "team",
      author: "alice",
      ruleId: "use-dayjs",
      now: "2026-05-17T00:00:00Z",
    });
    const kb = new FakeKb();
    const r = await runTeamSync({ cwd, apply: true, kbStore: kb });
    expect(r.applied?.upserted).toEqual(["use-dayjs"]);
    expect(kb.entries.has("use-dayjs")).toBe(true);
    const e = kb.entries.get("use-dayjs");
    expect(e.scope.level).toBe("team");
    expect(e.tags).toContain("viki-team-sync");
    expect(e.tags).toContain("original-author:alice");
  });

  it("--apply skips when rule already in KB", async () => {
    await runTeamShare({
      cwd,
      text: "Use dayjs",
      scope: "team",
      author: "alice",
      ruleId: "use-dayjs",
      now: "2026-05-17T00:00:00Z",
    });
    const kb = new FakeKb();
    kb.add({ id: "use-dayjs" }); // already present
    const r = await runTeamSync({ cwd, apply: true, kbStore: kb });
    expect(r.applied?.upserted).toEqual([]);
    expect(r.applied?.skipped[0]!.reason).toContain("already exists");
  });

  it("--apply tombstone deletes existing rule", async () => {
    await runTeamShare({
      cwd,
      text: "Old rule",
      scope: "team",
      author: "alice",
      ruleId: "stale-rule",
      now: "2026-05-17T00:00:00Z",
    });
    // Manually write tombstone claim by re-sharing with deleted=true via raw write
    const filePath = join(cwd, ".viki", "team", "alice", "stale-rule.json");
    const existing = JSON.parse(readFileSync(filePath, "utf-8"));
    existing.claims.push({
      author: "alice",
      timestamp: "2026-05-17T02:00:00Z",
      content: "",
      confidence: 0,
      deleted: true,
    });
    existing.current = { content: "", confidence: 0, timestamp: "2026-05-17T02:00:00Z", deleted: true };
    require("node:fs").writeFileSync(filePath, JSON.stringify(existing, null, 2), "utf-8");

    const kb = new FakeKb();
    kb.add({ id: "stale-rule" });
    const r = await runTeamSync({ cwd, apply: true, kbStore: kb });
    expect(r.applied?.deleted).toEqual(["stale-rule"]);
    expect(kb.entries.has("stale-rule")).toBe(false);
  });
});
