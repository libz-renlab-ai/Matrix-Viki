/**
 * `viki team infect [--force]`
 *
 * One-time setup that turns a vanilla git repo into a Viki team project:
 *   1. Write .viki/manifest.json (the marker)
 *   2. Copy scripts/team/githooks/post-merge → .githooks/post-merge
 *   3. `git config core.hooksPath .githooks` (so git actually runs it)
 *
 * Safety: refuses to overwrite a pre-existing core.hooksPath set to anything
 * other than `.githooks` (e.g. `.husky`, `.lefthook`) unless --force. This
 * avoids silently disabling another hooks framework the user installed.
 */

import { execSync, execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { readManifest, writeManifest, type Manifest } from "@viki/team";

export interface TeamInfectOptions {
  cwd: string;
  /** Override the manifest's `infected_by` (default: git user.name). */
  author?: string;
  /** Override the manifest's `viki_version`. */
  vikiVersion?: string;
  /** Override created_at; default new Date().toISOString(). */
  now?: string;
  /** Allow overwriting a non-.githooks core.hooksPath setting. */
  force?: boolean;
  /** Custom post-merge template path (test injection). */
  postMergeSource?: string;
}

export interface TeamInfectResult {
  skipped: boolean;
  reason?: string;
  written_files: string[];
  git_hookspath_set: boolean;
  hookspath_blocked?: boolean;
  hookspath_existing?: string;
}

export async function runTeamInfect(opts: TeamInfectOptions): Promise<TeamInfectResult> {
  const result: TeamInfectResult = {
    skipped: false,
    written_files: [],
    git_hookspath_set: false,
  };

  const existing = readManifest(opts.cwd);
  if (existing) {
    result.skipped = true;
    result.reason = `already infected (manifest exists at .viki/manifest.json)`;
    return result;
  }

  // Check existing core.hooksPath before any write — if it's something
  // foreign and --force isn't set, bail out cleanly.
  let existingHooksPath: string | undefined;
  try {
    existingHooksPath = execSync("git config --get core.hooksPath", {
      cwd: opts.cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch { /* no value set — OK */ }
  if (
    existingHooksPath &&
    existingHooksPath !== ".githooks" &&
    !opts.force
  ) {
    result.skipped = true;
    result.hookspath_blocked = true;
    result.hookspath_existing = existingHooksPath;
    result.reason = `core.hooksPath is set to "${existingHooksPath}" (likely husky/lefthook). Re-run with --force to override.`;
    return result;
  }

  // 1. Write manifest
  const manifest: Manifest = {
    schema_version: 1,
    viki_version: opts.vikiVersion ?? "0.0.0",
    created_at: opts.now ?? new Date().toISOString(),
    infected_by: opts.author ?? gitUserName(opts.cwd) ?? "unknown",
  };
  const mPath = writeManifest(opts.cwd, manifest);
  result.written_files.push(mPath);

  // 2. Copy post-merge template to .githooks/post-merge
  const src = opts.postMergeSource ?? defaultPostMergeSource();
  if (fs.existsSync(src)) {
    const dest = path.join(opts.cwd, ".githooks", "post-merge");
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    // chmod +x best-effort (Windows ignores)
    try { fs.chmodSync(dest, 0o755); } catch { /* ignore */ }
    result.written_files.push(dest);
  } else {
    result.reason = `post-merge template missing at ${src}; manifest written but hook not installed`;
  }

  // 3. Set git config core.hooksPath
  try {
    execFileSync("git", ["config", "core.hooksPath", ".githooks"], {
      cwd: opts.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    result.git_hookspath_set = true;
  } catch (e) {
    result.reason = `git config core.hooksPath failed: ${(e as Error).message}`;
  }

  return result;
}

function defaultPostMergeSource(): string {
  // Walk up from this file to find scripts/team/githooks/post-merge in the
  // repo root. Works for both src/ run (tsx) and dist/ run (bundled).
  const here = fileURLToPath(import.meta.url);
  let dir = path.dirname(here);
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, "scripts", "team", "githooks", "post-merge");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.join(path.dirname(here), "post-merge"); // best-effort
}

function gitUserName(cwd: string): string | null {
  try {
    const out = execSync("git config user.name", {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

export function parseTeamInfectArgs(argv: string[]): TeamInfectOptions {
  const opts: TeamInfectOptions = { cwd: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--force") opts.force = true;
    else if (a === "--cwd") opts.cwd = argv[++i]!;
    else if (a.startsWith("--cwd=")) opts.cwd = a.slice("--cwd=".length);
  }
  return opts;
}

export async function runTeamInfectCli(argv: string[]): Promise<number> {
  const opts = parseTeamInfectArgs(argv);
  const r = await runTeamInfect(opts);
  if (r.skipped) {
    if (r.hookspath_blocked) {
      process.stderr.write(`team infect BLOCKED: ${r.reason}\n`);
      return 2;
    }
    process.stdout.write(`team infect: ${r.reason}\n`);
    return 0;
  }
  process.stdout.write(
    `team infect: wrote ${r.written_files.length} file(s); core.hooksPath set: ${r.git_hookspath_set}\n`,
  );
  for (const f of r.written_files) process.stdout.write(`  ${f}\n`);
  return 0;
}
