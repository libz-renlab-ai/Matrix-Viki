import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsTeamRuleStore } from "../fs-team-rule-store.js";
import type { TeamRuleFile } from "@viki/team";

function sample(ruleId: string, author: string): TeamRuleFile {
  return {
    rule_id: ruleId,
    author,
    current: {
      content: "x",
      confidence: 0.8,
      timestamp: "2026-05-18T10:00:00Z",
      deleted: false,
    },
    claims: [
      {
        author,
        timestamp: "2026-05-18T10:00:00Z",
        content: "x",
        confidence: 0.8,
        deleted: false,
      },
    ],
  };
}

describe("FsTeamRuleStore", () => {
  let root: string;
  let store: FsTeamRuleStore;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "viki-fsstore-"));
    store = new FsTeamRuleStore();
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("listAll returns [] when team/ directory missing", async () => {
    expect(await store.listAll(root)).toEqual([]);
  });

  it("listAll reads multiple authors × multiple rules", async () => {
    await store.write(root, sample("r1", "alice"));
    await store.write(root, sample("r2", "alice"));
    await store.write(root, sample("r1", "bob"));
    const all = await store.listAll(root);
    expect(all.map((f) => `${f.author}/${f.rule_id}`).sort()).toEqual([
      "alice/r1",
      "alice/r2",
      "bob/r1",
    ]);
  });

  it("listAll surfaces corrupt JSON via onSkip (does not throw)", async () => {
    const dir = join(root, ".viki", "team", "alice");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "broken.json"), "{not json", "utf-8");
    await store.write(root, sample("good", "alice"));
    const skipped: { path: string; reason: string }[] = [];
    const all = await store.listAll(root, { onSkip: (e) => skipped.push(e) });
    expect(all).toHaveLength(1);
    expect(all[0]!.rule_id).toBe("good");
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.reason).toContain("JSON parse error");
  });

  it("listAll skips schema-violating file (missing rule_id) via onSkip", async () => {
    const dir = join(root, ".viki", "team", "alice");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "no-claims.json"), JSON.stringify({ author: "alice" }), "utf-8");
    const skipped: { path: string; reason: string }[] = [];
    const all = await store.listAll(root, { onSkip: (e) => skipped.push(e) });
    expect(all).toEqual([]);
    expect(skipped[0]!.reason).toContain("schema violation");
  });

  it("listAll skips unsafe author directory via onSkip", async () => {
    // "Alice Bob" contains a space — violates [A-Za-z0-9._-] regex
    const badDir = join(root, ".viki", "team", "Alice Bob");
    mkdirSync(badDir, { recursive: true });
    const skipped: { path: string; reason: string }[] = [];
    await store.listAll(root, { onSkip: (e) => skipped.push(e) });
    expect(skipped.some((s) => s.reason.includes("unsafe author"))).toBe(true);
  });

  it("write refuses unsafe rule_id", async () => {
    await expect(
      store.write(root, { ...sample("..", "alice"), rule_id: ".." }),
    ).rejects.toThrow(/unsafe rule_id/);
  });

  it("write creates parent dir + atomic tmp+rename", async () => {
    const out = await store.write(root, sample("use-dayjs", "alice"));
    expect(out).toBe(join(root, ".viki", "team", "alice", "use-dayjs.json"));
    const re = await store.read(root, "alice", "use-dayjs");
    expect(re?.rule_id).toBe("use-dayjs");
  });

  it("read returns null for missing", async () => {
    expect(await store.read(root, "ghost", "nope")).toBeNull();
  });
});
