# Team rule propagation

> Share AI-coding rules across your team via git. Learn it once, everyone gets it.

## What it does

Viki normally learns rules per-user, in your local `~/.viki/global.db` and
`<project>/.viki/knowledge.db`. The `viki team` namespace adds a separate,
**purely additive** pipeline that propagates rules from one user's KB to
every teammate's KB through git.

```
┌──────────────┐   1. team share     ┌──────────────────────────────────┐
│  Alice's KB  │ ─────────────────→  │ .viki/team/alice/<rule_id>.json  │
│  (sqlite)    │   2 gates           │   one file per rule              │
└──────────────┘                     └──────────────────────────────────┘
                                              │
                                              │ 2. team publish [--push]
                                              ▼
                                     ┌───────────────────────┐
                                     │   git remote (e.g.    │
                                     │   GitHub)             │
                                     └───────────────────────┘
                                              │
                                              │ 3. Bob's `git pull`
                                              ▼  (post-merge hook auto-fires)
                                     ┌───────────────────────┐
                                     │  team sync --apply    │
                                     │  → LWW merge          │
                                     │  → write to Bob's KB  │
                                     │  → tag                │
                                     │    original-author:   │
                                     │    alice              │
                                     └───────────────────────┘
```

## Two safety gates

Every `team share` text runs through:

1. **Secret scanner** (`@viki/team/secret-scanner.ts`) — blocks AWS keys,
   GitHub PATs, OpenAI/Anthropic keys, Slack tokens, JWTs, private IPs,
   `localhost` URLs, absolute home paths. **Non-overridable**: even with
   `--scope=team`, a secret hit refuses the share.
2. **Scope classifier** (`@viki/team/scope-classifier.ts`) — heuristic
   regex detects "team"/"our"/"standard" language vs "my"/"personal"/
   "just for me". Defaults to `uncertain → personal` when signal is
   missing or mixed (conservative).

User override via `--scope team|personal` beats the classifier but never
the secret scanner.

## Per-rule pipeline (recommended)

### Alice's side

```bash
# One-time: turn this repo into a Viki team project
viki team infect

# Whenever Alice learns a rule worth sharing:
viki team share --text "Our team should always use dayjs not moment" \
                --rule-id use-dayjs --scope team

# Commit the .viki/team/ file and push it to origin
viki team publish --push
```

### Bob's side

```bash
git clone <repo>            # gets .viki/manifest.json + .githooks/post-merge
cd <repo>
viki team bootstrap         # first-time catch-up — applies all team rules
```

After bootstrap, every subsequent `git pull` automatically runs
`team sync --apply` via the post-merge hook. Bob never has to think about
team rules again — they just appear in his KB.

### Conflict resolution: LWW + author lineage

Two users editing the same `rule_id` produces a single file
`<author>/<rule_id>.json` with multiple `claims[]`. Latest timestamp wins,
but **`file.author` (the lineage anchor) never changes** — Alice is the
original author forever, even if Bob's claim is the current winner. Tags
`original-author:alice` carry into Bob's KB so attribution chains survive.

### Soft-delete via tombstone

```bash
viki team delete use-dayjs
```

This **does not unlink the file**. It appends a `{deleted: true}` claim
with a fresh timestamp. LWW picks it as the winner → `team sync --apply`
sees `state: "tombstone"` → calls `kb.delete(rule_id)`. The tombstone
must stay on disk to outvote any older alive claim.

## Bundle path (quick-start alternative)

For small teams that don't want per-rule lineage, there's a simpler
single-file snapshot path:

```bash
# Dump all KB rules
viki team export             # → .viki/team-rules.json

# Load all rules from a bundle
viki team import             # ← .viki/team-rules.json
```

The bundle path **does NOT** include:

- Author lineage / claims history
- LWW merge — second import skips duplicates by `id`
- Tombstone support
- The post-merge hook (you commit + share the bundle file manually)

Use it for one-shot transfers; switch to the per-rule pipeline once the
team has more than 2-3 active contributors.

## Viral install (`viki team infect`)

Three writes per repo:

| Artifact | Purpose | Safety |
|---|---|---|
| `.viki/manifest.json` | "This is a Viki team project" marker | Atomic tmp+rename; existing manifest → skip (idempotent) |
| `.githooks/post-merge` | Auto-runs `team sync --apply` after `git pull` | Bash-only; `\|\| true` on failure; honors `VIKI_DISABLE_POST_MERGE=1` |
| `git config core.hooksPath .githooks` | Tell git to use `.githooks/` | Refuses to overwrite a pre-existing non-`.githooks` value (e.g. `.husky`, `.lefthook`) unless `--force` |

The hook is **silent on success** (`>/dev/null 2>&1`) and **never blocks
a pull** (every step is `|| true`).

## Status & diagnostics

```bash
viki team status
# → manifest: present (infected by alice, at 2026-05-17T00:00:00Z)
#   rules: 3 alive, 0 tombstoned (3 files)
#   authors:
#     alice: 2
#     bob: 1
#   last sync commit: a1b2c3d4 (2026-05-17T10:00:00Z)
#     [viki-sync] sync 1 change(s) in .viki/team
```

When a sync skips files (corrupt JSON, unsafe author/rule_id), `skipped_files`
surfaces the path + reason instead of silently dropping data.

## Architectural notes

- **Additive.** New `@viki/team` package, new `viki team <sub>` namespace,
  new file paths under `.viki/team/` and `.viki/manifest.json`. Exactly
  one line added to existing `packages/cli/src/bin.ts`. Zero edits to
  `@viki/types`, `@viki/ports`, `@viki/core` rule engine.
- **No new deps.** Built on `node:fs`, `node:crypto`, `node:child_process`,
  and existing `@viki/*` packages.
- **Schema-compatible with Matrix-Lucky.** The `.viki/team/<author>/<rule_id>.json`
  shape mirrors Matrix-Lucky's `.teamagent/team/<author>/<rule_id>.json`
  byte-for-byte. The two systems could read each other's team files
  with a path-prefix rename.

## FAQ

**Q: Does this work with husky/lefthook?**
A: `team infect` will refuse to overwrite a non-`.githooks` value of
`core.hooksPath` unless you pass `--force`. If you use husky and want
both, set `core.hooksPath` back to `.husky` after infect and add a line
to `.husky/post-merge` that calls `viki team sync --apply`.

**Q: What if I push a rule and want to take it back?**
A: `viki team delete <rule_id>` writes a tombstone claim → next sync on
any teammate's machine removes the rule from their KB. The tombstone
file stays on disk forever (LWW needs it).

**Q: Branch protection on `main` blocks `[viki-sync]` pushes — fine?**
A: That's the intended workflow: `[viki-sync]` commits land via PR like
any other change. The commit-message prefix is exactly to make protected-
branch rules easy to write.

**Q: What about Windows MAX_PATH?**
A: `team share` validates the rule_id + author + project-root length
against a 250-char budget (260 minus headroom for the tmp+rename
intermediate). Overlong combos refuse early with a clear error.

**Q: Can I sync rules across machines for the same user without a team?**
A: Yes — that's `viki team export` / `viki team import` (bundle path).
Or set up infect against your personal `~/dotfiles` repo if you want
the per-rule lineage flavor.

## Implementation files

| File | Role |
|---|---|
| `packages/team/src/types.ts` | TeamRuleFile, Manifest, ShareDecision schemas |
| `packages/team/src/secret-scanner.ts` | Gate 1: regex pack |
| `packages/team/src/scope-classifier.ts` | Gate 2: heuristic classifier |
| `packages/team/src/decide-share.ts` | Combine both gates + override |
| `packages/team/src/lww-merge.ts` | Last-write-wins with author lineage |
| `packages/team/src/path-safety.ts` | rule_id/author regex + MAX_PATH budget |
| `packages/team/src/manifest.ts` | manifest.json read/write |
| `packages/team/src/projection.ts` | TeamRuleFile ↔ adapter record |
| `packages/adapters/src/team/fs-team-rule-store.ts` | Per-rule file IO |
| `packages/adapters/src/team/team-to-knowledge.ts` | TeamRuleFile → KnowledgeEntry |
| `packages/cli/src/commands/team-*.ts` | CLI commands |
| `packages/cli/src/commands/team.ts` | Namespace dispatcher |
| `scripts/team/githooks/post-merge` | Hook template that `team infect` copies |
