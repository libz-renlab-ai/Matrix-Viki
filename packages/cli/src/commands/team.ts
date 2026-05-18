/**
 * `viki team <subcommand> [args...]` — namespace dispatcher.
 *
 * The team namespace is the user-facing surface of the team-rule
 * propagation pipeline. Each sub-command lives in its own file under
 * commands/team-*.ts; this dispatcher only routes argv.
 */

export async function runTeamSubcommand(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv;
  switch (sub) {
    case "share": {
      const { runTeamShareCli } = await import("./team-share.js");
      return await runTeamShareCli(rest);
    }
    case "sync": {
      const { runTeamSyncCli } = await import("./team-sync.js");
      return await runTeamSyncCli(rest);
    }
    case "publish": {
      const { runTeamPublishCli } = await import("./team-publish.js");
      return await runTeamPublishCli(rest);
    }
    case "infect": {
      const { runTeamInfectCli } = await import("./team-infect.js");
      return await runTeamInfectCli(rest);
    }
    case "bootstrap": {
      const { runTeamBootstrapCli } = await import("./team-bootstrap.js");
      return await runTeamBootstrapCli(rest);
    }
    case "status": {
      const { runTeamStatusCli } = await import("./team-status.js");
      return await runTeamStatusCli(rest);
    }
    case "delete": {
      const { runTeamDeleteCli } = await import("./team-delete.js");
      return await runTeamDeleteCli(rest);
    }
    case "export": {
      const { runTeamExportCli } = await import("./team-export.js");
      return await runTeamExportCli(rest);
    }
    case "import": {
      const { runTeamImportCli } = await import("./team-import.js");
      return await runTeamImportCli(rest);
    }
    case undefined:
    case "--help":
    case "-h": {
      printTeamHelp();
      return 0;
    }
    default: {
      process.stderr.write(`Unknown subcommand: viki team ${sub}\n`);
      printTeamHelp();
      return 1;
    }
  }
}

function printTeamHelp(): void {
  process.stdout.write(
    [
      "Usage: viki team <subcommand> [args]",
      "",
      "Per-rule pipeline (recommended for active teams):",
      "  share    --text \"...\" [--rule-id X] [--author A] [--scope team|personal]",
      "  sync     [--apply]   read .viki/team/<*>/<*>.json, LWW merge, optionally write to KB",
      "  publish  [--push]    git add+commit [viki-sync] (and optionally push)",
      "  delete   <rule_id> [--author A]   tombstone a rule (LWW-safe deletion)",
      "  status                            summary report",
      "",
      "Viral install (one-time per project):",
      "  infect   [--force]   write manifest + .githooks/post-merge + git config",
      "  bootstrap            first-time catch-up after `git clone` (sync --apply)",
      "",
      "Bundle path (simpler alternative):",
      "  export   [--out PATH]    dump local KB to .viki/team-rules.json",
      "  import   [--file PATH]   load .viki/team-rules.json into local KB",
      "",
    ].join("\n"),
  );
}
