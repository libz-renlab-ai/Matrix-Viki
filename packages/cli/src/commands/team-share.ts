/**
 * `viki team share --text "..." [--rule-id X] [--author A] [--scope personal|team] [--confidence N]`
 *
 * A-side of the per-rule team pipeline. Runs the share text through
 * gates 1 (secret scanner) + 2 (scope classifier) with optional override,
 * then either:
 *   - blocked_by_secret  → refuse, exit 2, print secret kinds
 *   - promote_to_l2      → write .viki/team/<author>/<rule_id>.json
 *   - demoted_to_personal → no team-file write (caller's personal KB
 *                           may already hold the rule via `viki pitfall`)
 *   - uncertain_held     → no team-file write; suggest --scope=team
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  classifyScope,
  decideShareAction,
  isSafeAuthor,
  isSafeRuleId,
  isTeamRulePathLengthSafe,
  appendClaim,
  newTeamRuleFile,
  scanForSecrets,
  estimateTeamRulePathLength,
  WINDOWS_MAX_PATH_BUDGET,
  type ShareDecision,
} from "@viki/team";
import { FsTeamRuleStore } from "@viki/adapters/team/fs-team-rule-store";

export class TeamShareValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeamShareValidationError";
  }
}

export interface TeamShareOptions {
  cwd: string;
  text: string;
  ruleId?: string;
  scope?: "personal" | "team";
  author?: string;
  confidence?: number;
  now?: string;
}

export interface TeamShareResult {
  rule_id: string;
  action: ShareDecision;
  written_path?: string;
  classification_class: "personal" | "shareable" | "uncertain";
  classification_reason: string;
  scan_matches_count: number;
}

export async function runTeamShare(opts: TeamShareOptions): Promise<TeamShareResult> {
  const text = opts.text;
  const scan = scanForSecrets(text);
  const classification = classifyScope(text);
  const action = decideShareAction({
    scan,
    classification,
    userOverride: opts.scope,
  });

  const ruleId = opts.ruleId ?? deriveRuleId(text);
  const author = opts.author ?? gitUserName(opts.cwd) ?? "unknown";
  const now = opts.now ?? new Date().toISOString();
  const confidence = opts.confidence ?? 0.85;

  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new TeamShareValidationError(
      `confidence "${confidence}" is not a finite number in [0,1]`,
    );
  }
  if (!isSafeRuleId(ruleId)) {
    throw new TeamShareValidationError(
      `--rule-id "${ruleId}" contains illegal characters; allowed: [A-Za-z0-9._-], length 1..200`,
    );
  }
  if (!isSafeAuthor(author)) {
    throw new TeamShareValidationError(
      `--author "${author}" contains illegal characters; allowed: [A-Za-z0-9._-], length 1..100`,
    );
  }
  if (!isTeamRulePathLengthSafe(opts.cwd, author, ruleId)) {
    const len = estimateTeamRulePathLength(opts.cwd, author, ruleId);
    throw new TeamShareValidationError(
      `rule path would be ${len} chars long, exceeding Windows MAX_PATH budget of ${WINDOWS_MAX_PATH_BUDGET}; shorten --rule-id or move the project`,
    );
  }
  // Future-timestamp guard (60s clock-skew tolerance).
  const nowMs = Date.parse(now);
  if (Number.isFinite(nowMs) && nowMs > Date.now() + 60_000) {
    throw new TeamShareValidationError(
      `--now "${now}" is more than 60s in the future relative to system clock`,
    );
  }

  let written_path: string | undefined;
  if (action.kind === "promote_to_l2") {
    const store = new FsTeamRuleStore();
    // Preserve lineage: if the rule already exists, keep its original_author
    // and append our claim. Otherwise create a new file with current user as
    // both the file-level author (lineage anchor) and the first claim author.
    const existing = await store.read(opts.cwd, author, ruleId);
    if (existing) {
      const next = appendClaim(existing, author, text, confidence, now);
      written_path = await store.write(opts.cwd, next);
    } else {
      // Also check any other author's directory for the same rule_id —
      // first-creator wins for lineage.
      const all = await store.listAll(opts.cwd);
      const claim = all.find((f) => f.rule_id === ruleId);
      if (claim) {
        const next = appendClaim(claim, author, text, confidence, now);
        written_path = await store.write(opts.cwd, next);
      } else {
        const fresh = newTeamRuleFile({
          ruleId,
          author,
          content: text,
          confidence,
          now,
        });
        written_path = await store.write(opts.cwd, fresh);
      }
    }
  }

  return {
    rule_id: ruleId,
    action,
    written_path,
    classification_class: classification.class,
    classification_reason: classification.reason,
    scan_matches_count: scan.length,
  };
}

export function deriveRuleId(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export function gitUserName(cwd: string): string | null {
  try {
    const out = execSync("git config user.name", {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

export function parseTeamShareArgs(argv: string[]): TeamShareOptions {
  const opts: Partial<TeamShareOptions> & { text: string } = { text: "", cwd: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--text") opts.text = argv[++i]!;
    else if (a.startsWith("--text=")) opts.text = a.slice("--text=".length);
    else if (a === "--rule-id") opts.ruleId = argv[++i];
    else if (a.startsWith("--rule-id=")) opts.ruleId = a.slice("--rule-id=".length);
    else if (a === "--author") opts.author = argv[++i];
    else if (a.startsWith("--author=")) opts.author = a.slice("--author=".length);
    else if (a === "--scope") opts.scope = argv[++i] as "personal" | "team";
    else if (a.startsWith("--scope=")) opts.scope = a.slice("--scope=".length) as "personal" | "team";
    else if (a === "--confidence") opts.confidence = Number(argv[++i]);
    else if (a.startsWith("--confidence=")) opts.confidence = Number(a.slice("--confidence=".length));
    else if (a === "--cwd") opts.cwd = argv[++i]!;
    else if (a.startsWith("--cwd=")) opts.cwd = a.slice("--cwd=".length);
  }
  return opts as TeamShareOptions;
}

export async function runTeamShareCli(argv: string[]): Promise<number> {
  const opts = parseTeamShareArgs(argv);
  if (!opts.text) {
    process.stderr.write("team share: --text is required\n");
    return 2;
  }
  try {
    const r = await runTeamShare(opts);
    if (r.action.kind === "blocked_by_secret") {
      process.stderr.write(`team share BLOCKED: ${r.action.reason}\n`);
      return 2;
    }
    if (r.action.kind === "promote_to_l2") {
      process.stdout.write(
        `team share: ${r.rule_id} promoted (${r.action.reason}) → ${r.written_path}\n`,
      );
      return 0;
    }
    process.stdout.write(
      `team share: ${r.rule_id} ${r.action.kind} (${r.action.reason}); not written to team/\n`,
    );
    return 0;
  } catch (e) {
    process.stderr.write(`team share failed: ${(e as Error).message}\n`);
    return 1;
  }
}
