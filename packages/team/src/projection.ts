/**
 * Projection layer: TeamRuleFile ↔ minimal record suitable for the existing
 * KB API. We intentionally do NOT import @viki/types here — instead we
 * return a small "TeamKnowledgeRecord" shape that adapters/team will map
 * to whatever the local KB expects. This keeps @viki/team pure and
 * dependency-free at the engine layer (constraint: don't touch rule engine).
 */

import type { MergeResult } from "./lww-merge.js";
import type { TeamRuleFile } from "./types.js";

/**
 * Minimal shape the adapter will insert/update in the KB. Designed so the
 * adapter can map it to the local KnowledgeEntry shape without exposing
 * the team package to engine types.
 */
export interface TeamKnowledgeRecord {
  id: string;
  content: string;
  confidence: number;
  /** Marker tags for attribution: `viki-team-sync`, `original-author:<name>` */
  tags: string[];
  /** Scope marker so query layers can distinguish team-sourced rules. */
  scope_level: "team";
  /** ISO timestamp from the winning LWW claim. */
  source_timestamp: string;
}

export function teamRuleToRecord(m: MergeResult): TeamKnowledgeRecord {
  return {
    id: m.rule_id,
    content: m.winner.content,
    confidence: m.winner.confidence,
    tags: ["viki-team-sync", `original-author:${m.original_author}`],
    scope_level: "team",
    source_timestamp: m.winner.timestamp,
  };
}

/**
 * Build a fresh TeamRuleFile from local KB content + author. Used by
 * team-share to convert a personal rule into the team file format before
 * writing to .viki/team/<author>/<rule_id>.json.
 */
export function newTeamRuleFile(args: {
  ruleId: string;
  author: string;
  content: string;
  confidence: number;
  now: string;
}): TeamRuleFile {
  const claim = {
    author: args.author,
    timestamp: args.now,
    content: args.content,
    confidence: args.confidence,
    deleted: false,
  };
  return {
    rule_id: args.ruleId,
    author: args.author,
    current: {
      content: args.content,
      confidence: args.confidence,
      timestamp: args.now,
      deleted: false,
    },
    claims: [claim],
  };
}

/**
 * Append a new claim to an existing TeamRuleFile (e.g., bob re-shares a
 * rule alice originally authored). Preserves the original_author lineage
 * via the file's immutable top-level `author` field.
 */
export function appendClaim(
  file: TeamRuleFile,
  claimer: string,
  content: string,
  confidence: number,
  now: string,
  deleted = false,
): TeamRuleFile {
  const claim = {
    author: claimer,
    timestamp: now,
    content,
    confidence,
    deleted,
  };
  return {
    rule_id: file.rule_id,
    author: file.author, // lineage anchor — NEVER change this on append
    current: { content, confidence, timestamp: now, deleted },
    claims: [...file.claims, claim],
  };
}
