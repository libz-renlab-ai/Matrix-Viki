/**
 * Defense-in-depth path validation for team-rule files. Rejects rule_ids and
 * authors that could produce path traversal, ANSI/shell injection, or
 * Windows MAX_PATH overflow.
 *
 * Mirrors Matrix-Lucky's secret-scanner.ts constants so the two systems
 * accept the same set of valid rule_ids.
 */

const SAFE_RULE_ID_RE = /^[A-Za-z0-9._-]{1,200}$/;
const SAFE_AUTHOR_RE = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * Windows MAX_PATH is 260 chars without long-path support. We budget 250
 * to leave headroom for the `.tmp-<pid>-<rand>` intermediate file used by
 * the atomic write path in FsTeamRuleStore.
 */
export const WINDOWS_MAX_PATH_BUDGET = 250;

export function isSafeRuleId(id: string): boolean {
  // Explicitly reject filesystem-traversal sentinels even though `.` and `-`
  // are in the regex char class — `..` would create surprising filenames
  // like <author>/...json that confuse later tooling.
  if (id === "." || id === "..") return false;
  return SAFE_RULE_ID_RE.test(id);
}

export function isSafeAuthor(a: string): boolean {
  if (a === "." || a === "..") return false;
  return SAFE_AUTHOR_RE.test(a);
}

/**
 * Compute the absolute path length that <projectRoot>/.viki/team/<author>/<ruleId>.json would have.
 * Use the same separator counts ("/") in both POSIX and Windows estimates —
 * the budget is the same regardless; only the renderer differs.
 */
export function estimateTeamRulePathLength(
  projectRoot: string,
  author: string,
  ruleId: string,
): number {
  // <projectRoot> + "/" + ".viki" + "/" + "team" + "/" + author + "/" + ruleId + ".json"
  return projectRoot.length + 1 + 5 + 1 + 4 + 1 + author.length + 1 + ruleId.length + 5;
}

export function isTeamRulePathLengthSafe(
  projectRoot: string,
  author: string,
  ruleId: string,
): boolean {
  return estimateTeamRulePathLength(projectRoot, author, ruleId) <= WINDOWS_MAX_PATH_BUDGET;
}
