/**
 * Filesystem-backed store for TeamRuleFile entries living at
 *   <projectRoot>/.viki/team/<author>/<rule_id>.json
 *
 * Per-rule file design (vs single bundle) buys us:
 *   - clean git diffs when one rule changes
 *   - low merge-conflict surface (rules in different files don't collide)
 *   - easy lineage scan (one author dir = one author's claims)
 *
 * All IO is best-effort: corrupt JSON / unsafe names are reported via the
 * `onSkip` callback rather than thrown, so a single bad file doesn't kill
 * the whole `team sync` run.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { isSafeAuthor, isSafeRuleId } from "@viki/team";
import type { TeamRuleFile } from "@viki/team";

export interface SkipEntry {
  path: string;
  reason: string;
}

export interface ListOptions {
  onSkip?: (entry: SkipEntry) => void;
}

export class FsTeamRuleStore {
  teamDir(projectRoot: string): string {
    return path.join(projectRoot, ".viki", "team");
  }

  async listAll(projectRoot: string, opts: ListOptions = {}): Promise<TeamRuleFile[]> {
    const root = this.teamDir(projectRoot);
    if (!fs.existsSync(root)) return [];
    const out: TeamRuleFile[] = [];
    for (const author of fs.readdirSync(root)) {
      if (!isSafeAuthor(author)) {
        opts.onSkip?.({
          path: path.join(root, author),
          reason: `unsafe author "${author}"`,
        });
        continue;
      }
      const dir = path.join(root, author);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(dir);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith(".json")) continue;
        const ruleId = file.slice(0, -".json".length);
        const full = path.join(dir, file);
        if (!isSafeRuleId(ruleId)) {
          opts.onSkip?.({ path: full, reason: `unsafe rule_id "${ruleId}"` });
          continue;
        }
        try {
          const raw = fs.readFileSync(full, "utf-8");
          const parsed = JSON.parse(raw) as Partial<TeamRuleFile>;
          if (
            typeof parsed.rule_id !== "string" ||
            typeof parsed.author !== "string" ||
            !Array.isArray(parsed.claims)
          ) {
            opts.onSkip?.({
              path: full,
              reason: "schema violation: missing rule_id / author / claims",
            });
            continue;
          }
          out.push(parsed as TeamRuleFile);
        } catch (e) {
          opts.onSkip?.({
            path: full,
            reason: `JSON parse error: ${(e as Error).message}`,
          });
        }
      }
    }
    return out;
  }

  /**
   * Read the team-rule file for a specific (author, rule_id) pair. Returns
   * null when the file doesn't exist or is unreadable. Caller is responsible
   * for using the returned object before any concurrent write.
   */
  async read(
    projectRoot: string,
    author: string,
    ruleId: string,
  ): Promise<TeamRuleFile | null> {
    if (!isSafeAuthor(author) || !isSafeRuleId(ruleId)) return null;
    const p = path.join(this.teamDir(projectRoot), author, `${ruleId}.json`);
    if (!fs.existsSync(p)) return null;
    try {
      const raw = fs.readFileSync(p, "utf-8");
      return JSON.parse(raw) as TeamRuleFile;
    } catch {
      return null;
    }
  }

  /**
   * Atomically write a TeamRuleFile via tmp + rename. Refuses unsafe paths
   * up front to keep callers honest. The author dir is created lazily.
   */
  async write(projectRoot: string, file: TeamRuleFile): Promise<string> {
    if (!isSafeAuthor(file.author)) {
      throw new Error(`unsafe author: "${file.author}"`);
    }
    if (!isSafeRuleId(file.rule_id)) {
      throw new Error(`unsafe rule_id: "${file.rule_id}"`);
    }
    const dir = path.join(this.teamDir(projectRoot), file.author);
    fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, `${file.rule_id}.json`);
    const tmp = `${out}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
    fs.writeFileSync(tmp, JSON.stringify(file, null, 2) + "\n", "utf-8");
    fs.renameSync(tmp, out);
    return out;
  }
}
