# Team Rule Propagation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port Matrix-Lucky's M5 team rule propagation system to Matrix-Viki as a **purely additive** feature. After this plan lands, a `viki` user can share a rule from their personal KB to a git remote, and any teammate who `git pull`s automatically gets the rule applied to their local KB. Two safety gates (secret scanner + scope classifier) keep private content from leaking, and LWW merge with author lineage handles conflicts.

**Architecture (5 layers, attacked bottom-up):**

```
┌──────────────────────────────────────────────────────────────────────┐
│  Layer 5: CLI dispatch  — bin.ts: `viki team <sub>` namespace        │
├──────────────────────────────────────────────────────────────────────┤
│  Layer 4: Commands     — team-{share,sync,publish,infect,            │
│                          bootstrap,status,delete,export,import}.ts   │
├──────────────────────────────────────────────────────────────────────┤
│  Layer 3: Adapters     — FsTeamRuleStore (fs-backed per-rule files)  │
├──────────────────────────────────────────────────────────────────────┤
│  Layer 2: Pure core    — @viki/team package: schema, secret-scanner, │
│                          scope-classifier, lww-merge, decide-share,  │
│                          path-safety, manifest, projection           │
├──────────────────────────────────────────────────────────────────────┤
│  Layer 1: Git transit  — .githooks/post-merge + manifest + git push  │
└──────────────────────────────────────────────────────────────────────┘
```

**Hard constraints (per user directive):**
1. **Additive only.** New package `@viki/team`, new CLI namespace `viki team <sub>`, new file paths under `.viki/team/...`. **Zero edits** to `@viki/types`, `@viki/ports`, `@viki/core` rule logic.
2. **Reuse existing KB API.** Read/write via the existing `DualLayerStore` from `@viki/adapters` (its `add` / `update` / `delete` public API). No internal KB mutations.
3. **No new dependencies.** Use built-ins (`node:fs`, `node:crypto`, `node:child_process`) only.

**Tech Stack:** TypeScript / Node 22 / vitest / pnpm workspace / tsup CJS bundling / existing `DualLayerStore` from `@viki/adapters` / git CLI (via `execSync`).

---

## File Structure

**New package: `packages/team/`** (pure core, zero IO)
```
packages/team/
├── package.json                    name: "@viki/team", private, no deps
├── tsconfig.json                   extends ../../tsconfig.base.json
├── src/
│   ├── index.ts                    barrel re-exports
│   ├── types.ts                    TeamRuleFile, TeamRuleClaim, Manifest, ShareAction
│   ├── path-safety.ts              isSafeRuleId, isSafeAuthor, Windows MAX_PATH
│   ├── secret-scanner.ts           scanForSecrets — regex pack for keys/tokens/IPs
│   ├── scope-classifier.ts         classifyScope — heuristic personal/shareable/uncertain
│   ├── decide-share.ts             decideShareAction({scan, classification, userOverride})
│   ├── lww-merge.ts                mergeLwwBatch — author lineage + timestamp wins
│   ├── manifest.ts                 manifest read/write/validate
│   ├── projection.ts               teamRuleToKnowledgeEntry, knowledgeEntryToTeamRule
│   └── __tests__/                  unit tests per module
```

**New adapter: `packages/adapters/src/team/`**
```
packages/adapters/src/team/
├── fs-team-rule-store.ts           list / read / write JSON files at .viki/team/<author>/<rule_id>.json
└── __tests__/fs-team-rule-store.test.ts
```

**New CLI commands: `packages/cli/src/commands/`**
```
team.ts                             dispatcher: viki team <sub> [...args]
team-share.ts                       A: write rule to .viki/team/<author>/<rule_id>.json
team-sync.ts                        B: read team/ → LWW → optionally --apply to KB
team-publish.ts                     git add + commit + [--push]
team-infect.ts                      write manifest + .githooks/post-merge + git config core.hooksPath
team-bootstrap.ts                   first-time clone: detect manifest, run sync --apply
team-status.ts                      summary: rule count, author distribution, last sync
team-delete.ts                      write tombstone (LWW-safe deletion)
team-export.ts                      bundle path: dump all KB rules to team-rules.json
team-import.ts                      bundle path: load team-rules.json into KB
```

**New static asset:**
```
scripts/team/githooks/post-merge    sh template that team-infect copies into .githooks/
scripts/team/githooks/README.md     explain the hook
```

**New tests at CLI layer:**
```
packages/cli/src/__tests__/team-share.test.ts
packages/cli/src/__tests__/team-sync.test.ts
packages/cli/src/__tests__/team-publish.test.ts
packages/cli/src/__tests__/team-infect.test.ts
packages/cli/src/__tests__/team-export-import.test.ts
packages/cli/src/__tests__/team-e2e-sandbox.test.ts   end-to-end dual-HOME via bare git
```

**Modify (the ONLY edits to existing code):**
- `packages/cli/src/bin.ts` — register `team` subcommand (one new case statement)
- `pnpm-workspace.yaml` — already covers `packages/*`, no edit needed
- `package.json` — already has `pnpm -r build`, no edit needed

---

## Data Schema

### `.viki/team/<author>/<rule_id>.json` — per-rule file
```typescript
interface TeamRuleClaim {
  author: string;             // git user.name of the claimant
  timestamp: string;          // ISO 8601
  content: string;            // rule text body
  confidence: number;         // 0..1
  deleted: boolean;           // tombstone marker
}

interface TeamRuleFile {
  rule_id: string;            // [A-Za-z0-9._-]{1,200}
  author: string;             // ORIGINAL author (lineage; immutable after first claim)
  current: {                  // LWW-resolved current state
    content: string;
    confidence: number;
    timestamp: string;
    deleted: boolean;
  };
  claims: TeamRuleClaim[];    // all writes, append-only
}
```

### `.viki/manifest.json` — "this repo is a Viki team project"
```typescript
interface Manifest {
  schema_version: 1;
  viki_version: string;       // from packages/viki/package.json at infect time
  created_at: string;         // ISO 8601
  infected_by: string;        // git user.name of first infector
}
```

### `.viki/team-rules.json` — bundle path (team-export/import)
```typescript
interface TeamBundle {
  schema_version: 1;
  exported_at: string;
  entries: KnowledgeEntry[];  // existing @viki/types shape
}
```

---

## Phase Breakdown (for prioritization)

| Phase | Tasks | What ships | LOC est. |
|-------|-------|-----------|----------|
| **A. Foundation** | 1–5 | Package skeleton, types, path-safety, secret-scanner, scope-classifier, decide-share | ~400 |
| **B. Storage + projection** | 6–8 | LWW-merge, FsTeamRuleStore, projection helpers | ~350 |
| **C. Bundle path** | 9 | team-export / team-import (the easy bundle API) | ~250 |
| **D. Per-rule pipeline** | 10–12 | team-share / team-sync / team-publish | ~500 |
| **E. Viral infect** | 13–16 | team-infect / team-bootstrap / team-status / team-delete / post-merge hook | ~400 |
| **F. CLI dispatch + tests** | 17–18 | team dispatcher, bin.ts wiring, e2e sandbox test | ~250 |
| **G. Docs** | 19 | README section + docs/team-propagation.md | ~150 |

**Total: ~2300 LOC including tests.**

---

## Task 1 — Package skeleton + types

**Files:**
- Create: `packages/team/package.json`
- Create: `packages/team/tsconfig.json`
- Create: `packages/team/src/index.ts`
- Create: `packages/team/src/types.ts`

### `packages/team/package.json`
```json
{
  "name": "@viki/team",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "build": "echo skip",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

### `packages/team/tsconfig.json`
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*.ts"]
}
```

### `packages/team/src/types.ts`
```typescript
export interface TeamRuleClaim {
  author: string;
  timestamp: string;
  content: string;
  confidence: number;
  deleted: boolean;
}

export interface TeamRuleFile {
  rule_id: string;
  author: string;
  current: {
    content: string;
    confidence: number;
    timestamp: string;
    deleted: boolean;
  };
  claims: TeamRuleClaim[];
}

export interface Manifest {
  schema_version: 1;
  viki_version: string;
  created_at: string;
  infected_by: string;
}

export type ShareDecision =
  | { kind: "promote_to_l2"; reason: string }
  | { kind: "blocked_by_secret"; reason: string; matches: SecretMatch[] }
  | { kind: "demoted_to_personal"; reason: string }
  | { kind: "uncertain_held"; reason: string };

export interface SecretMatch {
  kind: string;
  preview: string;
  span: [number, number];
}

export type ScopeClassification = "personal" | "shareable" | "uncertain";
```

### `packages/team/src/index.ts`
```typescript
export * from "./types.js";
export * from "./path-safety.js";
export * from "./secret-scanner.js";
export * from "./scope-classifier.js";
export * from "./decide-share.js";
export * from "./lww-merge.js";
export * from "./manifest.js";
export * from "./projection.js";
```

**Commit:** `feat(team): @viki/team package skeleton + core types`

---

## Task 2 — path-safety

**Files:**
- Create: `packages/team/src/path-safety.ts`
- Create: `packages/team/src/__tests__/path-safety.test.ts`

```typescript
// path-safety.ts
const SAFE_RULE_ID_RE = /^[A-Za-z0-9._-]{1,200}$/;
const SAFE_AUTHOR_RE = /^[A-Za-z0-9._-]{1,100}$/;
export const WINDOWS_MAX_PATH_BUDGET = 250;

export function isSafeRuleId(id: string): boolean { return SAFE_RULE_ID_RE.test(id); }
export function isSafeAuthor(a: string): boolean { return SAFE_AUTHOR_RE.test(a); }

export function estimateTeamRulePathLength(root: string, author: string, ruleId: string): number {
  // path = <root>/.viki/team/<author>/<rule_id>.json
  return root.length + "/.viki/team/".length + author.length + 1 + ruleId.length + ".json".length;
}

export function isTeamRulePathLengthSafe(root: string, author: string, ruleId: string): boolean {
  return estimateTeamRulePathLength(root, author, ruleId) <= WINDOWS_MAX_PATH_BUDGET;
}
```

Tests: cover SAFE_RULE_ID_RE boundaries (200-char OK, 201 fails, dot/dash/underscore OK, `/` fails, `..` fails), author boundaries, MAX_PATH (root + 240-char ruleId fails, short fits).

**Commit:** `feat(team): path safety (rule_id / author regex + Windows MAX_PATH budget)`

---

## Task 3 — secret-scanner

**Files:**
- Create: `packages/team/src/secret-scanner.ts`
- Create: `packages/team/src/__tests__/secret-scanner.test.ts`

Regex pack (mirror Matrix-Lucky's `secret-scanner.ts` but rewrite for clarity):

```typescript
import type { SecretMatch } from "./types.js";

interface Pattern { kind: string; re: RegExp; }

const PATTERNS: Pattern[] = [
  { kind: "aws-access-key",    re: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: "aws-secret",        re: /\b[A-Za-z0-9/+=]{40}\b/g },         // weak; only matches if context-flagged
  { kind: "github-pat",        re: /\bghp_[A-Za-z0-9]{36}\b/g },
  { kind: "github-server-pat", re: /\bghs_[A-Za-z0-9]{36}\b/g },
  { kind: "openai-key",        re: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { kind: "anthropic-key",     re: /\bsk-ant-[A-Za-z0-9-]{40,}\b/g },
  { kind: "google-api-key",    re: /\bAIza[0-9A-Za-z\-_]{35}\b/g },
  { kind: "slack-token",       re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { kind: "jwt",               re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { kind: "private-ip-v4",     re: /\b(?:10|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}\b/g },
  { kind: "private-url",       re: /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|[a-z0-9-]+\.local|[a-z0-9-]+\.internal)\b/gi },
  { kind: "absolute-home",     re: /\/Users\/[A-Za-z0-9._-]+|\/home\/[A-Za-z0-9._-]+|C:\\Users\\[A-Za-z0-9._-]+/g },
];

export function scanForSecrets(text: string): SecretMatch[] {
  const out: SecretMatch[] = [];
  for (const { kind, re } of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const preview = m[0].slice(0, 8) + "…";
      out.push({ kind, preview, span: [m.index, m.index + m[0].length] });
    }
  }
  return out;
}
```

Tests: positive case per pattern, negative case (clean rule text returns []), preview redacts after 8 chars, span correct.

**Commit:** `feat(team): regex-based secret scanner (gate 1)`

---

## Task 4 — scope-classifier

**Files:**
- Create: `packages/team/src/scope-classifier.ts`
- Create: `packages/team/src/__tests__/scope-classifier.test.ts`

Heuristic (no LLM) — keyword-based personal/shareable signal:

```typescript
import type { ScopeClassification } from "./types.js";

const PERSONAL_SIGNALS = [
  /\bmy\s+(machine|laptop|computer|setup|config|env)\b/i,
  /\bmine\b/i,
  /\bjust\s+for\s+me\b/i,
  /\bdon'?t\s+share\b/i,
  /\bpersonal\b/i,
  /\b(my|local)\s+\.env\b/i,
];

const SHAREABLE_SIGNALS = [
  /\b(team|our|we)\s+(should|must|always|never)\b/i,
  /\bteam\s+convention\b/i,
  /\bproject\s+rule\b/i,
  /\bsop\b|standard\s+operating\b/i,
];

export function classifyScope(text: string): { class: ScopeClassification; reason: string } {
  const personalHits = PERSONAL_SIGNALS.filter((re) => re.test(text)).length;
  const shareableHits = SHAREABLE_SIGNALS.filter((re) => re.test(text)).length;
  if (personalHits > 0 && shareableHits === 0) {
    return { class: "personal", reason: `personal-signal-hits=${personalHits}` };
  }
  if (shareableHits > 0 && personalHits === 0) {
    return { class: "shareable", reason: `shareable-signal-hits=${shareableHits}` };
  }
  // Conflicting or no signal → uncertain. Caller (decide-share) defaults uncertain → personal.
  return { class: "uncertain", reason: `personal=${personalHits} shareable=${shareableHits}` };
}
```

Tests: clear personal text → personal, clear team text → shareable, neutral text → uncertain.

**Commit:** `feat(team): heuristic scope classifier (gate 2, uncertain→personal default)`

---

## Task 5 — decide-share

**Files:**
- Create: `packages/team/src/decide-share.ts`
- Create: `packages/team/src/__tests__/decide-share.test.ts`

```typescript
import type { ShareDecision, SecretMatch, ScopeClassification } from "./types.js";

export interface DecideShareInput {
  scan: SecretMatch[];
  classification: { class: ScopeClassification; reason: string };
  userOverride?: "personal" | "team";
}

export function decideShareAction(input: DecideShareInput): ShareDecision {
  // Gate 1: any secret hit → blocked, regardless of override
  if (input.scan.length > 0) {
    return {
      kind: "blocked_by_secret",
      reason: `${input.scan.length} secret pattern hit(s): ${input.scan.map((s) => s.kind).join(", ")}`,
      matches: input.scan,
    };
  }
  // User override wins (when no secrets)
  if (input.userOverride === "personal") {
    return { kind: "demoted_to_personal", reason: "user override --scope=personal" };
  }
  if (input.userOverride === "team") {
    return { kind: "promote_to_l2", reason: "user override --scope=team" };
  }
  // Gate 2: classifier
  if (input.classification.class === "shareable") {
    return { kind: "promote_to_l2", reason: `classifier:${input.classification.reason}` };
  }
  if (input.classification.class === "personal") {
    return { kind: "demoted_to_personal", reason: `classifier:${input.classification.reason}` };
  }
  // uncertain → personal (conservative default)
  return { kind: "uncertain_held", reason: `classifier:uncertain (${input.classification.reason})` };
}
```

Tests: secret blocks even with team override, override beats classifier, classifier resolves shareable/personal, uncertain → uncertain_held.

**Commit:** `feat(team): decideShareAction — 2-gate share/personal/blocked decision`

---

## Task 6 — lww-merge

**Files:**
- Create: `packages/team/src/lww-merge.ts`
- Create: `packages/team/src/__tests__/lww-merge.test.ts`

```typescript
import type { TeamRuleFile, TeamRuleClaim } from "./types.js";

export interface MergeResult {
  rule_id: string;
  state: "alive" | "tombstone";
  winner: TeamRuleClaim;
  original_author: string;  // lineage from oldest claim
}

/**
 * For each rule_id, pick the claim with the latest timestamp (LWW). The
 * original_author comes from the file's `author` field (immutable lineage
 * preserved across re-shares by different authors).
 */
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
```

Tests: 2 claims same rule_id → latest wins; deleted claim → tombstone state; empty claims → omitted; multiple files → all merged.

**Commit:** `feat(team): LWW merge with author lineage preservation`

---

## Task 7 — FsTeamRuleStore

**Files:**
- Create: `packages/adapters/src/team/fs-team-rule-store.ts`
- Create: `packages/adapters/src/team/__tests__/fs-team-rule-store.test.ts`

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import type { TeamRuleFile } from "@viki/team";
import { isSafeAuthor, isSafeRuleId } from "@viki/team";

export interface SkipEntry { path: string; reason: string; }

export class FsTeamRuleStore {
  private teamDir(projectRoot: string): string {
    return path.join(projectRoot, ".viki", "team");
  }

  async listAll(
    projectRoot: string,
    opts: { onSkip?: (e: SkipEntry) => void } = {},
  ): Promise<TeamRuleFile[]> {
    const root = this.teamDir(projectRoot);
    if (!fs.existsSync(root)) return [];
    const out: TeamRuleFile[] = [];
    for (const author of fs.readdirSync(root)) {
      if (!isSafeAuthor(author)) {
        opts.onSkip?.({ path: path.join(root, author), reason: `unsafe author "${author}"` });
        continue;
      }
      const dir = path.join(root, author);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith(".json")) continue;
        const ruleId = file.slice(0, -".json".length);
        if (!isSafeRuleId(ruleId)) {
          opts.onSkip?.({ path: path.join(dir, file), reason: `unsafe rule_id "${ruleId}"` });
          continue;
        }
        const full = path.join(dir, file);
        try {
          const raw = fs.readFileSync(full, "utf-8");
          const parsed = JSON.parse(raw) as TeamRuleFile;
          if (!parsed.rule_id || !Array.isArray(parsed.claims)) {
            opts.onSkip?.({ path: full, reason: "schema violation: missing rule_id or claims" });
            continue;
          }
          out.push(parsed);
        } catch (e) {
          opts.onSkip?.({ path: full, reason: `JSON parse error: ${(e as Error).message}` });
        }
      }
    }
    return out;
  }

  async write(projectRoot: string, file: TeamRuleFile): Promise<string> {
    if (!isSafeAuthor(file.author) || !isSafeRuleId(file.rule_id)) {
      throw new Error(`unsafe author/rule_id: ${file.author}/${file.rule_id}`);
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
```

Tests: list empty → []; list 2 authors × 2 rules → 4; corrupt JSON skipped + onSkip called; unsafe author dir skipped; write creates parent dir + atomic tmp+rename.

**Commit:** `feat(adapters): FsTeamRuleStore — fs-backed per-rule TeamRuleFile store`

---

## Task 8 — projection (TeamRuleFile <-> KnowledgeEntry)

**Files:**
- Create: `packages/team/src/projection.ts`
- Create: `packages/team/src/__tests__/projection.test.ts`

```typescript
import type { TeamRuleFile, MergeResult } from "./types.js";
import type { KnowledgeEntry } from "@viki/types";

/**
 * Project a merged team-rule (LWW winner + lineage) into a KnowledgeEntry
 * that can be inserted via DualLayerStore.add. Marks scope.level=team and
 * tags original-author for attribution chains.
 */
export function teamRuleToKnowledgeEntry(m: MergeResult): KnowledgeEntry {
  return {
    id: m.rule_id,
    trigger: m.winner.content.slice(0, 200),
    wrong_pattern: "",
    correct_pattern: m.winner.content,
    reasoning: `Team rule shared by ${m.original_author}`,
    tags: ["viki-team-sync", `original-author:${m.original_author}`],
    confidence: m.winner.confidence,
    scope: { level: "team" } as any, // existing KnowledgeEntry.scope shape (extend if needed)
    // Other fields use store defaults; minimal shape for additive insertion.
  } as KnowledgeEntry;
}

/**
 * Inverse: given a KnowledgeEntry and an author, build a TeamRuleFile with a
 * single initial claim. Used by team-share to convert local KB → team file.
 */
export function knowledgeEntryToTeamRule(
  entry: KnowledgeEntry,
  author: string,
  now: string,
): TeamRuleFile {
  const claim = {
    author,
    timestamp: now,
    content: entry.correct_pattern || entry.trigger,
    confidence: entry.confidence ?? 0.85,
    deleted: false,
  };
  return {
    rule_id: entry.id,
    author,
    current: { ...claim },
    claims: [claim],
  };
}
```

Tests: round-trip team-rule → KnowledgeEntry → team-rule preserves rule_id + content + author; tags include original-author.

**Commit:** `feat(team): TeamRuleFile <-> KnowledgeEntry projection`

---

## Task 9 — manifest

**Files:**
- Create: `packages/team/src/manifest.ts`
- Create: `packages/team/src/__tests__/manifest.test.ts`

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import type { Manifest } from "./types.js";

export function manifestPath(projectRoot: string): string {
  return path.join(projectRoot, ".viki", "manifest.json");
}

export function readManifest(projectRoot: string): Manifest | null {
  const p = manifestPath(projectRoot);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw) as Partial<Manifest>;
    if (parsed.schema_version !== 1 || typeof parsed.viki_version !== "string") return null;
    return parsed as Manifest;
  } catch {
    return null;
  }
}

export function writeManifest(projectRoot: string, m: Manifest): string {
  const p = manifestPath(projectRoot);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  fs.writeFileSync(tmp, JSON.stringify(m, null, 2) + "\n", "utf-8");
  fs.renameSync(tmp, p);
  return p;
}
```

Tests: round-trip, missing returns null, malformed returns null.

**Commit:** `feat(team): manifest.json read/write`

---

## Task 10 — team-export / team-import (bundle path)

**Files:**
- Create: `packages/cli/src/commands/team-export.ts`
- Create: `packages/cli/src/commands/team-import.ts`
- Create: `packages/cli/src/__tests__/team-export-import.test.ts`

Implements `viki team export --out <path>` and `viki team import --file <path>`. Dumps `KnowledgeEntry[]` from the project KB into a `TeamBundle` JSON; import reads + inserts via `DualLayerStore.add` (skip dup by id).

```typescript
// team-export.ts
import * as fs from "node:fs";
import * as path from "node:path";
import { DualLayerStore } from "@viki/adapters";
import type { KnowledgeEntry } from "@viki/types";

export interface TeamExportOptions { cwd: string; outPath?: string; now?: string; }

export function runTeamExport(opts: TeamExportOptions): { written: string; count: number } {
  const out = opts.outPath ?? path.join(opts.cwd, ".viki", "team-rules.json");
  const dbPath = path.join(opts.cwd, ".viki", "knowledge.db");
  if (!fs.existsSync(dbPath)) throw new Error(`no project KB at ${dbPath}`);
  const store = new DualLayerStore({ projectDbPath: dbPath, userGlobalDbPath: dbPath });
  const entries: KnowledgeEntry[] = store.listAll(); // existing public API
  const bundle = {
    schema_version: 1 as const,
    exported_at: opts.now ?? new Date().toISOString(),
    entries,
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(bundle, null, 2) + "\n", "utf-8");
  return { written: out, count: entries.length };
}
```

Mirror shape for `team-import.ts` reading + calling `store.add(entry)` per row, returning `{ imported, skipped }`.

Tests: export → import round-trip restores 3 rules; import twice → second is no-op (skip-dup); import with corrupt file → throws.

**Commit:** `feat(team): bundle export/import (team-rules.json) — Phase 1 quick path`

---

## Task 11 — team-share command

**Files:**
- Create: `packages/cli/src/commands/team-share.ts`
- Create: `packages/cli/src/__tests__/team-share.test.ts`

`viki team share --text "..." [--rule-id X] [--author A] [--scope personal|team]`

Logic:
1. Validate inputs (path-safety, future-timestamp guard).
2. Run `scanForSecrets(text)` + `classifyScope(text)` + `decideShareAction({scan, classification, userOverride})`.
3. If `kind === "promote_to_l2"`:
   - Compute `rule_id` (provided or `sha256(text).slice(0,16)`).
   - Resolve `author` (provided or `git config user.name` or "unknown").
   - Read existing `.viki/team/<author>/<rule_id>.json` if present; preserve original lineage author.
   - Append new claim; write back via `FsTeamRuleStore.write`.
4. Return `{ rule_id, action, classification, written_path? }`.

Tests: secret blocks; uncertain held; team override promotes; existing file preserves original_author; written file passes round-trip.

**Commit:** `feat(team): team-share — A side writes rule to per-author file`

---

## Task 12 — team-sync command

**Files:**
- Create: `packages/cli/src/commands/team-sync.ts`
- Create: `packages/cli/src/__tests__/team-sync.test.ts`

`viki team sync [--apply]`

Logic:
1. `FsTeamRuleStore.listAll(cwd, {onSkip})` → collect files + skipped diagnostics.
2. `mergeLwwBatch(files)` → `Map<rule_id, MergeResult>`.
3. If `--apply`:
   - For each `MergeResult`:
     - If `state === "alive"`: `store.add(teamRuleToKnowledgeEntry(m))` (idempotent: skip if exists with same content).
     - If `state === "tombstone"`: `store.delete(rule_id)`.
4. Return summary `{ total_claims, merged: [...], applied?: {upserted, deleted, skipped}, skipped_files }`.

Tests: read 2 files → merge → apply writes to KB; tombstone deletes; corrupt file appears in skipped_files (not silent); dry-run (no --apply) doesn't touch KB.

**Commit:** `feat(team): team-sync — B side LWW merge + optional --apply to KB`

---

## Task 13 — team-publish command

**Files:**
- Create: `packages/cli/src/commands/team-publish.ts`
- Create: `packages/cli/src/__tests__/team-publish.test.ts`

`viki team publish [--push]`

Logic (mirror Matrix-Lucky's `m5-publish.ts` exactly, just rename prefix):
1. Filter `["team", ".viki/team", ".viki/manifest.json", ".githooks"]` to paths that exist.
2. `git status --porcelain -- <paths>` → if empty, return `{committed: false, reason: "no changes"}`.
3. `git add <paths>` + `git commit -m "[viki-sync] <summary>"`.
4. If `--push`: `git push` (best-effort; capture error in `push_error` field, don't throw).

Tests: no changes → no commit; with changes → commit happens; push failure captured in result.

**Commit:** `feat(team): team-publish — git add+commit+optional push, [viki-sync] prefix`

---

## Task 14 — team-infect command

**Files:**
- Create: `packages/cli/src/commands/team-infect.ts`
- Create: `packages/cli/src/__tests__/team-infect.test.ts`
- Create: `scripts/team/githooks/post-merge`
- Create: `scripts/team/githooks/README.md`

`viki team infect [--force]`

Logic:
1. If `.viki/manifest.json` already exists → return `{skipped: true, reason: "already infected"}`.
2. Read `core.hooksPath` via `git config --get core.hooksPath`:
   - If unset or `.githooks` → proceed.
   - Else (`.husky`/`.lefthook`/other): unless `--force`, return `{hookspath_blocked: true, hookspath_existing: <value>}` and stop.
3. Write `.viki/manifest.json` via `writeManifest`.
4. Copy `scripts/team/githooks/post-merge` → `.githooks/post-merge`, `chmod +x`.
5. `git config core.hooksPath .githooks`.

`scripts/team/githooks/post-merge`:
```bash
#!/usr/bin/env bash
# Auto-installed by `viki team infect`. Runs after every `git pull/merge`.
# Best-effort — never fail the merge.
( cd "$(git rev-parse --show-toplevel)" && viki team sync --apply >/dev/null 2>&1 ) || true
```

Tests: fresh infect writes 3 artifacts + sets git config; already-infected → skipped; pre-existing `.husky` blocks unless `--force`.

**Commit:** `feat(team): team-infect — viral install (manifest + .githooks + git config)`

---

## Task 15 — team-bootstrap command

**Files:**
- Create: `packages/cli/src/commands/team-bootstrap.ts`
- Create: `packages/cli/src/__tests__/team-bootstrap.test.ts`

`viki team bootstrap`

Logic: detect manifest exists → run `team-sync --apply` once → report.

Tests: with manifest + 2 team files → applies them; without manifest → returns `{skipped: true, reason: "not a viki team project"}`.

**Commit:** `feat(team): team-bootstrap — first-time clone catch-up`

---

## Task 16 — team-status + team-delete commands

**Files:**
- Create: `packages/cli/src/commands/team-status.ts`
- Create: `packages/cli/src/commands/team-delete.ts`
- Create: `packages/cli/src/__tests__/team-status-delete.test.ts`

`viki team status` — show count, author distribution, last git commit on `.viki/team/`, last sync timestamp.

`viki team delete <rule_id>` — append a tombstone claim (LWW-safe deletion):
```typescript
const file = await store.read(cwd, author, ruleId);
file.claims.push({ author: gitUserName(), timestamp: now, content: "", confidence: 0, deleted: true });
file.current = { content: "", confidence: 0, timestamp: now, deleted: true };
await store.write(cwd, file);
```

Tests: delete writes tombstone; status counts respect tombstones (state=tombstone).

**Commit:** `feat(team): team-status (summary) + team-delete (tombstone)`

---

## Task 17 — team dispatcher + bin.ts wiring

**Files:**
- Create: `packages/cli/src/commands/team.ts`
- Modify: `packages/cli/src/bin.ts` (one new case)

```typescript
// team.ts
export async function runTeamSubcommand(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv;
  switch (sub) {
    case "share":    { const { runTeamShareCli }    = await import("./team-share.js");    return runTeamShareCli(rest); }
    case "sync":     { const { runTeamSyncCli }     = await import("./team-sync.js");     return runTeamSyncCli(rest); }
    case "publish":  { const { runTeamPublishCli }  = await import("./team-publish.js");  return runTeamPublishCli(rest); }
    case "infect":   { const { runTeamInfectCli }   = await import("./team-infect.js");   return runTeamInfectCli(rest); }
    case "bootstrap":{ const { runTeamBootstrapCli }= await import("./team-bootstrap.js");return runTeamBootstrapCli(rest); }
    case "status":   { const { runTeamStatusCli }   = await import("./team-status.js");   return runTeamStatusCli(rest); }
    case "delete":   { const { runTeamDeleteCli }   = await import("./team-delete.js");   return runTeamDeleteCli(rest); }
    case "export":   { const { runTeamExportCli }   = await import("./team-export.js");   return runTeamExportCli(rest); }
    case "import":   { const { runTeamImportCli }   = await import("./team-import.js");   return runTeamImportCli(rest); }
    case "--help":
    case "-h":
    case undefined:  return printTeamHelp();
    default:         process.stderr.write(`Unknown subcommand: viki team ${sub}\n`); return 1;
  }
}
```

In `bin.ts` subcommand switch, add:
```typescript
case "team": {
  const { runTeamSubcommand } = await import("./commands/team.js");
  process.exit(await runTeamSubcommand(argv.slice(1)));
}
```

**Commit:** `feat(cli): viki team subcommand dispatcher + bin.ts registration`

---

## Task 18 — End-to-end sandbox test

**Files:**
- Create: `packages/cli/src/__tests__/team-e2e-sandbox.test.ts`

Simulates the full pipeline in an isolated tmp dir with two HOMEs (alice + bob) and a bare git repo as the "remote":

```typescript
it("end-to-end: alice shares → publishes → bob pulls + syncs → bob's KB has the rule", async () => {
  const { bareRemote, aliceRepo, bobRepo, aliceHome, bobHome } = setupTwoUserSandbox();

  // Alice writes a rule to her KB (via existing init + add).
  await initVikiProject(aliceRepo, aliceHome);
  await addRuleToKb(aliceRepo, { id: "use-dayjs", text: "Use dayjs not moment", confidence: 0.9 });

  // Alice shares it.
  const share = await runTeamShare({ cwd: aliceRepo, text: "Use dayjs not moment", ruleId: "use-dayjs", scope: "team", author: "alice" });
  expect(share.action.kind).toBe("promote_to_l2");
  expect(fs.existsSync(path.join(aliceRepo, ".viki/team/alice/use-dayjs.json"))).toBe(true);

  // Alice publishes (commit + push to bare remote).
  await execSync(`git -C ${aliceRepo} push origin main`);

  // Bob pulls.
  await execSync(`git -C ${bobRepo} pull origin main`);
  expect(fs.existsSync(path.join(bobRepo, ".viki/team/alice/use-dayjs.json"))).toBe(true);

  // Bob runs sync --apply.
  const sync = await runTeamSync({ cwd: bobRepo, apply: true });
  expect(sync.applied?.upserted).toContain("use-dayjs");

  // Bob's KB now has the rule with original-author tag.
  const bobRule = readRuleFromKb(bobRepo, "use-dayjs");
  expect(bobRule.tags).toContain("original-author:alice");
});
```

**Commit:** `test(team): end-to-end alice→git→bob sandbox e2e`

---

## Task 19 — Docs

**Files:**
- Create: `docs/team-propagation.md`
- Modify: `README.md` (add one-paragraph mention + link)

Cover: what it does, when to use, A-side flow, B-side flow, two gates, lineage, tombstone semantics, FAQ (Windows MAX_PATH, husky coexistence, branch protection).

**Commit:** `docs(team): team rule propagation user guide`

---

## Self-Review Checklist

**1. Spec coverage:** all 9 Matrix-Lucky `m5-*` + `team-transfer` + `git-sync` features mapped? ✓ (Tasks 10–16 cover share/sync/publish/infect/bootstrap/status/delete/export/import. `m5-replay` is dev-only CI testing — out of scope for user-facing port.)

**2. Placeholder scan:** No TBDs, all code blocks complete, file paths exact. ✓

**3. Type consistency:** `TeamRuleFile.current.deleted` is `boolean`; `TeamRuleClaim.deleted` is `boolean`; `ShareDecision.kind` enum used identically across decide-share + team-share. ✓

**4. Constraints honored:**
- Additive: new package + new CLI namespace + new file paths + only one new `case` in bin.ts. ✓
- Rule engine untouched: KB IO only via `DualLayerStore` public methods. ✓
- No new deps: only `node:fs`, `node:crypto`, `node:child_process`, existing `@viki/*` packages. ✓

---

## Execution Strategy

Dispatch parallel subagents for independent slices:

- **Subagent A**: Tasks 1–6 (foundation: types, path-safety, scanner, classifier, decide, lww)
- **Subagent B**: Tasks 7–9 (storage + projection + manifest)
- **Subagent C**: Tasks 10–11 (bundle export/import — depends on Adapters being built; can wait)
- After A+B complete:
- **Subagent D**: Tasks 12–14 (share, sync, publish — depend on A+B)
- **Subagent E**: Tasks 15–17 (infect, bootstrap, status, delete)
- **Main session**: Task 18 (e2e wiring) + Task 19 (docs) + final integration + commits

Each subagent works in the same worktree (sequential per file to avoid conflicts within a task batch).
