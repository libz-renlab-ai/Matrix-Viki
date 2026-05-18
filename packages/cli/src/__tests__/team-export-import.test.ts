import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DualLayerStore } from "@viki/adapters";
import type { KnowledgeEntry } from "@viki/types";
import { runTeamExport, parseTeamExportArgs, type TeamBundle } from "../commands/team-export.js";
import { runTeamImport, parseTeamImportArgs } from "../commands/team-import.js";

function mkEntry(id: string): KnowledgeEntry {
  return {
    id,
    scope: { level: "personal" },
    category: "E",
    tags: ["test"],
    type: "practice",
    nature: "subjective",
    trigger: "t",
    wrong_pattern: "",
    correct_pattern: id + " content",
    reasoning: "r",
    confidence: 0.8,
    enforcement: "warn",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-05-18T10:00:00Z",
    last_hit_at: "",
    last_validated_at: "",
    source: "imported",
    conflict_with: [],
    current_tier: "experimental",
    max_tier_ever: "experimental",
    tier_entered_at: "2026-05-18T10:00:00Z",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
  } as KnowledgeEntry;
}

function initKb(cwd: string, homeDir: string): DualLayerStore {
  const store = new DualLayerStore({
    projectDbPath: join(cwd, ".viki", "knowledge.db"),
    userGlobalDbPath: join(homeDir, ".viki", "global.db"),
  });
  return store;
}

describe("team-export / team-import bundle path", () => {
  let cwd: string;
  let home: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "viki-team-bundle-cwd-"));
    home = mkdtempSync(join(tmpdir(), "viki-team-bundle-home-"));
    // Ensure .viki/ exists so SQLite can open file in it
    require("node:fs").mkdirSync(join(cwd, ".viki"), { recursive: true });
    require("node:fs").mkdirSync(join(home, ".viki"), { recursive: true });
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  describe("parseTeamExportArgs", () => {
    it("parses --out <path>", () => {
      expect(parseTeamExportArgs(["--out", "/x.json"]).outPath).toBe("/x.json");
    });
    it("parses --out=<path>", () => {
      expect(parseTeamExportArgs(["--out=/y.json"]).outPath).toBe("/y.json");
    });
  });

  describe("parseTeamImportArgs", () => {
    it("parses --file <path>", () => {
      expect(parseTeamImportArgs(["--file", "/x.json"]).filePath).toBe("/x.json");
    });
  });

  it("export → import round-trip preserves rules", () => {
    const store = initKb(cwd, home);
    store.add(mkEntry("r1"));
    store.add(mkEntry("r2"));
    store.add(mkEntry("r3"));
    (store as any).close?.();

    const exp = runTeamExport({ cwd, homeDir: home });
    expect(exp.ok).toBe(true);
    expect(exp.count).toBe(3);

    // Verify the bundle file shape
    const bundle = JSON.parse(readFileSync(exp.written, "utf-8")) as TeamBundle;
    expect(bundle.schema_version).toBe(1);
    expect(bundle.entries.map((e) => e.id).sort()).toEqual(["r1", "r2", "r3"]);

    // Wipe project DB and re-import
    rmSync(join(cwd, ".viki", "knowledge.db"), { force: true });
    require("node:fs").rmSync(join(cwd, ".viki", "knowledge.db-shm"), { force: true });
    require("node:fs").rmSync(join(cwd, ".viki", "knowledge.db-wal"), { force: true });

    const imp = runTeamImport({ cwd, homeDir: home, filePath: exp.written });
    expect(imp.ok).toBe(true);
    expect(imp.imported).toBe(3);
    expect(imp.skipped).toBe(0);

    // Re-open and verify entries are back
    const verify = initKb(cwd, home);
    const ids = verify.getAll().map((e) => e.id).sort();
    expect(ids).toEqual(["r1", "r2", "r3"]);
    // And scope is normalized to team
    const r1 = verify.getById("r1")!;
    expect(r1.scope.level).toBe("team");
    expect(r1.source).toBe("team-shared");
    (verify as any).close?.();
  });

  it("import second time → 0 imported, all skipped (idempotent)", () => {
    const store = initKb(cwd, home);
    store.add(mkEntry("dup-test"));
    (store as any).close?.();

    const exp = runTeamExport({ cwd, homeDir: home });

    // Wipe project DB so first import is a fresh insert
    const fs2 = require("node:fs");
    fs2.rmSync(join(cwd, ".viki", "knowledge.db"), { force: true });
    fs2.rmSync(join(cwd, ".viki", "knowledge.db-shm"), { force: true });
    fs2.rmSync(join(cwd, ".viki", "knowledge.db-wal"), { force: true });

    const imp1 = runTeamImport({ cwd, homeDir: home, filePath: exp.written });
    expect(imp1.imported).toBe(1);

    const imp2 = runTeamImport({ cwd, homeDir: home, filePath: exp.written });
    expect(imp2.imported).toBe(0);
    expect(imp2.skipped).toBe(1);
  });

  it("import with missing bundle returns ok:false", () => {
    const r = runTeamImport({ cwd, homeDir: home, filePath: join(cwd, "no-such-file.json") });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("not found");
  });

  it("export with no project KB returns ok:false", () => {
    const r = runTeamExport({ cwd, homeDir: home });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("no project KB");
  });
});
