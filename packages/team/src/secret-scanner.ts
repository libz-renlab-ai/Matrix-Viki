/**
 * Gate 1 of the share pipeline: regex-based secret detection. Hits are
 * always blocking — no override, even with --scope=team. Patterns mirror
 * Matrix-Lucky's M5 scanner (well-known secret prefixes + private network
 * addresses + absolute home directory paths that leak machine identity).
 *
 * Tuning principle: false positives are OK (user can rewrite the rule);
 * false negatives are catastrophic (a token gets pushed to git).
 */

import type { SecretMatch } from "./types.js";

interface Pattern {
  kind: string;
  re: RegExp;
}

const PATTERNS: Pattern[] = [
  { kind: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: "github-pat", re: /\bghp_[A-Za-z0-9]{36}\b/g },
  { kind: "github-server-pat", re: /\bghs_[A-Za-z0-9]{36}\b/g },
  { kind: "github-oauth", re: /\bgho_[A-Za-z0-9]{36}\b/g },
  // OpenAI keys come in classic (sk-<48 alnum>) and project (sk-proj-<...>) shapes.
  // Allow underscores + hyphens in the body so sk-proj-<group>-<rand> also matches.
  { kind: "openai-key", re: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { kind: "anthropic-key", re: /\bsk-ant-[A-Za-z0-9-]{40,}\b/g },
  { kind: "google-api-key", re: /\bAIza[0-9A-Za-z\-_]{35}\b/g },
  { kind: "slack-token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { kind: "jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { kind: "private-ip-v4", re: /\b(?:10|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}\b/g },
  {
    kind: "private-url",
    re: /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|[a-z0-9-]+\.local|[a-z0-9-]+\.internal)\b/gi,
  },
  {
    kind: "absolute-home",
    re: /(?:\/Users\/[A-Za-z0-9._-]+|\/home\/[A-Za-z0-9._-]+|C:\\Users\\[A-Za-z0-9._-]+)/g,
  },
];

export function scanForSecrets(text: string): SecretMatch[] {
  const out: SecretMatch[] = [];
  for (const { kind, re } of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const hit = m[0];
      const preview = hit.length > 8 ? hit.slice(0, 8) + "…" : hit;
      out.push({ kind, preview, span: [m.index, m.index + hit.length] });
      if (m.index === re.lastIndex) re.lastIndex++; // zero-width safety
    }
  }
  return out;
}
