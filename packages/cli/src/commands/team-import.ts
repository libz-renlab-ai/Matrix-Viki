/**
 * `viki team import [--file <path>]` — read a TeamBundle JSON and insert
 * every entry into the project KB. Skips entries whose `id` already exists
 * (idempotent re-import). Counterpart to `viki team export`.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { DualLayerStore } from "@viki/adapters";
import type { KnowledgeEntry } from "@viki/types";
import type { TeamBundle } from "./team-export.js";

export interface TeamImportOptions {
  cwd: string;
  filePath?: string;
  homeDir?: string;
}

export interface TeamImportResult {
  ok: boolean;
  imported: number;
  skipped: number;
  total: number;
  reason?: string;
}

export function runTeamImport(opts: TeamImportOptions): TeamImportResult {
  const inPath = opts.filePath ?? path.join(opts.cwd, ".viki", "team-rules.json");
  if (!fs.existsSync(inPath)) {
    return { ok: false, imported: 0, skipped: 0, total: 0, reason: `bundle not found: ${inPath}` };
  }
  let bundle: TeamBundle;
  try {
    bundle = JSON.parse(fs.readFileSync(inPath, "utf-8")) as TeamBundle;
  } catch (e) {
    return {
      ok: false,
      imported: 0,
      skipped: 0,
      total: 0,
      reason: `bundle parse error: ${(e as Error).message}`,
    };
  }
  if (bundle.schema_version !== 1 || !Array.isArray(bundle.entries)) {
    return {
      ok: false,
      imported: 0,
      skipped: 0,
      total: 0,
      reason: `unsupported bundle schema (got ${JSON.stringify(bundle.schema_version)})`,
    };
  }

  const projectDbPath = path.join(opts.cwd, ".viki", "knowledge.db");
  if (!fs.existsSync(path.dirname(projectDbPath))) {
    fs.mkdirSync(path.dirname(projectDbPath), { recursive: true });
  }
  const userHome = opts.homeDir ?? process.env.USERPROFILE ?? process.env.HOME ?? "";
  const userGlobalDbPath = path.join(userHome, ".viki", "global.db");

  const store = new DualLayerStore({ projectDbPath, userGlobalDbPath });
  let imported = 0;
  let skipped = 0;
  try {
    for (const entry of bundle.entries) {
      if (store.getById(entry.id) !== undefined) {
        skipped++;
        continue;
      }
      // Force scope.level=team so team-imported rules don't collide with
      // a teammate's local personal rules. (Override even if bundle says
      // personal — the import context IS the team context.)
      const e: KnowledgeEntry = {
        ...entry,
        scope: { ...entry.scope, level: "team" },
        source: "team-shared",
      } as KnowledgeEntry;
      store.add(e);
      imported++;
    }
  } finally {
    try { (store as any).close?.(); } catch { /* ignore */ }
  }
  return { ok: true, imported, skipped, total: bundle.entries.length };
}

export function parseTeamImportArgs(argv: string[]): { filePath?: string } {
  const opts: { filePath?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--file" || a === "--input") {
      opts.filePath = argv[++i];
    } else if (a.startsWith("--file=")) {
      opts.filePath = a.slice("--file=".length);
    } else if (a.startsWith("--input=")) {
      opts.filePath = a.slice("--input=".length);
    }
  }
  return opts;
}

export async function runTeamImportCli(argv: string[]): Promise<number> {
  const parsed = parseTeamImportArgs(argv);
  const r = runTeamImport({ cwd: process.cwd(), filePath: parsed.filePath });
  if (!r.ok) {
    process.stderr.write(`team import failed: ${r.reason}\n`);
    return 1;
  }
  process.stdout.write(
    `team import: ${r.imported} imported, ${r.skipped} skipped (existing) of ${r.total} total\n`,
  );
  return 0;
}
