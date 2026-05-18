/**
 * Gate 2 of the share pipeline: heuristic classifier for personal vs
 * team-shareable rules. NOT an LLM — just keyword regex. Designed to be
 * conservative: if the signal is mixed or absent, return "uncertain" so
 * the caller's decideShareAction defaults to personal.
 *
 * Trade-off: a rule with no personal/shareable keywords is held back from
 * git unless the user explicitly says --scope=team. That's the safe default.
 */

import type { ScopeResult } from "./types.js";

const PERSONAL_SIGNALS: RegExp[] = [
  /\bmy\s+(machine|laptop|computer|setup|config|env|api[ _-]?key|token)\b/i,
  /\bmine\b/i,
  /\bjust\s+for\s+me\b/i,
  /\bdon'?t\s+share\b/i,
  /\bpersonal\b/i,
  /\b(my|local)\s+\.env\b/i,
];

const SHAREABLE_SIGNALS: RegExp[] = [
  /\b(team|our|we)\s+(should|must|always|never)\b/i,
  /\bteam\s+convention\b/i,
  /\bproject\s+rule\b/i,
  /\bsop\b/i,
  /\bstandard\s+operating\b/i,
  /\bcoding\s+standard\b/i,
  /\bevery(one|body)\s+(should|must)\b/i,
];

export function classifyScope(text: string): ScopeResult {
  const personalHits = PERSONAL_SIGNALS.filter((re) => re.test(text)).length;
  const shareableHits = SHAREABLE_SIGNALS.filter((re) => re.test(text)).length;

  if (personalHits > 0 && shareableHits === 0) {
    return {
      class: "personal",
      reason: `personal-signal-hits=${personalHits}`,
    };
  }
  if (shareableHits > 0 && personalHits === 0) {
    return {
      class: "shareable",
      reason: `shareable-signal-hits=${shareableHits}`,
    };
  }
  return {
    class: "uncertain",
    reason: `personal=${personalHits} shareable=${shareableHits}`,
  };
}
