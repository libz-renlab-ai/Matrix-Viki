/**
 * `viki team bootstrap`
 *
 * First-time catch-up: detect manifest → run team-sync --apply once so a
 * fresh `git clone` of a Viki team project gets all rules into the local
 * KB without the user having to type `viki team sync --apply` themselves.
 *
 * Idempotent; safe to re-run.
 */

import { readManifest } from "@viki/team";
import { runTeamSync, type KbAdapter, type TeamSyncResult } from "./team-sync.js";

export interface TeamBootstrapOptions {
  cwd: string;
  homeDir?: string;
  /** Inject a custom KB store (for tests; bypasses sqlite open). */
  kbStore?: KbAdapter;
}

export interface TeamBootstrapResult {
  skipped: boolean;
  reason?: string;
  sync?: TeamSyncResult;
}

export async function runTeamBootstrap(opts: TeamBootstrapOptions): Promise<TeamBootstrapResult> {
  const manifest = readManifest(opts.cwd);
  if (!manifest) {
    return {
      skipped: true,
      reason: "not a Viki team project (no .viki/manifest.json)",
    };
  }
  const sync = await runTeamSync({
    cwd: opts.cwd,
    apply: true,
    homeDir: opts.homeDir,
    kbStore: opts.kbStore,
  });
  return { skipped: false, sync };
}

export function parseTeamBootstrapArgs(argv: string[]): TeamBootstrapOptions {
  const opts: TeamBootstrapOptions = { cwd: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--cwd") opts.cwd = argv[++i]!;
    else if (a.startsWith("--cwd=")) opts.cwd = a.slice("--cwd=".length);
  }
  return opts;
}

export async function runTeamBootstrapCli(argv: string[]): Promise<number> {
  const opts = parseTeamBootstrapArgs(argv);
  const r = await runTeamBootstrap(opts);
  if (r.skipped) {
    process.stdout.write(`team bootstrap: ${r.reason}\n`);
    return 0;
  }
  const s = r.sync!;
  process.stdout.write(
    `team bootstrap: synced ${s.merged.length} rule(s) (upserted=${s.applied?.upserted.length ?? 0} deleted=${s.applied?.deleted.length ?? 0})\n`,
  );
  return 0;
}
