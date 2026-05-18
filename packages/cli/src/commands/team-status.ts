/**
 * `viki team status`
 *
 * One-page summary: manifest presence, rule count, author distribution,
 * last [viki-sync] commit, skipped files.
 */

import { execSync } from "node:child_process";
import { readManifest, mergeLwwBatch } from "@viki/team";
import { FsTeamRuleStore } from "@viki/adapters/team/fs-team-rule-store";

export interface TeamStatusOptions {
  cwd: string;
}

export interface TeamStatusResult {
  manifest_present: boolean;
  manifest_infected_by?: string;
  manifest_created_at?: string;
  total_files: number;
  alive_rules: number;
  tombstoned_rules: number;
  author_counts: Array<{ author: string; rules: number }>;
  last_sync_commit?: { sha: string; subject: string; date: string };
  skipped_files: Array<{ path: string; reason: string }>;
}

export async function runTeamStatus(opts: TeamStatusOptions): Promise<TeamStatusResult> {
  const manifest = readManifest(opts.cwd);
  const fsStore = new FsTeamRuleStore();
  const skipped: Array<{ path: string; reason: string }> = [];
  const files = await fsStore.listAll(opts.cwd, { onSkip: (e) => skipped.push(e) });
  const merged = mergeLwwBatch(files);

  let alive = 0;
  let tombs = 0;
  for (const m of merged.values()) {
    if (m.state === "alive") alive++;
    else tombs++;
  }

  const authorMap = new Map<string, number>();
  for (const f of files) {
    authorMap.set(f.author, (authorMap.get(f.author) ?? 0) + 1);
  }
  const author_counts = [...authorMap.entries()]
    .map(([author, rules]) => ({ author, rules }))
    .sort((a, b) => b.rules - a.rules);

  const last_sync_commit = readLastSyncCommit(opts.cwd);

  return {
    manifest_present: !!manifest,
    manifest_infected_by: manifest?.infected_by,
    manifest_created_at: manifest?.created_at,
    total_files: files.length,
    alive_rules: alive,
    tombstoned_rules: tombs,
    author_counts,
    last_sync_commit,
    skipped_files: skipped,
  };
}

function readLastSyncCommit(
  cwd: string,
): { sha: string; subject: string; date: string } | undefined {
  try {
    const out = execSync(
      `git log -1 --grep="\\[viki-sync\\]" --format="%H%x09%s%x09%aI"`,
      { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    if (!out) return undefined;
    const [sha, subject, date] = out.split("\t");
    return { sha: sha ?? "", subject: subject ?? "", date: date ?? "" };
  } catch {
    return undefined;
  }
}

export function parseTeamStatusArgs(argv: string[]): TeamStatusOptions {
  const opts: TeamStatusOptions = { cwd: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--cwd") opts.cwd = argv[++i]!;
    else if (a.startsWith("--cwd=")) opts.cwd = a.slice("--cwd=".length);
  }
  return opts;
}

export async function runTeamStatusCli(argv: string[]): Promise<number> {
  const opts = parseTeamStatusArgs(argv);
  const r = await runTeamStatus(opts);
  process.stdout.write(`Viki team status (${opts.cwd}):\n`);
  process.stdout.write(`  manifest: ${r.manifest_present ? "present" : "absent"}`);
  if (r.manifest_present) {
    process.stdout.write(` (infected by ${r.manifest_infected_by}, at ${r.manifest_created_at})`);
  }
  process.stdout.write(`\n`);
  process.stdout.write(`  rules: ${r.alive_rules} alive, ${r.tombstoned_rules} tombstoned (${r.total_files} files)\n`);
  if (r.author_counts.length > 0) {
    process.stdout.write(`  authors:\n`);
    for (const a of r.author_counts) {
      process.stdout.write(`    ${a.author}: ${a.rules}\n`);
    }
  }
  if (r.last_sync_commit) {
    process.stdout.write(`  last sync commit: ${r.last_sync_commit.sha.slice(0, 8)} (${r.last_sync_commit.date})\n`);
    process.stdout.write(`    ${r.last_sync_commit.subject}\n`);
  }
  if (r.skipped_files.length > 0) {
    process.stdout.write(`  skipped files: ${r.skipped_files.length}\n`);
  }
  return 0;
}
