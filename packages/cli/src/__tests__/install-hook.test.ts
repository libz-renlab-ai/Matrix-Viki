import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { installHook, uninstallHook } from "../commands/install-hook.js";

function mkTmp(): { cwd: string; cleanup: () => void } {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "install-hook-"));
  return {
    cwd,
    cleanup: () => fs.rmSync(cwd, { recursive: true, force: true }),
  };
}

// 用真实存在的文件作 fake hook entry，绕过"bundle 必须存在"的检查
const FAKE_HOOK_ENTRY = fileURLToPath(import.meta.url);

describe("installHook", () => {
  let tmp: ReturnType<typeof mkTmp>;

  beforeEach(() => {
    tmp = mkTmp();
  });

  afterEach(() => {
    tmp.cleanup();
  });

  it("creates settings.local.json with PreToolUse hook entry", () => {
    const r = installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, userLevel: false });
    expect(r.alreadyInstalled).toBe(false);

    const content = JSON.parse(fs.readFileSync(r.settingsPath, "utf-8"));
    expect(content.hooks.PreToolUse).toBeDefined();
    expect(content.hooks.PreToolUse[0]._vikiTag).toBe("viki-pre-tool-use");
    expect(content.hooks.PreToolUse[0].matcher).toContain("Bash");
    expect(content.hooks.PreToolUse[0].hooks[0].command).toContain("node");
    // command 会把反斜杠转为正斜杠
    const forwardEntry = FAKE_HOOK_ENTRY.replace(/\\/g, "/");
    expect(content.hooks.PreToolUse[0].hooks[0].command).toContain(forwardEntry);
  });

  it("preserves existing user settings", () => {
    const settingsPath = path.join(tmp.cwd, ".claude", "settings.local.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        someUserSetting: "preserved",
        hooks: {
          PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "user-hook.sh" }] }],
        },
      }),
    );

    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, userLevel: false });

    const content = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    expect(content.someUserSetting).toBe("preserved");
    expect(content.hooks.PreToolUse).toHaveLength(2);
    expect(content.hooks.PreToolUse[0].hooks[0].command).toBe("user-hook.sh");
    expect(content.hooks.PreToolUse[1]._vikiTag).toBe("viki-pre-tool-use");
  });

  it("idempotent: second install detects already-installed", () => {
    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, userLevel: false });
    const r2 = installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, userLevel: false });
    expect(r2.alreadyInstalled).toBe(true);

    const content = JSON.parse(
      fs.readFileSync(r2.settingsPath, "utf-8"),
    );
    expect(content.hooks.PreToolUse).toHaveLength(1);
  });

  // v0.11.0 channelOps unification: project-level applyChannelOps now also
  // strips untagged-legacy entries that point at Viki bundle filenames
  // (mirrors B-086 user-level dedup). Without this test, a future refactor
  // could silently regress project-level dedup since the symmetric user-level
  // test (line ~790) only exercises ~/.claude/settings.json — not
  // <cwd>/.claude/settings.local.json.
  //
  // Issue #6: legacy paths must lie inside a recognised Viki install location
  // (`~/.viki/hooks/`, `/packages/cli/dist/`, `/node_modules/viki/dist/`) for
  // the heuristic to fire. Random `/old/install/path/...` strings were never
  // safely-attributable to Viki and used to collide with foreign tools that
  // shipped same-named bundles.
  it("(B-086 project) untagged-legacy PreToolUse entry replaced cleanly on install", () => {
    const settingsPath = path.join(tmp.cwd, ".claude", "settings.local.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [
                {
                  type: "command",
                  // Viki-path signature: pre-tag install at ~/.viki/hooks/.
                  command: "node /old/.viki/hooks/bin-pre-tool-use.cjs",
                },
              ],
            },
          ],
        },
      }),
      "utf-8",
    );

    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, userLevel: false });

    const content = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    expect(content.hooks.PreToolUse).toHaveLength(1);
    expect(content.hooks.PreToolUse[0]._vikiTag).toBe("viki-pre-tool-use");
    const cmd: string = content.hooks.PreToolUse[0].hooks[0].command;
    expect(cmd).not.toContain("/old/.viki/hooks/bin-pre-tool-use.cjs");
  });

  // Issue #6 regression: a foreign tool may use exactly the same bundle
  // filename (e.g. Riven ships its own `bin-user-prompt-submit.cjs` under
  // `~/.riven/digital-twin/`). The pre-#6 filename-substring heuristic
  // misclassified such entries as Viki legacy and stripped them on every
  // `viki init`. Foreign entries — identified by `_*Tag` other than
  // `_vikiTag`, OR by a path outside Viki install locations — must be
  // preserved untouched.
  it("(#6) foreign-tag entries with same bundle filename are preserved", () => {
    const settingsPath = path.join(tmp.cwd, ".claude", "settings.local.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          UserPromptSubmit: [
            {
              // Riven uses exactly this filename — pre-#6 the substring
              // match against `bin-user-prompt-submit.cjs` falsely flagged
              // this entry as Viki legacy and dropped it.
              _rivenTag: "riven-user-prompt-submit",
              hooks: [
                {
                  type: "command",
                  command:
                    "bash -c '[ -f \"$1\" ] || exit 0; exec node --no-warnings \"$1\"' _ /home/u/.riven/digital-twin/bin-user-prompt-submit.cjs",
                  timeout: 5,
                },
              ],
            },
          ],
          Stop: [
            {
              // _teamagentTag (legacy predecessor) on a sibling channel —
              // must also survive a viki install. Path under .teamagent/
              // confirms it's foreign even by path signature.
              _teamagentTag: "teamagent-stop",
              hooks: [
                {
                  type: "command",
                  command:
                    "bash -c '[ -f \"$1\" ] || exit 0; exec node \"$1\"' _ /home/u/.teamagent/hooks/bin-stop.cjs",
                  timeout: 60,
                },
              ],
            },
          ],
        },
      }),
      "utf-8",
    );

    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      userPromptEntry: FAKE_HOOK_ENTRY,
      stopEntry: FAKE_HOOK_ENTRY,
      userLevel: false,
    });

    const content = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));

    // Foreign UserPromptSubmit entry preserved + Viki entry appended.
    expect(content.hooks.UserPromptSubmit).toHaveLength(2);
    expect(content.hooks.UserPromptSubmit[0]._rivenTag).toBe(
      "riven-user-prompt-submit",
    );
    expect(content.hooks.UserPromptSubmit[1]._vikiTag).toBe(
      "viki-user-prompt-submit",
    );

    // Foreign Stop entry (teamagent) preserved + Viki Stop appended.
    expect(content.hooks.Stop).toHaveLength(2);
    expect(content.hooks.Stop[0]._teamagentTag).toBe("teamagent-stop");
    expect(content.hooks.Stop[1]._vikiTag).toBe("viki-stop");
  });

  // Issue #6: untagged foreign entry whose command happens to mention a Viki
  // bundle filename but lives outside any Viki install location must also
  // be preserved. Path signature is the discriminator.
  it("(#6) untagged entries outside Viki paths are preserved even with same filename", () => {
    const settingsPath = path.join(tmp.cwd, ".claude", "settings.local.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [
                {
                  type: "command",
                  // Untagged, foreign-path (`/opt/foo/dist/`) — must survive.
                  command: "node /opt/foo/dist/bin-pre-tool-use.cjs",
                },
              ],
            },
          ],
        },
      }),
      "utf-8",
    );

    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, userLevel: false });

    const content = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    expect(content.hooks.PreToolUse).toHaveLength(2);
    expect(content.hooks.PreToolUse[0].hooks[0].command).toBe(
      "node /opt/foo/dist/bin-pre-tool-use.cjs",
    );
    expect(content.hooks.PreToolUse[1]._vikiTag).toBe("viki-pre-tool-use");
  });
});

describe("uninstallHook", () => {
  let tmp: ReturnType<typeof mkTmp>;

  beforeEach(() => {
    tmp = mkTmp();
  });

  afterEach(() => {
    tmp.cleanup();
  });

  it("returns removed=false when settings file missing", () => {
    const r = uninstallHook({ cwd: tmp.cwd });
    expect(r.removed).toBe(false);
  });

  it("removes only Viki entry, preserves user hooks", () => {
    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, userLevel: false });

    // 注入一条用户自己的 hook
    const settingsPath = path.join(tmp.cwd, ".claude", "settings.local.json");
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    settings.hooks.PreToolUse.push({
      matcher: "Read",
      hooks: [{ type: "command", command: "user-other.sh" }],
    });
    fs.writeFileSync(settingsPath, JSON.stringify(settings));

    const r = uninstallHook({ cwd: tmp.cwd });
    expect(r.removed).toBe(true);

    const after = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    expect(after.hooks.PreToolUse).toHaveLength(1);
    expect(after.hooks.PreToolUse[0].hooks[0].command).toBe("user-other.sh");
  });

  it("returns removed=false on second uninstall", () => {
    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, userLevel: false });
    uninstallHook({ cwd: tmp.cwd });
    const r2 = uninstallHook({ cwd: tmp.cwd });
    expect(r2.removed).toBe(false);
  });
});

describe("installHook — UserPromptSubmit + Stop", () => {
  let tmp: ReturnType<typeof mkTmp>;
  beforeEach(() => { tmp = mkTmp(); });
  afterEach(() => { tmp.cleanup(); });

  it("registers UserPromptSubmit hook when bundle provided", () => {
    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      userPromptEntry: FAKE_HOOK_ENTRY,
      userLevel: false,
    });
    const content = JSON.parse(
      fs.readFileSync(path.join(tmp.cwd, ".claude", "settings.local.json"), "utf-8")
    );
    expect(content.hooks.UserPromptSubmit).toBeDefined();
    expect(content.hooks.UserPromptSubmit[0]._vikiTag).toBe("viki-user-prompt-submit");
    expect(content.hooks.UserPromptSubmit[0].hooks[0].timeout).toBe(10);
    expect(content.hooks.UserPromptSubmit[0].matcher).toBeUndefined();
  });

  it("registers Stop hook when bundle provided", () => {
    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      stopEntry: FAKE_HOOK_ENTRY,
      userLevel: false,
    });
    const content = JSON.parse(
      fs.readFileSync(path.join(tmp.cwd, ".claude", "settings.local.json"), "utf-8")
    );
    expect(content.hooks.Stop).toBeDefined();
    expect(content.hooks.Stop[0]._vikiTag).toBe("viki-stop");
    expect(content.hooks.Stop[0].hooks[0].timeout).toBe(60);
    expect(content.hooks.Stop[0].matcher).toBeUndefined();
  });

  it("idempotent: second install of UserPromptSubmit not duplicated", () => {
    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, userPromptEntry: FAKE_HOOK_ENTRY, userLevel: false });
    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, userPromptEntry: FAKE_HOOK_ENTRY, userLevel: false });
    const content = JSON.parse(
      fs.readFileSync(path.join(tmp.cwd, ".claude", "settings.local.json"), "utf-8")
    );
    expect(content.hooks.UserPromptSubmit).toHaveLength(1);
  });

  it("uninstall removes UserPromptSubmit and Stop entries", () => {
    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      userPromptEntry: FAKE_HOOK_ENTRY,
      stopEntry: FAKE_HOOK_ENTRY,
      userLevel: false,
    });
    uninstallHook({ cwd: tmp.cwd });
    const content = JSON.parse(
      fs.readFileSync(path.join(tmp.cwd, ".claude", "settings.local.json"), "utf-8")
    );
    expect(content.hooks?.UserPromptSubmit).toBeUndefined();
    expect(content.hooks?.Stop).toBeUndefined();
  });
});

describe("installHook — statusLine", () => {
  let tmp: ReturnType<typeof mkTmp>;
  beforeEach(() => { tmp = mkTmp(); });
  afterEach(() => { tmp.cleanup(); });

  it("registers viki statusLine when none exists", () => {
    const r = installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      statusLineEntry: FAKE_HOOK_ENTRY,
      userLevel: false,
    });
    expect(r.statusLineSkipped).toBe(false);

    const content = JSON.parse(
      fs.readFileSync(path.join(tmp.cwd, ".claude", "settings.local.json"), "utf-8"),
    );
    expect(content.statusLine).toBeDefined();
    expect(content.statusLine.type).toBe("command");
    expect(content.statusLine._vikiTag).toBe("viki-statusline");
    expect(content.statusLine.command).toContain("node");
    expect(content.statusLine.command).toContain(FAKE_HOOK_ENTRY.replace(/\\/g, "/"));
  });

  it("updates tagged viki statusLine (idempotent)", () => {
    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, statusLineEntry: FAKE_HOOK_ENTRY, userLevel: false });
    const r2 = installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, statusLineEntry: FAKE_HOOK_ENTRY, userLevel: false });
    expect(r2.statusLineSkipped).toBe(false);

    const content = JSON.parse(
      fs.readFileSync(path.join(tmp.cwd, ".claude", "settings.local.json"), "utf-8"),
    );
    expect(content.statusLine._vikiTag).toBe("viki-statusline");
  });

  it("wraps user's project-level statusLine into bash -c chain (#104)", () => {
    const settingsPath = path.join(tmp.cwd, ".claude", "settings.local.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    const preExisting = {
      statusLine: {
        type: "command",
        command: "node /custom/user/bar.js",
      },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(preExisting));

    const r = installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      statusLineEntry: FAKE_HOOK_ENTRY,
      homeDir: tmp.cwd, // 测试用空 home，避免读到本机真 ~/.claude
      userLevel: false,
    });
    expect(r.statusLineSkipped).toBe(false);
    expect(r.statusLineMergedScope).toBe("project");

    const content = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    // command 现在是 chain 形态：bash -c '<user>; echo; <team>'
    expect(content.statusLine.command).toMatch(/^bash -c '/);
    expect(content.statusLine.command).toContain("node /custom/user/bar.js");
    expect(content.statusLine.command).toContain("; echo;");
    expect(content.statusLine._vikiTag).toBe("viki-statusline");
    expect(content.statusLine._vikiOriginalCommand).toBe("node /custom/user/bar.js");
    expect(content.statusLine._vikiOriginalType).toBe("command");
    expect(content.statusLine._vikiOriginalScope).toBe("project");
  });

  it("fans out stdin to BOTH chained segments so CC JSON reaches viki (#331)", () => {
    // Pre-existing user statusLine that drains stdin via `input=$(cat)` — the
    // realworld shape from ~/.claude/statusline-command.sh on the maintainer's
    // box. Before #331, the second segment (our cjs) saw EOF on stdin and all
    // CC-derived fields (model / context / cost) silently vanished. The
    // wrapper must snapshot stdin once at the top and replay it to both
    // segments via `printf %s | ...`.
    const settingsPath = path.join(tmp.cwd, ".claude", "settings.local.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    const preExisting = {
      statusLine: { type: "command", command: 'input=$(cat); echo USER_OUT' },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(preExisting));

    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      statusLineEntry: FAKE_HOOK_ENTRY,
      homeDir: tmp.cwd,
      userLevel: false,
    });

    const cmd = (JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as {
      statusLine: { command: string };
    }).statusLine.command;
    // The new chain wrap snapshots stdin into `_TS_IN` once, then replays it
    // to BOTH segments via `printf %s "$_TS_IN" | { ... }`.
    expect(cmd).toContain("_TS_IN=$(cat)");
    // `printf %s "$_TS_IN" | {` must appear at least twice — once per segment.
    const fanOutCount = (cmd.match(/printf "%s" "\$_TS_IN" \| \{/g) ?? []).length;
    expect(fanOutCount).toBe(2);
    // Both the user cmd and the viki cmd are still present.
    expect(cmd).toContain("input=$(cat); echo USER_OUT");
    expect(cmd).toContain("node");
    // Cosmetic newline separator preserved (legacy contract from PR #124).
    expect(cmd).toContain("; echo;");
  });

  it("wraps user-level ~/.claude/settings.json statusLine (#104)", () => {
    // 模拟 ~/.claude/settings.json
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "fake-home-"));
    const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");
    fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
    fs.writeFileSync(
      userSettingsPath,
      JSON.stringify({
        statusLine: { type: "command", command: "echo USER_OWN_STATUSLINE_TOKEN" },
      }),
    );

    try {
      const r = installHook({
        cwd: tmp.cwd,
        hookEntry: FAKE_HOOK_ENTRY,
        statusLineEntry: FAKE_HOOK_ENTRY,
        homeDir: fakeHome,
        userLevel: false,
      });
      expect(r.statusLineMergedScope).toBe("user");

      const projectSettings = JSON.parse(
        fs.readFileSync(path.join(tmp.cwd, ".claude", "settings.local.json"), "utf-8"),
      );
      expect(projectSettings.statusLine.command).toContain("echo USER_OWN_STATUSLINE_TOKEN");
      expect(projectSettings.statusLine.command).toMatch(/^bash -c '/);
      expect(projectSettings.statusLine._vikiOriginalCommand).toBe(
        "echo USER_OWN_STATUSLINE_TOKEN",
      );
      expect(projectSettings.statusLine._vikiOriginalScope).toBe("user");

      // user-level 文件保持原样（V4 / V1 不变）
      const userAfter = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));
      expect(userAfter.statusLine.command).toBe("echo USER_OWN_STATUSLINE_TOKEN");
    } finally {
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("project-level user statusLine takes precedence over user-level (#104)", () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "fake-home-"));
    fs.mkdirSync(path.join(fakeHome, ".claude"), { recursive: true });
    fs.writeFileSync(
      path.join(fakeHome, ".claude", "settings.json"),
      JSON.stringify({ statusLine: { type: "command", command: "USER_LEVEL_CMD" } }),
    );
    const projectPath = path.join(tmp.cwd, ".claude", "settings.local.json");
    fs.mkdirSync(path.dirname(projectPath), { recursive: true });
    fs.writeFileSync(
      projectPath,
      JSON.stringify({ statusLine: { type: "command", command: "PROJECT_LEVEL_CMD" } }),
    );

    try {
      const r = installHook({
        cwd: tmp.cwd,
        hookEntry: FAKE_HOOK_ENTRY,
        statusLineEntry: FAKE_HOOK_ENTRY,
        homeDir: fakeHome,
        userLevel: false,
      });
      expect(r.statusLineMergedScope).toBe("project");
      const content = JSON.parse(fs.readFileSync(projectPath, "utf-8"));
      expect(content.statusLine._vikiOriginalCommand).toBe("PROJECT_LEVEL_CMD");
      expect(content.statusLine.command).toContain("PROJECT_LEVEL_CMD");
      expect(content.statusLine.command).not.toContain("USER_LEVEL_CMD");
    } finally {
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("escapes single quotes in user cmd safely (#104)", () => {
    const settingsPath = path.join(tmp.cwd, ".claude", "settings.local.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        statusLine: { type: "command", command: "echo \"it's fine\"" },
      }),
    );

    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      statusLineEntry: FAKE_HOOK_ENTRY,
      homeDir: tmp.cwd,
      userLevel: false,
    });

    const content = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    // POSIX 单引号转义：' → '\''
    expect(content.statusLine.command).toContain("it'\\''s fine");
    expect(content.statusLine._vikiOriginalCommand).toBe("echo \"it's fine\"");
  });

  it("idempotent: second install does not double-wrap (#104)", () => {
    const settingsPath = path.join(tmp.cwd, ".claude", "settings.local.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        statusLine: { type: "command", command: "USER_CMD" },
      }),
    );
    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, statusLineEntry: FAKE_HOOK_ENTRY, homeDir: tmp.cwd, userLevel: false });
    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, statusLineEntry: FAKE_HOOK_ENTRY, homeDir: tmp.cwd, userLevel: false });
    const content = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    expect(content.statusLine._vikiOriginalCommand).toBe("USER_CMD");
    // chain 中只出现一次原 cmd
    const matches = content.statusLine.command.match(/USER_CMD/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("uninstall removes viki statusLine when no backup", () => {
    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, statusLineEntry: FAKE_HOOK_ENTRY, homeDir: tmp.cwd, userLevel: false });
    uninstallHook({ cwd: tmp.cwd });
    const content = JSON.parse(
      fs.readFileSync(path.join(tmp.cwd, ".claude", "settings.local.json"), "utf-8"),
    );
    expect(content.statusLine).toBeUndefined();
  });

  it("uninstall restores user's project-level statusLine from backup (#104)", () => {
    const settingsPath = path.join(tmp.cwd, ".claude", "settings.local.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        statusLine: { type: "command", command: "user-status.sh" },
      }),
    );
    installHook({ cwd: tmp.cwd, hookEntry: FAKE_HOOK_ENTRY, statusLineEntry: FAKE_HOOK_ENTRY, homeDir: tmp.cwd, userLevel: false });
    uninstallHook({ cwd: tmp.cwd });
    const content = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    expect(content.statusLine.command).toBe("user-status.sh");
    expect(content.statusLine.type).toBe("command");
    expect(content.statusLine._vikiTag).toBeUndefined();
  });

  it("uninstall scope=user just deletes project-level entry (#104)", () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "fake-home-"));
    fs.mkdirSync(path.join(fakeHome, ".claude"), { recursive: true });
    const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");
    fs.writeFileSync(
      userSettingsPath,
      JSON.stringify({
        statusLine: { type: "command", command: "echo USER_OWN_STATUSLINE_TOKEN" },
      }),
    );
    try {
      installHook({
        cwd: tmp.cwd,
        hookEntry: FAKE_HOOK_ENTRY,
        statusLineEntry: FAKE_HOOK_ENTRY,
        homeDir: fakeHome,
        userLevel: false,
      });
      uninstallHook({ cwd: tmp.cwd });

      const projectSettings = JSON.parse(
        fs.readFileSync(path.join(tmp.cwd, ".claude", "settings.local.json"), "utf-8"),
      );
      expect(projectSettings.statusLine).toBeUndefined();

      // user-level 永远不变（V4）
      const userAfter = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));
      expect(userAfter.statusLine.command).toBe("echo USER_OWN_STATUSLINE_TOKEN");
    } finally {
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });
});

// ─── Issue #161 — Layer 1 viral install (userLevel option) ──────────────────
describe("installHook — userLevel (issue #161)", () => {
  let tmp: ReturnType<typeof mkTmp>;
  let fakeHome: string;

  beforeEach(() => {
    tmp = mkTmp();
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "fake-home-uh-"));
  });

  afterEach(() => {
    tmp.cleanup();
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  it("userLevel: true writes ~/.claude/settings.json with the same hook shape", () => {
    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      postHookEntry: FAKE_HOOK_ENTRY,
      userPromptEntry: FAKE_HOOK_ENTRY,
      stopEntry: FAKE_HOOK_ENTRY,
      homeDir: fakeHome,
      userLevel: true,
    });

    const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");
    expect(fs.existsSync(userSettingsPath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));

    // Same shape as project-level: PreToolUse / PostToolUse / UserPromptSubmit / Stop
    expect(content.hooks).toBeDefined();
    expect(content.hooks.PreToolUse).toBeDefined();
    expect(content.hooks.PreToolUse[0]._vikiTag).toBe("viki-pre-tool-use");
    expect(content.hooks.PreToolUse[0].matcher).toContain("Bash");
    expect(content.hooks.PreToolUse[0].hooks[0].command).toContain("node");

    expect(content.hooks.PostToolUse).toBeDefined();
    expect(content.hooks.PostToolUse[0]._vikiTag).toBe("viki-post-tool-use");
    expect(content.hooks.PostToolUse[0].matcher).toContain("Bash");

    expect(content.hooks.UserPromptSubmit).toBeDefined();
    expect(content.hooks.UserPromptSubmit[0]._vikiTag).toBe("viki-user-prompt-submit");
    expect(content.hooks.UserPromptSubmit[0].hooks[0].timeout).toBe(10);

    expect(content.hooks.Stop).toBeDefined();
    expect(content.hooks.Stop[0]._vikiTag).toBe("viki-stop");
    expect(content.hooks.Stop[0].hooks[0].timeout).toBe(60);
  });

  it("userLevel: true is idempotent — running twice produces a single entry", () => {
    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      postHookEntry: FAKE_HOOK_ENTRY,
      userPromptEntry: FAKE_HOOK_ENTRY,
      stopEntry: FAKE_HOOK_ENTRY,
      homeDir: fakeHome,
      userLevel: true,
    });
    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      postHookEntry: FAKE_HOOK_ENTRY,
      userPromptEntry: FAKE_HOOK_ENTRY,
      stopEntry: FAKE_HOOK_ENTRY,
      homeDir: fakeHome,
      userLevel: true,
    });

    const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");
    const content = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));

    // Each Viki-tagged channel must contain exactly ONE entry after two installs.
    const preTagged = content.hooks.PreToolUse.filter(
      (h: { _vikiTag?: string }) => h._vikiTag === "viki-pre-tool-use",
    );
    expect(preTagged).toHaveLength(1);

    const postTagged = content.hooks.PostToolUse.filter(
      (h: { _vikiTag?: string }) => h._vikiTag === "viki-post-tool-use",
    );
    expect(postTagged).toHaveLength(1);

    const upTagged = content.hooks.UserPromptSubmit.filter(
      (h: { _vikiTag?: string }) => h._vikiTag === "viki-user-prompt-submit",
    );
    expect(upTagged).toHaveLength(1);

    const stopTagged = content.hooks.Stop.filter(
      (h: { _vikiTag?: string }) => h._vikiTag === "viki-stop",
    );
    expect(stopTagged).toHaveLength(1);
  });

  it("userLevel: true preserves existing non-Viki entries in ~/.claude/settings.json", () => {
    // Pre-seed user-level settings.json with foreign entries + an unrelated top-level setting.
    const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");
    fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
    fs.writeFileSync(
      userSettingsPath,
      JSON.stringify({
        someUserGlobalSetting: "preserved",
        hooks: {
          PreToolUse: [
            { matcher: "Bash", hooks: [{ type: "command", command: "user-global-pre.sh" }] },
          ],
          SessionStart: [
            { hooks: [{ type: "command", command: "user-session.sh" }] },
          ],
        },
      }),
    );

    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      postHookEntry: FAKE_HOOK_ENTRY,
      userPromptEntry: FAKE_HOOK_ENTRY,
      stopEntry: FAKE_HOOK_ENTRY,
      homeDir: fakeHome,
      userLevel: true,
    });

    const content = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));

    // Top-level non-hook setting preserved.
    expect(content.someUserGlobalSetting).toBe("preserved");

    // Foreign PreToolUse entry preserved AND Viki entry appended.
    expect(content.hooks.PreToolUse).toHaveLength(2);
    const foreignPre = content.hooks.PreToolUse.find(
      (h: { _vikiTag?: string; hooks: { command: string }[] }) =>
        h.hooks?.[0]?.command === "user-global-pre.sh",
    );
    expect(foreignPre).toBeDefined();
    expect(foreignPre._vikiTag).toBeUndefined();

    const taggedPre = content.hooks.PreToolUse.find(
      (h: { _vikiTag?: string }) => h._vikiTag === "viki-pre-tool-use",
    );
    expect(taggedPre).toBeDefined();

    // B+C scope (2026-05-09): SessionStart was previously "not managed here"
    // but is now folded into installHook user-level. The foreign entry must
    // still be preserved; the viki entry is added alongside.
    expect(content.hooks.SessionStart).toBeDefined();
    const foreignSession = content.hooks.SessionStart.find(
      (h: { hooks: { command: string }[] }) => h.hooks?.[0]?.command === "user-session.sh",
    );
    expect(foreignSession).toBeDefined();
    expect(foreignSession._vikiTag).toBeUndefined();
    // viki's SessionStart entry only registers if the bundle exists on
    // disk (default path = dist/bin-session-start.cjs from cliRoot). In dev
    // builds that bundle is present after `pnpm install`; in test
    // environments without the bundle it may be skipped. Either way the
    // foreign entry survives, which is the load-bearing assertion.
    expect(content.hooks.SessionStart.length).toBeGreaterThanOrEqual(1);
  });

  it("userLevel: false does NOT touch ~/.claude/settings.json", () => {
    const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");

    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      postHookEntry: FAKE_HOOK_ENTRY,
      userPromptEntry: FAKE_HOOK_ENTRY,
      stopEntry: FAKE_HOOK_ENTRY,
      homeDir: fakeHome,
      userLevel: false,
    });

    // No user-level settings.json should be created.
    expect(fs.existsSync(userSettingsPath)).toBe(false);

    // Project-level write happened (sanity check — userLevel:false didn't break the old path).
    const projectPath = path.join(tmp.cwd, ".claude", "settings.local.json");
    expect(fs.existsSync(projectPath)).toBe(true);
    const proj = JSON.parse(fs.readFileSync(projectPath, "utf-8"));
    expect(proj.hooks.PreToolUse[0]._vikiTag).toBe("viki-pre-tool-use");
  });
});

// ─── PR #181 fix-cycle (Worker E) — install-hook hardening ───────────────────
//
// Cases added per PR-PLAN docs/plans/2026-05-09-pr-181-fix-plan.md:
//   1. B-091 staged path under <homeDir>/.viki/hooks/
//   2. malformed user-level settings.json → backup + start fresh
//   3. atomic write via tmp+rename (POSIX renameSync)
//   4. B-086 untagged-legacy dedup at the user level
//   5. concurrent-init advisory lock at <homeDir>/.claude/.settings.lock
//   6. userLevel:false leaves ~/.claude/settings.json untouched (regression
//      lock — already covered above; re-run via this block to assert it
//      still passes after the staging refactor).
describe("installHook — PR #181 fix-cycle", () => {
  let tmp: ReturnType<typeof mkTmp>;
  let fakeHome: string;
  /**
   * Plant a *real-named* hook bundle at a stable path so
   * `applyUserLevelChannelOps` stages it as the right basename
   * (e.g. `bin-pre-tool-use.cjs`) under `<homeDir>/.viki/hooks/`.
   * `FAKE_HOOK_ENTRY` (the test file path) would stage as
   * `install-hook.test.ts` and fail the basename assertion below.
   */
  function plantBundle(dir: string, name: string): string {
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, name);
    fs.writeFileSync(p, "// stub bundle\n", "utf-8");
    return p;
  }

  beforeEach(() => {
    tmp = mkTmp();
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "fake-home-postpr-"));
  });

  afterEach(() => {
    tmp.cleanup();
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  it("(1) B-091: stages hook bundles to <homeDir>/.viki/hooks/ and references the staged path in settings.json", () => {
    const stage = path.join(tmp.cwd, "src-stage");
    const hookEntry = plantBundle(stage, "bin-pre-tool-use.cjs");
    const postHookEntry = plantBundle(stage, "bin-post-tool-use.cjs");
    const userPromptEntry = plantBundle(stage, "bin-user-prompt-submit.cjs");
    const stopEntry = plantBundle(stage, "bin-stop.cjs");

    installHook({
      cwd: tmp.cwd,
      hookEntry,
      postHookEntry,
      userPromptEntry,
      stopEntry,
      homeDir: fakeHome,
      userLevel: true,
    });

    const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");
    const content = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));

    // PreToolUse command must reference the STAGED path (not the source dist).
    const preCmd: string = content.hooks.PreToolUse[0].hooks[0].command;
    const expectedStaged = path.join(fakeHome, ".viki", "hooks", "bin-pre-tool-use.cjs");
    // command is normalized to forward slashes
    expect(preCmd).toContain(expectedStaged.replace(/\\/g, "/"));
    // command must NOT reference the original src-stage path
    expect(preCmd).not.toContain(stage.replace(/\\/g, "/"));
    // The staged file must actually exist.
    expect(fs.existsSync(expectedStaged)).toBe(true);
    expect(fs.statSync(expectedStaged).isFile()).toBe(true);

    // Same for the other 3 channels.
    const postCmd: string = content.hooks.PostToolUse[0].hooks[0].command;
    expect(postCmd).toContain(
      path.join(fakeHome, ".viki", "hooks", "bin-post-tool-use.cjs").replace(/\\/g, "/"),
    );
    expect(fs.existsSync(path.join(fakeHome, ".viki", "hooks", "bin-post-tool-use.cjs"))).toBe(true);

    const upCmd: string = content.hooks.UserPromptSubmit[0].hooks[0].command;
    expect(upCmd).toContain(
      path.join(fakeHome, ".viki", "hooks", "bin-user-prompt-submit.cjs").replace(/\\/g, "/"),
    );
    expect(fs.existsSync(path.join(fakeHome, ".viki", "hooks", "bin-user-prompt-submit.cjs"))).toBe(true);

    const stopCmd: string = content.hooks.Stop[0].hooks[0].command;
    expect(stopCmd).toContain(
      path.join(fakeHome, ".viki", "hooks", "bin-stop.cjs").replace(/\\/g, "/"),
    );
    expect(fs.existsSync(path.join(fakeHome, ".viki", "hooks", "bin-stop.cjs"))).toBe(true);
  });

  it("(2) readSettings recovers from malformed user-level settings.json by backing up + starting fresh", () => {
    // Pre-seed `<home>/.claude/settings.json` with literally-malformed JSON.
    const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");
    fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
    fs.writeFileSync(userSettingsPath, "{not json}", "utf-8");

    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    try {
      // Should not throw — install proceeds even with corrupt settings.
      const r = installHook({
        cwd: tmp.cwd,
        hookEntry: FAKE_HOOK_ENTRY,
        postHookEntry: FAKE_HOOK_ENTRY,
        userPromptEntry: FAKE_HOOK_ENTRY,
        stopEntry: FAKE_HOOK_ENTRY,
        homeDir: fakeHome,
        userLevel: true,
      });
      expect(r.settingsPath).toBeDefined();

      // The new file is valid JSON with Viki entries.
      const after = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));
      expect(after.hooks).toBeDefined();
      expect(after.hooks.PreToolUse[0]._vikiTag).toBe("viki-pre-tool-use");

      // The original corrupt file is preserved at `<path>.bak-<ts>`.
      const claudeDir = path.dirname(userSettingsPath);
      const baks = fs
        .readdirSync(claudeDir)
        .filter((f) => f.startsWith("settings.json.bak-"));
      expect(baks.length).toBeGreaterThanOrEqual(1);
      const firstBak = baks[0];
      if (!firstBak) throw new Error("expected at least one .bak file");
      const bakContent = fs.readFileSync(path.join(claudeDir, firstBak), "utf-8");
      expect(bakContent).toBe("{not json}");

      // A stderr warning was emitted at least once mentioning malformed.
      const stderrCalls = stderrSpy.mock.calls.map((c) => String(c[0] ?? ""));
      const hasMalformedWarn = stderrCalls.some((s) =>
        s.includes("malformed") && s.includes("backed up"),
      );
      expect(hasMalformedWarn).toBe(true);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("(3) writeSettings is atomic via tmp+rename — fs.renameSync is called with a .tmp- source", () => {
    // We spy on fs.renameSync; the real implementation must still run so the
    // file actually lands on disk. Capture argument shape only.
    const renameSpy = vi.spyOn(fs, "renameSync");

    try {
      installHook({
        cwd: tmp.cwd,
        hookEntry: FAKE_HOOK_ENTRY,
        postHookEntry: FAKE_HOOK_ENTRY,
        userPromptEntry: FAKE_HOOK_ENTRY,
        stopEntry: FAKE_HOOK_ENTRY,
        homeDir: fakeHome,
        userLevel: true,
      });

      // Among all renameSync calls, at least one must be tmp → final settings
      // path with the .tmp-<pid>-<rand> shape (writeSettings's atomic-write
      // contract).
      const calls = renameSpy.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(1);
      const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");
      const projectSettingsPath = path.join(tmp.cwd, ".claude", "settings.local.json");
      const matched = calls.some(([src, dst]) => {
        const s = String(src);
        const d = String(dst);
        return (
          /\.tmp-\d+-/.test(s) &&
          (d === userSettingsPath || d === projectSettingsPath)
        );
      });
      expect(matched).toBe(true);

      // And the resulting file is valid JSON (no half-written state visible).
      const content = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));
      expect(content.hooks).toBeDefined();
    } finally {
      renameSpy.mockRestore();
    }
  });

  it("(4) B-086 dedup: untagged legacy PreToolUse entry at Viki path is replaced (1 entry remains)", () => {
    // Pre-seed user settings.json with an UNTAGGED entry whose command
    // contains the bundle filename — exactly the "legacy install" case
    // described in B-086. The new applyChannelOps must filter both
    // tagged AND untagged Viki entries before pushing the new one.
    //
    // Issue #6: the legacy path must lie inside a recognised Viki install
    // location (here: `~/.viki/hooks/`). Random paths are no longer eligible
    // for the heuristic strip — that was the source of foreign-tool collisions.
    const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");
    fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
    fs.writeFileSync(
      userSettingsPath,
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              // Untagged — points at a Viki-pattern path (~/.viki/hooks/).
              hooks: [
                {
                  type: "command",
                  command: "node /home/u/.viki/hooks/bin-pre-tool-use.cjs",
                },
              ],
            },
          ],
        },
      }),
      "utf-8",
    );

    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      postHookEntry: FAKE_HOOK_ENTRY,
      userPromptEntry: FAKE_HOOK_ENTRY,
      stopEntry: FAKE_HOOK_ENTRY,
      homeDir: fakeHome,
      userLevel: true,
    });

    const content = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));
    // Exactly one PreToolUse entry: the new tagged Viki one.
    expect(content.hooks.PreToolUse).toHaveLength(1);
    expect(content.hooks.PreToolUse[0]._vikiTag).toBe("viki-pre-tool-use");
    // The legacy command path is gone.
    const cmd: string = content.hooks.PreToolUse[0].hooks[0].command;
    expect(cmd).not.toContain("/home/u/.viki/hooks/bin-pre-tool-use.cjs");
  });

  // Issue #6 regression at user-level scope: foreign tools (Riven) keep
  // their UserPromptSubmit / Stop entries when `viki init` writes the
  // user-level `~/.claude/settings.json`. Symmetric to the project-level
  // regression test, but exercises the `applyUserLevelChannelOps` path
  // (which goes through the settings lock and `~/.viki/hooks/` staging).
  it("(#6) user-level: foreign-tag entries on UserPromptSubmit and Stop survive viki init", () => {
    const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");
    fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
    fs.writeFileSync(
      userSettingsPath,
      JSON.stringify({
        hooks: {
          UserPromptSubmit: [
            {
              _rivenTag: "riven-user-prompt-submit",
              hooks: [
                {
                  type: "command",
                  command:
                    "bash -c '[ -f \"$1\" ] || exit 0; exec node --no-warnings \"$1\"' _ /home/u/.riven/digital-twin/bin-user-prompt-submit.cjs",
                  timeout: 5,
                },
              ],
            },
          ],
        },
      }),
      "utf-8",
    );

    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      postHookEntry: FAKE_HOOK_ENTRY,
      userPromptEntry: FAKE_HOOK_ENTRY,
      stopEntry: FAKE_HOOK_ENTRY,
      homeDir: fakeHome,
      userLevel: true,
    });

    const content = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));

    // Riven entry preserved, Viki entry appended.
    expect(content.hooks.UserPromptSubmit).toHaveLength(2);
    const tags = content.hooks.UserPromptSubmit.map(
      (h: { _rivenTag?: string; _vikiTag?: string }) =>
        h._rivenTag ?? h._vikiTag,
    );
    expect(tags).toContain("riven-user-prompt-submit");
    expect(tags).toContain("viki-user-prompt-submit");
  });

  it("(5) concurrent-init advisory lock — lockfile is created during the call and removed after", () => {
    const lockPath = path.join(fakeHome, ".claude", ".settings.lock");

    // Lock must not exist before.
    expect(fs.existsSync(lockPath)).toBe(false);

    // Spy on fs.openSync so we can observe the moment the lock is acquired
    // (its 'wx' open is synchronous and the lock is held until the merge
    // completes). The real openSync still runs so the actual lock is taken.
    const openSpy = vi.spyOn(fs, "openSync");

    try {
      installHook({
        cwd: tmp.cwd,
        hookEntry: FAKE_HOOK_ENTRY,
        postHookEntry: FAKE_HOOK_ENTRY,
        userPromptEntry: FAKE_HOOK_ENTRY,
        stopEntry: FAKE_HOOK_ENTRY,
        homeDir: fakeHome,
        userLevel: true,
      });

      // openSync was called with the lockfile path and "wx" flag at least once.
      const opened = openSpy.mock.calls.some(([p, flags]) => {
        return String(p) === lockPath && String(flags) === "wx";
      });
      expect(opened).toBe(true);

      // After a successful acquire (fd != null), the lock is released and
      // the lockfile is unlinked. Round-2 F1 only changed the *fd === null*
      // (degraded) branch so it no longer unlinks; the happy path is
      // unchanged.
      expect(fs.existsSync(lockPath)).toBe(false);

      // The settings file was still written successfully.
      const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");
      const content = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));
      expect(content.hooks.PreToolUse[0]._vikiTag).toBe("viki-pre-tool-use");
    } finally {
      openSpy.mockRestore();
    }
  });

  // ─── PR #181 round-2 (Worker FC) — true mutual-exclusion behaviour ────────
  //
  // Round-2 finding #10 noted that case (5) above only verifies the lockfile
  // is created and removed — it does NOT exercise contention. The two cases
  // below test the actual mutual-exclusion contract:
  //
  //   (5a) stale-lock recovery — a lockfile with mtime > 30s is detected as
  //        stale, unlinked, and the install proceeds normally. Exercises the
  //        retry-with-stale-detect branch in `acquireSettingsLock`.
  //   (5b) lock held by another process — when we cannot acquire the lock
  //        within MAX_RETRIES (5 retries × 200ms = 1s), `acquireSettingsLock`
  //        degrades to fd=null and proceeds. The Round-2 F1 fix says we MUST
  //        NOT unlink the lockfile we don't own. This is the regression
  //        coverage for that fix — without F1, the second concurrent install
  //        would silently nuke the first one's lock and break mutual
  //        exclusion entirely.
  it("(5a) stale-lock recovery — stale (>30s) lockfile is detected, unlinked, and install proceeds", () => {
    const lockPath = path.join(fakeHome, ".claude", ".settings.lock");

    // Pre-create a STALE lockfile (mtime in the past, > 30s ago). The
    // stale-detect path in `acquireSettingsLock` will unlink it and retry.
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, "", "utf-8");
    const stalePast = new Date(Date.now() - 60_000); // 60s ago > STALE_MS=30s
    fs.utimesSync(lockPath, stalePast, stalePast);

    // Sanity: the lockfile is in place and stale before we run.
    expect(fs.existsSync(lockPath)).toBe(true);
    expect(Date.now() - fs.statSync(lockPath).mtimeMs).toBeGreaterThan(30_000);

    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      postHookEntry: FAKE_HOOK_ENTRY,
      userPromptEntry: FAKE_HOOK_ENTRY,
      stopEntry: FAKE_HOOK_ENTRY,
      homeDir: fakeHome,
      userLevel: true,
    });

    // After install: lockfile is gone (we acquired + released it), settings
    // were written, all without throwing on the pre-existing stale lock.
    expect(fs.existsSync(lockPath)).toBe(false);
    const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");
    const content = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));
    expect(content.hooks.PreToolUse[0]._vikiTag).toBe("viki-pre-tool-use");
  });

  it("(5b) Round-2 F1 regression: when lock is held by another process (fd=null), releaseSettingsLock does NOT unlink", () => {
    // This is the failure mode the round-2 /review caught: in the previous
    // implementation, `releaseSettingsLock` unconditionally unlinked the
    // lockfile — even when our own `fs.openSync(lockPath, "wx")` had failed
    // and the file was still held by another process. That defeated mutual
    // exclusion: the second install would silently nuke the first install's
    // lock partway through its read-modify-write window.
    //
    // We simulate "lock held by another process" by pre-creating the
    // lockfile with a *fresh* mtime so it never trips stale-detect, and we
    // hold the file descriptor open for the duration of installHook. The
    // contention path in `acquireSettingsLock` exhausts MAX_RETRIES and
    // returns fd=null. After Round-2 F1, releaseSettingsLock(null, ...) is
    // a no-op — the held lockfile must still exist when installHook returns.
    const lockPath = path.join(fakeHome, ".claude", ".settings.lock");
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    const otherFd = fs.openSync(lockPath, "wx");

    // Capture stderr so the degraded-path warning doesn't pollute test
    // output, AND so we can assert it was actually emitted.
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    try {
      installHook({
        cwd: tmp.cwd,
        hookEntry: FAKE_HOOK_ENTRY,
        postHookEntry: FAKE_HOOK_ENTRY,
        userPromptEntry: FAKE_HOOK_ENTRY,
        stopEntry: FAKE_HOOK_ENTRY,
        homeDir: fakeHome,
        userLevel: true,
      });

      // The CRITICAL Round-2 F1 invariant: the lockfile that we did NOT
      // acquire must still exist. The pre-fix code would have unlinked it.
      expect(fs.existsSync(lockPath)).toBe(true);

      // The degraded-path warning was emitted.
      const stderrCalls = stderrSpy.mock.calls.map((c) => String(c[0] ?? ""));
      const hasDegradedWarning = stderrCalls.some((s) =>
        s.includes("settings lock") && s.includes("contention"),
      );
      expect(hasDegradedWarning).toBe(true);

      // The settings file was still written (degraded path proceeds without
      // the lock — race-prone but better than blocking init forever).
      const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");
      const content = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));
      expect(content.hooks.PreToolUse[0]._vikiTag).toBe("viki-pre-tool-use");
    } finally {
      stderrSpy.mockRestore();
      // Clean up: release the held lockfile we created above.
      try { fs.closeSync(otherFd); } catch { /* best-effort */ }
      try { fs.unlinkSync(lockPath); } catch { /* best-effort */ }
    }
  }, 30_000);

  it("(5c) Round-2 F3 regression: stageBundleToUserViki uses tmp+rename (atomic copy)", () => {
    // Round-2 finding: under Windows, an unconditional `copyFileSync` over
    // an in-use bundle throws EBUSY and crashes init. Under POSIX, an
    // in-flight hook process can otherwise see a half-written bundle. The
    // F3 fix replaces the bare copy with `copyFileSync → renameSync` via a
    // pid+rand .tmp- intermediate. This test pins that contract by spying
    // on `fs.renameSync` and confirming each staged channel goes through
    // a `.tmp-<pid>-<rand>` source.
    //
    // We have to plant *real* hook bundles in a stable directory — using
    // FAKE_HOOK_ENTRY (this test file's own path) doesn't trigger the
    // stage-skip heuristic in stageBundleToUserViki (size+mtime guard)
    // when the destination doesn't yet exist, but its filename
    // `install-hook.test.ts` is not a recognized channel basename and would
    // confuse the staged-path assertions. Plant proper bundle-named files.
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), "stage-bundle-"));
    try {
      const hookEntry = path.join(stage, "bin-pre-tool-use.cjs");
      const postHookEntry = path.join(stage, "bin-post-tool-use.cjs");
      const userPromptEntry = path.join(stage, "bin-user-prompt-submit.cjs");
      const stopEntry = path.join(stage, "bin-stop.cjs");
      for (const p of [hookEntry, postHookEntry, userPromptEntry, stopEntry]) {
        fs.writeFileSync(p, "// stub bundle\n", "utf-8");
      }

      const renameSpy = vi.spyOn(fs, "renameSync");
      try {
        installHook({
          cwd: tmp.cwd,
          hookEntry,
          postHookEntry,
          userPromptEntry,
          stopEntry,
          homeDir: fakeHome,
          userLevel: true,
        });

        const calls = renameSpy.mock.calls;
        // Among all renames during install (writeSettings tmp+rename for
        // each of project + user settings.json AND stageBundleToUserViki
        // tmp+rename for each of 4 channels), at least 4 must be
        // bundle-staging renames whose source matches the .tmp-<pid>-<rand>
        // shape and whose destination is under <home>/.viki/hooks/.
        const vikiHooksDir = path.join(fakeHome, ".viki", "hooks");
        const stagingRenames = calls.filter(([src, dst]) => {
          const s = String(src);
          const d = String(dst);
          return (
            d.startsWith(vikiHooksDir) &&
            /\.tmp-\d+-[a-z0-9]+$/.test(s)
          );
        });
        expect(stagingRenames.length).toBeGreaterThanOrEqual(4);

        // Each .tmp- source name follows pid-rand contract (no static name).
        const stagingSources = stagingRenames.map(([s]) => String(s));
        for (const src of stagingSources) {
          expect(src).toMatch(/\.tmp-\d+-[a-z0-9]+$/);
        }

        // The four channel destinations all materialize as real files.
        for (const basename of [
          "bin-pre-tool-use.cjs",
          "bin-post-tool-use.cjs",
          "bin-user-prompt-submit.cjs",
          "bin-stop.cjs",
        ]) {
          const dest = path.join(vikiHooksDir, basename);
          expect(fs.existsSync(dest)).toBe(true);
          // No leaked .tmp- intermediates next to the final files.
          const peers = fs.readdirSync(vikiHooksDir);
          const leaks = peers.filter((p) => p.startsWith(`${basename}.tmp-`));
          expect(leaks).toEqual([]);
        }
      } finally {
        renameSpy.mockRestore();
      }
    } finally {
      fs.rmSync(stage, { recursive: true, force: true });
    }
  });

  it("(7) issue #209: user-level hook commands wrap staged path in graceful `bash -c '[ -f X ] || exit 0; exec node X'` shim", () => {
    // Regression lock: the user-level entries written into
    // ~/.claude/settings.json must be wrapped so a missing
    // ~/.viki/hooks/<bin>.cjs (manual rm -rf, partial install, disk-full
    // mid-stage) does NOT spam Node MODULE_NOT_FOUND traces in every Stop /
    // PreToolUse / PostToolUse / UserPromptSubmit.
    const stage = path.join(tmp.cwd, "src-stage");
    const hookEntry = plantBundle(stage, "bin-pre-tool-use.cjs");
    const postHookEntry = plantBundle(stage, "bin-post-tool-use.cjs");
    const userPromptEntry = plantBundle(stage, "bin-user-prompt-submit.cjs");
    const stopEntry = plantBundle(stage, "bin-stop.cjs");

    installHook({
      cwd: tmp.cwd,
      hookEntry,
      postHookEntry,
      userPromptEntry,
      stopEntry,
      homeDir: fakeHome,
      userLevel: true,
    });

    const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");
    const content = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));

    for (const channel of ["PreToolUse", "PostToolUse", "UserPromptSubmit", "Stop"] as const) {
      const cmd: string = content.hooks[channel][0].hooks[0].command;
      expect(cmd.startsWith("bash -c '")).toBe(true);
      expect(cmd).toContain("[ -f ");
      expect(cmd).toContain("|| exit 0");
      expect(cmd).toContain("exec node ");
      // Stale plain-`node <path>` form must NOT survive — the absence of any
      // graceful guard is exactly what issue #209 is about.
      expect(cmd.match(/^node /)).toBeNull();
    }
  });

  it("(6) userLevel: false leaves ~/.claude/settings.json untouched (regression lock for staging refactor)", () => {
    // Sanity re-check after PR #181 staging refactor — the userLevel:false
    // path must NOT touch the user-level settings file at all.
    const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");

    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      postHookEntry: FAKE_HOOK_ENTRY,
      userPromptEntry: FAKE_HOOK_ENTRY,
      stopEntry: FAKE_HOOK_ENTRY,
      homeDir: fakeHome,
      userLevel: false,
    });

    expect(fs.existsSync(userSettingsPath)).toBe(false);
    // Lock should never have been created either.
    expect(fs.existsSync(path.join(fakeHome, ".claude", ".settings.lock"))).toBe(false);
    // Project-level path still works.
    const projectPath = path.join(tmp.cwd, ".claude", "settings.local.json");
    const proj = JSON.parse(fs.readFileSync(projectPath, "utf-8"));
    expect(proj.hooks.PreToolUse[0]._vikiTag).toBe("viki-pre-tool-use");
  });
});

// B+C scope (2026-05-09): three new channels folded into installHook —
// SessionStart / SessionEnd / PreCompact. SessionEnd and PreCompact write to
// BOTH project and user-level settings (mirroring the existing four).
// SessionStart writes to user-level ONLY, for reasons documented inline in
// install-hook.ts.
describe("installHook — B+C scope new channels (2026-05-09)", () => {
  let tmp: ReturnType<typeof mkTmp>;
  let fakeHome: string;

  beforeEach(() => {
    tmp = mkTmp();
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "viki-bc-home-"));
  });

  afterEach(() => {
    tmp.cleanup();
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  it("registers SessionEnd + PreCompact at project level (settings.local.json)", () => {
    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      postHookEntry: FAKE_HOOK_ENTRY,
      userPromptEntry: FAKE_HOOK_ENTRY,
      stopEntry: FAKE_HOOK_ENTRY,
      sessionEndEntry: FAKE_HOOK_ENTRY,
      preCompactEntry: FAKE_HOOK_ENTRY,
      homeDir: fakeHome,
      userLevel: false,
    });

    const projectPath = path.join(tmp.cwd, ".claude", "settings.local.json");
    const proj = JSON.parse(fs.readFileSync(projectPath, "utf-8"));
    expect(proj.hooks.SessionEnd?.[0]?._vikiTag).toBe("viki-session-end");
    expect(proj.hooks.SessionEnd[0].hooks[0].timeout).toBe(30);
    expect(proj.hooks.PreCompact?.[0]?._vikiTag).toBe("viki-pre-compact");
    expect(proj.hooks.PreCompact[0].hooks[0].timeout).toBe(30);
  });

  it("does NOT register SessionStart at project level", () => {
    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      postHookEntry: FAKE_HOOK_ENTRY,
      userPromptEntry: FAKE_HOOK_ENTRY,
      stopEntry: FAKE_HOOK_ENTRY,
      sessionStartEntry: FAKE_HOOK_ENTRY,
      homeDir: fakeHome,
      userLevel: false,
    });

    const projectPath = path.join(tmp.cwd, ".claude", "settings.local.json");
    const proj = JSON.parse(fs.readFileSync(projectPath, "utf-8"));
    expect(proj.hooks.SessionStart).toBeUndefined();
    // Stop has bin-stop only. Verify one Stop entry with the bin-stop tag.
    expect(proj.hooks.Stop).toHaveLength(1);
    expect(proj.hooks.Stop[0]._vikiTag).toBe("viki-stop");
  });

  it("registers all 7 channel tags at user level (~/.claude/settings.json)", () => {
    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      postHookEntry: FAKE_HOOK_ENTRY,
      userPromptEntry: FAKE_HOOK_ENTRY,
      stopEntry: FAKE_HOOK_ENTRY,
      sessionStartEntry: FAKE_HOOK_ENTRY,
      sessionEndEntry: FAKE_HOOK_ENTRY,
      preCompactEntry: FAKE_HOOK_ENTRY,
      homeDir: fakeHome,
      userLevel: true,
    });

    const userSettings = JSON.parse(
      fs.readFileSync(path.join(fakeHome, ".claude", "settings.json"), "utf-8"),
    );
    const allTags = new Set<string>();
    for (const ch of Object.keys(userSettings.hooks ?? {})) {
      const list = userSettings.hooks[ch] as Array<{ _vikiTag?: string }>;
      for (const entry of list) {
        if (entry._vikiTag) allTags.add(entry._vikiTag);
      }
    }
    expect(allTags).toEqual(
      new Set([
        "viki-pre-tool-use",
        "viki-post-tool-use",
        "viki-user-prompt-submit",
        "viki-stop",
        "viki-session-start",
        "viki-session-end",
        "viki-pre-compact",
      ]),
    );
    // Stop hosts only the bin-stop tag.
    expect(userSettings.hooks.Stop).toHaveLength(1);
  });

  it("uninstallHook cleans SessionEnd / PreCompact tags", () => {
    installHook({
      cwd: tmp.cwd,
      hookEntry: FAKE_HOOK_ENTRY,
      postHookEntry: FAKE_HOOK_ENTRY,
      userPromptEntry: FAKE_HOOK_ENTRY,
      stopEntry: FAKE_HOOK_ENTRY,
      sessionEndEntry: FAKE_HOOK_ENTRY,
      preCompactEntry: FAKE_HOOK_ENTRY,
      homeDir: fakeHome,
      userLevel: false,
    });

    // Sanity: project-level entries exist before uninstall.
    const projectPath = path.join(tmp.cwd, ".claude", "settings.local.json");
    const before = JSON.parse(fs.readFileSync(projectPath, "utf-8"));
    expect(before.hooks.SessionEnd).toBeDefined();
    expect(before.hooks.PreCompact).toBeDefined();

    const r = uninstallHook({ cwd: tmp.cwd });
    expect(r.removed).toBe(true);

    const after = JSON.parse(fs.readFileSync(projectPath, "utf-8"));
    expect(after.hooks?.SessionEnd).toBeUndefined();
    expect(after.hooks?.PreCompact).toBeUndefined();
    expect(after.hooks?.Stop).toBeUndefined(); // only Viki tags existed
  });
});

describe("auditOrphanShellHooks (B+C scope, 2026-05-09)", () => {
  let tmp: ReturnType<typeof mkTmp>;

  beforeEach(() => {
    tmp = mkTmp();
  });

  afterEach(() => {
    tmp.cleanup();
  });

  it("returns empty list when .claude/hooks is missing", async () => {
    const { auditOrphanShellHooks } = await import("../commands/install-hook.js");
    expect(auditOrphanShellHooks(tmp.cwd)).toEqual([]);
  });

  it("returns empty list when no .sh files exist", async () => {
    fs.mkdirSync(path.join(tmp.cwd, ".claude", "hooks"), { recursive: true });
    const { auditOrphanShellHooks } = await import("../commands/install-hook.js");
    expect(auditOrphanShellHooks(tmp.cwd)).toEqual([]);
  });

  it("flags an orphan .sh that no settings file references", async () => {
    const hooksDir = path.join(tmp.cwd, ".claude", "hooks");
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(hooksDir, "orphan.sh"), "#!/bin/bash\n");

    const { auditOrphanShellHooks } = await import("../commands/install-hook.js");
    expect(auditOrphanShellHooks(tmp.cwd)).toEqual(["orphan.sh"]);
  });

  it("does NOT flag a .sh that committed settings.json references", async () => {
    const claudeDir = path.join(tmp.cwd, ".claude");
    const hooksDir = path.join(claudeDir, "hooks");
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(hooksDir, "wired.sh"), "#!/bin/bash\n");
    fs.writeFileSync(
      path.join(claudeDir, "settings.json"),
      JSON.stringify({
        hooks: {
          Stop: [
            {
              hooks: [
                { type: "command", command: "bash .claude/hooks/wired.sh", timeout: 5 },
              ],
            },
          ],
        },
      }),
    );

    const { auditOrphanShellHooks } = await import("../commands/install-hook.js");
    expect(auditOrphanShellHooks(tmp.cwd)).toEqual([]);
  });

  it("does NOT flag a .sh that settings.local.json references", async () => {
    const claudeDir = path.join(tmp.cwd, ".claude");
    const hooksDir = path.join(claudeDir, "hooks");
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(hooksDir, "host-local.sh"), "#!/bin/bash\n");
    fs.writeFileSync(
      path.join(claudeDir, "settings.local.json"),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              hooks: [
                { type: "command", command: "bash .claude/hooks/host-local.sh" },
              ],
            },
          ],
        },
      }),
    );

    const { auditOrphanShellHooks } = await import("../commands/install-hook.js");
    expect(auditOrphanShellHooks(tmp.cwd)).toEqual([]);
  });

  it("returns sorted list when multiple orphans", async () => {
    const hooksDir = path.join(tmp.cwd, ".claude", "hooks");
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(hooksDir, "z-orphan.sh"), "#!/bin/bash\n");
    fs.writeFileSync(path.join(hooksDir, "a-orphan.sh"), "#!/bin/bash\n");
    fs.writeFileSync(path.join(hooksDir, "m-orphan.sh"), "#!/bin/bash\n");

    const { auditOrphanShellHooks } = await import("../commands/install-hook.js");
    expect(auditOrphanShellHooks(tmp.cwd)).toEqual([
      "a-orphan.sh",
      "m-orphan.sh",
      "z-orphan.sh",
    ]);
  });

  it("survives malformed settings.json (treats as zero references, all .sh are orphans)", async () => {
    const claudeDir = path.join(tmp.cwd, ".claude");
    const hooksDir = path.join(claudeDir, "hooks");
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(hooksDir, "lonely.sh"), "#!/bin/bash\n");
    fs.writeFileSync(path.join(claudeDir, "settings.json"), "{ malformed json");

    const { auditOrphanShellHooks } = await import("../commands/install-hook.js");
    // Malformed file is treated as "no references" → the .sh shows as orphan.
    expect(auditOrphanShellHooks(tmp.cwd)).toEqual(["lonely.sh"]);
  });
});

// ─── 2026-05-18 — user-level install completeness (auto-init + statusLine) ───
//
// Symptoms found via sandbox new-user repro:
//   1. SessionStart auto-init banner promised "新项目检测到, 后台 init 中..." but
//      proj2/.viki/knowledge.db never appeared — root cause: spawnAutoInit
//      runs `node <home>/.viki/hooks/bin.js` but bin.js was never staged
//      (and can't be: ESM bundle has split chunks). Fix: write
//      ~/.viki/install-source.json with absolute binJsPath at install time;
//      findMainBin reads it.
//   2. session-start-errors.log spammed "updater-bin-missing" because
//      bin-updater.cjs wasn't staged alongside bin-embedder.cjs.
//   3. statusLine only appeared in the project where viki init ran — never in
//      other projects because applyUserLevelChannelOps registered hooks but
//      not statusLine. Fix: also register user-level statusLine via the same
//      chain-wrap logic project-level uses.
describe("user-level install — auto-init + statusLine enablement (2026-05-18)", () => {
  let tmp: ReturnType<typeof mkTmp>;
  let fakeHome: string;
  function plantBundle(dir: string, name: string): string {
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, name);
    fs.writeFileSync(p, "// stub bundle\n", "utf-8");
    return p;
  }
  beforeEach(() => {
    tmp = mkTmp();
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "viki-userlvl-extras-"));
  });
  afterEach(() => {
    tmp.cleanup();
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  it("stages bin-updater.cjs to <home>/.viki/hooks/ (fixes 'updater-bin-missing' spam)", () => {
    const stage = path.join(tmp.cwd, "src-stage");
    const hookEntry = plantBundle(stage, "bin-pre-tool-use.cjs");
    installHook({
      cwd: tmp.cwd,
      hookEntry,
      homeDir: fakeHome,
      userLevel: true,
    });
    // bin-updater.cjs ships in packages/cli/dist/ (cliRoot's real dist), so
    // applyUserLevelChannelOps stages it from cliRoot just like bin-embedder.
    // No explicit opt needed; the default lookup resolves it.
    const staged = path.join(fakeHome, ".viki", "hooks", "bin-updater.cjs");
    expect(fs.existsSync(staged)).toBe(true);
  });

  it("stages viki-statusline.cjs to <home>/.viki/hooks/ (needed for user-level statusLine)", () => {
    const stage = path.join(tmp.cwd, "src-stage");
    const hookEntry = plantBundle(stage, "bin-pre-tool-use.cjs");
    installHook({
      cwd: tmp.cwd,
      hookEntry,
      homeDir: fakeHome,
      userLevel: true,
    });
    const staged = path.join(fakeHome, ".viki", "hooks", "viki-statusline.cjs");
    expect(fs.existsSync(staged)).toBe(true);
  });

  it("writes <home>/.viki/install-source.json with absolute binJsPath", () => {
    const stage = path.join(tmp.cwd, "src-stage");
    const hookEntry = plantBundle(stage, "bin-pre-tool-use.cjs");
    const fakeBinJs = plantBundle(stage, "bin.js"); // pretend this is viki dist/bin.js
    installHook({
      cwd: tmp.cwd,
      hookEntry,
      binJsPath: fakeBinJs, // NEW: explicit override (defaults to cliRoot/../viki/dist/bin.js)
      homeDir: fakeHome,
      userLevel: true,
    });
    const sourcePath = path.join(fakeHome, ".viki", "install-source.json");
    expect(fs.existsSync(sourcePath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(sourcePath, "utf-8"));
    expect(parsed.binJsPath).toBe(fakeBinJs);
  });

  it("registers user-level statusLine when no existing user statusLine", () => {
    const stage = path.join(tmp.cwd, "src-stage");
    const hookEntry = plantBundle(stage, "bin-pre-tool-use.cjs");
    installHook({
      cwd: tmp.cwd,
      hookEntry,
      homeDir: fakeHome,
      userLevel: true,
    });
    const userSettings = JSON.parse(
      fs.readFileSync(path.join(fakeHome, ".claude", "settings.json"), "utf-8"),
    );
    expect(userSettings.statusLine).toBeDefined();
    expect(userSettings.statusLine._vikiTag).toBe("viki-statusline");
    expect(userSettings.statusLine.command).toContain("viki-statusline.cjs");
    // Command must point at the STAGED bundle, not the source dist
    expect(userSettings.statusLine.command).toContain(
      path.join(fakeHome, ".viki", "hooks", "viki-statusline.cjs").replace(/\\/g, "/"),
    );
    // First install, no user cmd to wrap
    expect(userSettings.statusLine._vikiOriginalCommand).toBeUndefined();
  });

  it("user-level statusLine chain-wraps an existing user statusLine.command", () => {
    const userSettingsPath = path.join(fakeHome, ".claude", "settings.json");
    fs.mkdirSync(path.dirname(userSettingsPath), { recursive: true });
    fs.writeFileSync(
      userSettingsPath,
      JSON.stringify({
        statusLine: { type: "command", command: "my-custom-statusline" },
      }),
      "utf-8",
    );
    const stage = path.join(tmp.cwd, "src-stage");
    const hookEntry = plantBundle(stage, "bin-pre-tool-use.cjs");
    installHook({
      cwd: tmp.cwd,
      hookEntry,
      homeDir: fakeHome,
      userLevel: true,
    });
    const userSettings = JSON.parse(fs.readFileSync(userSettingsPath, "utf-8"));
    expect(userSettings.statusLine._vikiTag).toBe("viki-statusline");
    expect(userSettings.statusLine._vikiOriginalCommand).toBe("my-custom-statusline");
    // Chain command contains both segments
    expect(userSettings.statusLine.command).toContain("my-custom-statusline");
    expect(userSettings.statusLine.command).toContain("viki-statusline.cjs");
  });
});

describe("install-user-hook deprecation (B+C scope, 2026-05-09)", () => {
  it("installUserHook emits a deprecation warning to stderr", async () => {
    const { installUserHook } = await import("../commands/install-user-hook.js");
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "viki-iuh-home-"));
    try {
      const captured: string[] = [];
      const origWrite = process.stderr.write.bind(process.stderr);
      const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: any) => {
        captured.push(typeof chunk === "string" ? chunk : String(chunk));
        return true;
      });
      try {
        installUserHook({
          homeDir: fakeHome,
          sessionStartEntry: FAKE_HOOK_ENTRY,
        });
      } finally {
        writeSpy.mockRestore();
        // safety: never let mocked stderr leak across tests
        void origWrite;
      }

      const joined = captured.join("");
      expect(joined.toLowerCase()).toContain("deprecat");
    } finally {
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });
});

