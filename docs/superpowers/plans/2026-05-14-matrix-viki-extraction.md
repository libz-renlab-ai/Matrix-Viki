# Matrix-Viki Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract TeamBrain's B1 learning engine into Matrix-Viki, a personal-only Claude Code rule assistant, by faithful subset extraction (copy-all-then-prune + rename), keeping the codebase compiling and tests green.

**Architecture:** Preserve TeamBrain's Functional Core / Imperative Shell + Ports & Adapters monorepo (`cli → adapters → core → ports → types`). This is a *subtraction* task: copy the whole repo, delete team/video/viral/sync/benchmark code, rename `teamagent` → `viki`, then iteratively fix compilation and tests. No new business logic.

**Tech Stack:** TypeScript, pnpm workspaces, vitest, tsx, tsup. Windows + PowerShell.

**Note on task style:** This is an extraction, not a feature build — there is no "write failing test first". Verification per task is: the existing test suite still passes (minus deleted-feature tests), `pnpm typecheck` compiles, `pnpm build` succeeds. Tasks 12–13 (compile-fix / test-fix) are inherently iterative and specify a *process*, not fixed code.

**Reference paths:**
- Source (read-only): `C:\Users\tianhaoxuan\teamagent-test01\TeamBrain` — local clone, `origin/main @ 6f13b4c`
- Reference worktree (created in Task 1): `C:\Users\tianhaoxuan\teamagent-test01\TeamBrain-main`
- Target: `C:\Users\tianhaoxuan\Matrix-Viki` — git repo, branch `main`, 1 commit (the spec)

---

## File Structure (what gets created/modified)

**Kept packages** (copied, then pruned): `packages/{types,ports,core,adapters,cli,teamagent,skills}/`
**Dropped packages** (deleted after copy): `packages/{digital-twin,benchmark,mcp-server,portal,landing-adapter}/`
**Dropped top-level dirs**: `apps/ landing/ audit/ docker/ release-prep/ .teamagent/ .agents/ .pi/ .gstack/ .judge/`
**Modified scaffolding**: `package.json pnpm-workspace.yaml packages/cli/package.json packages/cli/tsup.hook.config.ts packages/teamagent/tsup.config.ts CLAUDE.md AGENTS.md release/install.sh`
**New files**: `LICENSE README.md`

---

## Phase 0 — Setup

### Task 1: Create reference worktree and confirm target state

**Files:** none (git plumbing)

- [ ] **Step 1: Create a clean origin/main worktree to copy from**

```powershell
$src = "C:\Users\tianhaoxuan\teamagent-test01\TeamBrain"
git -C $src fetch origin
git -C $src worktree add "C:\Users\tianhaoxuan\teamagent-test01\TeamBrain-main" origin/main
```
Expected: `Preparing worktree ... HEAD is now at 6f13b4c`

- [ ] **Step 2: Verify worktree is at the spec baseline**

```powershell
git -C "C:\Users\tianhaoxuan\teamagent-test01\TeamBrain-main" log --oneline -1
```
Expected: `6f13b4c feat(m3): transcript→MiningInput extractor ...`

- [ ] **Step 3: Confirm target repo state**

```powershell
git -C "C:\Users\tianhaoxuan\Matrix-Viki" status -s; git -C "C:\Users\tianhaoxuan\Matrix-Viki" branch
```
Expected: clean working tree, on branch `main`.

- [ ] **Step 4: Create the working branch**

```powershell
git -C "C:\Users\tianhaoxuan\Matrix-Viki" checkout -b feat/initial-extraction
```

---

## Phase 1 — Copy the full tree

### Task 2: Copy TeamBrain-main into Matrix-Viki (excluding heavy/VCS dirs)

**Files:** copies most of the repo into `C:\Users\tianhaoxuan\Matrix-Viki`

- [ ] **Step 1: robocopy everything except node_modules / .git / dist / build artifacts**

```powershell
$src = "C:\Users\tianhaoxuan\teamagent-test01\TeamBrain-main"
$dst = "C:\Users\tianhaoxuan\Matrix-Viki"
robocopy $src $dst /E /XD node_modules .git dist .turbo coverage /XF "*.tsbuildinfo" /NFL /NDL /NJH /NJS
```
Expected: robocopy exit code 1 (files copied) — exit codes 0–7 are success, 8+ is failure.

- [ ] **Step 2: Verify the spec doc and .git survived (they pre-existed in target)**

```powershell
git -C "C:\Users\tianhaoxuan\Matrix-Viki" status -s | Select-Object -First 20
Test-Path "C:\Users\tianhaoxuan\Matrix-Viki\docs\superpowers\specs\2026-05-14-matrix-viki-split-design.md"
```
Expected: many untracked files; spec doc path returns `True`. (robocopy `/E` does not delete; the pre-existing `docs/superpowers/` is preserved alongside copied `docs/`.)

- [ ] **Step 3: Confirm `.gitignore` was copied (so node_modules etc. stay ignored)**

```powershell
Test-Path "C:\Users\tianhaoxuan\Matrix-Viki\.gitignore"
```
Expected: `True`.

- [ ] **Step 4: Commit the raw import as a baseline**

```powershell
cd C:\Users\tianhaoxuan\Matrix-Viki
git add -A
git commit -m "chore: import TeamBrain origin/main @ 6f13b4c as extraction baseline"
```

---

## Phase 2 — Prune dropped packages and top-level dirs

### Task 3: Delete the 5 dropped packages and dropped top-level dirs

**Files:**
- Delete: `packages/{digital-twin,benchmark,mcp-server,portal,landing-adapter}/`
- Delete: `apps/ landing/ audit/ docker/ release-prep/ .teamagent/ .agents/ .pi/ .gstack/ .judge/`

- [ ] **Step 1: Remove dropped packages**

```powershell
cd C:\Users\tianhaoxuan\Matrix-Viki
foreach ($p in @("digital-twin","benchmark","mcp-server","portal","landing-adapter")) {
  Remove-Item -Recurse -Force "packages\$p" -ErrorAction SilentlyContinue
}
```

- [ ] **Step 2: Remove dropped top-level dirs**

```powershell
foreach ($d in @("apps","landing","audit","docker","release-prep",".teamagent",".agents",".pi",".gstack",".judge")) {
  Remove-Item -Recurse -Force ".\$d" -ErrorAction SilentlyContinue
}
```

- [ ] **Step 3: Verify only kept packages remain**

```powershell
Get-ChildItem packages -Directory | Select-Object Name
```
Expected: exactly `adapters core cli ports skills teamagent types`.

- [ ] **Step 4: Commit**

```powershell
git add -A
git commit -m "chore: drop team/video/benchmark/portal packages and team-only top-level dirs"
```

---

### Task 4: Prune `@teamagent/types`

**Files:** Delete `packages/types/src/m5.ts`; modify `packages/types/src/index.ts`

- [ ] **Step 1: Delete the m5 types file**

```powershell
Remove-Item "packages\types\src\m5.ts" -Force
```

- [ ] **Step 2: Remove the m5 re-export from the barrel**

Open `packages/types/src/index.ts`. Delete any line matching `export * from './m5'` (or `from './m5.js'`). Also check `packages/types/src/__tests__/` for an `m5*.test.ts` and delete it if present.

- [ ] **Step 3: Verify no remaining references to the deleted file**

```powershell
git grep -n "from './m5'" packages/types/ ; git grep -n "types/m5" packages/
```
Expected: no output (or only matches inside already-pruned context — fix any that remain).

- [ ] **Step 4: Commit**

```powershell
git add -A
git commit -m "chore(types): drop m5 viral-spread types"
```

---

### Task 5: Prune `@teamagent/ports`

**Files:** Delete `packages/ports/src/{github-activity-port.ts,github-activity-port-inmemory.ts,scope-classifier-port.ts}` and their contract tests; modify `packages/ports/src/index.ts`

- [ ] **Step 1: Delete team-only port files**

```powershell
Remove-Item "packages\ports\src\github-activity-port.ts","packages\ports\src\github-activity-port-inmemory.ts","packages\ports\src\scope-classifier-port.ts" -Force
```

- [ ] **Step 2: Delete their contract/unit tests**

```powershell
Get-ChildItem "packages\ports\src\__tests__" -Filter "*github-activity*" | Remove-Item -Force
Get-ChildItem "packages\ports\src\__tests__" -Filter "*scope-classifier*" | Remove-Item -Force
```

- [ ] **Step 3: Remove the corresponding `export * from` lines in `packages/ports/src/index.ts`**

Open `packages/ports/src/index.ts`, delete export lines for `github-activity-port`, `github-activity-port-inmemory`, `scope-classifier-port`.

- [ ] **Step 4: Verify**

```powershell
git grep -n "github-activity-port\|scope-classifier-port" packages/ports/
```
Expected: no output.

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "chore(ports): drop github-activity and scope-classifier ports"
```

---

### Task 6: Prune `@teamagent/core`

**Files:** Delete `packages/core/src/{m5,presence}/`; modify `packages/core/src/index.ts`. Triage `live-inspection/` and `rag/` per spec §6.

- [ ] **Step 1: Delete the clearly-team core subdirs**

```powershell
Remove-Item -Recurse -Force "packages\core\src\m5","packages\core\src\presence"
```

- [ ] **Step 2: Triage `live-inspection/`** — inspect each file's purpose

```powershell
Get-ChildItem "packages\core\src\live-inspection" -Recurse -File | Select-Object Name
git grep -l "live-inspection" packages/cli/ packages/adapters/
```
Decision rule (spec §6): `live-inspection` is incident detection / freeze — defaults to **delete** unless a sub-file (e.g. `detect-abnormal.ts`) is imported by a *kept* CLI command with personal value. If only dropped commands (`presence`, `digital-twin`, `inspect-member`) consume it → `Remove-Item -Recurse -Force "packages\core\src\live-inspection"`.

- [ ] **Step 3: Triage `rag/`** — confirm dependency weight

```powershell
Get-ChildItem "packages\core\src\rag" -Recurse -File | Select-Object Name
git grep -l "core/src/rag\|from.*rag/internet-rag\|/rag'" packages/
```
Decision rule (spec §6): `rag` defaults to **keep**. Only delete if it pulls a heavy external dep not used elsewhere AND no kept command imports it.

- [ ] **Step 4: Remove barrel exports for whatever was deleted**

Open `packages/core/src/index.ts`. Delete `export * from './m5...'`, `export * from './presence...'`, and (if deleted) `live-inspection` / `rag` export lines.

- [ ] **Step 5: Delete orphaned tests**

```powershell
Get-ChildItem "packages\core\src\__tests__" -Recurse | Where-Object { $_.Name -match "m5|presence" } | Remove-Item -Force
# plus live-inspection tests if that dir was deleted
```

- [ ] **Step 6: Verify**

```powershell
git grep -n "src/m5\|src/presence\|/presence'\|/m5'" packages/core/
```
Expected: no output.

- [ ] **Step 7: Commit**

```powershell
git add -A
git commit -m "chore(core): drop m5/presence; triage live-inspection/rag"
```

---

### Task 7: Prune `@teamagent/adapters`

**Files:** Delete `packages/adapters/src/{m5,mcp,github-activity}/`; modify `packages/adapters/src/index.ts`

- [ ] **Step 1: Delete dropped adapter subdirs**

```powershell
Remove-Item -Recurse -Force "packages\adapters\src\m5","packages\adapters\src\mcp","packages\adapters\src\github-activity"
```

- [ ] **Step 2: Remove their barrel exports**

Open `packages/adapters/src/index.ts`, delete export lines referencing `m5`, `mcp`, `github-activity`.

- [ ] **Step 3: Delete orphaned tests**

```powershell
Get-ChildItem "packages\adapters\src" -Recurse -Directory -Filter "__tests__" | ForEach-Object {
  Get-ChildItem $_.FullName | Where-Object { $_.Name -match "^m5|mcp|github-activity" } | Remove-Item -Force
}
```

- [ ] **Step 4: Verify**

```powershell
git grep -n "adapters/src/m5\|adapters/src/mcp\|adapters/src/github-activity\|/m5'\|/mcp'" packages/adapters/
```
Expected: no output.

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "chore(adapters): drop m5/mcp/github-activity adapters"
```

---

### Task 8: Prune `@teamagent/cli` — delete dropped commands, bins, top-level files, tests

**Files:** see lists below

- [ ] **Step 1: Delete dropped command files**

```powershell
$dropCmds = @("bpp","digital-twin","video","recording","presence","inspect-member",
  "m5-bootstrap","m5-delete","m5-infect","m5-publish","m5-replay","m5-share","m5-status","m5-sync",
  "team-init","team-transfer","team-transfer-lead","git-sync","symphony","pair","docs-propagate",
  "dashboard","compile-cursor","e2e-evaluate","pr-cycle","required-check","dogfood-report","ingest")
foreach ($c in $dropCmds) { Remove-Item "packages\cli\src\commands\$c.ts" -Force -ErrorAction SilentlyContinue }
```

- [ ] **Step 2: Delete dropped hook bins and top-level cli files**

```powershell
Remove-Item "packages\cli\src\bin-digital-twin-tap.ts","packages\cli\src\m5-session-hook.ts","packages\cli\src\m5-default-port.ts","packages\cli\src\realtime-emit.ts" -Force -ErrorAction SilentlyContinue
```
Note: `realtime-emit.ts` is B2 realtime streaming — dropped. If a kept file imports it, that surfaces in Task 8 Step 5 / Task 12.

- [ ] **Step 3: Delete tests for all dropped commands/bins**

```powershell
$dropTests = $dropCmds + @("bin-digital-twin-tap","digital-twin-command","statusline-cc-status","m5","realtime-emit")
Get-ChildItem "packages\cli\src\__tests__" -Recurse -File | Where-Object {
  $n = $_.BaseName
  $dropTests | Where-Object { $n -match [regex]::Escape($_) }
} | Remove-Item -Force
```
Then manually scan remaining `__tests__` for any file whose name matches a dropped feature and delete it.

- [ ] **Step 4: Remove dropped commands from the CLI command registry**

Open `packages/cli/src/bin.ts` (and any `commands/index.ts` registry). Delete the `import` line and the registration/dispatch entry for every command in `$dropCmds`. Keep the file compiling — each removed command is one import + one registration block.

- [ ] **Step 5: Verify no kept cli file imports a deleted sibling**

```powershell
git grep -n "realtime-emit\|m5-session-hook\|m5-default-port\|bin-digital-twin-tap" packages/cli/src/
git grep -n "commands/bpp\|commands/digital-twin\|commands/m5-\|commands/team-" packages/cli/src/
```
Expected: no output. Fix any straggler imports.

- [ ] **Step 6: Commit**

```powershell
git add -A
git commit -m "chore(cli): drop team/video/m5/benchmark commands, bins and tests"
```

---

### Task 9: Surgically fix KEPT cli files that referenced `@teamagent/digital-twin`

**Files:** `packages/cli/src/commands/doctor.ts`, `packages/cli/src/commands/install-hook.ts`, `packages/cli/src/commands/record.ts`, `packages/cli/src/__tests__/doctor.test.ts`, `packages/cli/src/__tests__/record-command.test.ts`

- [ ] **Step 1: `doctor.ts`** — remove the digital-twin / cc-status / mcp-reachable probe

Open `packages/cli/src/commands/doctor.ts`. Delete the `import ... from '@teamagent/digital-twin'` line and the code block that uses it (the cc-status / mcp-reachable check). Per spec §9 doctor reports `hook-registered` + `plugin-sync` only. Keep the rest of the doctor report intact and compiling.

- [ ] **Step 2: `install-hook.ts`** — remove digital-twin usage

Open `packages/cli/src/commands/install-hook.ts`. Delete the `@teamagent/digital-twin` import and the lines using it (likely registering a digital-twin tap hook). Keep core hook installation working.

- [ ] **Step 3: `record.ts`** — decide keep-and-strip vs drop

Open `packages/cli/src/commands/record.ts`. If `record` is fundamentally a digital-twin recording command (video/session capture for B2/B3), delete it instead (`Remove-Item packages\cli\src\commands\record.ts`, its test, and its `bin.ts` registration). If it has standalone personal value, strip only the `@teamagent/digital-twin` import + usage. Default: **drop** if >50% of the file is digital-twin wiring.

- [ ] **Step 4: Fix `doctor.test.ts` and `record-command.test.ts`**

Open both. Remove test cases asserting digital-twin behavior. If `record.ts` was dropped in Step 3, delete `record-command.test.ts` entirely.

- [ ] **Step 5: Verify zero digital-twin references remain in cli**

```powershell
git grep -n "@teamagent/digital-twin" packages/cli/
```
Expected: only `packages/cli/package.json` (fixed in Task 10) — or no output.

- [ ] **Step 6: Commit**

```powershell
git add -A
git commit -m "fix(cli): strip digital-twin wiring from doctor/install-hook/record"
```

---

## Phase 3 — Workspace config and dependencies

### Task 10: Fix workspace config, package.json deps, and build configs

**Files:** `package.json`, `pnpm-workspace.yaml`, `packages/cli/package.json`, `packages/cli/tsup.hook.config.ts`, `packages/teamagent/tsup.config.ts`

- [ ] **Step 1: Root `package.json`** — remove scripts referencing dropped packages/dirs

Open `package.json`. Delete these script entries: `benchmark`, `dashboard`, `frontend:*` (init/install/dev/build/start/typecheck), `regen-static-user-skills` (if it references a dropped dir — keep if `static-user-skills` core dir is kept), `dogfood-report`, plus any `smoke:*` / `evidence:*` script whose target file lives in a dropped dir. Keep: `build`, `test`, `test:watch`, `typecheck`, `teamagent` (renamed later), `verify`, `build:publish`, `prepublish:teamagent`. Remove dropped packages from any `devDependencies`/`dependencies` if listed.

- [ ] **Step 2: `pnpm-workspace.yaml`** — drop the `apps/*` glob

```yaml
packages:
  - "packages/*"
```
(Delete the `- "apps/*"` line and its comment.)

- [ ] **Step 3: `packages/cli/package.json`** — remove the digital-twin dependency

Open `packages/cli/package.json`. Delete `"@teamagent/digital-twin": "..."` from `dependencies`.

- [ ] **Step 4: `packages/cli/tsup.hook.config.ts`** — remove digital-twin tap entry

Open `packages/cli/tsup.hook.config.ts`. Delete the `bin-digital-twin-tap` entry from the `entry` list (the file no longer exists).

- [ ] **Step 5: `packages/teamagent/tsup.config.ts`** — remove digital-twin reference

Open `packages/teamagent/tsup.config.ts`. Remove any entry/import bundling `@teamagent/digital-twin`.

- [ ] **Step 6: Verify no config still references a dropped package**

```powershell
git grep -n "digital-twin\|benchmark\|mcp-server\|landing-adapter\|@teamagent/portal" -- "*.json" "*.config.ts" "pnpm-workspace.yaml"
```
Expected: no output.

- [ ] **Step 7: Install dependencies**

```powershell
cd C:\Users\tianhaoxuan\Matrix-Viki
pnpm install
```
Expected: resolves and installs with no missing-workspace-package errors. If it fails on a dropped package reference, fix the offending package.json and re-run.

- [ ] **Step 8: Commit**

```powershell
git add -A
git commit -m "chore: prune workspace config and deps for dropped packages"
```

---

## Phase 4 — Rebrand teamagent → viki

### Task 11: Full rename `teamagent` → `viki`

**Files:** every package.json `name` field, all `@teamagent/*` import specifiers, CLI name, config dir paths

- [ ] **Step 1: Rename npm scopes in all `package.json` files**

For each of `packages/{types,ports,core,adapters,cli,skills,teamagent}/package.json`:
- `@teamagent/types` → `@viki/types`, `@teamagent/ports` → `@viki/ports`, `@teamagent/core` → `@viki/core`, `@teamagent/adapters` → `@viki/adapters`, `@teamagent/cli` → `@viki/cli`
- `packages/teamagent/package.json`: `"name": "teamagent"` → `"name": "viki"`
- Update every `dependencies` entry that names a `@teamagent/*` workspace package.

- [ ] **Step 2: Rename all `@teamagent/*` import specifiers in source**

```powershell
cd C:\Users\tianhaoxuan\Matrix-Viki
$files = git grep -l "@teamagent/" -- "packages/**/*.ts" "packages/**/*.tsx" "*.ts"
foreach ($f in $files) {
  (Get-Content $f -Raw).Replace("@teamagent/","@viki/") | Set-Content $f -NoNewline -Encoding utf8
}
```

- [ ] **Step 2b: Verify no `@teamagent/` specifier remains**

```powershell
git grep -n "@teamagent/" -- "packages/"
```
Expected: no output.

- [ ] **Step 3: Rename the CLI binary name**

In `packages/cli/package.json` and `packages/teamagent/package.json`, change the `"bin"` map key `teamagent` → `viki`. In root `package.json`, rename the `teamagent` script to `viki` (`tsx packages/cli/src/bin.ts`).

- [ ] **Step 4: Rename config-dir and brand strings**

```powershell
$srcFiles = git grep -l "teamagent\|TeamAgent\|\.teamagent" -- "packages/**/*.ts"
```
For each file, replace (case-sensitive, in this order):
- `.teamagent` → `.viki` (config dir: `~/.teamagent/` and project `.teamagent/`)
- `TeamAgent` → `Viki`
- standalone `teamagent` CLI invocations in strings/help text → `viki`

Be careful: do NOT rename inside the spec/plan docs under `docs/superpowers/`. Scope replacements to `packages/`. Review each diff hunk — some `teamagent` occurrences may be in comments referencing TeamBrain history; those can stay or become "TeamBrain (upstream)".

- [ ] **Step 5: Typecheck after rename**

```powershell
pnpm typecheck
```
Expected: may still have errors from pruning (Task 12 handles those) — but NO error should be `Cannot find module '@teamagent/...'`. If one appears, a rename was missed.

- [ ] **Step 6: Commit**

```powershell
git add -A
git commit -m "refactor: rebrand teamagent -> viki (scopes, CLI name, config dir)"
```

---

## Phase 5 — Make it compile and pass

### Task 12: Iterative compile-fix (`pnpm typecheck` to zero errors)

**Files:** wherever the compiler points — driven by errors, not pre-listed

**Process (repeat until clean):**

- [ ] **Step 1: Run the typechecker**

```powershell
cd C:\Users\tianhaoxuan\Matrix-Viki
pnpm typecheck 2>&1 | Tee-Object -FilePath C:\Users\tianhaoxuan\Matrix-Viki\.tc.log
```

- [ ] **Step 2: Categorize each error** — every error falls into one bucket:
  - **(a) Orphaned import** — imports a deleted file/symbol → delete the import + the now-dead code that used it.
  - **(b) Orphaned barrel export** — `index.ts` re-exports a deleted module → delete the export line.
  - **(c) Dead reference in kept code** — a kept function calls into deleted code → remove the call; if the function becomes empty/meaningless, evaluate whether the whole function/command should have been dropped (cross-check spec §3–§6).
  - **(d) Test-only error** — error is in a `__tests__` file for a dropped feature → delete the test file.
  - **(e) Genuine type error unrelated to pruning** — should be rare on a faithful copy; investigate individually.

- [ ] **Step 3: Fix one cluster of related errors, then re-run Step 1.** Do NOT batch unrelated fixes — fix, re-typecheck, observe the count drop.

- [ ] **Step 4: When `pnpm typecheck` exits clean (0 errors), delete the log and commit**

```powershell
Remove-Item C:\Users\tianhaoxuan\Matrix-Viki\.tc.log
git add -A
git commit -m "fix: resolve compile errors from package pruning"
```

**Guardrail:** if fixing an error requires writing genuinely new logic (not deletion/rewiring), stop and re-check the spec — the extraction boundary is probably wrong. Faithful extraction should only ever *remove* code.

---

### Task 13: Iterative test-fix (`pnpm test` to green)

**Files:** test files for dropped features (delete), test setup/fixtures referencing dropped code (prune)

- [ ] **Step 1: Run the suite**

```powershell
cd C:\Users\tianhaoxuan\Matrix-Viki
pnpm test 2>&1 | Tee-Object -FilePath C:\Users\tianhaoxuan\Matrix-Viki\.test.log
```

- [ ] **Step 2: Categorize each failure:**
  - **Import error / module not found** in a test for a dropped feature → delete the test file.
  - **Failure in a kept feature's test** → this is a real regression from over-pruning. Investigate: did a shared helper get deleted? Restore the minimum needed, or fix the wiring. Do NOT delete a kept-feature test to make the suite green.
  - **Fixture referencing dropped data** (`fixtures/`, `.teamagent/` manifests) → prune the dropped-feature fixture entries.

- [ ] **Step 3: Fix one file's failures, re-run, repeat.**

- [ ] **Step 4: Confirm the suite is green and the kept-feature count is sane**

```powershell
pnpm test 2>&1 | Select-String "Test Files|Tests "
```
Expected: all passing; a meaningfully large number of tests still run (we kept ~12 of 17 clusters — if only a handful of tests remain, over-pruning happened).

- [ ] **Step 5: Build check**

```powershell
pnpm build
```
Expected: all kept packages build with no errors.

- [ ] **Step 6: Commit**

```powershell
Remove-Item C:\Users\tianhaoxuan\Matrix-Viki\.test.log -ErrorAction SilentlyContinue
git add -A
git commit -m "fix: prune dropped-feature tests, restore green suite"
```

---

## Phase 6 — Finalize project identity

### Task 14: LICENSE, README, docs prune, brand docs

**Files:** Create `LICENSE`, `README.md`; modify `CLAUDE.md`, `AGENTS.md`, `release/install.sh`; prune `docs/`

- [ ] **Step 1: Add a LICENSE**

Create `C:\Users\tianhaoxuan\Matrix-Viki\LICENSE` — MIT, copyright holder `libz-renlab-ai`, year 2026. (TeamBrain upstream has no LICENSE; Matrix-Viki gets an explicit one.)

- [ ] **Step 2: Write a new `README.md`**

Replace the copied TeamBrain `README.md` with a Matrix-Viki one: what it is (personal Claude Code rule assistant — auto-captures your corrections, warns before you repeat mistakes), install (`pnpm install`), key commands (`viki init`, `viki doctor`, `viki pitfall`, `viki stats`, `viki skeleton-demo`), and a one-line note that it is extracted from TeamBrain (link upstream).

- [ ] **Step 3: Prune `docs/`**

Delete `docs/` subtrees for dropped features: anything under `docs/plans/` / `docs/features/` whose slug matches a dropped cluster (team-share, xsync, m5, ab-benchmark, digital-twin, video, mcp-server, cursor-compiler). Keep `docs/PRODUCT-FEATURES.md` but it is now stale — add a top-note `> Matrix-Viki is a personal-only extraction; team features (B2/B3, m5, benchmark) were removed. See docs/superpowers/specs/`. Keep `docs/ARCHITECTURE.md`. Keep `docs/superpowers/` untouched.

- [ ] **Step 4: De-team `CLAUDE.md` and `AGENTS.md`**

Open both. Remove sections describing team workflows, m5, digital-twin, FIXEDFLOW, video. Keep architecture rules (Ports & Adapters, core purity, AttributionBus, contract tests). Update the project name/description to Matrix-Viki.

- [ ] **Step 5: Fix `release/install.sh`**

Open `release/install.sh`. Remove m5 / team bootstrap logic. Update brand strings `teamagent` → `viki`. If the installer is deeply tangled with dropped features, reduce it to: check node ≥ 22, pick npm/pnpm, install the `viki` package.

- [ ] **Step 6: Final typecheck + test + build (regression gate)**

```powershell
cd C:\Users\tianhaoxuan\Matrix-Viki
pnpm typecheck; pnpm test 2>&1 | Select-String "Tests "; pnpm build
```
Expected: typecheck clean, tests green, build OK. (Docs/markdown changes shouldn't break code — this is a safety net.)

- [ ] **Step 7: Commit**

```powershell
git add -A
git commit -m "docs: add LICENSE + Matrix-Viki README, de-team docs and installer"
```

---

### Task 15: End-to-end verification

**Files:** none (runtime verification)

- [ ] **Step 1: CLI smoke — help text shows the renamed binary and pruned command set**

```powershell
cd C:\Users\tianhaoxuan\Matrix-Viki
pnpm viki --help
```
Expected: command lists `init`, `doctor`, `pitfall`, `stats`, `skeleton-demo`, etc.; NO `bpp`, `digital-twin`, `m5-*`, `team-*`, `video`.

- [ ] **Step 2: Core learning-loop smoke**

```powershell
pnpm viki skeleton-demo
```
Expected: the minimal record → compile → attribute loop runs end-to-end without error.

- [ ] **Step 3: Doctor smoke**

```powershell
pnpm viki doctor
```
Expected: reports `hook-registered` / `plugin-sync` state; does NOT crash on a missing digital-twin/mcp probe.

- [ ] **Step 4: Record the verification result**

If any smoke step fails, return to Task 12/13 — do not paper over it. If all pass, commit a short note:

```powershell
git commit --allow-empty -m "test: e2e smoke passing (help/skeleton-demo/doctor)"
```

---

### Task 16: Integrate the branch

- [ ] **Step 1: Review the full diff against `main`**

```powershell
git -C C:\Users\tianhaoxuan\Matrix-Viki diff main...feat/initial-extraction --stat
```

- [ ] **Step 2: Merge to `main`**

```powershell
git -C C:\Users\tianhaoxuan\Matrix-Viki checkout main
git -C C:\Users\tianhaoxuan\Matrix-Viki merge --no-ff feat/initial-extraction -m "feat: initial Matrix-Viki extraction from TeamBrain"
```

- [ ] **Step 3: Push to origin**

```powershell
git -C C:\Users\tianhaoxuan\Matrix-Viki push -u origin main
```

- [ ] **Step 4: Clean up the reference worktree**

```powershell
git -C C:\Users\tianhaoxuan\teamagent-test01\TeamBrain worktree remove C:\Users\tianhaoxuan\teamagent-test01\TeamBrain-main
```

---

## Self-Review

**Spec coverage:**
- §1 goal / non-goals → Tasks 3–9 (drop team/video/viral/sync/benchmark) ✓
- §2 architecture preserved → faithful copy in Task 2, no new logic (Task 12 guardrail) ✓
- §3 package decisions → Task 3 (drop 5), Tasks 4–9 (prune 6 kept + skills untouched) ✓
- §4 CLI trim → Task 8 ✓
- §5 cross-cutting (簇5/9/11, Cursor drop; PII keep) → Task 8 drops compile-cursor; PII kept by *not* being in any delete list ✓
- §6 core triage → Task 6 Steps 2–3 (live-inspection/rag), duck-mode kept by omission from delete lists ✓
- §7 scaffolding → Task 3 (drop dirs), Task 10 (config), Task 14 (docs/installer) ✓
- §8 rebrand → Task 11 ✓
- §9 verification → Task 13 (test/build), Task 15 (skeleton-demo, doctor) ✓
- §10 result → emergent from the above ✓
- §11 implementation order → matches Tasks 1–16 ✓

**Placeholder scan:** Tasks 12–13 specify an iterative *process* rather than fixed code — this is correct for an extraction (errors are not knowable in advance), and each carries an explicit categorization rubric + guardrail. Task 6 triage decisions carry explicit decision rules. No "TBD"/"handle edge cases" placeholders.

**Type consistency:** No new types/signatures introduced — pure deletion + string rename. The only renamed identifier is the npm scope `@teamagent/*` → `@viki/*`, applied uniformly in Task 11 Steps 1–2 with a verify step.
