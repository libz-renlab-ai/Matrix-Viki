import { describe, expect, it } from "vitest";
import { mergeLwwBatch } from "../lww-merge.js";
import type { TeamRuleFile } from "../types.js";

function f(rule_id: string, author: string, claims: Array<{ author: string; ts: string; content: string; deleted?: boolean }>): TeamRuleFile {
  return {
    rule_id,
    author,
    current: {
      content: claims[claims.length - 1]!.content,
      confidence: 0.85,
      timestamp: claims[claims.length - 1]!.ts,
      deleted: !!claims[claims.length - 1]!.deleted,
    },
    claims: claims.map((c) => ({
      author: c.author,
      timestamp: c.ts,
      content: c.content,
      confidence: 0.85,
      deleted: !!c.deleted,
    })),
  };
}

describe("mergeLwwBatch", () => {
  it("returns empty map for no files", () => {
    expect(mergeLwwBatch([])).toEqual(new Map());
  });

  it("picks latest claim by timestamp", () => {
    const file = f("r1", "alice", [
      { author: "alice", ts: "2026-05-15T00:00:00Z", content: "v1" },
      { author: "bob", ts: "2026-05-16T00:00:00Z", content: "v2" },
      { author: "alice", ts: "2026-05-17T00:00:00Z", content: "v3" },
    ]);
    const m = mergeLwwBatch([file]).get("r1")!;
    expect(m.winner.content).toBe("v3");
    expect(m.winner.author).toBe("alice");
    expect(m.state).toBe("alive");
  });

  it("preserves original_author lineage (file.author, not winning-claim author)", () => {
    const file = f("r1", "alice", [
      { author: "alice", ts: "2026-05-15T00:00:00Z", content: "v1" },
      { author: "bob", ts: "2026-05-16T00:00:00Z", content: "v2" },
    ]);
    const m = mergeLwwBatch([file]).get("r1")!;
    expect(m.original_author).toBe("alice"); // even though bob's claim won
    expect(m.winner.author).toBe("bob");
  });

  it("marks state=tombstone when winning claim is deleted", () => {
    const file = f("r1", "alice", [
      { author: "alice", ts: "2026-05-15T00:00:00Z", content: "v1" },
      { author: "alice", ts: "2026-05-16T00:00:00Z", content: "", deleted: true },
    ]);
    const m = mergeLwwBatch([file]).get("r1")!;
    expect(m.state).toBe("tombstone");
  });

  it("handles multiple files independently", () => {
    const files = [
      f("r1", "alice", [{ author: "alice", ts: "2026-05-15T00:00:00Z", content: "a" }]),
      f("r2", "bob", [{ author: "bob", ts: "2026-05-16T00:00:00Z", content: "b" }]),
    ];
    const m = mergeLwwBatch(files);
    expect(m.size).toBe(2);
    expect(m.get("r1")?.winner.content).toBe("a");
    expect(m.get("r2")?.winner.content).toBe("b");
  });

  it("omits files with no claims", () => {
    const file: TeamRuleFile = {
      rule_id: "empty",
      author: "alice",
      current: { content: "", confidence: 0, timestamp: "", deleted: false },
      claims: [],
    };
    expect(mergeLwwBatch([file]).has("empty")).toBe(false);
  });
});
