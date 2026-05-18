/**
 * `viki team delete <rule_id> [--author <a>]`
 *
 * Soft-delete a team rule by appending a tombstone claim. We do NOT delete
 * the file from disk — LWW needs the tombstone to outvote any older claim
 * that would otherwise resurrect the rule on B's next sync.
 */

import { appendClaim, isSafeAuthor, isSafeRuleId } from "@viki/team";
import { FsTeamRuleStore } from "@viki/adapters/team/fs-team-rule-store";
import { execSync } from "node:child_process";

export interface TeamDeleteOptions {
  cwd: string;
  ruleId: string;
  author?: string;
  now?: string;
}

export interface TeamDeleteResult {
  ok: boolean;
  rule_id: string;
  tombstoned_files: string[];
  reason?: string;
}

export async function runTeamDelete(opts: TeamDeleteOptions): Promise<TeamDeleteResult> {
  if (!isSafeRuleId(opts.ruleId)) {
    return { ok: false, rule_id: opts.ruleId, tombstoned_files: [], reason: `unsafe rule_id: "${opts.ruleId}"` };
  }
  const author = opts.author ?? gitUserName(opts.cwd) ?? "unknown";
  if (!isSafeAuthor(author)) {
    return { ok: false, rule_id: opts.ruleId, tombstoned_files: [], reason: `unsafe author: "${author}"` };
  }
  const now = opts.now ?? new Date().toISOString();

  const store = new FsTeamRuleStore();
  const all = await store.listAll(opts.cwd);
  const matching = all.filter((f) => f.rule_id === opts.ruleId);
  if (matching.length === 0) {
    return { ok: false, rule_id: opts.ruleId, tombstoned_files: [], reason: `no team file exists for rule_id "${opts.ruleId}"` };
  }
  const tombstoned: string[] = [];
  for (const file of matching) {
    const next = appendClaim(file, author, "", 0, now, true);
    const out = await store.write(opts.cwd, next);
    tombstoned.push(out);
  }
  return { ok: true, rule_id: opts.ruleId, tombstoned_files: tombstoned };
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

export function parseTeamDeleteArgs(argv: string[]): TeamDeleteOptions {
  const opts: Partial<TeamDeleteOptions> = { cwd: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--author") opts.author = argv[++i];
    else if (a.startsWith("--author=")) opts.author = a.slice("--author=".length);
    else if (a === "--cwd") opts.cwd = argv[++i]!;
    else if (a.startsWith("--cwd=")) opts.cwd = a.slice("--cwd=".length);
    else if (!a.startsWith("--") && !opts.ruleId) opts.ruleId = a;
  }
  return opts as TeamDeleteOptions;
}

export async function runTeamDeleteCli(argv: string[]): Promise<number> {
  const opts = parseTeamDeleteArgs(argv);
  if (!opts.ruleId) {
    process.stderr.write("team delete: rule_id is required\n");
    return 2;
  }
  const r = await runTeamDelete(opts);
  if (!r.ok) {
    process.stderr.write(`team delete failed: ${r.reason}\n`);
    return 1;
  }
  process.stdout.write(`team delete: tombstoned ${r.tombstoned_files.length} file(s) for rule "${r.rule_id}"\n`);
  for (const f of r.tombstoned_files) process.stdout.write(`  ${f}\n`);
  return 0;
}
