/**
 * Non-interactive batch approve/reject for rule candidates.
 * Mirrors packages/cli/src/commands/review-candidates.ts decision logic.
 *
 * Usage:
 *   pnpm tsx scripts/batch-review-candidates.ts --approve=<id-suffix,...> --reject=<id-suffix,...>
 *
 * ID suffix = last 6 chars of candidate.id, matches the table shown by the interactive tool.
 */
import os from "node:os";
import path from "node:path";
import {
  DualLayerStore,
  SqliteCandidateQueue,
  openDb,
  makeSkillCompiler,
} from "@viki/adapters";
import { runCalibrationPipeline, defaultCalibrator, runCompile } from "@viki/core";

function parseCsv(arg: string | undefined): Set<string> {
  if (!arg) return new Set();
  return new Set(
    arg
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function getArg(flag: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : undefined;
}

async function main(): Promise<void> {
  const approveSuffixes = parseCsv(getArg("--approve"));
  const rejectSuffixes = parseCsv(getArg("--reject"));
  if (approveSuffixes.size === 0 && rejectSuffixes.size === 0) {
    process.stderr.write("Usage: --approve=suffix1,suffix2 --reject=suffix3,suffix4\n");
    process.exit(1);
  }

  const home = os.homedir();
  const cwd = process.cwd();
  const candidatesDbPath = path.join(home, ".viki", "candidates.db");
  const projectDbPath = path.join(cwd, ".viki", "knowledge.db");
  const userGlobalDbPath = path.join(home, ".viki", "global.db");
  const skillsDir = path.join(home, ".claude", "skills", "viki");

  const queueDb = openDb(candidatesDbPath);
  const queue = new SqliteCandidateQueue(queueDb);
  const pending = queue.listPending();

  const store = new DualLayerStore({ projectDbPath, userGlobalDbPath });
  const projectStore = store.getProjectStore();

  let approved = 0;
  let rejected = 0;
  let unknown = 0;

  for (const candidate of pending) {
    const suffix = candidate.id.slice(-6);
    if (approveSuffixes.has(suffix)) {
      try {
        projectStore.add(candidate.entry);
        queue.updateStatus(candidate.id, "approved");
        approved++;
        process.stdout.write(`✓ approved ${suffix} — ${candidate.entry.trigger}\n`);
      } catch (err) {
        process.stdout.write(`⚠ failed approve ${suffix}: ${String(err).slice(0, 120)}\n`);
      }
    } else if (rejectSuffixes.has(suffix)) {
      queue.updateStatus(candidate.id, "rejected");
      rejected++;
      process.stdout.write(`✗ rejected ${suffix} — ${candidate.entry.trigger}\n`);
    } else {
      unknown++;
    }
  }

  if (approved > 0) {
    process.stdout.write("\nRecalibrate + update Skills…\n");
    try {
      const now = () => new Date();
      await runCalibrationPipeline({
        calibrator: defaultCalibrator,
        store: projectStore as unknown as Parameters<typeof runCalibrationPipeline>[0]["store"],
        events: [],
        now,
      });
      await runCompile({
        store,
        skillCompiler: makeSkillCompiler({ skillsDir }),
      });
      process.stdout.write("✓ Skills refreshed\n");
    } catch (err) {
      process.stdout.write(`⚠ calibrate/export failed: ${String(err).slice(0, 200)}\n`);
    }
  }

  store.close();
  queueDb.close();

  process.stdout.write(
    `\nDone. approved=${approved} rejected=${rejected} untouched=${unknown}\n`,
  );
}

main().catch((e) => {
  process.stderr.write(`${String(e)}\n`);
  process.exit(1);
});
