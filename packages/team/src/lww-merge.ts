/**
 * Last-Write-Wins merge for team-rule files. For each rule_id, pick the
 * claim with the max ISO-8601 timestamp. The `original_author` comes from
 * the file's top-level `author` field — that's the lineage anchor and
 * never changes even when subsequent claims come from other users.
 *
 * A claim with `deleted: true` marks the rule as a tombstone; sync --apply
 * sees `state: "tombstone"` and calls store.delete(rule_id) instead of
 * inserting.
 */

import type { TeamRuleClaim, TeamRuleFile } from "./types.js";

export interface MergeResult {
  rule_id: string;
  state: "alive" | "tombstone";
  winner: TeamRuleClaim;
  /** Lineage anchor from the file's immutable `author` field. */
  original_author: string;
}

export function mergeLwwBatch(files: TeamRuleFile[]): Map<string, MergeResult> {
  const out = new Map<string, MergeResult>();
  for (const f of files) {
    const winner = pickLatest(f.claims);
    if (!winner) continue;
    out.set(f.rule_id, {
      rule_id: f.rule_id,
      state: winner.deleted ? "tombstone" : "alive",
      winner,
      original_author: f.author,
    });
  }
  return out;
}

function pickLatest(claims: TeamRuleClaim[]): TeamRuleClaim | null {
  let best: TeamRuleClaim | null = null;
  for (const c of claims) {
    if (!best || c.timestamp > best.timestamp) best = c;
  }
  return best;
}
