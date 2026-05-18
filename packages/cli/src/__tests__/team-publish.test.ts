import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseTeamPublishArgs, runTeamPublish } from "../commands/team-publish.js";

function setupGitRepo(cwd: string) {
  mkdirSync(cwd, { recursive: true });
  execSync("git init -q", { cwd });
  execSync("git config user.email test@test.local", { cwd });
  execSync("git config user.name tester", { cwd });
  execSync("git commit --allow-empty -m init", { cwd });
}

describe("team-publish", () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "viki-team-pub-"));
    setupGitRepo(cwd);
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it("no paths exist → reason='no team... paths exist yet', no commit", async () => {
    const r = await runTeamPublish({ cwd });
    expect(r.committed).toBe(false);
    expect(r.reason).toContain("no team");
  });

  it("paths exist but no changes → no commit", async () => {
    mkdirSync(join(cwd, ".viki", "team"), { recursive: true });
    writeFileSync(join(cwd, ".viki", "team", ".keep"), "", "utf-8");
    execSync("git add .viki && git commit -m baseline", { cwd });
    const r = await runTeamPublish({ cwd });
    expect(r.committed).toBe(false);
    expect(r.reason).toContain("no changes");
  });

  it("changes exist → commits with [viki-sync] prefix", async () => {
    mkdirSync(join(cwd, ".viki", "team", "alice"), { recursive: true });
    writeFileSync(join(cwd, ".viki", "team", "alice", "r1.json"), "{}", "utf-8");
    const r = await runTeamPublish({ cwd });
    expect(r.committed).toBe(true);
    expect(r.commit_sha).toMatch(/^[0-9a-f]{40}$/);
    const log = execSync("git log -1 --format=%s", { cwd, encoding: "utf-8" });
    expect(log).toContain("[viki-sync]");
  });

  it("custom prefix is honored", async () => {
    mkdirSync(join(cwd, ".viki", "team", "alice"), { recursive: true });
    writeFileSync(join(cwd, ".viki", "team", "alice", "r1.json"), "{}", "utf-8");
    await runTeamPublish({ cwd, commitMsgPrefix: "[custom]" });
    const log = execSync("git log -1 --format=%s", { cwd, encoding: "utf-8" });
    expect(log).toContain("[custom]");
  });

  it("--push without remote → push_error populated, not throw", async () => {
    mkdirSync(join(cwd, ".viki", "team", "alice"), { recursive: true });
    writeFileSync(join(cwd, ".viki", "team", "alice", "r1.json"), "{}", "utf-8");
    const r = await runTeamPublish({ cwd, push: true });
    expect(r.committed).toBe(true);
    expect(r.pushed).toBe(false);
    expect(r.push_error).toBeTruthy();
  });

  it("parseTeamPublishArgs --push", () => {
    expect(parseTeamPublishArgs(["--push"]).push).toBe(true);
    expect(parseTeamPublishArgs([]).push).toBeUndefined();
  });
});
