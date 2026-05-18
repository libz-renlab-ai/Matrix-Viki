import { describe, expect, it } from "vitest";
import { appendClaim, newTeamRuleFile, teamRuleToRecord } from "../projection.js";
import type { MergeResult } from "../lww-merge.js";

describe("projection", () => {
  it("newTeamRuleFile produces a single-claim file", () => {
    const f = newTeamRuleFile({
      ruleId: "use-dayjs",
      author: "alice",
      content: "Use dayjs not moment",
      confidence: 0.9,
      now: "2026-05-18T10:00:00Z",
    });
    expect(f.rule_id).toBe("use-dayjs");
    expect(f.author).toBe("alice");
    expect(f.claims).toHaveLength(1);
    expect(f.claims[0]!.author).toBe("alice");
    expect(f.current.content).toBe("Use dayjs not moment");
    expect(f.current.deleted).toBe(false);
  });

  it("appendClaim preserves original_author lineage even when claimer differs", () => {
    const orig = newTeamRuleFile({
      ruleId: "r1",
      author: "alice",
      content: "v1",
      confidence: 0.8,
      now: "2026-05-15T00:00:00Z",
    });
    const next = appendClaim(orig, "bob", "v2", 0.9, "2026-05-16T00:00:00Z");
    expect(next.author).toBe("alice"); // immutable
    expect(next.claims).toHaveLength(2);
    expect(next.claims[1]!.author).toBe("bob");
    expect(next.current.content).toBe("v2");
  });

  it("appendClaim can write a tombstone claim", () => {
    const orig = newTeamRuleFile({
      ruleId: "r1",
      author: "alice",
      content: "v1",
      confidence: 0.8,
      now: "2026-05-15T00:00:00Z",
    });
    const tomb = appendClaim(orig, "alice", "", 0, "2026-05-16T00:00:00Z", true);
    expect(tomb.current.deleted).toBe(true);
    expect(tomb.claims[1]!.deleted).toBe(true);
  });

  it("teamRuleToRecord emits viki-team-sync + original-author tags", () => {
    const m: MergeResult = {
      rule_id: "use-dayjs",
      state: "alive",
      original_author: "alice",
      winner: {
        author: "bob",
        timestamp: "2026-05-18T10:00:00Z",
        content: "Use dayjs",
        confidence: 0.9,
        deleted: false,
      },
    };
    const rec = teamRuleToRecord(m);
    expect(rec.id).toBe("use-dayjs");
    expect(rec.content).toBe("Use dayjs");
    expect(rec.tags).toContain("viki-team-sync");
    expect(rec.tags).toContain("original-author:alice");
    expect(rec.scope_level).toBe("team");
  });
});
