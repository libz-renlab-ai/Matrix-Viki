/**
 * Shared types for the @viki/team package — pure schema, zero IO.
 *
 * Designed to be byte-compatible with Matrix-Lucky's M5 `TeamRuleFile`
 * shape so the two systems could theoretically read each other's
 * .viki/team/<author>/<rule_id>.json files in the future. We use `.viki/`
 * prefix where Matrix-Lucky uses `.teamagent/` — that's the only structural
 * difference at the data layer.
 */

export interface TeamRuleClaim {
  author: string;
  timestamp: string;
  content: string;
  confidence: number;
  deleted: boolean;
}

export interface TeamRuleFile {
  rule_id: string;
  /** Original author (lineage). Immutable after first claim. */
  author: string;
  /** LWW-resolved current state — convenience snapshot of the latest claim. */
  current: {
    content: string;
    confidence: number;
    timestamp: string;
    deleted: boolean;
  };
  /** All writes, append-only. LWW takes the max-timestamp claim. */
  claims: TeamRuleClaim[];
}

export interface Manifest {
  schema_version: 1;
  viki_version: string;
  created_at: string;
  infected_by: string;
}

export interface SecretMatch {
  kind: string;
  /** Redacted preview (first 8 chars + ellipsis). */
  preview: string;
  span: [number, number];
}

export type ScopeClassification = "personal" | "shareable" | "uncertain";

export interface ScopeResult {
  class: ScopeClassification;
  reason: string;
}

export type ShareDecision =
  | { kind: "promote_to_l2"; reason: string }
  | { kind: "blocked_by_secret"; reason: string; matches: SecretMatch[] }
  | { kind: "demoted_to_personal"; reason: string }
  | { kind: "uncertain_held"; reason: string };
