import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import nodeFs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  executeInit,
  parseInitArgs,
  renderInitResult,
  mirrorProjectSkillToUserLevel,
} from "../commands/init.js";
import { DualLayerStore, SqliteKnowledgeStore, openDb } from "@viki/adapters";
import type { LLMClient } from "@viki/ports";

function mkTmp() {
  const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), "init-"));
  const cwd = path.join(root, "project");
  const home = path.join(root, "home");
  nodeFs.mkdirSync(cwd, { recursive: true });
  nodeFs.mkdirSync(home, { recursive: true });
  return {
    root,
    cwd,
    home,
    projectDbPath: path.join(cwd, ".viki", "knowledge.db"),
    userGlobalDbPath: path.join(home, ".viki", "global.db"),
    cleanup: () => nodeFs.rmSync(root, { recursive: true, force: true }),
  };
}

const OK_LLM_RESPONSE = JSON.stringify({
  category: "E",
  tags: ["imported"],
  type: "practice",
  nature: "subjective",
  trigger: "imported trigger",
  wrong_pattern: "",
  correct_pattern: "imported correct",
  reasoning: "imported reason",
});

const stubLLM = (r: string): LLMClient => ({ complete: async () => r });

describe("executeInit", () => {
  let tmp: ReturnType<typeof mkTmp>;
  let ctr = 0;
  beforeEach(() => {
    tmp = mkTmp();
    ctr = 0;
  });
  afterEach(() => tmp.cleanup());

  const commonOpts = () => ({
    cwd: tmp.cwd,
    homeDir: tmp.home,
    skipHook: true,
    skipSeed: true,
    idGen: () => `pers-test-${++ctr}`,
    now: () => new Date("2026-04-14T12:00:00Z"),
  });
  const itWithFileSymlink = process.platform === "win32" ? it.skip : it;

  it("dry-run: no files written, plans are reported", async () => {
    nodeFs.writeFileSync(
      path.join(tmp.cwd, "CLAUDE.md"),
      "# Rules\n- existing rule one\n- existing rule two\n",
    );

    const r = await executeInit({
      ...commonOpts(),
      dryRun: true,
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });

    expect(r.ok).toBe(true);
    expect(r.dryRun).toBe(true);
    // No knowledge DB files created
    expect(nodeFs.existsSync(tmp.userGlobalDbPath)).toBe(false);
    expect(nodeFs.existsSync(tmp.projectDbPath)).toBe(false);
    // CLAUDE.md untouched (no VIKI block added)
    const md = nodeFs.readFileSync(path.join(tmp.cwd, "CLAUDE.md"), "utf-8");
    expect(md).not.toContain("VIKI:START");
  });

  it("happy path: preset + import + compile all succeed (issue #42 nested rules)", async () => {
    nodeFs.writeFileSync(
      path.join(tmp.cwd, "CLAUDE.md"),
      "# Team rules\n- Prefer fetch over axios\n- Use pnpm\n",
    );

    const r = await executeInit({
      ...commonOpts(),
      structure: true,
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });

    expect(r.ok).toBe(true);
    // 8 presets written to global DB (4 base meta + 4 canonical team rules)
    const globalStore = new SqliteKnowledgeStore(openDb(tmp.userGlobalDbPath));
    const globalCount = globalStore.count();
    globalStore.close();
    expect(globalCount).toBe(8);

    // 2 imported rules in project DB (both CLAUDE.md bullets)
    const projectStore = new SqliteKnowledgeStore(openDb(tmp.projectDbPath));
    const personalCount = projectStore.count();
    projectStore.close();
    expect(personalCount).toBe(2);

    // CLAUDE.md remains human-maintained; init no longer writes a VIKI block.
    const md = nodeFs.readFileSync(path.join(tmp.cwd, "CLAUDE.md"), "utf-8");
    expect(md).not.toContain("VIKI:START");
    expect(md).not.toContain("VIKI:END");
    expect(md).toContain("# Team rules");
    expect(r.steps.find((s) => s.step === "compile-skills")?.status).toBe("ok");

    expect(r.summary.presetAdded).toBe(8);
    expect(r.summary.importedRules).toBe(2);
    expect(r.summary.totalActiveEntries).toBeGreaterThanOrEqual(10);

    // Issue #218 — F6: lock down that without seeding the source SKILL.md,
    // the mirror step records 'skipped' (and is non-fatal). Stops a
    // regression where the step accidentally becomes 'failed' or vanishes.
    const mirrorStep = r.steps.find(
      (s) => s.step === "mirror-claim-to-merge-skill",
    );
    expect(mirrorStep?.status).toBe("skipped");
    expect(mirrorStep?.detail).toContain("不存在");
  });

  // #445: default `init` must NOT call the LLM or read
  // CLAUDE.md/AGENTS.md/.cursorrules. LLM rule structuring spawns one
  // `claude -p` per rule (231 in a real install transcript), burns the user's
  // Claude subscription quota, and hangs with no API key. Now opt-in: --structure.
  it("default init does NOT call the LLM and imports 0 rules (#445)", async () => {
    nodeFs.writeFileSync(
      path.join(tmp.cwd, "CLAUDE.md"),
      "# Team rules\n- Prefer fetch over axios\n- Use pnpm\n",
    );
    let llmCalls = 0;
    const spyLLM: LLMClient = {
      complete: async () => {
        llmCalls++;
        return OK_LLM_RESPONSE;
      },
    };
    const r = await executeInit({ ...commonOpts(), llmClient: spyLLM });
    expect(r.ok).toBe(true);
    expect(llmCalls).toBe(0);
    expect(r.summary.importedRules).toBe(0);
    const structureStep = r.steps.find((s) => s.step === "structure-rules")!;
    expect(structureStep.detail).toContain("--structure");
  });

  it("--structure opts in to LLM-based rule import (#445)", async () => {
    nodeFs.writeFileSync(
      path.join(tmp.cwd, "CLAUDE.md"),
      "# Team rules\n- Prefer fetch over axios\n- Use pnpm\n",
    );
    const r = await executeInit({
      ...commonOpts(),
      structure: true,
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });
    expect(r.ok).toBe(true);
    expect(r.summary.importedRules).toBe(2);
  });

  it("dry-run does not write required-mode artifacts", async () => {
    nodeFs.writeFileSync(
      path.join(tmp.cwd, "CLAUDE.md"),
      "# Team rules\n",
    );

    const r = await executeInit({
      ...commonOpts(),
      dryRun: true,
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });

    expect(r.dryRun).toBe(true);
    expect(
      nodeFs.existsSync(path.join(tmp.cwd, ".viki", "required.json")),
    ).toBe(false);
    expect(
      nodeFs.existsSync(
        path.join(tmp.cwd, ".claude", "hooks", "check-viki.sh"),
      ),
    ).toBe(false);
  });

  it("target=codex does not write required-mode artifacts", async () => {
    const r = await executeInit({
      ...commonOpts(),
      target: "codex",
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });

    expect(r.ok).toBe(true);
    expect(
      nodeFs.existsSync(path.join(tmp.cwd, ".viki", "required.json")),
    ).toBe(false);
    expect(
      nodeFs.existsSync(
        path.join(tmp.cwd, ".claude", "hooks", "check-viki.sh"),
      ),
    ).toBe(false);
  });

  it("target=codex exports Skills and links .codex/skills", async () => {
    const r = await executeInit({
      ...commonOpts(),
      target: "codex",
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });

    expect(r.ok).toBe(true);
    expect(r.steps.find((s) => s.step === "compile-skills")?.status).toBe("ok");
    expect(r.steps.find((s) => s.step === "link-codex-files")?.status).toBe("ok");
    const codexSkillsPath = path.join(tmp.cwd, ".codex", "skills");
    const vikiSkillsPath = path.join(tmp.home, ".claude", "skills", "viki");
    expect(nodeFs.existsSync(path.join(tmp.cwd, "AGENTS.md"))).toBe(false);
    expect(nodeFs.existsSync(path.join(tmp.cwd, "CLAUDE.md"))).toBe(false);
    expect(nodeFs.lstatSync(codexSkillsPath).isSymbolicLink()).toBe(true);
    expect(path.resolve(tmp.cwd, ".codex", nodeFs.readlinkSync(codexSkillsPath))).toBe(
      vikiSkillsPath,
    );
  });

  it("target=codex pre-check validates readable CLAUDE.md for import", async () => {
    const claudePath = path.join(tmp.cwd, "CLAUDE.md");
    nodeFs.writeFileSync(claudePath, "# locked\n");

    const accessSpy = vi.spyOn(nodeFs, "accessSync").mockImplementation((p, mode) => {
      if (p === claudePath) {
        throw new Error("EACCES");
      }
      return undefined as unknown as void;
    });

    const r = await executeInit({
      ...commonOpts(),
      target: "codex",
      structure: true,
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });

    accessSpy.mockRestore();
    expect(r.ok).toBe(false);
    expect(r.steps[0]).toMatchObject({
      step: "pre-check",
      status: "failed",
      detail: "CLAUDE.md 文件无读取权限，请运行: chmod 644 CLAUDE.md",
    });
  });

  it("default init (no --structure) succeeds even with an unreadable CLAUDE.md (#445)", async () => {
    const claudePath = path.join(tmp.cwd, "CLAUDE.md");
    nodeFs.writeFileSync(claudePath, "# locked\n");
    const accessSpy = vi.spyOn(nodeFs, "accessSync").mockImplementation((p) => {
      if (p === claudePath) throw new Error("EACCES");
      return undefined as unknown as void;
    });
    const r = await executeInit({
      ...commonOpts(),
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });
    accessSpy.mockRestore();
    // #445: default init does not read CLAUDE.md, so an unreadable one must not block it.
    expect(r.ok).toBe(true);
    expect(r.steps[0]).toMatchObject({ step: "pre-check", status: "ok" });
    expect(accessSpy).not.toHaveBeenCalledWith(claudePath, nodeFs.constants.R_OK);
  });

  it("target=codex pre-check only requires read access for existing AGENTS.md", async () => {
    const agentsPath = path.join(tmp.cwd, "AGENTS.md");
    nodeFs.writeFileSync(agentsPath, "# Agent guidance\n");

    const accessSpy = vi.spyOn(nodeFs, "accessSync").mockImplementation((p, mode) => {
      if (p === agentsPath && typeof mode === "number" && (mode & nodeFs.constants.W_OK) !== 0) {
        throw new Error("unexpected write access check");
      }
      return undefined as unknown as void;
    });

    const r = await executeInit({
      ...commonOpts(),
      target: "codex",
      structure: true,
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });

    expect(r.ok).toBe(true);
    expect(accessSpy).toHaveBeenCalledWith(agentsPath, nodeFs.constants.R_OK);
    accessSpy.mockRestore();
    expect(nodeFs.readFileSync(agentsPath, "utf-8")).toBe("# Agent guidance\n");
  });

  itWithFileSymlink(
    "target=codex removes old Viki AGENTS.md symlink and does not import it",
    async () => {
      const oldRulesDir = path.join(tmp.home, ".claude", "viki", "rules");
      const oldRulesPath = path.join(oldRulesDir, "INDEX.md");
      const agentsPath = path.join(tmp.cwd, "AGENTS.md");
      nodeFs.mkdirSync(oldRulesDir, { recursive: true });
      nodeFs.writeFileSync(oldRulesPath, "- stale generated rule\n", "utf-8");
      nodeFs.symlinkSync(oldRulesPath, agentsPath, "file");

      const r = await executeInit({
        ...commonOpts(),
        target: "codex",
        llmClient: stubLLM(OK_LLM_RESPONSE),
      });

      expect(r.ok).toBe(true);
      expect(nodeFs.existsSync(agentsPath)).toBe(false);
      expect(r.summary.importedRules).toBe(0);
      expect(r.steps.find((s) => s.step === "link-codex-files")?.detail).toContain(
        "AGENTS.md legacy link (removed)",
      );
    }
  );

  itWithFileSymlink(
    "target=both removes old AGENTS.md link to CLAUDE.md after import",
    async () => {
      const claudePath = path.join(tmp.cwd, "CLAUDE.md");
      const agentsPath = path.join(tmp.cwd, "AGENTS.md");
      nodeFs.writeFileSync(claudePath, "- current Claude rule\n", "utf-8");
      nodeFs.symlinkSync(claudePath, agentsPath, "file");

      const r = await executeInit({
        ...commonOpts(),
        target: "both",
        structure: true,
        llmClient: stubLLM(OK_LLM_RESPONSE),
      });

      expect(r.ok).toBe(true);
      expect(nodeFs.existsSync(agentsPath)).toBe(false);
      expect(r.summary.importedRules).toBe(1);
    }
  );

  it("target=both exports Skills and links .codex/skills", async () => {
    const r = await executeInit({
      ...commonOpts(),
      target: "both",
      skipImport: true,
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });

    expect(r.ok).toBe(true);
    expect(nodeFs.existsSync(path.join(tmp.cwd, "CLAUDE.md"))).toBe(false);
    expect(r.steps.find((s) => s.step === "compile-skills")?.status).toBe("ok");
    const codexSkillsPath = path.join(tmp.cwd, ".codex", "skills");
    expect(nodeFs.lstatSync(codexSkillsPath).isSymbolicLink()).toBe(true);
  });

  it("idempotent: running init twice doesn't duplicate presets", async () => {
    await executeInit({
      ...commonOpts(),
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });
    const r2 = await executeInit({
      ...commonOpts(),
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });
    expect(r2.ok).toBe(true);
    // Second run should add 0 new presets (all 8 already present)
    expect(r2.summary.presetAdded).toBe(0);
    const globalStore = new SqliteKnowledgeStore(openDb(tmp.userGlobalDbPath));
    const globalCount = globalStore.count();
    globalStore.close();
    expect(globalCount).toBe(8); // still 8
  });

  it("no CLAUDE.md + no .cursorrules → import step reports '无规则可导入'", async () => {
    const r = await executeInit({
      ...commonOpts(),
      structure: true,
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });
    const structureStep = r.steps.find((s) => s.step === "structure-rules")!;
    expect(structureStep.status).toBe("ok");
    expect(structureStep.detail).toContain("无规则");
    expect(r.summary.importedRules).toBe(0);
  });

  it("pre-check accepts missing CLAUDE.md", async () => {
    const r = await executeInit({
      ...commonOpts(),
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });
    expect(r.ok).toBe(true);
    expect(r.steps.find((s) => s.step === "pre-check")?.status).toBe("ok");
    expect(nodeFs.existsSync(path.join(tmp.cwd, "CLAUDE.md"))).toBe(false);
  });

  it("reads .cursorrules and imports from it", async () => {
    nodeFs.writeFileSync(
      path.join(tmp.cwd, ".cursorrules"),
      "- cursor rule one\n- cursor rule two\n- cursor rule three\n",
    );
    const r = await executeInit({
      ...commonOpts(),
      structure: true,
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });
    expect(r.summary.importedRules).toBe(3);
  });

  it("--skip-import skips LLM structure step but still loads presets", async () => {
    nodeFs.writeFileSync(path.join(tmp.cwd, "CLAUDE.md"), "- one\n- two\n");
    const r = await executeInit({
      ...commonOpts(),
      skipImport: true,
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });
    expect(r.ok).toBe(true);
    expect(r.summary.presetAdded).toBe(8);
    expect(r.summary.importedRules).toBe(0);
    const structureStep = r.steps.find((s) => s.step === "structure-rules")!;
    expect(structureStep.detail).toContain("skipImport");
  });

  it("LLM returning null for all rules → 0 imported, no failure", async () => {
    nodeFs.writeFileSync(path.join(tmp.cwd, "CLAUDE.md"), "- a\n- b\n");
    const r = await executeInit({
      ...commonOpts(),
      structure: true,
      llmClient: stubLLM("null"),
    });
    expect(r.ok).toBe(true);
    expect(r.summary.importedRules).toBe(0);
  });

  it("per-rule LLM error does not abort init", async () => {
    nodeFs.writeFileSync(path.join(tmp.cwd, "CLAUDE.md"), "- a\n- b\n");
    let calls = 0;
    const flakyLLM: LLMClient = {
      complete: async () => {
        calls++;
        if (calls === 1) throw new Error("rate limited");
        return OK_LLM_RESPONSE;
      },
    };
    const r = await executeInit({
      ...commonOpts(),
      structure: true,
      llmClient: flakyLLM,
    });
    expect(r.ok).toBe(true);
    expect(r.summary.importedRules).toBe(1);
  });

  it("detect-stack reports typescript + react", async () => {
    nodeFs.writeFileSync(
      path.join(tmp.cwd, "package.json"),
      JSON.stringify({ dependencies: { react: "^18" } }),
    );
    nodeFs.writeFileSync(path.join(tmp.cwd, "tsconfig.json"), "{}");
    nodeFs.writeFileSync(path.join(tmp.cwd, "pnpm-lock.yaml"), "");
    const r = await executeInit({
      ...commonOpts(),
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });
    const stackStep = r.steps.find((s) => s.step === "detect-stack")!;
    expect(stackStep.detail).toContain("typescript");
    expect(stackStep.detail).toContain("react");
    expect(stackStep.detail).toContain("pnpm");
  });

  it("load-seed: injects bundled rules when seedPath is provided", async () => {
    const seedFile = path.join(tmp.root, "rules.jsonl");
    const seedEntry = {
      id: "seed-demo-1",
      scope: { level: "global" },
      category: "E",
      tags: ["seed"],
      type: "practice",
      nature: "subjective",
      trigger: "test seed",
      wrong_pattern: "",
      correct_pattern: "use seed value",
      reasoning: "bundled",
      confidence: 0.9,
      enforcement: "suggest",
      status: "active",
      hit_count: 0,
      success_count: 0,
      override_count: 0,
      evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
      created_at: "2026-04-14T12:00:00Z",
      last_hit_at: "",
      last_validated_at: "2026-04-14T12:00:00Z",
      source: "preset",
      conflict_with: [],
      current_tier: "experimental",
      max_tier_ever: "experimental",
      tier_entered_at: "",
      demerit: 0,
      demerit_last_updated: "",
      resurrect_count: 0,
    };
    nodeFs.writeFileSync(seedFile, JSON.stringify(seedEntry) + "\n");

    const r = await executeInit({
      ...commonOpts(),
      skipSeed: false,
      seedPath: seedFile,
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });

    expect(r.ok).toBe(true);
    expect(r.summary.seedAdded).toBe(1);
    const globalStore = new SqliteKnowledgeStore(openDb(tmp.userGlobalDbPath));
    expect(globalStore.getById("seed-demo-1")).toBeDefined();
    expect(globalStore.count()).toBe(9); // 8 presets + 1 seed
    globalStore.close();

    // idempotent second run
    const r2 = await executeInit({
      ...commonOpts(),
      skipSeed: false,
      seedPath: seedFile,
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });
    expect(r2.summary.seedAdded).toBe(0);
  });

  it("load-seed: also loads sibling packs/*.jsonl files (issue #88)", async () => {
    const seedFile = path.join(tmp.root, "rules.jsonl");
    const baseEntry = {
      id: "seed-base-pack-test",
      scope: { level: "global" as const },
      category: "E" as const,
      tags: ["seed"],
      type: "practice" as const,
      nature: "subjective" as const,
      trigger: "test base",
      wrong_pattern: "",
      correct_pattern: "use base",
      reasoning: "base seed entry",
      confidence: 0.9,
      enforcement: "warn" as const,
      status: "active" as const,
      hit_count: 0,
      success_count: 0,
      override_count: 0,
      evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
      created_at: "2026-05-07T03:30:00Z",
      last_hit_at: "",
      last_validated_at: "2026-05-07T03:30:00Z",
      source: "preset" as const,
      conflict_with: [],
      current_tier: "experimental" as const,
      max_tier_ever: "experimental" as const,
      tier_entered_at: "",
      demerit: 0,
      demerit_last_updated: "",
      resurrect_count: 0,
    };
    nodeFs.writeFileSync(seedFile, JSON.stringify(baseEntry) + "\n");

    // Create a sibling packs/ directory with two jsonl pack files.
    const packsDir = path.join(tmp.root, "packs");
    nodeFs.mkdirSync(packsDir, { recursive: true });
    const packEntryA = {
      ...baseEntry,
      id: "seed-pack-test-A",
      type: "avoidance" as const,
      wrong_pattern: "rm -rf /",
      enforcement: "block" as const,
      confidence: 0.85,
    };
    const packEntryB = {
      ...baseEntry,
      id: "seed-pack-test-B",
      type: "avoidance" as const,
      wrong_pattern: "chmod 777",
      enforcement: "block" as const,
      confidence: 0.85,
    };
    nodeFs.writeFileSync(
      path.join(packsDir, "alpha.jsonl"),
      JSON.stringify(packEntryA) + "\n",
    );
    nodeFs.writeFileSync(
      path.join(packsDir, "beta.jsonl"),
      JSON.stringify(packEntryB) + "\n",
    );

    const r = await executeInit({
      ...commonOpts(),
      skipSeed: false,
      seedPath: seedFile,
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });

    expect(r.ok).toBe(true);
    // 1 base + 2 pack entries should all be loaded.
    expect(r.summary.seedAdded).toBe(3);

    const globalStore = new SqliteKnowledgeStore(openDb(tmp.userGlobalDbPath));
    expect(globalStore.getById("seed-base-pack-test")).toBeDefined();
    expect(globalStore.getById("seed-pack-test-A")).toBeDefined();
    expect(globalStore.getById("seed-pack-test-B")).toBeDefined();
    globalStore.close();
  });

  it("load-seed: malformed pack does not abort load (issue #88)", async () => {
    const seedFile = path.join(tmp.root, "rules.jsonl");
    const baseEntry = {
      id: "seed-malformed-pack-base",
      scope: { level: "global" as const },
      category: "E" as const,
      tags: ["seed"],
      type: "practice" as const,
      nature: "subjective" as const,
      trigger: "t",
      wrong_pattern: "",
      correct_pattern: "c",
      reasoning: "r",
      confidence: 0.9,
      enforcement: "warn" as const,
      status: "active" as const,
      hit_count: 0,
      success_count: 0,
      override_count: 0,
      evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
      created_at: "2026-05-07T03:30:00Z",
      last_hit_at: "",
      last_validated_at: "2026-05-07T03:30:00Z",
      source: "preset" as const,
      conflict_with: [],
      current_tier: "experimental" as const,
      max_tier_ever: "experimental" as const,
      tier_entered_at: "",
      demerit: 0,
      demerit_last_updated: "",
      resurrect_count: 0,
    };
    nodeFs.writeFileSync(seedFile, JSON.stringify(baseEntry) + "\n");

    const packsDir = path.join(tmp.root, "packs");
    nodeFs.mkdirSync(packsDir, { recursive: true });
    // Garbage in a pack file — must not abort the whole load.
    nodeFs.writeFileSync(path.join(packsDir, "broken.jsonl"), "{not valid json\n");
    // Good pack file alongside.
    const goodEntry = { ...baseEntry, id: "seed-pack-good-1" };
    nodeFs.writeFileSync(
      path.join(packsDir, "good.jsonl"),
      JSON.stringify(goodEntry) + "\n",
    );

    const r = await executeInit({
      ...commonOpts(),
      skipSeed: false,
      seedPath: seedFile,
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });

    expect(r.ok).toBe(true);
    // Base entry must load; broken pack is skipped; the good pack file
    // happens to be alphabetically AFTER broken in `readdirSync().sort()`
    // (`broken` < `good`), and the broken file's read is wrapped in
    // try/catch — so `good.jsonl` still loads.
    expect(r.summary.seedAdded).toBeGreaterThanOrEqual(2);
    const globalStore = new SqliteKnowledgeStore(openDb(tmp.userGlobalDbPath));
    expect(globalStore.getById("seed-malformed-pack-base")).toBeDefined();
    expect(globalStore.getById("seed-pack-good-1")).toBeDefined();
    globalStore.close();
  });

  it("writes install-log on successful run", async () => {
    await executeInit({
      ...commonOpts(),
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });
    const logPath = path.join(tmp.home, ".viki", ".install-log");
    expect(nodeFs.existsSync(logPath)).toBe(true);
    const content = nodeFs.readFileSync(logPath, "utf-8").trim();
    expect(content).toContain("pre-check");
    expect(content).toContain("compile-skills");
  });

  // ─── PR #181 fix-cycle (Worker E) — nested-init guard ──────────────────
  //
  // Background (PR-PLAN finding #5): running `viki init` from a sub-
  // directory of an already-initialized project must REFUSE by default,
  // to avoid creating a duplicate child `.viki/`. Escape hatch:
  // `--force-nested-init` (opts.force === true).
  it("PR #181: refuses nested init by default — fails with hint about --force-nested-init", async () => {
    // Build an initialized parent: <parent>/.viki/knowledge.db + .git
    // and sub directory <parent>/child. Call executeInit({ cwd: <parent>/child })
    // and expect the nested-init guard to fire.
    const parent = path.join(tmp.root, "parent");
    const child = path.join(parent, "child");
    nodeFs.mkdirSync(child, { recursive: true });
    nodeFs.mkdirSync(path.join(parent, ".viki"), { recursive: true });
    nodeFs.writeFileSync(path.join(parent, ".viki", "knowledge.db"), "stub");
    // Project marker required by the new walk-up contract.
    nodeFs.mkdirSync(path.join(parent, ".git"), { recursive: true });

    const r = await executeInit({
      ...commonOpts(),
      cwd: child,
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });

    expect(r.ok).toBe(false);
    const guard = r.steps.find((s) => s.step === "nested-init-guard");
    expect(guard).toBeDefined();
    expect(guard?.status).toBe("failed");
    expect(guard?.detail).toContain("ancestor");
    expect(guard?.detail).toContain("--force-nested-init");
    // Critical safety: the child must NOT have a `.viki/` dir created
    // (the guard short-circuits before doCreateDirs runs).
    expect(nodeFs.existsSync(path.join(child, ".viki"))).toBe(false);

    // Now call again with force=true — guard is bypassed and init proceeds.
    const r2 = await executeInit({
      ...commonOpts(),
      cwd: child,
      force: true,
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });
    expect(r2.ok).toBe(true);
    // The nested-init-guard step is NOT present when force is set.
    expect(r2.steps.find((s) => s.step === "nested-init-guard")).toBeUndefined();
    // Child's .viki/ now exists (init proceeded normally).
    expect(nodeFs.existsSync(path.join(child, ".viki", "knowledge.db"))).toBe(true);
  });
});

describe("parseInitArgs", () => {
  it("empty → {}", () => {
    expect(parseInitArgs([])).toEqual({});
  });
  it("--dry-run", () => {
    expect(parseInitArgs(["--dry-run"])).toEqual({ dryRun: true });
  });
  it("--structure", () => {
    expect(parseInitArgs(["--structure"])).toEqual({ structure: true });
  });
  it("--skip-import + --skip-hook combined", () => {
    expect(parseInitArgs(["--skip-import", "--skip-hook"])).toEqual({
      skipImport: true,
      skipHook: true,
    });
  });
  it("--install-plugins opt-in flag", () => {
    expect(parseInitArgs(["--install-plugins"])).toEqual({
      installPlugins: true,
    });
  });
  it("--codex and --target=both", () => {
    expect(parseInitArgs(["--codex"])).toEqual({ target: "codex" });
    expect(parseInitArgs(["--target=both"])).toEqual({ target: "both" });
  });
  it("--cwd=<path> assigns opts.cwd", () => {
    expect(parseInitArgs(["--cwd=/tmp/sandbox"])).toEqual({
      cwd: "/tmp/sandbox",
    });
  });
  it("--cwd <path> (space-separated) assigns opts.cwd", () => {
    expect(parseInitArgs(["--cwd", "/tmp/sandbox"])).toEqual({
      cwd: "/tmp/sandbox",
    });
  });
  it("--home=<path> assigns opts.homeDir", () => {
    expect(parseInitArgs(["--home=/tmp/home"])).toEqual({
      homeDir: "/tmp/home",
    });
  });
  it("--skip-seed assigns opts.skipSeed", () => {
    expect(parseInitArgs(["--skip-seed"])).toEqual({ skipSeed: true });
  });
  it("--cwd + --home + --skip-seed combined for Feature ① harness", () => {
    expect(
      parseInitArgs([
        "--cwd=/tmp/sandbox",
        "--home=/tmp/home",
        "--skip-import",
        "--skip-hook",
        "--skip-seed",
        "--skip-warmup",
      ]),
    ).toEqual({
      cwd: "/tmp/sandbox",
      homeDir: "/tmp/home",
      skipImport: true,
      skipHook: true,
      skipSeed: true,
      skipWarmup: true,
    });
  });
  it("--cwd without value throws", () => {
    expect(() => parseInitArgs(["--cwd"])).toThrowError(/--cwd/);
  });
  it("--cwd followed by another flag throws instead of consuming it as a path", () => {
    expect(() => parseInitArgs(["--cwd", "--skip-import"])).toThrowError(
      /--cwd/,
    );
  });
  it("--cwd= without value throws", () => {
    expect(() => parseInitArgs(["--cwd="])).toThrowError(/--cwd/);
  });
  it("--home without value throws", () => {
    expect(() => parseInitArgs(["--home"])).toThrowError(/--home/);
  });
  it("--home followed by another flag throws instead of consuming it as a path", () => {
    expect(() => parseInitArgs(["--home", "--skip-hook"])).toThrowError(
      /--home/,
    );
  });
  it("--home= without value throws", () => {
    expect(() => parseInitArgs(["--home="])).toThrowError(/--home/);
  });
  it("unknown --foo flag does not break parsing (warning to stderr)", () => {
    const writeSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    expect(parseInitArgs(["--foo", "--skip-import"])).toEqual({
      skipImport: true,
    });
    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringContaining("--foo"),
    );
    writeSpy.mockRestore();
  });
});

describe("executeInit — Feature ① init in fresh empty cwd", () => {
  let tmpFeat1: ReturnType<typeof mkTmp>;
  beforeEach(() => (tmpFeat1 = mkTmp()));
  afterEach(() => tmpFeat1.cleanup());

  it("fresh empty cwd + all --skip-* → .viki/ landed + ok=true", async () => {
    const r = await executeInit({
      cwd: tmpFeat1.cwd,
      homeDir: tmpFeat1.home,
      skipImport: true,
      skipHook: true,
      skipSeed: true,
      skipWarmup: true,
      idGen: () => "feat1-test",
      now: () => new Date("2026-05-11T12:00:00Z"),
    });

    // 第三方 judge harness 真正关心的契约：
    expect(r.ok).toBe(true);
    expect(nodeFs.existsSync(path.join(tmpFeat1.cwd, ".viki"))).toBe(true);
    // create-dirs 是 .viki/ 落地的权威 step
    const createDirs = r.steps.find((s) => s.step === "create-dirs");
    expect(createDirs?.status).toBe("ok");
    // compile-skills 是 ~/.claude/skills/viki/ 落地的权威 step
    const compileSkills = r.steps.find((s) => s.step === "compile-skills");
    expect(compileSkills?.status).toBe("ok");
    // 没有 unhandled failed step（dryRun 之外）
    const failed = r.steps.filter((s) => s.status === "failed");
    expect(failed).toEqual([]);
  });

  it("rendered stdout contains ✅ markers — judge.json grep anchor", async () => {
    const r = await executeInit({
      cwd: tmpFeat1.cwd,
      homeDir: tmpFeat1.home,
      skipImport: true,
      skipHook: true,
      skipSeed: true,
      skipWarmup: true,
      idGen: () => "feat1-render-test",
      now: () => new Date("2026-05-11T12:00:00Z"),
    });
    const out = renderInitResult(r);
    expect(out).toContain("✅");
    // Issue #326 RESCOPE item 6: success block collapsed to minimal
    // "Viki 已就绪 + Next: cd / claude". Old "安装成功" wording is gone.
    expect(out).toContain("Viki 已就绪");
    expect(out).toContain("cd your-project");
  });
});

describe("executeInit --install-plugins (opt-in plugin install)", () => {
  let tmp2: ReturnType<typeof mkTmp>;
  beforeEach(() => (tmp2 = mkTmp()));
  afterEach(() => tmp2.cleanup());

  const fakeInstaller = (calls: string[]) =>
    ({
      addMarketplace: async (m: { name: string }) => {
        calls.push(`mp:${m.name}`);
        return { status: "already" as const, detail: "already" };
      },
      installPlugin: async (p: { plugin: string; marketplace: string }) => {
        calls.push(`pl:${p.plugin}@${p.marketplace}`);
        return { status: "added" as const, detail: "ok" };
      },
    }) as unknown as import("@viki/adapters").ClaudePluginInstaller;

  it("runs plugin install step only when --install-plugins is set", async () => {
    const calls: string[] = [];
    const base = {
      cwd: tmp2.cwd,
      homeDir: tmp2.home,
      skipHook: true,
      skipImport: true,
      projectDbPath: tmp2.projectDbPath,
      userGlobalDbPath: tmp2.userGlobalDbPath,
      pluginInstaller: fakeInstaller(calls),
    };

    const off = await executeInit(base);
    expect(off.steps.find((s) => s.step === "install-plugins")).toBeUndefined();
    expect(calls).toEqual([]);

    const on = await executeInit({ ...base, installPlugins: true });
    const step = on.steps.find((s) => s.step === "install-plugins");
    expect(step?.status).toBe("ok");
    expect(calls.length).toBeGreaterThan(0);
  });

  it("reports failed when plugin install has any failure", async () => {
    const failingInstaller = {
      addMarketplace: async () => ({ status: "added" as const, detail: "" }),
      installPlugin: async () => ({ status: "failed" as const, detail: "boom" }),
    } as unknown as import("@viki/adapters").ClaudePluginInstaller;

    const result = await executeInit({
      cwd: tmp2.cwd,
      homeDir: tmp2.home,
      skipHook: true,
      skipImport: true,
      projectDbPath: tmp2.projectDbPath,
      userGlobalDbPath: tmp2.userGlobalDbPath,
      installPlugins: true,
      pluginInstaller: failingInstaller,
    });
    const step = result.steps.find((s) => s.step === "install-plugins");
    expect(step?.status).toBe("failed");
    expect(result.ok).toBe(false);
  });
});

describe("renderInitResult", () => {
  it("success → includes step list + summary", () => {
    const out = renderInitResult({
      ok: true,
      dryRun: false,
      steps: [
        { step: "pre-check", status: "ok", detail: "ok" },
        { step: "detect-stack", status: "ok", detail: "lang=typescript" },
      ],
      summary: {
        stack: "lang=typescript",
        presetAdded: 4,
        seedAdded: 0,
        importedRules: 2,
        totalActiveEntries: 6,
      },
    });
    // Issue #326 RESCOPE item 6: success block is now the minimal
    // "Viki 已就绪 + Next: cd / claude". The verbose "重新打开 Claude
    // Code" guidance moved behind VIKI_VERBOSE_INIT=1 (kept in source
    // for `viki doctor` / future flag).
    expect(out).toContain("✅ Viki 已就绪");
    expect(out).toContain("前置检查");
    expect(out).toContain("lang=typescript");
    expect(out).toContain("下一步：");
    expect(out).toContain("cd your-project");
  });

  it("failure → shows warning footer", () => {
    const out = renderInitResult({
      ok: false,
      dryRun: false,
      steps: [{ step: "pre-check", status: "failed", detail: "bad permissions" }],
      summary: { stack: "", presetAdded: 0, seedAdded: 0, importedRules: 0, totalActiveEntries: 0 },
    });
    expect(out).toContain("❌ 安装未完成");
    expect(out).toContain("前置检查");
  });

  // Regression: when executeInit short-circuits on `nested-init-guard`, the
  // returned InitResult has exactly one step whose key isn't listed in any
  // stepGroup. The render loop silently dropped it, so users only saw the
  // bottom "❌ 安装未完成 ... 运行 viki doctor" footer with NO reason —
  // and doctor then sent them back to init in a loop. Surface the full detail
  // (ancestor path + --force-nested-init hint) so the user can act.
  it("renders nested-init-guard failure with ancestor path + --force-nested-init hint", () => {
    const out = renderInitResult({
      ok: false,
      dryRun: false,
      steps: [{
        step: "nested-init-guard",
        status: "failed",
        detail:
          "detected ancestor Viki project at /Users/m1/projects; refusing to " +
          "create duplicate .viki/ in /Users/m1/projects/demo-repo — cd to the " +
          "project root or use --force-nested-init to override.",
      }],
      summary: { stack: "", presetAdded: 0, seedAdded: 0, importedRules: 0, totalActiveEntries: 0 },
    });
    expect(out).toContain("❌ 安装未完成");
    // Specific anchors the user must see in order to act:
    expect(out).toContain("ancestor Viki project at /Users/m1/projects");
    expect(out).toContain("--force-nested-init");
  });

  // Issue #326 RESCOPE item 6: the "💡 团队标配插件" hint is no longer in
  // the default success path — it would violate the minimal 5-line
  // "Viki 已就绪 + Next: cd / claude" success block. The hint stays
  // gated behind VIKI_VERBOSE_INIT=1 so power users / `viki
  // doctor` flows can still surface it.
  it("success without --install-plugins: hint hidden by default, shown with VIKI_VERBOSE_INIT=1", () => {
    const renderArg = {
      ok: true,
      dryRun: false,
      steps: [{ step: "pre-check", status: "ok" as const, detail: "ok" }],
      summary: {
        stack: "lang=typescript",
        presetAdded: 4,
        seedAdded: 0,
        importedRules: 0,
        totalActiveEntries: 4,
      },
    };
    // default path: hint hidden
    const defaultOut = renderInitResult(renderArg);
    expect(defaultOut).not.toMatch(/install-plugins/);
    // verbose path: hint resurfaces
    const prev = process.env["VIKI_VERBOSE_INIT"];
    process.env["VIKI_VERBOSE_INIT"] = "1";
    try {
      const verboseOut = renderInitResult(renderArg);
      expect(verboseOut).toMatch(/install-plugins/);
    } finally {
      if (prev === undefined) delete process.env["VIKI_VERBOSE_INIT"];
      else process.env["VIKI_VERBOSE_INIT"] = prev;
    }
  });

  it("success with install-plugins step present does NOT show the hint", () => {
    const renderArg = {
      ok: true,
      dryRun: false,
      steps: [
        { step: "pre-check", status: "ok" as const, detail: "ok" },
        { step: "install-plugins", status: "ok" as const, detail: "all ok" },
      ],
      summary: {
        stack: "lang=typescript",
        presetAdded: 4,
        seedAdded: 0,
        importedRules: 0,
        totalActiveEntries: 4,
      },
    };
    // default path: no hint regardless
    const defaultOut = renderInitResult(renderArg);
    expect(defaultOut).not.toMatch(/viki install-plugins.*\n.*运行/);
    // verbose path: still no hint because install-plugins already ran
    const prev = process.env["VIKI_VERBOSE_INIT"];
    process.env["VIKI_VERBOSE_INIT"] = "1";
    try {
      const verboseOut = renderInitResult(renderArg);
      expect(verboseOut).not.toMatch(/viki install-plugins.*\n.*运行/);
    } finally {
      if (prev === undefined) delete process.env["VIKI_VERBOSE_INIT"];
      else process.env["VIKI_VERBOSE_INIT"] = prev;
    }
  });
});

describe("renderInitResult — new UX", () => {
  it("shows success banner when all steps pass", () => {
    const result = {
      ok: true,
      dryRun: false,
      steps: [
        { step: "pre-check", status: "ok" as const, detail: "所有前置检查通过" },
        { step: "detect-stack", status: "ok" as const, detail: "lang=typescript" },
        { step: "create-dirs", status: "ok" as const, detail: ".viki/" },
        { step: "load-presets", status: "ok" as const, detail: "加载 12 条元原则" },
        { step: "import-rules", status: "ok" as const, detail: "导入 5 条" },
        { step: "install-hook", status: "ok" as const, detail: "已写入" },
        { step: "compile-skills", status: "ok" as const, detail: "导出 3 条" },
      ],
      summary: { stack: "typescript", presetAdded: 12, seedAdded: 0, importedRules: 5, totalActiveEntries: 17 },
    };
    const out = renderInitResult(result);
    // Issue #326 RESCOPE item 6: minimal success block.
    // "重新打开 Claude Code" + "viki doctor" moved behind
    // VIKI_VERBOSE_INIT=1 (kept in source for power-user / doctor flows).
    expect(out).toContain("✅ Viki 已就绪");
    expect(out).toContain("下一步：");
    expect(out).toContain("cd your-project");
    expect(out).toContain("claude");
  });

  it("shows failure banner when a step fails", () => {
    const result = {
      ok: false,
      dryRun: false,
      steps: [
        { step: "pre-check", status: "failed" as const, detail: "CLAUDE.md 文件不可读，请检查权限" },
      ],
      summary: { stack: "", presetAdded: 0, seedAdded: 0, importedRules: 0, totalActiveEntries: 0 },
    };
    const out = renderInitResult(result);
    expect(out).toContain("❌ 安装未完成");
    expect(out).toContain("viki doctor");
    expect(out).not.toContain("ENOENT"); // no raw errors
  });

  it("shows dry-run banner when dryRun=true", () => {
    const result = {
      ok: true,
      dryRun: true,
      steps: [],
      summary: { stack: "", presetAdded: 0, seedAdded: 0, importedRules: 0, totalActiveEntries: 0 },
    };
    const out = renderInitResult(result);
    expect(out).toContain("预览模式");
    expect(out).toContain("--dry-run");
  });

  // Issue #218 — F5 stepGroups + stepLabel rendering contract: a typo in
  // either mapping would silently render the step under the wrong icon
  // group or with label "unknown". Assert the rendered output ties the
  // step to "📄 导出 Skills" and "FIXEDFLOW Skill".
  it("mirror step renders under '📄 导出 Skills' group with 'FIXEDFLOW Skill' label", () => {
    const out = renderInitResult({
      ok: true,
      dryRun: false,
      steps: [
        { step: "compile-skills", status: "ok" as const, detail: "导出 3 条" },
        {
          step: "mirror-claim-to-merge-skill",
          status: "ok" as const,
          detail: "已复制到 /tmp/.claude/skills/viki/claim-to-merge/SKILL.md",
        },
      ],
      summary: {
        stack: "lang=typescript",
        presetAdded: 0,
        seedAdded: 0,
        importedRules: 0,
        totalActiveEntries: 0,
      },
    });
    expect(out).toContain("FIXEDFLOW Skill");
    expect(out).toContain("📄 导出 Skills");
    const idxGroup = out.indexOf("📄 导出 Skills");
    const idxLabel = out.indexOf("FIXEDFLOW Skill");
    expect(idxLabel).toBeGreaterThan(idxGroup);
  });
});

// Issue #218 — F2 + F3: end-to-end coverage of doMirrorClaimToMergeSkill
// (success + dryRun + skipped + non-fatal failure) and the
// targetIncludesClaude conditional that decides whether the step runs.
describe("executeInit — mirror-claim-to-merge-skill (issue #218)", () => {
  let tmp: ReturnType<typeof mkTmp>;
  let ctr = 0;
  beforeEach(() => {
    tmp = mkTmp();
    ctr = 0;
  });
  afterEach(() => {
    // F17 (review iter 2): safety net for any vi.spyOn that leaked because
    // executeInit threw before the test's explicit mockRestore() ran.
    // vitest.config.ts pins singleThread + fileParallelism:false, so a
    // leaked spy persists for every subsequent test in this file.
    vi.restoreAllMocks();
    tmp.cleanup();
  });

  const commonOpts = () => ({
    cwd: tmp.cwd,
    homeDir: tmp.home,
    skipHook: true,
    skipSeed: true,
    idGen: () => `pers-test-${++ctr}`,
    now: () => new Date("2026-04-14T12:00:00Z"),
  });

  // Plant a stub source SKILL.md under tmp.cwd so the mirror step's
  // success branch fires.
  function seedClaimToMergeSource(
    body = "# claim-to-merge\nFIXEDFLOW routing stub for tests\n",
  ): { sourcePath: string; userTargetPath: string } {
    const sourceDir = path.join(tmp.cwd, ".claude", "skills", "claim-to-merge");
    nodeFs.mkdirSync(sourceDir, { recursive: true });
    const sourcePath = path.join(sourceDir, "SKILL.md");
    nodeFs.writeFileSync(sourcePath, body);
    const userTargetPath = path.join(
      tmp.home,
      ".claude",
      "skills",
      "viki",
      "claim-to-merge",
      "SKILL.md",
    );
    return { sourcePath, userTargetPath };
  }

  it("F2 success: copies source SKILL.md to user-level target byte-for-byte", async () => {
    const { userTargetPath } = seedClaimToMergeSource(
      "# claim-to-merge\nrouting body for byte-equality assertion\n",
    );
    const r = await executeInit({
      ...commonOpts(),
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });
    const step = r.steps.find(
      (s) => s.step === "mirror-claim-to-merge-skill",
    );
    expect(step?.status).toBe("ok");
    expect(step?.detail).toContain("已复制到");
    expect(nodeFs.existsSync(userTargetPath)).toBe(true);
    expect(nodeFs.readFileSync(userTargetPath, "utf-8")).toBe(
      "# claim-to-merge\nrouting body for byte-equality assertion\n",
    );
  });

  it("F2 source-missing: step skipped with informative detail, no target written", async () => {
    // Do NOT seed the source.
    const r = await executeInit({
      ...commonOpts(),
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });
    const step = r.steps.find(
      (s) => s.step === "mirror-claim-to-merge-skill",
    );
    expect(step?.status).toBe("skipped");
    expect(step?.detail).toContain("不存在");
    expect(step?.detail).toContain("仅 TeamBrain 仓库需要");
    expect(
      nodeFs.existsSync(
        path.join(
          tmp.home,
          ".claude",
          "skills",
          "viki",
          "claim-to-merge",
          "SKILL.md",
        ),
      ),
    ).toBe(false);
  });

  it("F2 dryRun: step ok with '(dry-run) 会复制' detail, no target written", async () => {
    const { userTargetPath } = seedClaimToMergeSource();
    const r = await executeInit({
      ...commonOpts(),
      dryRun: true,
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });
    const step = r.steps.find(
      (s) => s.step === "mirror-claim-to-merge-skill",
    );
    expect(step?.status).toBe("ok");
    expect(step?.detail).toMatch(/^\(dry-run\) 会复制/);
    expect(nodeFs.existsSync(userTargetPath)).toBe(false);
  });

  it("F2 + F1 non-fatal failure: copyFileSync throws → status='ok' with ⚠️ prefix; result.ok stays true", async () => {
    seedClaimToMergeSource();
    // Force fs.copyFileSync to throw for any user-level target write,
    // simulating $HOME read-only / disk full / EPERM.
    const copySpy = vi
      .spyOn(nodeFs, "copyFileSync")
      .mockImplementation((src, dest) => {
        // Cross-platform path check: Windows uses `\`, POSIX uses `/`.
        // Normalize before substring match so the test holds on both.
        const destPosix = String(dest).split(path.sep).join("/");
        if (destPosix.includes("/.claude/skills/viki/claim-to-merge/")) {
          throw new Error("EACCES: simulated permission denied");
        }
        // Defer to real impl for other writes (none expected in this test).
        throw new Error(
          `unexpected copyFileSync target in test: ${String(dest)}`,
        );
      });

    const r = await executeInit({
      ...commonOpts(),
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });
    copySpy.mockRestore();

    const step = r.steps.find(
      (s) => s.step === "mirror-claim-to-merge-skill",
    );
    // F1 contract: cosmetic failure must NOT flip result.ok.
    expect(step?.status).toBe("ok");
    expect(step?.detail).toMatch(/^⚠️ 镜像失败但 init 继续/);
    expect(step?.detail).toContain("EACCES");
    expect(r.ok).toBe(true);
  });

  it("F3 target=codex: mirror step is NOT included (writes to ~/.claude/, codex-only install must not touch it)", async () => {
    seedClaimToMergeSource();
    const r = await executeInit({
      ...commonOpts(),
      target: "codex",
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });
    const step = r.steps.find(
      (s) => s.step === "mirror-claim-to-merge-skill",
    );
    expect(step).toBeUndefined();
  });

  it("F3 target=both: mirror step IS included with status='ok' when source is seeded", async () => {
    const { userTargetPath } = seedClaimToMergeSource();
    const r = await executeInit({
      ...commonOpts(),
      target: "both",
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });
    const step = r.steps.find(
      (s) => s.step === "mirror-claim-to-merge-skill",
    );
    expect(step?.status).toBe("ok");
    expect(nodeFs.existsSync(userTargetPath)).toBe(true);
  });

  // Issue #218 — F15 (review iter 2): mirrorProjectSkillToUserLevel takes
  // skillId as a string and joins it into a fs path. Today the only
  // caller is hardcoded to "claim-to-merge", but the helper docstring
  // explicitly invites future callers. Defend against a future caller
  // deriving skillId from config/CLI input by enforcing
  // SKILL_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/ at entry.
  it.each([
    ["..", "path traversal up"],
    ["../etc", "path traversal explicit"],
    ["foo/bar", "embedded slash"],
    ["foo/../bar", "traversal in middle"],
    ["", "empty string"],
    ["UPPERCASE", "uppercase rejected"],
    ["-leading-hyphen", "leading hyphen"],
    ["a".repeat(65), "over 64 chars"],
  ])("F15 rejects skillId %j (%s) with failed status", (badId, _label) => {
    const result = mirrorProjectSkillToUserLevel(
      badId,
      "test-step-key",
      {
        home: tmp.home,
        cwd: tmp.cwd,
        projectDbPath: "",
        userGlobalDbPath: "",
        claudeMdPath: "",
        agentsMdPath: "",
        skillsDir: path.join(tmp.home, ".claude", "skills", "viki"),
        installLogPath: "",
      },
      false,
    );
    expect(result.status).toBe("failed");
    expect(result.detail).toContain("invalid skillId");
  });

  it("F15 accepts well-formed skillId 'claim-to-merge'", () => {
    seedClaimToMergeSource("# stub\n");
    const result = mirrorProjectSkillToUserLevel(
      "claim-to-merge",
      "test-step-key",
      {
        home: tmp.home,
        cwd: tmp.cwd,
        projectDbPath: "",
        userGlobalDbPath: "",
        claudeMdPath: "",
        agentsMdPath: "",
        skillsDir: path.join(tmp.home, ".claude", "skills", "viki"),
        installLogPath: "",
      },
      false,
    );
    expect(result.status).toBe("ok");
    expect(result.detail).toContain("已复制到");
  });
});
