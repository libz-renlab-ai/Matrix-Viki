#!/usr/bin/env node
// Issue #10: silence the `ExperimentalWarning: SQLite is an experimental
// feature` line that Node 22's `node:sqlite` emits on first import. Viki
// relies on `node:sqlite` intentionally (the whole rule store is built on
// it); the warning has no actionable content for end users and looks like
// an error in `viki stats` / `viki review` output. We only filter this
// one specific warning so genuine deprecation / unhandled-rejection /
// other ExperimentalWarning entries still surface.
{
  const origEmit = process.emit.bind(process);
  // @ts-expect-error — overload signature mismatch is fine; we forward all args
  process.emit = function (event: string, ...args: unknown[]): boolean {
    if (event === "warning") {
      const w = args[0] as { name?: string; message?: string } | undefined;
      if (
        w &&
        w.name === "ExperimentalWarning" &&
        typeof w.message === "string" &&
        /SQLite is an experimental feature/i.test(w.message)
      ) {
        return false;
      }
    }
    return origEmit(event as never, ...(args as never[]));
  };
}

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { runSkeletonDemo } from "./commands/skeleton-demo.js";
import {
  executeVerifyAnchors,
  parseVerifyAnchorsArgs,
  renderVerifyAnchorsJson,
  renderVerifyAnchorsTerminal,
} from "./commands/verify-anchors.js";
import {
  executePitfall,
  runPitfallInteractive,
  parsePitfallArgs,
} from "./commands/pitfall.js";
import { executeStats } from "./commands/stats.js";
import { executeDemoHook, parseDemoHookArgs } from "./commands/demo-hook.js";
import { installHook, uninstallHook } from "./commands/install-hook.js";
import {
  parseInstallArgs,
  renderInstallPreviewOutput,
} from "./commands/install-manifest.js";
import {
  renderInstallHelp,
  runInstall,
} from "./commands/install.js";
import { installUserHook, uninstallUserHook } from "./commands/install-user-hook.js";
import { executeAnalyze, parseAnalyzeArgs } from "./commands/analyze.js";
import { executeReview, parseReviewArgs } from "./commands/review.js";
import {
  executeInit,
  parseInitArgs,
  renderInitResult,
} from "./commands/init.js";
import {
  disable,
  enable,
  uninstall,
  parseUninstallArgs,
  renderUninstallResult,
} from "./commands/uninstall.js";
import {
  executeCalibrate,
  parseCalibrateArgs,
  renderCalibrateResult,
} from "./commands/calibrate.js";
import {
  executeVerify,
  parseVerifyArgs,
  renderVerifyTerminal,
} from "./commands/verify.js";
import {
  executeBugReport,
  parseBugReportArgs,
} from "./commands/bug-report.js";
import { executeIngest, parseIngestArgs } from "./commands/ingest.js";
import {
  executeCompile,
  parseCompileArgs,
  renderCompileResult,
} from "./commands/compile.js";
import {
  executeDaily,
  parseDailyArgs,
  renderDailyHelp,
  renderDailyStdout,
} from "./commands/daily.js";
import { executeConfig } from "./commands/config.js";
import {
  executeDoctor,
  parseDoctorArgs,
  renderDoctorHelp,
  renderDoctorResult,
} from "./commands/doctor.js";
import {
  executeInstallPlugins,
  parseInstallPluginsArgs,
  renderInstallPluginsResult,
} from "./commands/install-plugins.js";
import { executeScanErrors, parseScanErrorsArgs } from "./commands/scan-errors.js";
import {
  executeReviewCandidates,
  parseReviewCandidatesArgs,
} from "./commands/review-candidates.js";
import {
  executePackAdd,
  executePackList,
  executePackRemove,
  packAddExitCode,
  parsePackArgs,
  renderPackAdd,
  renderPackList,
  renderPackRemove,
} from "./commands/pack.js";
import {
  executeFixtureReplay,
  parseFixtureReplayArgs,
  renderFixtureReplayResult,
  renderFixtureReplayHelp,
  FixtureReplayArgError,
} from "./commands/fixture-replay.js";
import {
  parseRepairSemanticArgs,
  formatRepairResult,
  executeRepairSemantic,
} from "./commands/repair-semantic.js";

function findPackageVersion(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  let workspaceRoot: string | null = null;
  for (let i = 0; i < 8; i++) {
    // Detect monorepo root for dev-mode fallback (pnpm uses pnpm-workspace.yaml,
    // not package.json's "workspaces" field).
    if (
      !workspaceRoot &&
      (fs.existsSync(path.join(dir, "pnpm-workspace.yaml")) ||
        fs.existsSync(path.join(dir, "packages", "viki", "package.json")))
    ) {
      workspaceRoot = dir;
    }
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
          name?: string;
          version?: string;
          bin?: Record<string, string>;
        };
        // Installed tarball: name=viki + bin.viki + version.
        if (pkg.name === "viki" && pkg.bin?.["viki"] && pkg.version) {
          return pkg.version;
        }
      } catch {
        // Keep walking upward; --version should never make the CLI fail.
      }
    }
    const next = path.dirname(dir);
    if (next === dir) break;
    dir = next;
  }
  // Dev fallback: read the publishable package.json directly.
  if (workspaceRoot) {
    try {
      const tpkgPath = path.join(workspaceRoot, "packages", "viki", "package.json");
      const tpkg = JSON.parse(fs.readFileSync(tpkgPath, "utf-8")) as { version?: string };
      if (tpkg.version) return tpkg.version;
    } catch {
      // fall through
    }
  }
  return "unknown";
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const rawRest = process.argv.slice(3);

  // Global flags inherited by all subcommands (issue #116):
  // --explain-like-ceo-duck enables duck-mode explanations (中文 cute-duck
  // alongside engineer jargon). Mirrors env VIKI_EXPLAIN_LIKE_CEO_DUCK.
  const duckCliFlag = "--explain-like-ceo-duck";
  if (rawRest.includes(duckCliFlag)) {
    const envObj = (globalThis as { process: { env: Record<string, string | undefined> } }).process.env;
    envObj["VIKI_EXPLAIN_LIKE_CEO_DUCK"] = "1";
  }
  const rest = rawRest.filter((a) => a !== duckCliFlag);

  switch (command) {
    case "--version":
    case "-V":
    case "version": {
      process.stdout.write(`${findPackageVersion()}\n`);
      return;
    }
    case "skeleton-demo": {
      const output = await runSkeletonDemo();
      if (output) process.stdout.write(output + "\n");
      return;
    }
    case "pitfall": {
      let nonInteractive;
      try {
        nonInteractive = parsePitfallArgs(rest);
      } catch (err) {
        const { PitfallValidationError } = await import("./commands/pitfall.js");
        if (err instanceof PitfallValidationError) {
          process.stderr.write(err.message + "\n");
          process.exit(2);
        }
        throw err;
      }
      const output = nonInteractive
        ? await executePitfall(nonInteractive)
        : await runPitfallInteractive();
      if (output) process.stdout.write(output + "\n");
      return;
    }
    case "stats": {
      const statsOpts: import("./commands/stats.js").StatsOptions = {};
      for (let i = 0; i < rest.length; i++) {
        const a = rest[i]!;
        if (a === "--stuck-in-promotion") {
          statsOpts.stuckInPromotion = true;
        } else if (a === "--explain" && rest[i + 1]) {
          statsOpts.explain = rest[++i];
        } else if (a.startsWith("--explain=")) {
          statsOpts.explain = a.slice("--explain=".length);
        } else if (a.startsWith("--stuck-days=")) {
          const v = parseInt(a.slice("--stuck-days=".length), 10);
          if (isNaN(v) || v < 0) {
            process.stderr.write(`--stuck-days 必须是正整数，收到: "${a.slice("--stuck-days=".length)}"\n`);
            process.exit(1);
          }
          statsOpts.stuckDays = v;
        } else if (a === "--override-signals") {
          statsOpts.overrideSignals = true;
        }
      }
      process.stdout.write(executeStats(statsOpts));
      return;
    }
    case "try": {
      const { executeTry } = await import("./commands/try.js");
      // Help mode
      if (rest.includes("--help") || rest.includes("-h")) {
        const r = await executeTry({ help: true });
        process.stdout.write(r.output);
        process.exit(r.exitCode);
      }
      const r = await executeTry({});
      process.stdout.write(r.output);
      process.exit(r.exitCode);
    }
    case "demo": {
      // Legacy subcommand: viki demo hook <tool> <key=value>...
      const sub = rest[0];
      if (sub === "hook") {
        const opts = parseDemoHookArgs(rest.slice(1));
        if (!opts) {
          process.stderr.write(
            "用法: viki demo hook <tool> <key=value>... 例: viki demo hook Bash 'command=npm install moment'\n" +
              "多字段：用空格分隔多个 'key=value' 槽位，或传单个 JSON 对象，例: viki demo hook Write '{\"file_path\":\"a.js\",\"content\":\"hi\"}'\n",
          );
          process.exit(1);
        }
        process.stdout.write(executeDemoHook(opts).output);
        return;
      }
      // Issue #93 modes: viki demo / --inline / --record [path]
      const { parseDemoArgs, executeDemo } = await import("./commands/demo.js");
      const demoArgs = parseDemoArgs(rest);
      const r = await executeDemo(demoArgs);
      process.stdout.write(r.output);
      if (r.exitCode !== 0) process.exit(r.exitCode);
      return;
    }
    case "install-hook": {
      const r = installHook();
      if (r.alreadyInstalled) {
        process.stdout.write(
          `✓ Hook 已安装（无变化）: ${r.settingsPath}\n  入口: ${r.hookEntry}\n`,
        );
      } else {
        process.stdout.write(
          `✅ Hook 已注册到 Claude Code: ${r.settingsPath}\n  入口: ${r.hookEntry}\n  下次开 Claude Code 时生效。可用 'viki demo hook ...' 离线测试。\n`,
        );
      }
      return;
    }
    case "uninstall-hook": {
      const r = uninstallHook();
      if (r.removed) {
        process.stdout.write(`✅ Hook 已移除: ${r.settingsPath}\n`);
      } else {
        process.stdout.write(`未找到 Viki hook 注册。无需移除。\n`);
      }
      return;
    }
    case "install-user-hook": {
      if (rest.includes("--dry-run")) {
        process.stderr.write(
          `install-user-hook 不支持 --dry-run（该命令直接修改 ~/.claude/settings.json）。\n` +
            `如需查看注册路径，先运行: viki install-user-hook 后用 cat ~/.claude/settings.json 查看，` +
            `或用 viki uninstall-user-hook 撤销。\n`,
        );
        process.exit(2);
      }
      const r = installUserHook();
      if (r.alreadyInstalled) {
        process.stdout.write(
          `✓ 用户级 SessionStart hook 已安装 (无变化): ${r.settingsPath}\n`,
        );
      } else {
        process.stdout.write(
          `✅ 用户级 SessionStart hook 已注册: ${r.settingsPath}\n` +
            (r.backupPath ? `   原配置已备份: ${r.backupPath}\n` : "") +
            `   入口: ${r.hookEntry}\n` +
            `   打开任何新项目时将自动检测并 init\n`,
        );
      }
      return;
    }
    case "uninstall-user-hook": {
      if (rest.includes("--dry-run")) {
        process.stderr.write(
          `uninstall-user-hook 不支持 --dry-run（该命令直接修改 ~/.claude/settings.json）。\n`,
        );
        process.exit(2);
      }
      const r = uninstallUserHook();
      if (r.removed) {
        process.stdout.write(`✅ 用户级 SessionStart hook 已移除: ${r.settingsPath}\n`);
      } else {
        process.stdout.write(`未找到用户级 SessionStart hook，无需移除\n`);
      }
      return;
    }
    case "analyze": {
      const opts = parseAnalyzeArgs(rest);
      const output = await executeAnalyze(opts);
      process.stdout.write(output);
      return;
    }
    case "team": {
      const { runTeamSubcommand } = await import("./commands/team.js");
      process.exit(await runTeamSubcommand(rest));
    }
    case "review": {
      const opts = parseReviewArgs(rest);
      process.stdout.write(executeReview(opts));
      return;
    }
    case "init": {
      if (rest.includes("--help") || rest.includes("-h")) {
        process.stdout.write(
          "Usage: viki init [--dry-run] [--structure] [--skip-import] [--skip-hook]\n" +
          "                      [--skip-seed] [--skip-warmup] [--install-plugins]\n" +
          "                      [--target=claude|codex|both] [--pack <all|name1,name2>]\n" +
          "                      [--no-user-level-hook] [--force-nested-init]\n" +
          "                      [--cwd=<path>] [--home=<path>]\n" +
          "\n" +
          "Options:\n" +
          "  --dry-run              Preview what init would do without making changes\n" +
          "  --structure            Opt in to LLM-based rule import from CLAUDE.md /\n" +
          "                         AGENTS.md / .cursorrules. Spawns one `claude -p` call\n" +
          "                         per rule and consumes Claude subscription quota.\n" +
          "                         Default OFF: init does not call the LLM or read those\n" +
          "                         files — rules live in the rule store, not CLAUDE.md.\n" +
          "  --skip-import          Force-skip LLM rule import even when --structure is set\n" +
          "  --skip-hook            Skip hook registration\n" +
          "  --skip-seed            Skip bundled seed-rule injection\n" +
          "  --skip-warmup          Skip embedding model warmup\n" +
          "  --install-plugins      Also install team plugins (playground/code-review/code-simplifier/...)\n" +
          "  --target=TARGET        claude (default), codex, or both\n" +
          "  --pack=NAMES           Install stack packs without showing the agent prompt.\n" +
          "                         NAMES may be 'all' or a comma-separated list (e.g. frontend-js,ops-safety).\n" +
          "  --no-user-level-hook   Issue #161 escape hatch: do NOT register hooks in\n" +
          "                         ~/.claude/settings.json. Default behaviour registers\n" +
          "                         user-level hooks so cc launched from sub-directories\n" +
          "                         still triggers Viki (project DB resolved via walk-up).\n" +
          "  --force-nested-init    Issue #161 escape hatch: allow `init` to create a\n" +
          "                         child .viki/ even when an ancestor already has\n" +
          "                         one. Default refuses to avoid duplicate state.\n" +
          "  --cwd=<path>           Override target project dir (default: process.cwd()).\n" +
          "                         Required for third-party judge harnesses that land init\n" +
          "                         on a sandbox without `cd` (Feature ① openable-and-usable).\n" +
          "  --home=<path>          Override user home dir for state files / skills mirror\n" +
          "                         (default: os.homedir()). Use together with --cwd to fully\n" +
          "                         isolate a fresh-repo smoke run from existing Viki state.\n" +
          "\n" +
          "Scaffolds Viki config in the current project:\n" +
          "  - Creates .viki/ directory and initializes knowledge DB\n" +
          "  - Injects meta-principles into global store\n" +
          "  - Imports rules from CLAUDE.md / AGENTS.md / .cursorrules (only with --structure)\n" +
          "  - Registers Claude Code hook (PreToolUse) at project AND user level\n" +
          "  - Exports compiled Skills\n" +
          "\n" +
          "Run viki doctor after init to verify the installation.\n",
        );
        return;
      }
      const opts = parseInitArgs(rest);
      const result = await executeInit(opts);
      process.stdout.write(renderInitResult(result));
      if (!result.ok) process.exit(1);
      return;
    }
    case "install-codex": {
      const opts = parseInitArgs(rest);
      const result = await executeInit({ ...opts, target: "codex" });
      process.stdout.write(renderInitResult(result));
      if (!result.ok) process.exit(1);
      return;
    }
    case "install": {
      const installArgs = parseInstallArgs(rest);
      if (installArgs.help) {
        process.stdout.write(renderInstallHelp());
        return;
      }
      if (installArgs.preview) {
        process.stdout.write(renderInstallPreviewOutput());
        return;
      }
      const result = await runInstall(installArgs);
      process.stdout.write(result.output);
      if (!result.ok) process.exit(1);
      return;
    }
    case "disable": {
      const r = disable();
      if (r.removed) {
        process.stdout.write(`✓ Hook 已禁用: ${r.settingsPath}\n  数据保留；用 'viki enable' 恢复\n`);
      } else {
        process.stdout.write(`未找到已注册的 Viki hook，无需禁用\n`);
      }
      return;
    }
    case "enable": {
      const r = enable();
      if (r.alreadyInstalled) {
        process.stdout.write(`✓ Hook 已启用（无变化）: ${r.settingsPath}\n`);
      } else {
        process.stdout.write(`✅ Hook 已重新启用: ${r.settingsPath}\n  下次开 Claude Code 时生效\n`);
      }
      return;
    }
    case "uninstall": {
      let opts;
      try {
        opts = parseUninstallArgs(rest);
      } catch (err) {
        const { UninstallArgError } = await import("./commands/uninstall.js");
        if (err instanceof UninstallArgError) {
          process.stderr.write(err.message + "\n");
          process.exit(2);
        }
        throw err;
      }
      const r = uninstall(opts);
      process.stdout.write(renderUninstallResult(r));
      return;
    }
    case "calibrate": {
      let opts;
      try {
        opts = parseCalibrateArgs(rest);
      } catch (err) {
        const { CalibrateArgError } = await import("./commands/calibrate.js");
        if (err instanceof CalibrateArgError) {
          process.stderr.write(err.message + "\n");
          process.exit(2);
        }
        throw err;
      }
      const r = await executeCalibrate(opts);
      process.stdout.write(renderCalibrateResult(r));
      return;
    }
    case "verify": {
      let opts;
      try {
        opts = parseVerifyArgs(rest);
      } catch (err) {
        const { VerifyArgError } = await import("./commands/verify.js");
        if (err instanceof VerifyArgError) {
          process.stderr.write(err.message + "\n");
          process.exit(2);
        }
        throw err;
      }
      const { result, reportPath } = await executeVerify(opts);
      process.stdout.write(renderVerifyTerminal(result));
      if (reportPath) {
        process.stdout.write(`\n📄 详细报告: ${reportPath}\n`);
      }
      if (result.passed !== result.total) process.exit(1);
      return;
    }
    case "verify-anchors": {
      let opts;
      try {
        opts = parseVerifyAnchorsArgs(rest);
      } catch (err) {
        const { VerifyAnchorsArgError } = await import(
          "./commands/verify-anchors.js"
        );
        if (err instanceof VerifyAnchorsArgError) {
          process.stderr.write(err.message + "\n");
          process.exit(2);
        }
        throw err;
      }
      const r = await executeVerifyAnchors(opts);
      if (opts.json) process.stdout.write(renderVerifyAnchorsJson(r));
      else process.stdout.write(renderVerifyAnchorsTerminal(r));
      if (r.failCount > 0) process.exit(1);
      return;
    }
    case "ingest": {
      let opts;
      try {
        opts = parseIngestArgs(rest);
      } catch (err) {
        process.stderr.write(
          `${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exit(1);
        return;
      }
      const output = await executeIngest(opts);
      if (output.startsWith("✗")) {
        process.stderr.write(output);
        process.exit(1);
        return;
      }
      process.stdout.write(output);
      return;
    }
    case "bug-report": {
      if (rest.includes("--help") || rest.includes("-h")) {
        process.stdout.write(
          "Usage: viki bug-report [--out=path] [--stdout]\n" +
          "\n" +
          "Options:\n" +
          "  --out=PATH       Write report to PATH (default: ~/.viki/bug-reports/...md)\n" +
          "  --stdout         Print report to stdout instead of writing to file\n" +
          "\n" +
          "Generates a diagnostic bug report with system info, tool versions,\n" +
          "hook config, and raw logs. Attach to GitHub issues when reporting\n" +
          "first-install or hook failures. Secrets are auto-redacted.\n" +
          "\n" +
          "Includes: system info, how-to-reproduce steps, raw logs (auto-redacted).\n",
        );
        return;
      }
      const opts = parseBugReportArgs(rest);
      const result = await executeBugReport({
        ...opts,
        cwd: process.cwd(),
        vikiVersion: findPackageVersion(),
      });
      if (opts.stdout) {
        process.stdout.write(result.markdown);
      } else {
        process.stdout.write(
          `Bug report written: ${result.outputPath}\n` +
            "Attach this file when reporting first-install or hook failures.\n",
        );
      }
      return;
    }
    case "pack": {
      if (rest.length === 0 || rest.includes("--help") || rest.includes("-h")) {
        process.stdout.write(
          "Usage:\n" +
            "  viki pack list [--json]\n" +
            "  viki pack add <names>      e.g. pack add frontend-js,ops-safety\n" +
            "  viki pack remove <names>\n" +
            "\n" +
            "Manages stack packs (per ADR 0002 — agent-driven detection).\n" +
            "Pack rules are written to ~/.viki/global.db with tag pack:<name>.\n",
        );
        return;
      }
      let args;
      try {
        args = parsePackArgs(rest);
      } catch (err) {
        process.stderr.write(
          `${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exit(2);
        return;
      }
      if (args.sub === "list") {
        const result = executePackList({});
        process.stdout.write(renderPackList(result, args.json));
        return;
      }
      if (args.sub === "add") {
        const result = await executePackAdd(args.names, {});
        process.stdout.write(renderPackAdd(result));
        const code = packAddExitCode(result);
        if (code !== 0) process.exit(code);
        return;
      }
      if (args.sub === "remove") {
        const result = executePackRemove(args.names, {});
        process.stdout.write(renderPackRemove(result));
        return;
      }
      return;
    }
    case "fixture": {
      try {
        if (rest.length === 0 || rest.includes("--help") || rest.includes("-h")) {
          process.stdout.write(renderFixtureReplayHelp());
          return;
        }
        const opts = parseFixtureReplayArgs(rest);
        const result = await executeFixtureReplay(opts);
        process.stdout.write(
          opts.json
            ? JSON.stringify(result, null, 2) + "\n"
            : renderFixtureReplayResult(result),
        );
        if (!result.ok) process.exit(1);
      } catch (err) {
        if (err instanceof FixtureReplayArgError) {
          process.stderr.write(err.message.endsWith("\n") ? err.message : err.message + "\n");
          process.exit(2);
        }
        throw err;
      }
      return;
    }
    case "compile": {
      let opts;
      try {
        opts = parseCompileArgs(rest);
      } catch (err) {
        const { CompileArgError } = await import("./commands/compile.js");
        if (err instanceof CompileArgError) {
          process.stderr.write(err.message + "\n");
          process.exit(2);
        }
        throw err;
      }
      const result = await executeCompile(opts);
      process.stdout.write(renderCompileResult(result, opts.dryRun));
      return;
    }
    case "daily": {
      let opts;
      try {
        opts = parseDailyArgs(rest);
      } catch (err) {
        process.stderr.write(`${(err as Error).message}\n`);
        process.exit(2);
      }
      if (opts.help) {
        process.stdout.write(renderDailyHelp());
        return;
      }
      const out = executeDaily(opts);
      process.stdout.write(renderDailyStdout(out, opts));
      return;
    }
    case "config": {
      const sub = rest[0];
      const val = rest[1];
      if (!sub || (sub !== "show" && sub !== "stop-mode")) {
        console.error('Usage: viki config stop-mode <sync|async>');
        console.error('       viki config show');
        process.exit(1);
      }
      try {
        const out = executeConfig({ subcommand: sub as "stop-mode" | "show", value: val });
        console.log(out);
      } catch (e) {
        console.error(String(e));
        process.exit(1);
      }
      break;
    }
    case "migrate-v6": {
      const { assertNoUnknownFlags, UnknownFlagError } = await import("./commands/arg-utils.js");
      try {
        assertNoUnknownFlags("migrate-v6", rest, new Set([
          "--dry-run", "--fast", "--repair-all", "--limit", "--db",
        ]));
      } catch (err) {
        if (err instanceof UnknownFlagError) { process.stderr.write(err.message + "\n"); process.exit(2); }
        throw err;
      }
      const dryRun = rest.includes("--dry-run");
      const fast = rest.includes("--fast");
      const repairAll = rest.includes("--repair-all");
      const limitArg = rest.find((a) => a.startsWith("--limit="));
      const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;
      const dbArg = rest.find((a) => a.startsWith("--db="));
      const dbPath = dbArg ? dbArg.split("=").slice(1).join("=") : undefined;
      const { executeMigrateV6 } = await import("./commands/migrate-v6.js");
      const result = await executeMigrateV6({ dryRun, dbPath, limit, fast, repairAll });
      process.stdout.write(`migrated=${result.migrated} resurrected=${result.resurrected} skipped=${result.skipped}\n`);
      return;
    }
    case "migrate-v7": {
      const { assertNoUnknownFlags, UnknownFlagError } = await import("./commands/arg-utils.js");
      try {
        assertNoUnknownFlags("migrate-v7", rest, new Set([
          "--dry-run", "--limit", "--db",
        ]));
      } catch (err) {
        if (err instanceof UnknownFlagError) { process.stderr.write(err.message + "\n"); process.exit(2); }
        throw err;
      }
      const dryRun = rest.includes("--dry-run");
      const limitArg = rest.find((a) => a.startsWith("--limit="));
      const limit = limitArg ? parseInt(limitArg.split("=")[1]!, 10) : undefined;
      const dbArg = rest.find((a) => a.startsWith("--db="));
      const dbPath = dbArg ? dbArg.split("=").slice(1).join("=") : undefined;
      const { executeMigrateV7 } = await import("./commands/migrate-v7.js");
      await executeMigrateV7({ dryRun, dbPath, limit, cwd: process.cwd() });
      return;
    }
    case "migrate": {
      const { assertNoUnknownFlags, UnknownFlagError } = await import("./commands/arg-utils.js");
      try {
        assertNoUnknownFlags("migrate", rest, new Set(["--dry-run"]));
      } catch (err) {
        if (err instanceof UnknownFlagError) { process.stderr.write(err.message + "\n"); process.exit(2); }
        throw err;
      }
      const dryRun = rest.includes("--dry-run");
      const { executeMigrate } = await import("./commands/migrate-v1-to-v2.js");
      const r = await executeMigrate({ dryRun });
      process.stdout.write(`Phase 1 → v2 迁移:\n`);
      process.stdout.write(`  读取条目: ${r.readEntries}\n`);
      process.stdout.write(`    personal: ${r.byScope.personal}\n`);
      process.stdout.write(`    team: ${r.byScope.team}\n`);
      process.stdout.write(`    global: ${r.byScope.global}\n`);
      if (dryRun) {
        process.stdout.write(`\n(dry-run 模式，未写入 SQLite)\n`);
      } else {
        process.stdout.write(`  写入: ${r.written} 条; 拒绝: ${r.rejected} 条\n`);
        if (r.rejectionLog.length > 0) {
          for (const entry of r.rejectionLog) {
            process.stderr.write(`  rejected ${entry.id}: ${entry.reason}\n`);
          }
        }
      }
      return;
    }
    case "scan-errors": {
      const scanOpts = parseScanErrorsArgs(rest);
      const output = await executeScanErrors(scanOpts);
      if (output) process.stdout.write(output);
      return;
    }
    case "review-candidates": {
      const reviewOpts = parseReviewCandidatesArgs(rest);
      const output = await executeReviewCandidates(reviewOpts);
      if (output) process.stdout.write(output);
      return;
    }
    case "doctor": {
      // Issue #172: `viki doctor --help` previously executed doctor
      // (because parseDoctorArgs ignored unknown flags). Make `--help`/`-h`
      // print subcommand-specific help and return without running diagnostics.
      if (rest.includes("--help") || rest.includes("-h")) {
        process.stdout.write(renderDoctorHelp());
        return;
      }
      const opts = parseDoctorArgs(rest);
      const result = await executeDoctor({ ...opts, cwd: opts.cwd ?? process.cwd() });
      if (opts.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      } else if (!opts.postinstall || !result.allPassed) {
        process.stdout.write(renderDoctorResult(result));
      }
      if (!result.allPassed) process.exit(1);
      return;
    }
    case "install-plugins": {
      const opts = parseInstallPluginsArgs(rest);
      const result = await executeInstallPlugins(opts);
      process.stdout.write(renderInstallPluginsResult(result));
      if (!result.ok) process.exit(1);
      return;
    }
    case "warmup": {
      const { runWarmup } = await import("./commands/warmup.js");
      // Issue #91: optional `--write-state <path>` records progress and the
      // final outcome to a JSON file for other processes (PreToolUse, Stop,
      // doctor) to consult without having to load the embedder themselves.
      let stateFilePath: string | undefined;
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === "--write-state" && rest[i + 1]) {
          stateFilePath = rest[i + 1];
          i++;
        } else if (rest[i]?.startsWith("--write-state=")) {
          stateFilePath = rest[i]!.slice("--write-state=".length);
        }
      }
      const result = await runWarmup({ stateFilePath });
      process.exit(result.ok ? 0 : 1);
    }
    case "migrate-auto": {
      const { assertNoUnknownFlags, UnknownFlagError } = await import("./commands/arg-utils.js");
      try {
        // migrate-auto currently takes no flags; reject anything unknown.
        assertNoUnknownFlags("migrate-auto", rest, new Set([]));
      } catch (err) {
        if (err instanceof UnknownFlagError) { process.stderr.write(err.message + "\n"); process.exit(2); }
        throw err;
      }
      const { runMigrateAuto } = await import("./commands/migrate-auto.js");
      const r = await runMigrateAuto();
      process.stderr.write(JSON.stringify(r, null, 2) + "\n");
      process.exit(r.ok ? 0 : 1);
    }
    case "update": {
      const { runUpdateCommand, parseUpdateArgs } = await import("./commands/update.js");
      const { sub, rest: subRest } = parseUpdateArgs(rest);
      const r = await runUpdateCommand(sub, subRest);
      process.stdout.write(r.output);
      process.exit(r.ok ? 0 : 1);
    }
    case "whatsnew": {
      const { executeWhatsNew, parseWhatsNewArgs } = await import("./commands/whatsnew.js");
      const opts = parseWhatsNewArgs(rest);
      const r = executeWhatsNew(opts);
      process.stdout.write(r.output);
      process.exit(r.ok ? 0 : 1);
    }
    case "reclassify": {
      if (rest.includes("--help") || rest.includes("-h") || rest[0] === "--help" || rest[0] === "-h") {
        process.stdout.write(
          "Usage:\n" +
          "  viki reclassify apply --plan <path> [--dry-run] [--min-conf=0.7]\n" +
          "  viki reclassify rollback --audit <audit-id>\n" +
          "\n" +
          "Subcommands:\n" +
          "  apply      Apply a reclassification plan to rule channel/enforcement in knowledge.db\n" +
          "  rollback   Reverse a previous apply using its audit-id\n" +
          "\n" +
          "Options for apply:\n" +
          "  --plan=PATH      JSON plan file produced by scripts/reclassify-rules.ts\n" +
          "  --dry-run        Preview without writing to DB\n" +
          "  --min-conf=N     Minimum confidence threshold (default 0.7)\n" +
          "\n" +
          "Options for rollback:\n" +
          "  --audit=ID       Audit-id from a previous apply\n" +
          "\n" +
          "Reclassifies rules by scope, changing channel and enforcement fields.\n",
        );
        return;
      }
      const sub = rest[0];
      const subArgs = rest.slice(1);
      const { runReclassifyApply, runReclassifyRollback } = await import("./commands/reclassify.js");
      if (sub === "apply") {
        const planIdx = subArgs.findIndex((a) => a === "--plan");
        const planFile = planIdx >= 0 ? subArgs[planIdx + 1] : undefined;
        if (!planFile) {
          process.stderr.write("Usage: viki reclassify apply --plan <path> [--dry-run] [--min-conf=0.7]\n");
          process.exit(1);
        }
        const dryRun = subArgs.includes("--dry-run");
        const minConfArg = subArgs.find((a) => a.startsWith("--min-conf="));
        const minConfidence = minConfArg ? parseFloat(minConfArg.split("=")[1]!) : 0.7;
        runReclassifyApply({ plan: planFile, dryRun, minConfidence });
        return;
      }
      if (sub === "rollback") {
        const auditIdx = subArgs.findIndex((a) => a === "--audit");
        const auditId = auditIdx >= 0 ? subArgs[auditIdx + 1] : undefined;
        if (!auditId) {
          process.stderr.write("Usage: viki reclassify rollback --audit <audit-id>\n");
          process.exit(1);
        }
        runReclassifyRollback({ auditId });
        return;
      }
      process.stderr.write(
        "Usage:\n" +
          "  viki reclassify apply --plan <path> [--dry-run] [--min-conf=0.7]\n" +
          "  viki reclassify rollback --audit <audit-id>\n",
      );
      process.exit(1);
      return;
    }
    case "repair-semantic": {
      const opts = parseRepairSemanticArgs(rest);
      const result = await executeRepairSemantic(opts);
      process.stdout.write(formatRepairResult(result));
      process.exit(result.ok ? 0 : 1);
    }
    case undefined: {
      const { runFirstRunWizard } = await import("./commands/first-run.js");
      await runFirstRunWizard();
      return;
    }
    case "--help":
    case "-h":
    case "help": {
      process.stdout.write(
        [
          "viki — Viki CLI",
          "",
          "用法:",
          "  viki try                    30 秒一键体验：依次播放 5 个经典 hook 拦截场景（首次安装推荐入口）",
          "  viki skeleton-demo          M0 Walking Skeleton 演示",
          "  viki pitfall                手动记录一条踩坑经验 (交互)",
          "  viki pitfall --non-interactive --trigger=... --wrong=... --correct=... --reason=...",
          "                                   非交互模式 (可选: --category=C|E|S|K --tags=a,b --level=personal|team|global --nature=objective|subjective)",
          "  viki stats [--stuck-in-promotion] [--stuck-days=N] [--explain=<id>]",
          "                                   展示知识库统计；--stuck-in-promotion 列出卡在 probation 超 N 天的规则",
          "  viki demo hook <tool> <k=v>...    [advanced] 离线模拟 PreToolUse hook（多字段请用空格分隔多个 slot，或传单个 JSON：'{\"file_path\":\"a\",\"content\":\"b\"}'）",
          "                                   例：viki demo hook Bash 'command=npm install moment'",
          "                                   例：viki demo hook Write file_path=a.js content='console.log(1)'",
          "  viki install-hook           把 PreToolUse hook 注册到当前项目 .claude/settings.local.json",
          "  viki uninstall-hook         移除 PreToolUse hook 注册",
          "  viki install-user-hook      把 SessionStart hook 注册到 ~/.claude/settings.json",
          "                                   (打开任何新项目时自动 init, 一次装永久生效)",
          "  viki uninstall-user-hook    移除用户级 SessionStart hook 注册",
          "  viki analyze [--session=<id|path>] [--verbose] [--commit]",
          "                                   分析 Claude Code 会话日志，识别纠正时刻+成功信号",
          "                                   --commit: 通过 LLM 提取成知识条目并写入知识库 + 更新 Skills + 调度 docs propagation",
          "  viki review [N] [--scope=personal|team|global]",
          "                                   列出最近 N 条知识（默认 10），供人工复核",
          "  viki init [--dry-run] [--structure] [--skip-hook] [--install-plugins] [--target=claude|codex|both]",
          "                                   一键安装到当前项目：建目录 + 注入元原则 + 注册集成 + 导出 Skills",
          "                                   默认 target=claude；codex 会创建 .codex/skills 软链接且不注册 Claude hook",
          "                                   --structure: opt-in，从 CLAUDE.md/AGENTS.md/.cursorrules 跑 LLM 结构化导入（消耗订阅额度）；默认不导入",
          "                                   --install-plugins: 同时注册团队标配插件（opt-in，改写用户全局 settings）",
          "                                   VIKI_VERBOSE_INIT=1: 在成功输出中恢复 4-step 下一步列表 + plugin tip + 🆕 本次新增 tail",
          "  viki install-codex [--dry-run] [--structure]",
          "                                   Codex 快捷安装：导出 Skills，并创建 .codex/skills 软链接",
          "                                   --structure: 同 init，opt-in LLM 结构化导入；默认不导入、不消耗订阅额度",
          "  viki doctor [--fix [--dry-run]] [--json] [--cwd=<path>] [--help]",
          "                                   诊断安装环境（Node版本/Claude Code/sqlite-vec/Hook/CLAUDE.md）",
          "                                   --fix: 自动修复能修的项；写 CLAUDE.md 前先备份到 ~/.viki/backups/",
          "                                          - 旧版 VIKI:START 生成块（剥离）",
          "                                          - 知识库未初始化（viki init）",
          "                                          - hook 未注册（viki install-hook）",
          "                                          配 --dry-run 预览 unified diff，不写入；详细帮助见 `viki doctor --help`",
          "                                   --json: 输出机器可读 JSON（含 fixOutcomes 与 dryRun 字段）",
          "  viki install-plugins [--dry-run] [--only=a,b] [--scope=user|project|local]",
          "                                   注册团队标配 plugins（与 .claude/settings.json:enabledPlugins 同步）",
          "                                   通过 'claude plugin marketplace add' + 'claude plugin install' 调 CC CLI",
          "                                   默认装全部；--only 限定子集；--dry-run 只预览",
          "  viki disable                临时禁用 Hook（保留数据）",
          "  viki enable                 重新启用 Hook",
          "  viki uninstall [--delete-data] [--dry-run]",
          "                                   完全卸载：移除 Hook 注册 + 清掉 CLAUDE.md 区块；加 --delete-data 同时清数据",
          "  viki calibrate [--days=7] [--dry-run]",
          "                                   根据 events.jsonl 重算 confidence + 自动归档低分条目",
          "  viki verify [--report=path]",
          "  viki verify-anchors [--claude-md=<path>] [--docs-root=<path>] [--json]",
          "                                   静态校验 CLAUDE.md canned-answer anchor 卡的结构完整性",
          "                                   (a) 声明的 grep substring 是否真出现在 anchor sentence；",
          "                                   (b) 全部 N 个锚点 的 N 是否对得上；",
          "                                   (c) 引用的 docs/*.md 路径是否存在；",
          "                                   (d) anchor sentence 是否唯一不重复。",
          "                                   跑 5 个验证场景（踩坑→学习→避坑），输出 PRR/KP 指标",
          "  viki daily [--projects-root=PATH] [--archive] [--format=json|context] [--help]",
          "                                   [issue-371] 跨项目扫 ~/.claude/projects 今天活动，输出 member×project 一句话日报骨架",
          "  viki bug-report [--out=path] [--stdout]",
          "                                   生成可附到 issue 的诊断报告：系统信息 + hook 配置 + 原始日志（自动脱敏）",
          "  viki compile [--dry-run] [--skills-only] [--markdown-only] [--force] [--legacy-claude-md] [--target=claude|codex|both]",
          "                                   编译 Agent Skills (stable+)；CLAUDE.md 规则块输出已禁用",
          "                                   --legacy-claude-md: 显式恢复旧 CLAUDE.md managed block 输出",
          "                                   --dry-run: 预览将写/删哪些文件，不实际写入",
          "                                   --skills-only / --markdown-only: legacy flags",
          "  viki config stop-mode <sync|async>  切换 Stop hook 运行模式（默认 sync）",
          "  viki config show                    查看当前配置",
          "  viki scan-errors [--mode=efficient|full] [--since=<duration|ISO>] [--min-freq=N] [--dry-run] [--quiet]",
          "                                   自动采集错误信号 → 提取候选规则 → 写入候选队列",
          "  viki review-candidates [--limit=N] [--approve-scope=personal|team|global]",
          "                                   交互式审核候选规则：[a]批准 [r]拒绝 [s]跳过 [q]退出；可把批准项提升为本地 team scope",
          "  viki migrate-v6 [--dry-run] [--limit=N] [--db=<path>]",
          "                                   迁移旧规则（trigger_description 为空）通过 LLM 生成双描述，并写入 vec0 和 FTS5",
          "  viki migrate-v7 [--dry-run] [--limit=N] [--db=<path>]",
          "                                   批量为存量规则生成 tool_context_description，并写入 knowledge_tool_vec",
          "  viki pack list [--json]",
          "                                   列出已安装 / 可用的 stack packs（ADR 0002 — agent 决定装哪些）",
          "  viki pack add <names>       例 pack add frontend-js,ops-safety；从 seed/packs/<name>.{jsonl,meta.json} 读取并注入用户全局 store",
          "  viki pack remove <names>    按 tag pack:<name> 过滤删除全局 store 中对应规则",
          "  viki ingest --from-insights <path> | --from-audit | --from-pr <n>",
          "                   | --from-git [--since=30d] | --from-ci [--since=30d] | --from-candidates <path>",
          "                                   多源摄入：Claude /insights / npm audit / PR review / git hotspot / CI failure",
          "                                   半自动源加 --dry-run 只产出候选 md 供人工勾选",
          "",
          "环境变量:",
          "  VIKI_VISIBILITY=silent|smart|verbose    归因渲染模式（默认 verbose）",
          "",
        ].join("\n"),
      );
      return;
    }
    default:
      process.stderr.write(`未知命令: ${command}\n`);
      process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
