import { spawnSync } from "node:child_process";
import os from "node:os";
import { NPMMIRROR_SHARP_LIBVIPS } from "../postinstall-helpers.js";
import { describeSemanticReadiness } from "../warmup-state.js";

export interface RepairSemanticOptions {
  skipRebuild: boolean;
  dryRun: boolean;
  home?: string;
}

export interface RepairSemanticResult {
  ok: boolean;
  ranRebuild: boolean;
  ranWarmup: boolean;
  error: string | null;
  dryRun: boolean;
}

export function parseRepairSemanticArgs(argv: string[]): RepairSemanticOptions {
  const parseFlag = (name: string): string | undefined => {
    const eq = `--${name}=`;
    for (const arg of argv) {
      if (arg.startsWith(eq)) return arg.slice(eq.length);
    }
    const idx = argv.indexOf(`--${name}`);
    if (idx !== -1 && argv[idx + 1] && !argv[idx + 1]!.startsWith("--")) {
      return argv[idx + 1];
    }
    return undefined;
  };
  return {
    skipRebuild: argv.includes("--skip-rebuild"),
    dryRun: argv.includes("--dry-run"),
    home: parseFlag("home"),
  };
}

export function formatRepairResult(r: RepairSemanticResult): string {
  if (r.ok) {
    const rebuildLabel = r.dryRun ? "would run" : (r.ranRebuild ? "ran" : "skipped");
    const warmupLabel = r.dryRun ? "would run" : (r.ranWarmup ? "ran" : "skipped");
    const header = r.dryRun ? "✅ semantic ready (dry-run preview)" : "✅ semantic ready";
    return [
      "──────────────────────────────────────────────────────────────",
      header,
      `   rebuild: ${rebuildLabel}`,
      `   warmup:  ${warmupLabel}`,
      "──────────────────────────────────────────────────────────────",
      "",
    ].join("\n");
  }
  return [
    "──────────────────────────────────────────────────────────────",
    "❌ repair-semantic FAILED",
    "",
    `   ${r.error ?? "(unknown error)"}`,
    "",
    "Manual fallback:",
    `  $env:SHARP_DIST_BASE_URL = "${NPMMIRROR_SHARP_LIBVIPS}"`,
    "  pnpm rebuild sharp",
    "  pnpm viki warmup",
    "──────────────────────────────────────────────────────────────",
    "",
  ].join("\n");
}

export async function executeRepairSemantic(
  opts: RepairSemanticOptions,
): Promise<RepairSemanticResult> {
  const home = opts.home ?? os.homedir();
  const homeEnvKey = process.platform === "win32" ? "USERPROFILE" : "HOME";
  const env = {
    ...process.env,
    SHARP_DIST_BASE_URL: NPMMIRROR_SHARP_LIBVIPS,
    [homeEnvKey]: home,
  };
  let ranRebuild = false;
  let ranWarmup = false;

  if (!opts.skipRebuild) {
    if (opts.dryRun) {
      ranRebuild = true;
    } else {
      const rebuild = spawnSync("corepack", ["pnpm", "rebuild", "sharp"], {
        env,
        stdio: "inherit",
        shell: process.platform === "win32",
      });
      ranRebuild = true;
      if (rebuild.status !== 0) {
        return { ok: false, ranRebuild, ranWarmup, error: `pnpm rebuild sharp exited ${rebuild.status}`, dryRun: opts.dryRun };
      }
    }
  }

  if (opts.dryRun) {
    ranWarmup = true;
  } else {
    const warmup = spawnSync("corepack", ["pnpm", "viki", "warmup"], {
      env,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    ranWarmup = true;
    if (warmup.status !== 0) {
      return { ok: false, ranRebuild, ranWarmup, error: `viki warmup exited ${warmup.status}`, dryRun: opts.dryRun };
    }
  }

  if (opts.dryRun) {
    return { ok: true, ranRebuild, ranWarmup, error: null, dryRun: true };
  }
  const r = describeSemanticReadiness(home);
  if (!r.ready) {
    return { ok: false, ranRebuild, ranWarmup, error: `state still not ready after repair (reason=${r.reason})`, dryRun: false };
  }
  return { ok: true, ranRebuild, ranWarmup, error: null, dryRun: false };
}
