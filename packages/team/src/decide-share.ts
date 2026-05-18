/**
 * Decision function combining the two share gates plus the optional user
 * override. Rules:
 *
 *  1. Any secret hit → blocked, even with --scope=team. Non-overridable.
 *  2. User override beats classifier (when no secrets).
 *  3. Classifier resolves shareable | personal.
 *  4. Uncertain → uncertain_held (caller writes to personal KB only, not
 *     to the team file). The conservative default.
 */

import type { ScopeResult, SecretMatch, ShareDecision } from "./types.js";

export interface DecideShareInput {
  scan: SecretMatch[];
  classification: ScopeResult;
  userOverride?: "personal" | "team";
}

export function decideShareAction(input: DecideShareInput): ShareDecision {
  if (input.scan.length > 0) {
    const kinds = input.scan.map((s) => s.kind).join(", ");
    return {
      kind: "blocked_by_secret",
      reason: `${input.scan.length} secret pattern hit(s): ${kinds}`,
      matches: input.scan,
    };
  }
  if (input.userOverride === "personal") {
    return {
      kind: "demoted_to_personal",
      reason: "user override --scope=personal",
    };
  }
  if (input.userOverride === "team") {
    return {
      kind: "promote_to_l2",
      reason: "user override --scope=team",
    };
  }
  if (input.classification.class === "shareable") {
    return {
      kind: "promote_to_l2",
      reason: `classifier:${input.classification.reason}`,
    };
  }
  if (input.classification.class === "personal") {
    return {
      kind: "demoted_to_personal",
      reason: `classifier:${input.classification.reason}`,
    };
  }
  return {
    kind: "uncertain_held",
    reason: `classifier:uncertain (${input.classification.reason})`,
  };
}
