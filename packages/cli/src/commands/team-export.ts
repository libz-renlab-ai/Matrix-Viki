/**
 * `viki team export [--out <path>]` — dump every KnowledgeEntry in the
 * project KB into a single TeamBundle JSON. Quick-path simpler alternative
 * to the per-rule team-share/team-sync pipeline; appropriate for small
 * teams that just want a "snapshot of rules" file in git.
 *
 * Pairs with `viki team import` on the receiver side.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { DualLayerStore } from "@viki/adapters";
import type { KnowledgeEntry } from "@viki/types";

export interface TeamBundle {
  schema_version: 1;
  exported_at: string;
  entries: KnowledgeEntry[];
}

export interface TeamExportOptions {
  cwd: string;
  outPath?: string;
  homeDir?: string;
  now?: string;
}

export interface TeamExportResult {
  ok: boolean;
  written: string;
  count: number;
  reason?: string;
}

export function runTeamExport(opts: TeamExportOptions): TeamExportResult {
  const projectDbPath = path.join(opts.cwd, ".viki", "knowledge.db");
  if (!fs.existsSync(projectDbPath)) {
    return {
      ok: false,
      written: "",
      count: 0,
      reason: `no project KB at ${projectDbPath} (run \`viki init\` first)`,
    };
  }
  const userHome = opts.homeDir ?? process.env.USERPROFILE ?? process.env.HOME ?? "";
  const userGlobalDbPath = path.join(userHome, ".viki", "global.db");

  const out = opts.outPath ?? path.join(opts.cwd, ".viki", "team-rules.json");
  const store = new DualLayerStore({ projectDbPath, userGlobalDbPath });
  let entries: KnowledgeEntry[];
  try {
    entries = store.getAll();
  } finally {
    try { (store as any).close?.(); } catch { /* ignore */ }
  }

  const bundle: TeamBundle = {
    schema_version: 1,
    exported_at: opts.now ?? new Date().toISOString(),
    entries,
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tmp = `${out}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  fs.writeFileSync(tmp, JSON.stringify(bundle, null, 2) + "\n", "utf-8");
  fs.renameSync(tmp, out);
  return { ok: true, written: out, count: entries.length };
}

export function parseTeamExportArgs(argv: string[]): { outPath?: string } {
  const opts: { outPath?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--out" || a === "--output") {
      opts.outPath = argv[++i];
    } else if (a.startsWith("--out=")) {
      opts.outPath = a.slice("--out=".length);
    } else if (a.startsWith("--output=")) {
      opts.outPath = a.slice("--output=".length);
    }
  }
  return opts;
}

export async function runTeamExportCli(argv: string[]): Promise<number> {
  const parsed = parseTeamExportArgs(argv);
  const r = runTeamExport({ cwd: process.cwd(), outPath: parsed.outPath });
  if (!r.ok) {
    process.stderr.write(`team export failed: ${r.reason}\n`);
    return 1;
  }
  process.stdout.write(`team export: wrote ${r.count} rule(s) → ${r.written}\n`);
  return 0;
}
