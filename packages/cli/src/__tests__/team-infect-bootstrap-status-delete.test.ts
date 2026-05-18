import { execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runTeamInfect } from "../commands/team-infect.js";
import { runTeamStatus } from "../commands/team-status.js";
import { runTeamDelete } from "../commands/team-delete.js";
import { runTeamBootstrap } from "../commands/team-bootstrap.js";
import { runTeamShare } from "../commands/team-share.js";
import type { KbAdapter } from "../commands/team-sync.js";

class FakeKb implements KbAdapter {
  public entries = new Map<string, any>();
  getById(id: string) { return this.entries.get(id); }
  add(e: any) { this.entries.set(e.id, e); }
  delete(id: string) { this.entries.delete(id); }
}

function setupGitRepo(cwd: string) {
  mkdirSync(cwd, { recursive: true });
  execSync("git init -q", { cwd });
  execSync("git config user.email tester@test.local", { cwd });
  execSync("git config user.name tester", { cwd });
  execSync("git commit --allow-empty -m init", { cwd });
}

function writeFakePostMergeSource(root: string): string {
  const p = join(root, "fake-post-merge");
  writeFileSync(p, "#!/usr/bin/env bash\necho fake\n", "utf-8");
  return p;
}

describe("team-infect", () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "viki-team-infect-"));
    setupGitRepo(cwd);
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it("fresh repo → writes manifest + .githooks/post-merge + sets core.hooksPath", async () => {
    const src = writeFakePostMergeSource(cwd);
    const r = await runTeamInfect({
      cwd,
      author: "alice",
      vikiVersion: "0.1.0",
      now: "2026-05-17T00:00:00Z",
      postMergeSource: src,
    });
    expect(r.skipped).toBe(false);
    expect(existsSync(join(cwd, ".viki", "manifest.json"))).toBe(true);
    expect(existsSync(join(cwd, ".githooks", "post-merge"))).toBe(true);
    expect(r.git_hookspath_set).toBe(true);
    const cfg = execSync("git config --get core.hooksPath", { cwd, encoding: "utf-8" }).trim();
    expect(cfg).toBe(".githooks");
  });

  it("already-infected → skipped", async () => {
    const src = writeFakePostMergeSource(cwd);
    await runTeamInfect({ cwd, author: "alice", vikiVersion: "0.1.0", now: "2026-05-17T00:00:00Z", postMergeSource: src });
    const r2 = await runTeamInfect({ cwd, author: "alice", vikiVersion: "0.1.0", now: "2026-05-17T00:00:00Z", postMergeSource: src });
    expect(r2.skipped).toBe(true);
    expect(r2.reason).toContain("already infected");
  });

  it("preexisting husky hooksPath → blocked without --force", async () => {
    execSync("git config core.hooksPath .husky", { cwd });
    const src = writeFakePostMergeSource(cwd);
    const r = await runTeamInfect({ cwd, author: "alice", vikiVersion: "0.1.0", now: "2026-05-17T00:00:00Z", postMergeSource: src });
    expect(r.skipped).toBe(true);
    expect(r.hookspath_blocked).toBe(true);
    expect(r.hookspath_existing).toBe(".husky");
  });

  it("preexisting husky + --force → overwrites", async () => {
    execSync("git config core.hooksPath .husky", { cwd });
    const src = writeFakePostMergeSource(cwd);
    const r = await runTeamInfect({
      cwd,
      author: "alice",
      vikiVersion: "0.1.0",
      now: "2026-05-17T00:00:00Z",
      postMergeSource: src,
      force: true,
    });
    expect(r.skipped).toBe(false);
    expect(r.git_hookspath_set).toBe(true);
  });
});

describe("team-status", () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "viki-team-status-"));
    setupGitRepo(cwd);
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it("reports manifest absent + zero rules on fresh repo", async () => {
    const r = await runTeamStatus({ cwd });
    expect(r.manifest_present).toBe(false);
    expect(r.total_files).toBe(0);
    expect(r.alive_rules).toBe(0);
  });

  it("reports rules + author distribution after sharing", async () => {
    const src = writeFakePostMergeSource(cwd);
    await runTeamInfect({ cwd, author: "alice", vikiVersion: "0.1.0", now: "2026-05-17T00:00:00Z", postMergeSource: src });
    await runTeamShare({ cwd, text: "Use dayjs", scope: "team", author: "alice", ruleId: "r1", now: "2026-05-17T00:00:00Z" });
    await runTeamShare({ cwd, text: "Prefer pnpm", scope: "team", author: "bob", ruleId: "r2", now: "2026-05-17T00:00:00Z" });
    const r = await runTeamStatus({ cwd });
    expect(r.manifest_present).toBe(true);
    expect(r.manifest_infected_by).toBe("alice");
    expect(r.alive_rules).toBe(2);
    expect(r.author_counts.find((a) => a.author === "alice")?.rules).toBe(1);
    expect(r.author_counts.find((a) => a.author === "bob")?.rules).toBe(1);
  });
});

describe("team-delete", () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "viki-team-del-"));
    setupGitRepo(cwd);
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it("tombstones existing rule by appending a deleted=true claim", async () => {
    await runTeamShare({ cwd, text: "Use dayjs", scope: "team", author: "alice", ruleId: "r1", now: "2026-05-17T00:00:00Z" });
    const r = await runTeamDelete({ cwd, ruleId: "r1", author: "alice", now: "2026-05-17T01:00:00Z" });
    expect(r.ok).toBe(true);
    expect(r.tombstoned_files).toHaveLength(1);
    const file = JSON.parse(readFileSync(r.tombstoned_files[0]!, "utf-8"));
    expect(file.current.deleted).toBe(true);
    expect(file.claims).toHaveLength(2);
    expect(file.claims[1]!.deleted).toBe(true);
  });

  it("returns ok:false when rule does not exist", async () => {
    const r = await runTeamDelete({ cwd, ruleId: "ghost", author: "alice" });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("no team file");
  });

  it("rejects unsafe rule_id", async () => {
    const r = await runTeamDelete({ cwd, ruleId: "..", author: "alice" });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("unsafe rule_id");
  });
});

describe("team-bootstrap", () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "viki-team-bs-"));
    setupGitRepo(cwd);
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it("no manifest → skipped", async () => {
    const r = await runTeamBootstrap({ cwd });
    expect(r.skipped).toBe(true);
    expect(r.reason).toContain("not a Viki team project");
  });

  it("with manifest + 2 rules → runs sync apply (via injected KB)", async () => {
    const src = writeFakePostMergeSource(cwd);
    await runTeamInfect({ cwd, author: "alice", vikiVersion: "0.1.0", now: "2026-05-17T00:00:00Z", postMergeSource: src });
    await runTeamShare({ cwd, text: "Use dayjs", scope: "team", author: "alice", ruleId: "r1", now: "2026-05-17T00:00:00Z" });
    await runTeamShare({ cwd, text: "Prefer pnpm", scope: "team", author: "alice", ruleId: "r2", now: "2026-05-17T00:00:00Z" });

    // Inject FakeKb so the test doesn't open a SQLite handle on cwd's
    // .viki/knowledge.db. Avoids Windows EBUSY on rmSync teardown.
    const kb = new FakeKb();
    const r = await runTeamBootstrap({ cwd, kbStore: kb });
    expect(r.skipped).toBe(false);
    expect(r.sync?.applied?.upserted.length).toBeGreaterThanOrEqual(2);
    expect(kb.entries.has("r1")).toBe(true);
    expect(kb.entries.has("r2")).toBe(true);
  });
});
