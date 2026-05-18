# Semantic-Required & Onboarding Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote semantic matching from optional-with-silent-fallback to required-with-loud-banner, and clean up four onboarding bugs that silently mislead new users on Windows / China-network installs.

**Architecture:** Five layers, attacked top-down:
1. **Install-time** — postinstall script forces mirror URL on Windows, validates `sharp` native binary loads, fails loud at install time so the bug surfaces before runtime.
2. **State layer** — split warmup state into `.warmup-state.json` (last attempt) + `.warmup-last-success.json` (sticky, never overwritten by failure) so one bad cwd can't poison all projects.
3. **Self-heal tool** — new `viki repair-semantic` command runs rebuild → warmup → verify as one atomic action; doctor and banner both point users to it.
4. **Visibility** — SessionStart prints a loud banner if semantic isn't ready; Stop hook stderr-streams a one-liner when Step 6b/6c is skipped. No tool calls are denied (soft enforcement: visible failure, not blocked workflow).
5. **Doctor hygiene** — separate "user hasn't enabled X" from "X is broken"; init.ts user-level hook writer respects `--home`.

**Tech Stack:** TypeScript / Node 22 / vitest / pnpm workspace / tsup bundling / `node:sqlite` for state, `@xenova/transformers` + `sharp` for embedder, Claude Code hooks system.

---

## File Structure

**New files:**
- `packages/cli/src/commands/repair-semantic.ts` — new self-heal command
- `packages/cli/src/__tests__/repair-semantic.test.ts` — unit tests for parser + flow
- `packages/cli/src/__tests__/warmup-last-success.test.ts` — sticky-success state tests
- `packages/cli/src/__tests__/postinstall-validate.test.ts` — Windows-detection + mirror-set + sharp-probe tests

**Modify:**
- `packages/cli/src/warmup-state.ts` — add `WARMUP_LAST_SUCCESS_FILENAME` + `describeSemanticReadiness()` (new) that prefers last-success over last-attempt
- `packages/cli/src/bin-pre-tool-use.ts` — switch the warmup-gate read from `describeWarmupReadiness` to `describeSemanticReadiness`
- `packages/cli/src/bin-stop.ts` — same switch + stderr reminder when Step 6b skipped + write `~/.viki/.semantic-degraded.flag`
- `packages/cli/src/bin-session-start.ts` — read flag + emit loud banner on session start when semantic isn't ready
- `packages/cli/src/commands/doctor.ts` — vec-coverage SKIP when no warmup-success exists; plugin-sync SKIP when no enabledPlugins in settings; suggest `viki repair-semantic` on semantic failures
- `packages/cli/src/commands/init.ts` — user-level hook writer reads `args.home`, not `os.homedir()`
- `packages/cli/src/bin.ts` — register `repair-semantic` subcommand
- `packages/viki/postinstall.mjs` — Windows detection block: set `SHARP_DIST_BASE_URL` to npmmirror if unset; after install, probe `require('sharp')` + look for `.node` binary; emit fix instructions and exit non-zero on failure
- `packages/types/src/attribution.ts` — add `HookSessionStartSemanticBannerEvent` to the union
- `packages/adapters/src/attribution/stdout-renderer.ts` — exhaustive case for new event

---

## Task 1: Sticky last-success warmup state (Bug 4 root fix)

**Files:**
- Modify: `packages/cli/src/warmup-state.ts`
- Create: `packages/cli/src/__tests__/warmup-last-success.test.ts`

The current single-file design means one failed warmup (e.g., session opened in a worktree with broken `sharp`) overwrites the global ready state and kills semantic for every other project. We add a sticky last-success file that failures never touch.

- [ ] **Step 1: Write the failing test**

Create `packages/cli/src/__tests__/warmup-last-success.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  writeWarmupState,
  writeWarmupLastSuccess,
  defaultWarmupStatePath,
  defaultWarmupLastSuccessPath,
  describeSemanticReadiness,
} from "../warmup-state.js";

describe("describeSemanticReadiness — sticky last-success", () => {
  let home: string;
  beforeEach(() => { home = mkdtempSync(join(tmpdir(), "viki-warmup-")); });
  afterEach(() => { rmSync(home, { recursive: true, force: true }); });

  it("returns ready=true when last-success exists, even if last attempt failed", () => {
    writeWarmupLastSuccess(defaultWarmupLastSuccessPath(home), {
      status: "ready",
      started_at: "2026-05-15T00:00:00Z",
      completed_at: "2026-05-15T00:01:00Z",
      pid: 1234,
      model: "Xenova/multilingual-e5-small",
      cwd: "D:/proj-A",
      node_modules_root: "D:/proj-A/node_modules",
    });
    writeWarmupState(defaultWarmupStatePath(home), {
      status: "failed",
      started_at: "2026-05-16T10:13:24Z",
      completed_at: "2026-05-16T10:13:25Z",
      pid: 5678,
      model: "Xenova/multilingual-e5-small",
      error: "sharp not found",
    });
    const r = describeSemanticReadiness(home);
    expect(r.ready).toBe(true);
    expect(r.reason).toBe("ready_via_last_success");
  });

  it("returns ready=false when only failure state exists", () => {
    writeWarmupState(defaultWarmupStatePath(home), {
      status: "failed",
      started_at: "2026-05-16T10:13:24Z",
      pid: 5678,
      model: "Xenova/multilingual-e5-small",
      error: "sharp not found",
    });
    const r = describeSemanticReadiness(home);
    expect(r.ready).toBe(false);
    expect(r.reason).toBe("failed");
  });

  it("returns ready=false when nothing recorded", () => {
    const r = describeSemanticReadiness(home);
    expect(r.ready).toBe(false);
    expect(r.reason).toBe("missing");
  });

  it("writes last-success file when warmup succeeds", () => {
    const successPath = defaultWarmupLastSuccessPath(home);
    expect(existsSync(successPath)).toBe(false);
    writeWarmupLastSuccess(successPath, {
      status: "ready",
      started_at: "2026-05-16T00:00:00Z",
      completed_at: "2026-05-16T00:01:00Z",
      pid: 1,
      model: "test",
      cwd: "/x",
      node_modules_root: "/x/node_modules",
    });
    expect(existsSync(successPath)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:/0jingtong/Matrix-Viki && corepack pnpm exec vitest run packages/cli/src/__tests__/warmup-last-success.test.ts`
Expected: FAIL with "writeWarmupLastSuccess is not a function" / "defaultWarmupLastSuccessPath is not a function" / "describeSemanticReadiness is not a function".

- [ ] **Step 3: Extend warmup-state.ts with sticky-success API**

In `packages/cli/src/warmup-state.ts`, after the existing `WARMUP_STATE_FILENAME` constant, add:

```typescript
export const WARMUP_LAST_SUCCESS_FILENAME = ".warmup-last-success.json";

export interface WarmupSuccessState extends WarmupState {
  status: "ready";
  completed_at: string;
  /** Absolute path of the cwd that produced this success. */
  cwd: string;
  /** Absolute path of the node_modules root that resolved sharp / xenova. */
  node_modules_root: string;
}

export function defaultWarmupLastSuccessPath(homeDir: string = os.homedir()): string {
  return path.join(homeDir, ".viki", WARMUP_LAST_SUCCESS_FILENAME);
}

export function writeWarmupLastSuccess(filePath: string, state: WarmupSuccessState): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}

export function readWarmupLastSuccess(filePath: string): WarmupSuccessState | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Partial<WarmupSuccessState>;
    if (
      parsed.status !== "ready" ||
      typeof parsed.completed_at !== "string" ||
      typeof parsed.cwd !== "string" ||
      typeof parsed.node_modules_root !== "string"
    ) return null;
    return parsed as WarmupSuccessState;
  } catch {
    return null;
  }
}

export function describeSemanticReadiness(homeDir: string = os.homedir()): {
  ready: boolean;
  reason:
    | "ready_via_state"
    | "ready_via_last_success"
    | "missing"
    | "downloading"
    | "failed"
    | "skipped"
    | "stale_downloading"
    | "malformed";
  state: WarmupState | null;
  lastSuccess: WarmupSuccessState | null;
} {
  const statePath = defaultWarmupStatePath(homeDir);
  const successPath = defaultWarmupLastSuccessPath(homeDir);
  const lastSuccess = readWarmupLastSuccess(successPath);
  const stateRead = describeWarmupReadiness(statePath);

  // If the most recent attempt succeeded, trust it.
  if (stateRead.ready) {
    return { ready: true, reason: "ready_via_state", state: stateRead.state, lastSuccess };
  }
  // Otherwise fall back to the sticky success record.
  if (lastSuccess) {
    return { ready: true, reason: "ready_via_last_success", state: stateRead.state, lastSuccess };
  }
  return { ready: false, reason: stateRead.reason, state: stateRead.state, lastSuccess: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm exec vitest run packages/cli/src/__tests__/warmup-last-success.test.ts`
Expected: 4/4 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/warmup-state.ts packages/cli/src/__tests__/warmup-last-success.test.ts
git commit -m "feat(cli): sticky last-success warmup state (no single-cwd poisoning)"
```

---

## Task 2: Wire `describeSemanticReadiness` into the runtime gates

**Files:**
- Modify: `packages/cli/src/bin-stop.ts:744-750` (semantic-scan gate)
- Modify: `packages/cli/src/bin-pre-tool-use.ts` (find equivalent gate via grep)
- Modify: `packages/cli/src/commands/doctor.ts` (vec-coverage check)

Replace every call site that asks `describeWarmupReadiness(defaultWarmupStatePath(home))` with the new sticky check.

- [ ] **Step 1: List all current call sites**

Run: `corepack pnpm exec grep -rn "describeWarmupReadiness\|defaultWarmupStatePath" packages/cli/src --include='*.ts'`
Expected output lists every line that needs updating (bin-stop.ts:744-750, bin-pre-tool-use.ts entries, doctor.ts entry, warmup CLI). Record these line numbers — Step 2 changes each.

- [ ] **Step 2: Replace each call site**

Pattern to replace:
```typescript
const { describeWarmupReadiness, defaultWarmupStatePath } = await import("./warmup-state.js");
const stopWarmup = describeWarmupReadiness(defaultWarmupStatePath(os.homedir()));
const useLegacyMatcher = (process.env.VIKI_MATCHER ?? "").toLowerCase() === "legacy" || !stopWarmup.ready;
```
becomes:
```typescript
const { describeSemanticReadiness } = await import("./warmup-state.js");
const stopWarmup = describeSemanticReadiness(os.homedir());
const useLegacyMatcher = (process.env.VIKI_MATCHER ?? "").toLowerCase() === "legacy" || !stopWarmup.ready;
```

Apply the same shape change in `bin-pre-tool-use.ts` and `doctor.ts`. Internal call sites that need to know the **raw** last-attempt state (e.g., a doctor row reporting "last attempt failed") should keep using `describeWarmupReadiness` — only the "should we use semantic now?" decision uses `describeSemanticReadiness`.

- [ ] **Step 3: Run all bin-* and doctor tests**

Run: `corepack pnpm exec vitest run packages/cli/src/__tests__/bin-stop.test.ts packages/cli/src/__tests__/bin-pre-tool-use packages/cli/src/__tests__/doctor.test.ts`
Expected: All previously-passing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/bin-stop.ts packages/cli/src/bin-pre-tool-use.ts packages/cli/src/commands/doctor.ts
git commit -m "refactor(cli): runtime gates read sticky semantic readiness, not last-attempt"
```

---

## Task 3: Postinstall hardening (set mirror + validate sharp)

**Files:**
- Modify: `packages/viki/postinstall.mjs`
- Create: `packages/cli/src/__tests__/postinstall-validate.test.ts` (pure-function tests; the real postinstall runs in-process)

Today's failure mode: postinstall succeeds (sharp installed) but `sharp/build/Release/sharp-win32-x64.node` is missing because GitHub TLS dropped the download. We add a Windows-only block that (a) sets `SHARP_DIST_BASE_URL` to npmmirror **before** any sharp postinstall would re-run, and (b) probes `require('sharp')` + asserts the native `.node` file exists, exiting non-zero with fix instructions if not.

- [ ] **Step 1: Write failing test for the validator helper**

Create `packages/cli/src/__tests__/postinstall-validate.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  detectChinaMirror,
  formatSharpFailureMessage,
  isWindowsPlatform,
} from "../postinstall-helpers.js";

describe("postinstall helpers", () => {
  it("detectChinaMirror returns the npmmirror URL when env unset", () => {
    expect(detectChinaMirror({})).toBe(
      "https://registry.npmmirror.com/-/binary/sharp-libvips/v8.14.5/",
    );
  });

  it("detectChinaMirror returns null when env already set", () => {
    expect(detectChinaMirror({ SHARP_DIST_BASE_URL: "https://github.com/..." })).toBe(null);
  });

  it("isWindowsPlatform respects an override (for testing)", () => {
    expect(isWindowsPlatform("win32")).toBe(true);
    expect(isWindowsPlatform("linux")).toBe(false);
    expect(isWindowsPlatform("darwin")).toBe(false);
  });

  it("formatSharpFailureMessage includes the repair command", () => {
    const msg = formatSharpFailureMessage("Cannot find module ../build/Release/sharp-win32-x64.node");
    expect(msg).toMatch(/viki repair-semantic/);
    expect(msg).toMatch(/SHARP_DIST_BASE_URL/);
    expect(msg).toContain("Cannot find module");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm exec vitest run packages/cli/src/__tests__/postinstall-validate.test.ts`
Expected: FAIL with "Failed to load url ../postinstall-helpers.js".

- [ ] **Step 3: Create the helpers module**

Create `packages/cli/src/postinstall-helpers.ts`:

```typescript
export const NPMMIRROR_SHARP_LIBVIPS =
  "https://registry.npmmirror.com/-/binary/sharp-libvips/v8.14.5/";

export function detectChinaMirror(env: NodeJS.ProcessEnv): string | null {
  if (env.SHARP_DIST_BASE_URL) return null;
  return NPMMIRROR_SHARP_LIBVIPS;
}

export function isWindowsPlatform(platform: string): boolean {
  return platform === "win32";
}

export function formatSharpFailureMessage(rawError: string): string {
  return [
    "",
    "──────────────────────────────────────────────────────────────",
    "❌ Viki: sharp native binary unavailable — semantic matcher will NOT run.",
    "",
    `   ${rawError.slice(0, 200)}`,
    "",
    "Fix (one shot):",
    "  $env:SHARP_DIST_BASE_URL = \"" + NPMMIRROR_SHARP_LIBVIPS + "\"",
    "  pnpm rebuild sharp",
    "  viki repair-semantic",
    "",
    "Or run `viki repair-semantic` to do this automatically.",
    "──────────────────────────────────────────────────────────────",
    "",
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm exec vitest run packages/cli/src/__tests__/postinstall-validate.test.ts`
Expected: 4/4 PASS.

- [ ] **Step 5: Use the helpers in postinstall.mjs**

In `packages/viki/postinstall.mjs`, near the top before any sharp probe, add:

```javascript
import { detectChinaMirror, isWindowsPlatform, formatSharpFailureMessage } from "../cli/dist/postinstall-helpers.js";

if (isWindowsPlatform(process.platform)) {
  const mirror = detectChinaMirror(process.env);
  if (mirror) {
    process.env.SHARP_DIST_BASE_URL = mirror;
    console.log(`[viki postinstall] Set SHARP_DIST_BASE_URL=${mirror} for Windows mirror.`);
  }
}
```

And near the end (or wherever sharp loading is currently best-effort tried), add the hard validation:

```javascript
try {
  const sharp = (await import("sharp")).default;
  // Probe a no-op pipeline to force native binary load.
  await sharp(Buffer.from([0xff])).metadata().catch(() => {});
  console.log("[viki postinstall] sharp native binary OK.");
} catch (e) {
  process.stderr.write(formatSharpFailureMessage(String(e?.message ?? e)));
  process.exit(1);
}
```

- [ ] **Step 6: Manual smoke test (no automated test for the full postinstall)**

Run: `cd packages/viki && node postinstall.mjs`
Expected: Either `sharp native binary OK.` (if your main repo sharp is fine) or the formatted failure message + exit 1.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/postinstall-helpers.ts packages/cli/src/__tests__/postinstall-validate.test.ts packages/viki/postinstall.mjs
git commit -m "feat(viki): postinstall sets sharp mirror on Windows + validates native binary"
```

---

## Task 4: `viki repair-semantic` command

**Files:**
- Create: `packages/cli/src/commands/repair-semantic.ts`
- Create: `packages/cli/src/__tests__/repair-semantic.test.ts`
- Modify: `packages/cli/src/bin.ts` (register command)

A one-shot self-heal that the banner and doctor both point to. Runs: set mirror env → `pnpm rebuild sharp` → invoke warmup → verify success → emit "Done, semantic ready".

- [ ] **Step 1: Write failing test for the command's pure helpers**

Create `packages/cli/src/__tests__/repair-semantic.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  parseRepairSemanticArgs,
  formatRepairResult,
} from "../commands/repair-semantic.js";

describe("repair-semantic command", () => {
  it("parses --skip-rebuild flag", () => {
    expect(parseRepairSemanticArgs(["--skip-rebuild"])).toEqual({ skipRebuild: true, dryRun: false });
  });

  it("parses --dry-run flag", () => {
    expect(parseRepairSemanticArgs(["--dry-run"])).toEqual({ skipRebuild: false, dryRun: true });
  });

  it("defaults both flags to false", () => {
    expect(parseRepairSemanticArgs([])).toEqual({ skipRebuild: false, dryRun: false });
  });

  it("formats success result", () => {
    const out = formatRepairResult({ ok: true, ranRebuild: true, ranWarmup: true, error: null });
    expect(out).toContain("✅");
    expect(out).toContain("semantic ready");
  });

  it("formats failure result with original error", () => {
    const out = formatRepairResult({ ok: false, ranRebuild: true, ranWarmup: true, error: "sharp module crash" });
    expect(out).toContain("❌");
    expect(out).toContain("sharp module crash");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm exec vitest run packages/cli/src/__tests__/repair-semantic.test.ts`
Expected: FAIL with "Failed to load url ../commands/repair-semantic.js".

- [ ] **Step 3: Implement the command**

Create `packages/cli/src/commands/repair-semantic.ts`:

```typescript
import { spawnSync } from "node:child_process";
import { NPMMIRROR_SHARP_LIBVIPS } from "../postinstall-helpers.js";
import { describeSemanticReadiness } from "../warmup-state.js";

export interface RepairSemanticOptions {
  skipRebuild: boolean;
  dryRun: boolean;
}

export interface RepairSemanticResult {
  ok: boolean;
  ranRebuild: boolean;
  ranWarmup: boolean;
  error: string | null;
}

export function parseRepairSemanticArgs(argv: string[]): RepairSemanticOptions {
  return {
    skipRebuild: argv.includes("--skip-rebuild"),
    dryRun: argv.includes("--dry-run"),
  };
}

export function formatRepairResult(r: RepairSemanticResult): string {
  if (r.ok) {
    return [
      "──────────────────────────────────────────────────────────────",
      "✅ semantic ready",
      `   rebuild: ${r.ranRebuild ? "ran" : "skipped"}`,
      `   warmup:  ${r.ranWarmup ? "ran" : "skipped"}`,
      "──────────────────────────────────────────────────────────────",
      "",
    ].join("\n");
  }
  return [
    "──────────────────────────────────────────────────────────────",
    "❌ repair-semantic FAILED",
    "",
    `   ${r.error ?? "(unknown error)"}`,
    "",
    "Manual fallback:",
    `  $env:SHARP_DIST_BASE_URL = "${NPMMIRROR_SHARP_LIBVIPS}"`,
    "  pnpm rebuild sharp",
    "  pnpm viki warmup",
    "──────────────────────────────────────────────────────────────",
    "",
  ].join("\n");
}

export async function executeRepairSemantic(
  opts: RepairSemanticOptions,
): Promise<RepairSemanticResult> {
  const env = { ...process.env, SHARP_DIST_BASE_URL: NPMMIRROR_SHARP_LIBVIPS };
  let ranRebuild = false;
  let ranWarmup = false;

  if (!opts.skipRebuild) {
    if (opts.dryRun) {
      ranRebuild = true;
    } else {
      const rebuild = spawnSync("corepack", ["pnpm", "rebuild", "sharp"], {
        env,
        stdio: "inherit",
        shell: process.platform === "win32",
      });
      ranRebuild = true;
      if (rebuild.status !== 0) {
        return { ok: false, ranRebuild, ranWarmup, error: `pnpm rebuild sharp exited ${rebuild.status}` };
      }
    }
  }

  if (opts.dryRun) {
    ranWarmup = true;
  } else {
    const warmup = spawnSync("corepack", ["pnpm", "viki", "warmup"], {
      env,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    ranWarmup = true;
    if (warmup.status !== 0) {
      return { ok: false, ranRebuild, ranWarmup, error: `viki warmup exited ${warmup.status}` };
    }
  }

  if (opts.dryRun) {
    return { ok: true, ranRebuild, ranWarmup, error: null };
  }
  const r = describeSemanticReadiness();
  if (!r.ready) {
    return { ok: false, ranRebuild, ranWarmup, error: `state still not ready after repair (reason=${r.reason})` };
  }
  return { ok: true, ranRebuild, ranWarmup, error: null };
}
```

- [ ] **Step 4: Register in bin.ts**

In `packages/cli/src/bin.ts`, find the subcommand switch and add:

```typescript
case "repair-semantic": {
  const { parseRepairSemanticArgs, executeRepairSemantic, formatRepairResult } = await import(
    "./commands/repair-semantic.js"
  );
  const opts = parseRepairSemanticArgs(argv.slice(1));
  const result = await executeRepairSemantic(opts);
  process.stdout.write(formatRepairResult(result));
  process.exit(result.ok ? 0 : 1);
}
```

- [ ] **Step 5: Run tests + manual smoke**

Run: `corepack pnpm exec vitest run packages/cli/src/__tests__/repair-semantic.test.ts`
Expected: 5/5 PASS.

Manual: `corepack pnpm viki repair-semantic --dry-run`
Expected: prints "✅ semantic ready" with rebuild/warmup marked "ran" (dry-run shortcut).

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/repair-semantic.ts packages/cli/src/__tests__/repair-semantic.test.ts packages/cli/src/bin.ts
git commit -m "feat(cli): viki repair-semantic — one-shot self-heal for sharp/warmup"
```

---

## Task 5: SessionStart loud banner when semantic isn't ready

**Files:**
- Modify: `packages/types/src/attribution.ts` (new event)
- Modify: `packages/adapters/src/attribution/stdout-renderer.ts` (exhaustive case)
- Modify: `packages/cli/src/bin-session-start.ts` (emit banner)
- Modify: `packages/cli/src/__tests__/bin-session-start.test.ts` (or create) — assert banner fires when not ready

- [ ] **Step 1: Add attribution event type**

In `packages/types/src/attribution.ts`, near the other `HookSessionStart*` events, add:

```typescript
export interface HookSessionStartSemanticBannerEvent extends AttributionEventBase {
  kind: "hook-session-start.semantic-not-ready";
  source: "hook-session-start";
  reason: string;
  repairCommand: string;
}
```

Add `| HookSessionStartSemanticBannerEvent` to the union at the bottom of the file.

- [ ] **Step 2: Add the exhaustive case in stdout-renderer**

In `packages/adapters/src/attribution/stdout-renderer.ts`, before the `default:` clause in `describeEvent`, add:

```typescript
case "hook-session-start.semantic-not-ready":
  return `🛑 语义匹配未启动 (${event.reason})；规则保护降级到关键词。修复：${event.repairCommand}`;
```

- [ ] **Step 3: Write failing test**

In `packages/cli/src/__tests__/bin-session-start.test.ts` (create if it doesn't exist), add:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { emitSemanticBannerIfDegraded } from "../bin-session-start.js";

describe("bin-session-start banner", () => {
  let home: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "viki-banner-"));
    mkdirSync(join(home, ".viki"), { recursive: true });
  });
  afterEach(() => { rmSync(home, { recursive: true, force: true }); });

  it("emits banner when no warmup state exists", () => {
    const events: any[] = [];
    emitSemanticBannerIfDegraded(home, (e) => events.push(e));
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("hook-session-start.semantic-not-ready");
    expect(events[0].repairCommand).toContain("viki repair-semantic");
  });

  it("emits banner when last attempt failed and no last-success", () => {
    writeFileSync(
      join(home, ".viki", ".warmup-state.json"),
      JSON.stringify({ status: "failed", started_at: "2026-05-16T00:00:00Z", pid: 1, model: "x", error: "..." }),
    );
    const events: any[] = [];
    emitSemanticBannerIfDegraded(home, (e) => events.push(e));
    expect(events).toHaveLength(1);
    expect(events[0].reason).toBe("failed");
  });

  it("stays silent when last-success exists", () => {
    writeFileSync(
      join(home, ".viki", ".warmup-last-success.json"),
      JSON.stringify({
        status: "ready", started_at: "2026-05-15T00:00:00Z", completed_at: "2026-05-15T00:01:00Z",
        pid: 1, model: "x", cwd: "/p", node_modules_root: "/p/node_modules",
      }),
    );
    const events: any[] = [];
    emitSemanticBannerIfDegraded(home, (e) => events.push(e));
    expect(events).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `corepack pnpm exec vitest run packages/cli/src/__tests__/bin-session-start.test.ts`
Expected: FAIL with "emitSemanticBannerIfDegraded is not exported".

- [ ] **Step 5: Implement the banner emitter**

In `packages/cli/src/bin-session-start.ts`, add an exported function near the top of the runtime body and call it in the SessionStart pipeline:

```typescript
import { describeSemanticReadiness } from "./warmup-state.js";
import type { AttributionEvent } from "@viki/types";

export function emitSemanticBannerIfDegraded(
  homeDir: string,
  emit: (event: AttributionEvent) => void,
): void {
  const r = describeSemanticReadiness(homeDir);
  if (r.ready) return;
  emit({
    kind: "hook-session-start.semantic-not-ready",
    source: "hook-session-start",
    severity: "warn",
    timestamp: new Date().toISOString(),
    reason: r.reason,
    repairCommand: "viki repair-semantic",
  });
}
```

Call it in the SessionStart entrypoint right after locating `homeDir`:

```typescript
emitSemanticBannerIfDegraded(os.homedir(), (e) => bus.emit(e));
```

- [ ] **Step 6: Run test + typecheck**

Run: `corepack pnpm exec vitest run packages/cli/src/__tests__/bin-session-start.test.ts`
Expected: 3/3 PASS.

Run: `corepack pnpm exec tsc --noEmit -p packages/cli && corepack pnpm exec tsc --noEmit -p packages/adapters && corepack pnpm exec tsc --noEmit -p packages/types`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add packages/types/src/attribution.ts packages/adapters/src/attribution/stdout-renderer.ts packages/cli/src/bin-session-start.ts packages/cli/src/__tests__/bin-session-start.test.ts
git commit -m "feat(cli): loud SessionStart banner when semantic matcher isn't ready"
```

---

## Task 6: Stop hook reminder when Step 6b/6c skipped

**Files:**
- Modify: `packages/cli/src/bin-stop.ts`
- Modify: `packages/types/src/attribution.ts` (new event)
- Modify: `packages/adapters/src/attribution/stdout-renderer.ts` (exhaustive case)
- Modify: `packages/cli/src/__tests__/bin-stop.test.ts` (assert emission when warmup not ready)

When `useLegacyMatcher = true`, currently Step 6b just silently skips. We add a single emit so the user knows "this Stop ran with no semantic scan".

- [ ] **Step 1: Add attribution event type + exhaustive case**

In `packages/types/src/attribution.ts`:

```typescript
export interface HookStopSemanticSkippedEvent extends AttributionEventBase {
  kind: "hook-stop.semantic-skipped";
  source: "hook-stop";
  reason: string;
}
```

Add `| HookStopSemanticSkippedEvent` to the union.

In `packages/adapters/src/attribution/stdout-renderer.ts` (before `default:`):

```typescript
case "hook-stop.semantic-skipped":
  return `Stop 跳过语义扫描 (${event.reason})；运行 viki repair-semantic`;
```

- [ ] **Step 2: Wire the emit in bin-stop.ts**

In `packages/cli/src/bin-stop.ts`, find the `if (!useLegacyMatcher) {` block (around line 751 after Task 2's changes). Add an `else` branch right after it:

```typescript
        if (!useLegacyMatcher) {
          // ... existing Step 6b + 6c body ...
        } else {
          emitWithFallback(
            emit,
            {
              kind: "hook-stop.semantic-skipped",
              source: "hook-stop",
              severity: "info",
              timestamp: nowIso(),
              reason: stopWarmup.reason,
            },
            `Viki: 语义扫描跳过 (${stopWarmup.reason}); 运行 viki repair-semantic\n`,
          );
        }
```

- [ ] **Step 3: Add test**

In `packages/cli/src/__tests__/bin-stop.test.ts`, add a new test (use the existing test rig):

```typescript
it("emits semantic-skipped when warmup state is failed", async () => {
  // VIKI_HOME points to fresh tmp dir per beforeEach. Write a failed warmup state.
  const fs = await import("node:fs");
  const path = await import("node:path");
  fs.mkdirSync(path.join(testVikiHome, ".viki"), { recursive: true });
  fs.writeFileSync(
    path.join(testVikiHome, ".viki", ".warmup-state.json"),
    JSON.stringify({ status: "failed", started_at: "2026-05-16T00:00:00Z", pid: 1, model: "x", error: "..." }),
  );

  const emitted: any[] = [];
  const input: StopHookInput = {
    session_id: "skip-test",
    transcript_path: transcriptPath,
    cwd: process.cwd(),
    hook_event_name: "Stop",
  };
  await runStopPipeline(input, { emit: (e: any) => emitted.push(e) });
  const skipEvent = emitted.find((e) => e.kind === "hook-stop.semantic-skipped");
  expect(skipEvent).toBeDefined();
  expect(skipEvent.reason).toBe("failed");
});
```

- [ ] **Step 4: Run all bin-stop tests**

Run: `corepack pnpm exec vitest run packages/cli/src/__tests__/bin-stop.test.ts`
Expected: previous 21 + new 1 = 22 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/bin-stop.ts packages/types/src/attribution.ts packages/adapters/src/attribution/stdout-renderer.ts packages/cli/src/__tests__/bin-stop.test.ts
git commit -m "feat(cli): Stop hook emits semantic-skipped attribution when matcher unavailable"
```

---

## Task 7: Doctor — separate "not enabled" from "broken" (Bugs 2 + 3)

**Files:**
- Modify: `packages/cli/src/commands/doctor.ts`
- Modify: `packages/cli/src/__tests__/doctor.test.ts`

Today's behavior:
- `vec-coverage` reports FAIL if any active rule lacks vectors, even when the user never ran warmup.
- `plugin-sync` reports FAIL when `.claude/plugins/` is absent, even when the user never enabled any plugins.

Both should be SKIP, not FAIL, when the user hasn't opted in.

- [ ] **Step 1: Write failing tests for both checks**

In `packages/cli/src/__tests__/doctor.test.ts`, add:

```typescript
it("vec-coverage SKIPs when warmup has never succeeded", async () => {
  // Set up a doctor run with no warmup-last-success.json and no .warmup-state.json
  // (helper fn / fixture per existing test patterns).
  const result = await runDoctorWithHome(makeFreshHome());
  const row = result.rows.find((r) => r.id === "vec-coverage");
  expect(row?.status).toBe("skip");
  expect(row?.message).toMatch(/run viki warmup/);
});

it("plugin-sync SKIPs when no plugins are enabled in any settings.json", async () => {
  const home = makeFreshHome(); // no settings.json with enabledPlugins
  const result = await runDoctorWithHome(home);
  const row = result.rows.find((r) => r.id === "plugin-sync");
  expect(row?.status).toBe("skip");
});
```

Wire `runDoctorWithHome` against the existing doctor test rig if absent (model on existing fixtures).

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm exec vitest run packages/cli/src/__tests__/doctor.test.ts`
Expected: FAIL — the two new tests fail because both rows currently return status=fail.

- [ ] **Step 3: Patch the doctor checks**

In `packages/cli/src/commands/doctor.ts`, find the `vec-coverage` check and the `plugin-sync` check. For each, gate on the opt-in signal:

```typescript
// vec-coverage:
const semanticReady = describeSemanticReadiness(home);
if (!semanticReady.ready && semanticReady.reason !== "ready_via_state" && semanticReady.reason !== "ready_via_last_success") {
  return { id: "vec-coverage", status: "skip", message: "warmup 未完成；run viki warmup 或 viki repair-semantic" };
}
// ... existing 0/66 check follows ...
```

```typescript
// plugin-sync:
const enabledPlugins = readEnabledPluginsFromAllSettings(home, cwd);
if (Object.keys(enabledPlugins).length === 0) {
  return { id: "plugin-sync", status: "skip", message: "no plugins enabled (opt-in via viki install-plugins)" };
}
// ... existing check follows ...
```

Helper `readEnabledPluginsFromAllSettings` reads user-level + project-level settings.json, merges `enabledPlugins`. If empty in both → user hasn't opted in.

- [ ] **Step 4: Run tests**

Run: `corepack pnpm exec vitest run packages/cli/src/__tests__/doctor.test.ts`
Expected: All previously-passing tests still pass + the 2 new tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/doctor.ts packages/cli/src/__tests__/doctor.test.ts
git commit -m "fix(doctor): SKIP (not FAIL) vec-coverage when warmup-never-ran, plugin-sync when no plugins enabled"
```

---

## Task 8: `init --home` respects sandbox for user-level hook write (Bug 1)

**Files:**
- Modify: `packages/cli/src/commands/init.ts`
- Modify: `packages/cli/src/__tests__/init.test.ts`

Currently the "user-level hook" writer in `init.ts` uses `os.homedir()` directly, ignoring `args.home`. CI / judge / sandbox tests get their real `~/.claude/settings.json` polluted by inert hook entries.

- [ ] **Step 1: Write failing test**

In `packages/cli/src/__tests__/init.test.ts`, add:

```typescript
it("--home redirects user-level hook write to sandbox (does not touch real ~/.claude/)", async () => {
  const sandboxHome = mkdtempSync(join(tmpdir(), "viki-init-home-"));
  const sandboxCwd = mkdtempSync(join(tmpdir(), "viki-init-cwd-"));
  const realHomeSnapshot = readSettingsIfExists(join(os.homedir(), ".claude", "settings.json"));

  await executeInit({
    home: sandboxHome,
    cwd: sandboxCwd,
    skipWarmup: true,
    target: "claude",
  });

  // Sandbox should have the user-level settings now.
  const sandboxSettingsPath = join(sandboxHome, ".claude", "settings.json");
  expect(existsSync(sandboxSettingsPath)).toBe(true);
  const sandboxSettings = JSON.parse(readFileSync(sandboxSettingsPath, "utf-8"));
  expect(sandboxSettings.hooks).toBeDefined();

  // Real ~/.claude/settings.json untouched (or, if it had viki entries before, byte-identical).
  const realHomeAfter = readSettingsIfExists(join(os.homedir(), ".claude", "settings.json"));
  expect(realHomeAfter).toEqual(realHomeSnapshot);

  rmSync(sandboxHome, { recursive: true, force: true });
  rmSync(sandboxCwd, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm exec vitest run packages/cli/src/__tests__/init.test.ts -t "user-level hook write to sandbox"`
Expected: FAIL — the assertion `realHomeAfter equals realHomeSnapshot` fails because init wrote to the real home.

- [ ] **Step 3: Patch init.ts**

Grep for `os.homedir()` in `packages/cli/src/commands/init.ts`. Each call site that resolves the user-level `~/.claude/settings.json` path should accept and use `args.home ?? os.homedir()` instead. Example fix shape:

```typescript
// Before:
const userClaudeSettings = path.join(os.homedir(), ".claude", "settings.json");
// After:
const userHome = args.home ?? os.homedir();
const userClaudeSettings = path.join(userHome, ".claude", "settings.json");
```

If the user-level writer is in a separate helper (e.g., `writeUserLevelHook`), thread the home argument through that helper's signature.

- [ ] **Step 4: Run test + the sandbox dogfood**

Run: `corepack pnpm exec vitest run packages/cli/src/__tests__/init.test.ts`
Expected: All tests pass including the new one.

Manual: `SANDBOX_HOME=$(mktemp -d) && SANDBOX_CWD=$(mktemp -d) && corepack pnpm viki init --home="$SANDBOX_HOME" --cwd="$SANDBOX_CWD" --skip-warmup && ls "$SANDBOX_HOME/.claude/" && stat -c '%y' /c/Users/$USER/.claude/settings.json`
Expected: `$SANDBOX_HOME/.claude/settings.json` exists; real `~/.claude/settings.json` mtime unchanged.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/init.ts packages/cli/src/__tests__/init.test.ts
git commit -m "fix(init): --home redirects user-level hook write to sandbox (no real-home pollution)"
```

---

## Task 9: Write the success marker when warmup finishes

**Files:**
- Modify: wherever the existing warmup code writes `status: "ready"` to `.warmup-state.json`

Task 1 added the API; this task plugs in the producer side so `.warmup-last-success.json` actually gets written on success.

- [ ] **Step 1: Locate the writer**

Run: `corepack pnpm exec grep -rn 'status: "ready"\|status:"ready"' packages/cli/src --include='*.ts'`
Expected: one or two lines, probably in `packages/cli/src/warmup-run.ts` (or similar). Record the path.

- [ ] **Step 2: Wire the dual-write**

At each call site that writes `status: "ready"` to the regular state file, immediately after the successful write, also call:

```typescript
import { writeWarmupLastSuccess, defaultWarmupLastSuccessPath } from "./warmup-state.js";

writeWarmupLastSuccess(defaultWarmupLastSuccessPath(os.homedir()), {
  status: "ready",
  started_at: state.started_at,
  completed_at: state.completed_at ?? new Date().toISOString(),
  pid: state.pid,
  model: state.model,
  cwd: process.cwd(),
  node_modules_root: resolveNodeModulesRoot() ?? "(unknown)",
});
```

Where `resolveNodeModulesRoot()` walks up from `__dirname` to find the nearest `node_modules` ancestor (or returns null if none).

- [ ] **Step 3: Add assertion to the existing warmup test**

Find the existing warmup-success test (likely in `packages/cli/src/__tests__/warmup-*.test.ts`). Add an assertion:

```typescript
import { defaultWarmupLastSuccessPath, readWarmupLastSuccess } from "../warmup-state.js";
// ... after the warmup-success path runs:
const ls = readWarmupLastSuccess(defaultWarmupLastSuccessPath(testHome));
expect(ls).not.toBeNull();
expect(ls?.status).toBe("ready");
```

- [ ] **Step 4: Run tests**

Run: `corepack pnpm exec vitest run packages/cli/src/__tests__/`
Expected: 0 regressions.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/  # whichever files changed
git commit -m "feat(cli): write sticky last-success marker when warmup completes"
```

---

## Task 10: Full validation pass

**Files:** None (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `corepack pnpm exec vitest run`
Expected: 0 regressions from the baseline (which already has 7 known Windows-symlink-EPERM failures unrelated to this plan).

- [ ] **Step 2: Typecheck all packages**

Run: `corepack pnpm typecheck`
Expected: 0 errors in packages/types, /ports, /adapters, /cli, /viki. (packages/core has pre-existing rootDir errors from `fixtures/` — unchanged.)

- [ ] **Step 3: Build**

Run: `corepack pnpm -r build`
Expected: build success across all packages, all 9 hook bundles emitted under `packages/cli/dist/` and `packages/viki/dist/`.

- [ ] **Step 4: Manual end-to-end dogfooding**

```bash
SANDBOX_HOME=$(mktemp -d)
SANDBOX_CWD=$(mktemp -d)
corepack pnpm viki init --home="$SANDBOX_HOME" --cwd="$SANDBOX_CWD" --skip-warmup
# Expected: only $SANDBOX_HOME/.claude/settings.json written (real ~/.claude/ untouched).
corepack pnpm viki doctor --home="$SANDBOX_HOME" --cwd="$SANDBOX_CWD"
# Expected: vec-coverage = SKIP, plugin-sync = SKIP (no FAILs from those two).
corepack pnpm viki repair-semantic --dry-run --home="$SANDBOX_HOME"
# Expected: ✅ semantic ready (dry-run shortcut).
rm -rf "$SANDBOX_HOME" "$SANDBOX_CWD"
```

- [ ] **Step 5: Final commit if anything outstanding**

(If a follow-up touch-up is needed during Step 4 dogfood, commit it now.)

- [ ] **Step 6: Squash-merge / cherry-pick to main and push**

If implementation happened in a worktree branch, cherry-pick the chain onto main and push:

```bash
git -C D:/0jingtong/Matrix-Viki cherry-pick <first>..<last>
git -C D:/0jingtong/Matrix-Viki push origin main
```

---

## Cross-cutting notes

- **`describeWarmupReadiness` vs `describeSemanticReadiness`:** the former is still used internally by anything that wants the **raw last-attempt** state (doctor's `vector_model` diagnostic row, for instance). The latter is the only correct caller for "should we use semantic now?" decisions. Keep both — don't delete the old one.

- **Why no PreToolUse deny:** the user chose "soft block — banner only, no deny" so `bin-pre-tool-use.ts` keeps the keyword fallback path; we just make sure the banner already fired on SessionStart so the user knows their PreToolUse hits are degraded.

- **What this plan does NOT do:**
  - Auto-install `sharp` native binary on Linux/macOS (Linux often comes prebuilt from npm; this plan focuses on the Windows + China cliff).
  - Migrate existing `.warmup-state.json` files. New users get both files; existing users get sticky-success only after their next successful warmup. Acceptable — the failure mode for the transition window is identical to today.
  - Touch `viki init`'s output formatting beyond the `--home` bug. Doctor banner / init prompts are out of scope.

- **Suggested execution worktree:** create a fresh worktree from `main` for execution (the previous worktree `magical-brewing-wozniak` has been deleted and shouldn't be reused).
