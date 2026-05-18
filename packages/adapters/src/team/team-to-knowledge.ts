/**
 * Bridge between @viki/team's MergeResult and the existing
 * `KnowledgeEntry` shape consumed by `DualLayerStore.add`. Lives in
 * adapters (not in @viki/team) because it depends on @viki/types — keeps
 * @viki/team pure / engine-free per the additive-only constraint.
 */

import type { MergeResult } from "@viki/team";
import type { KnowledgeEntry } from "@viki/types";

export interface BuildOptions {
  /** ISO 8601; defaults to merge-result winner.timestamp. */
  now?: string;
}

/**
 * Build a minimal-but-valid KnowledgeEntry from a team-rule merge result.
 * Marks scope.level=team so DualLayerStore routes it to the project store.
 * Tags `viki-team-sync` + `original-author:<name>` preserve attribution.
 *
 * Defaults match the KnowledgeEntrySchema's `default(...)` clauses so the
 * resulting record satisfies the schema even without z.parse normalization.
 */
export function buildKnowledgeEntryFromMerge(
  m: MergeResult,
  opts: BuildOptions = {},
): KnowledgeEntry {
  const now = opts.now ?? m.winner.timestamp;
  return {
    id: m.rule_id,
    scope: { level: "team" },
    category: "E",
    tags: ["viki-team-sync", `original-author:${m.original_author}`],
    type: "practice",
    nature: "subjective",
    trigger: m.winner.content.slice(0, 200),
    wrong_pattern: "",
    correct_pattern: m.winner.content,
    reasoning: `Team rule shared by ${m.original_author}; latest claim by ${m.winner.author}`,
    confidence: m.winner.confidence,
    enforcement: enforcementFor(m.winner.confidence),
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: {
      success_sessions: 0,
      success_users: 0,
      correction_sessions: 0,
    },
    created_at: now,
    last_hit_at: "",
    last_validated_at: "",
    source: "team-shared",
    conflict_with: [],
    current_tier: "experimental",
    max_tier_ever: "experimental",
    tier_entered_at: now,
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
  } as KnowledgeEntry;
}

function enforcementFor(conf: number): "block" | "warn" | "suggest" | "passive" {
  if (conf < 0.5) return "passive";
  if (conf < 0.7) return "suggest";
  if (conf < 0.9) return "warn";
  // Cap at warn for subjective team-shared rules (mirrors core.computeEnforcement)
  return "warn";
}
