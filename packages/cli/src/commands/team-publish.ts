/**
 * `viki team publish [--push]`
 *
 * Stage 3 (transit): commit local .viki/team/ + .viki/manifest.json +
 * .githooks/ changes and (optionally) push to origin. Best-effort —
 * never throws on push failure; reports the error in `push_error`.
 *
 * Commit message prefix is fixed at `[viki-sync]` so consumers can filter
 * git log and protected-branch rules can target it explicitly.
 */

import { execSync, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import * as path from "node:path";

export interface TeamPublishOptions {
  cwd: string;
  push?: boolean;
  /** Default `[viki-sync]`. */
  commitMsgPrefix?: string;
}

export interface TeamPublishResult {
  changes_count: number;
  committed: boolean;
  commit_sha?: string;
  pushed: boolean;
  push_error?: string;
  reason?: string;
}

export async function runTeamPublish(opts: TeamPublishOptions): Promise<TeamPublishResult> {
  const result: TeamPublishResult = {
    changes_count: 0,
    committed: false,
    pushed: false,
  };

  const CANDIDATE_PATHS = [".viki/team", ".viki/manifest.json", ".githooks"];
  const PATHS = CANDIDATE_PATHS.filter((p) => existsSync(path.join(opts.cwd, p)));
  if (PATHS.length === 0) {
    result.reason = "no team / manifest / githooks paths exist yet";
    return result;
  }

  let status = "";
  try {
    status = execSync(
      `git status --porcelain -- ${PATHS.map((p) => `"${p}"`).join(" ")}`,
      { cwd: opts.cwd, encoding: "utf8" },
    );
  } catch (e) {
    result.reason = `git status failed: ${(e as Error).message}`;
    return result;
  }
  const changedLines = status.split(/\r?\n/).filter((l) => l.trim().length > 0);
  result.changes_count = changedLines.length;
  if (changedLines.length === 0) {
    result.reason = "no changes in tracked team paths";
    return result;
  }

  // Stage + commit
  try {
    execFileSync("git", ["add", "--", ...PATHS], {
      cwd: opts.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    result.reason = `git add failed: ${(e as Error).message}`;
    return result;
  }

  const prefix = opts.commitMsgPrefix ?? "[viki-sync]";
  const msg = `${prefix} sync ${changedLines.length} change(s) in .viki/team`;
  try {
    execFileSync("git", ["commit", "-m", msg], {
      cwd: opts.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    result.committed = true;
    try {
      result.commit_sha = execSync("git rev-parse HEAD", {
        cwd: opts.cwd,
        encoding: "utf-8",
      }).trim();
    } catch { /* best-effort */ }
  } catch (e) {
    result.reason = `git commit failed: ${(e as Error).message}`;
    return result;
  }

  if (opts.push) {
    try {
      execFileSync("git", ["push"], {
        cwd: opts.cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });
      result.pushed = true;
    } catch (e) {
      result.push_error = (e as Error).message;
    }
  }
  return result;
}

export function parseTeamPublishArgs(argv: string[]): TeamPublishOptions {
  const opts: TeamPublishOptions = { cwd: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--push") opts.push = true;
    else if (a === "--cwd") opts.cwd = argv[++i]!;
    else if (a.startsWith("--cwd=")) opts.cwd = a.slice("--cwd=".length);
  }
  return opts;
}

export async function runTeamPublishCli(argv: string[]): Promise<number> {
  const opts = parseTeamPublishArgs(argv);
  const r = await runTeamPublish(opts);
  if (!r.committed) {
    process.stdout.write(`team publish: nothing to commit (${r.reason ?? "unknown"})\n`);
    return 0;
  }
  process.stdout.write(
    `team publish: committed ${r.commit_sha?.slice(0, 8)} (${r.changes_count} change(s))\n`,
  );
  if (opts.push) {
    if (r.pushed) {
      process.stdout.write("team publish: pushed to origin\n");
    } else {
      process.stderr.write(`team publish: push failed — ${r.push_error}\n`);
    }
  }
  return 0;
}
