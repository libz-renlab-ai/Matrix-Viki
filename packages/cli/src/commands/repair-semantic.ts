import { spawnSync } from "node:child_process";
import { NPMMIRROR_SHARP_LIBVIPS } from "../postinstall-helpers.js";
import { describeSemanticReadiness } from "../warmup-state.js";

export interface RepairSemanticOptions {
  skipRebuild: boolean;
  dryRun: boolean;
}

export interface RepairSemanticResult {
  ok: boolean;
  ranRebuild: boolean;
  ranWarmup: boolean;
  error: string | null;
}

export function parseRepairSemanticArgs(argv: string[]): RepairSemanticOptions {
  return {
    skipRebuild: argv.includes("--skip-rebuild"),
    dryRun: argv.includes("--dry-run"),
  };
}

export function formatRepairResult(r: RepairSemanticResult): string {
  if (r.ok) {
    return [
      "──────────────────────────────────────────────────────────────",
      "✅ semantic ready",
      `   rebuild: ${r.ranRebuild ? "ran" : "skipped"}`,
      `   warmup:  ${r.ranWarmup ? "ran" : "skipped"}`,
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
  const env = { ...process.env, SHARP_DIST_BASE_URL: NPMMIRROR_SHARP_LIBVIPS };
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
        return { ok: false, ranRebuild, ranWarmup, error: `pnpm rebuild sharp exited ${rebuild.status}` };
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
      return { ok: false, ranRebuild, ranWarmup, error: `viki warmup exited ${warmup.status}` };
    }
  }

  if (opts.dryRun) {
    return { ok: true, ranRebuild, ranWarmup, error: null };
  }
  const r = describeSemanticReadiness();
  if (!r.ready) {
    return { ok: false, ranRebuild, ranWarmup, error: `state still not ready after repair (reason=${r.reason})` };
  }
  return { ok: true, ranRebuild, ranWarmup, error: null };
}
