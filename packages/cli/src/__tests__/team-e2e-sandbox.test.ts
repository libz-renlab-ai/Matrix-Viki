/**
 * End-to-end sandbox: alice → git → bob.
 *
 * Sets up:
 *   <root>/bare/         (bare git remote, "origin")
 *   <root>/alice/        (alice's local clone)
 *   <root>/bob/          (bob's local clone)
 *
 * Flow:
 *   1. alice clones bare, infects, shares a rule, publishes (commit+push)
 *   2. bob clones bare and pulls alice's commit
 *   3. bob runs team bootstrap with an injected FakeKb
 *   4. Assert: FakeKb has the rule, tagged with original-author:alice
 *
 * This is a proper end-to-end test of the L1 (file write) + L2 (git push) +
 * L3 (post-clone sync) layers, mirroring Matrix-Lucky's m5-auto-demo.sh
 * (the source we ported from) but in TypeScript with deterministic
 * timestamps and an injected KB to avoid SQLite EBUSY on Windows.
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runTeamInfect } from "../commands/team-infect.js";
import { runTeamShare } from "../commands/team-share.js";
import { runTeamPublish } from "../commands/team-publish.js";
import { runTeamBootstrap } from "../commands/team-bootstrap.js";
import type { KbAdapter } from "../commands/team-sync.js";

class FakeKb implements KbAdapter {
  public entries = new Map<string, any>();
  getById(id: string) { return this.entries.get(id); }
  add(e: any) { this.entries.set(e.id, e); }
  delete(id: string) { this.entries.delete(id); }
}

function fakeHook(root: string): string {
  const p = join(root, "fake-post-merge");
  writeFileSync(p, "#!/usr/bin/env bash\nexit 0\n", "utf-8");
  return p;
}

function gitInit(cwd: string) {
  mkdirSync(cwd, { recursive: true });
  execSync("git init -q", { cwd });
  execSync("git config user.email tester@test.local", { cwd });
}

function gitClone(remote: string, dest: string) {
  execSync(`git clone -q "${remote}" "${dest}"`, { stdio: "ignore" });
}

describe("team e2e: alice → git → bob", () => {
  let root: string;
  let bare: string;
  let aliceRepo: string;
  let bobRepo: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "viki-team-e2e-"));
    bare = join(root, "bare.git");
    aliceRepo = join(root, "alice");
    bobRepo = join(root, "bob");

    // Set up bare remote
    execSync(`git init --bare -q "${bare}"`);

    // Alice's local clone (seed with one commit so we have a default branch)
    gitClone(bare, aliceRepo);
    execSync("git config user.email alice@test.local", { cwd: aliceRepo });
    execSync("git config user.name alice", { cwd: aliceRepo });
    writeFileSync(join(aliceRepo, "README.md"), "# project\n", "utf-8");
    execSync("git add README.md", { cwd: aliceRepo });
    execSync("git commit -q -m seed", { cwd: aliceRepo });
    // Push so the branch exists on remote; bob can clone non-empty
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: aliceRepo, encoding: "utf-8" }).trim();
    execSync(`git push -q origin ${branch}`, { cwd: aliceRepo });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("alice shares + publishes → bob pulls + bootstraps → rule lands in bob's KB", async () => {
    const hookSrc = fakeHook(root);

    // 1. Alice infects her repo
    const infect = await runTeamInfect({
      cwd: aliceRepo,
      author: "alice",
      vikiVersion: "0.1.0",
      now: "2026-05-17T00:00:00Z",
      postMergeSource: hookSrc,
    });
    expect(infect.skipped).toBe(false);
    expect(existsSync(join(aliceRepo, ".viki", "manifest.json"))).toBe(true);

    // 2. Alice shares a rule
    const share = await runTeamShare({
      cwd: aliceRepo,
      text: "Our team should always use dayjs not moment",
      scope: "team",
      author: "alice",
      ruleId: "use-dayjs",
      now: "2026-05-17T00:00:00Z",
    });
    expect(share.action.kind).toBe("promote_to_l2");
    expect(existsSync(join(aliceRepo, ".viki", "team", "alice", "use-dayjs.json"))).toBe(true);

    // 3. Alice publishes (commit + push)
    const pub = await runTeamPublish({ cwd: aliceRepo, push: true });
    expect(pub.committed).toBe(true);
    expect(pub.pushed).toBe(true);

    // 4. Bob clones the bare remote
    gitClone(bare, bobRepo);
    execSync("git config user.email bob@test.local", { cwd: bobRepo });
    execSync("git config user.name bob", { cwd: bobRepo });

    // 5. Verify bob has the team file on disk after clone
    expect(existsSync(join(bobRepo, ".viki", "manifest.json"))).toBe(true);
    expect(existsSync(join(bobRepo, ".viki", "team", "alice", "use-dayjs.json"))).toBe(true);

    // 6. Bob runs team bootstrap (injected FakeKb so no SQLite open on Windows)
    const kb = new FakeKb();
    const boot = await runTeamBootstrap({ cwd: bobRepo, kbStore: kb });
    expect(boot.skipped).toBe(false);
    expect(boot.sync?.applied?.upserted).toContain("use-dayjs");

    // 7. Bob's KB has the rule, with attribution chain intact
    const rule = kb.entries.get("use-dayjs");
    expect(rule).toBeDefined();
    expect(rule.scope.level).toBe("team");
    expect(rule.tags).toContain("viki-team-sync");
    expect(rule.tags).toContain("original-author:alice");
    expect(rule.source).toBe("team-shared");
    expect(rule.correct_pattern).toContain("dayjs");
  });

  it("LWW lineage preserved: bob re-shares same rule_id → alice stays as original_author", async () => {
    const hookSrc = fakeHook(root);
    await runTeamInfect({ cwd: aliceRepo, author: "alice", vikiVersion: "0.1.0", now: "2026-05-17T00:00:00Z", postMergeSource: hookSrc });
    await runTeamShare({ cwd: aliceRepo, text: "Use dayjs", scope: "team", author: "alice", ruleId: "use-dayjs", now: "2026-05-17T00:00:00Z" });
    await runTeamPublish({ cwd: aliceRepo, push: true });

    gitClone(bare, bobRepo);
    execSync("git config user.email bob@test.local", { cwd: bobRepo });
    execSync("git config user.name bob", { cwd: bobRepo });

    // Bob re-shares the same rule_id with different content. Lineage rule:
    // file.author should remain "alice" (original creator), but file.claims
    // gains bob's new claim.
    await runTeamShare({
      cwd: bobRepo,
      text: "Always reach for dayjs over moment",
      scope: "team",
      author: "bob",
      ruleId: "use-dayjs",
      now: "2026-05-17T01:00:00Z",
    });

    const file = JSON.parse(
      require("node:fs").readFileSync(
        join(bobRepo, ".viki", "team", "alice", "use-dayjs.json"),
        "utf-8",
      ),
    );
    expect(file.author).toBe("alice"); // lineage anchor immutable
    expect(file.claims).toHaveLength(2);
    expect(file.claims[1].author).toBe("bob");
    expect(file.current.content).toBe("Always reach for dayjs over moment");
  });

  it("secret-scanner blocks even with leak attempt — no new team-rule files surface", async () => {
    const hookSrc = fakeHook(root);
    await runTeamInfect({ cwd: aliceRepo, author: "alice", vikiVersion: "0.1.0", now: "2026-05-17T00:00:00Z", postMergeSource: hookSrc });
    // Commit the infect artifacts (manifest + hook) so they're not "new"
    await runTeamPublish({ cwd: aliceRepo });

    const r = await runTeamShare({
      cwd: aliceRepo,
      text: "Use this key: AKIAIOSFODNN7EXAMPLE in your config",
      scope: "team",
      author: "alice",
      ruleId: "leaked-key",
      now: "2026-05-17T01:00:00Z",
    });
    expect(r.action.kind).toBe("blocked_by_secret");
    // No team-rule JSON file written for the leaked rule
    expect(existsSync(join(aliceRepo, ".viki", "team", "alice", "leaked-key.json"))).toBe(false);

    // Now publish — should find no new changes (infect already committed,
    // the leaked share didn't write anything)
    const pub = await runTeamPublish({ cwd: aliceRepo });
    expect(pub.committed).toBe(false);
    expect(pub.reason).toContain("no changes");
  });
});
