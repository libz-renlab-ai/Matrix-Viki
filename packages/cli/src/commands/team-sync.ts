/**
 * `viki team sync [--apply]`
 *
 * B-side. Reads all .viki/team/<*>/<*>.json files, LWW-merges across
 * authors, and (with --apply) inserts each alive rule into the local KB
 * + deletes tombstoned ones. Without --apply: dry-run summary only.
 */

import * as path from "node:path";
import * as fs from "node:fs";
import { mergeLwwBatch, type MergeResult } from "@viki/team";
import { FsTeamRuleStore } from "@viki/adapters/team/fs-team-rule-store";
import { DualLayerStore } from "@viki/adapters";
import { buildKnowledgeEntryFromMerge } from "@viki/adapters/team/team-to-knowledge";

export interface TeamSyncOptions {
  cwd: string;
  apply?: boolean;
  homeDir?: string;
  /** Inject a custom store for testing (bypasses sqlite open). */
  kbStore?: KbAdapter;
}

export interface KbAdapter {
  getById(id: string): { id: string } | undefined;
  add(entry: any): void;
  delete(id: string): void;
  close?(): void;
}

export interface TeamSyncResult {
  total_claims: number;
  merged: Array<{
    rule_id: string;
    state: "alive" | "tombstone";
    winner_author: string;
    original_author: string;
    summary: string;
  }>;
  skipped_files: Array<{ path: string; reason: string }>;
  applied?: {
    upserted: string[];
    deleted: string[];
    skipped: Array<{ rule_id: string; reason: string }>;
  };
}

export async function runTeamSync(opts: TeamSyncOptions): Promise<TeamSyncResult> {
  const fsStore = new FsTeamRuleStore();
  const skipped: Array<{ path: string; reason: string }> = [];
  const files = await fsStore.listAll(opts.cwd, { onSkip: (e) => skipped.push(e) });
  const merged = mergeLwwBatch(files);

  const mergedOut: TeamSyncResult["merged"] = [];
  for (const [, m] of merged) {
    mergedOut.push({
      rule_id: m.rule_id,
      state: m.state,
      winner_author: m.winner.author,
      original_author: m.original_author,
      summary: sanitize(m.winner.content).slice(0, 60),
    });
  }
  mergedOut.sort((a, b) => a.rule_id.localeCompare(b.rule_id));

  const result: TeamSyncResult = {
    total_claims: files.length,
    merged: mergedOut,
    skipped_files: skipped,
  };

  if (opts.apply) {
    const kb = opts.kbStore ?? openProjectKb(opts.cwd, opts.homeDir);
    const applied = result.applied = { upserted: [] as string[], deleted: [] as string[], skipped: [] as Array<{ rule_id: string; reason: string }> };
    try {
      for (const [ruleId, m] of merged) {
        try {
          if (m.state === "tombstone") {
            if (kb.getById(ruleId) !== undefined) {
              kb.delete(ruleId);
              applied.deleted.push(ruleId);
            }
            continue;
          }
          const entry = buildKnowledgeEntryFromMerge(m as MergeResult);
          if (kb.getById(ruleId) !== undefined) {
            // Simplest LWW-apply: skip if exists; future iteration can
            // compare timestamps + update via store.update().
            applied.skipped.push({ rule_id: ruleId, reason: "already exists" });
            continue;
          }
          kb.add(entry);
          applied.upserted.push(ruleId);
        } catch (e) {
          applied.skipped.push({ rule_id: ruleId, reason: (e as Error).message });
        }
      }
    } finally {
      try { kb.close?.(); } catch { /* ignore */ }
    }
  }

  return result;
}

function openProjectKb(cwd: string, homeDir?: string): KbAdapter {
  const projectDbPath = path.join(cwd, ".viki", "knowledge.db");
  if (!fs.existsSync(path.dirname(projectDbPath))) {
    fs.mkdirSync(path.dirname(projectDbPath), { recursive: true });
  }
  const userHome = homeDir ?? process.env.USERPROFILE ?? process.env.HOME ?? "";
  const userGlobalDbPath = path.join(userHome, ".viki", "global.db");
  return new DualLayerStore({ projectDbPath, userGlobalDbPath }) as unknown as KbAdapter;
}

function sanitize(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "?");
}

export function parseTeamSyncArgs(argv: string[]): TeamSyncOptions {
  const opts: TeamSyncOptions = { cwd: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--apply") opts.apply = true;
    else if (a === "--cwd") opts.cwd = argv[++i]!;
    else if (a.startsWith("--cwd=")) opts.cwd = a.slice("--cwd=".length);
  }
  return opts;
}

export async function runTeamSyncCli(argv: string[]): Promise<number> {
  const opts = parseTeamSyncArgs(argv);
  const r = await runTeamSync(opts);
  const verb = opts.apply ? "applied" : "preview";
  process.stdout.write(
    `team sync ${verb}: ${r.merged.length} rule(s) from ${r.total_claims} file(s); skipped ${r.skipped_files.length} file(s)\n`,
  );
  if (r.applied) {
    process.stdout.write(
      `  upserted=${r.applied.upserted.length} deleted=${r.applied.deleted.length} skipped=${r.applied.skipped.length}\n`,
    );
  }
  for (const m of r.merged.slice(0, 20)) {
    process.stdout.write(`  ${m.rule_id}\t[${m.state}]\tby ${m.winner_author} (orig: ${m.original_author})\t${m.summary}\n`);
  }
  if (r.skipped_files.length > 0) {
    process.stderr.write(`Skipped files:\n`);
    for (const s of r.skipped_files.slice(0, 10)) {
      process.stderr.write(`  ${s.path}: ${s.reason}\n`);
    }
  }
  return 0;
}
