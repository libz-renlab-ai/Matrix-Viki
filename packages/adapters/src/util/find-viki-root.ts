import { findVikiRoot as findHardenedRoot } from "./walk-up.js";

/**
 * Walk up from `cwd` to find the nearest ancestor directory containing
 * `.viki/knowledge.db` (issue #161). Mirrors `git`'s ancestor-walk for `.git/`.
 *
 * Thin wrapper around the hardened `walk-up.ts` helper that:
 *   - requires a project marker in the matched directory,
 *   - caps the walk at `~`,
 *   - rejects symlinks via `lstatSync`.
 *
 * Returns the matched ancestor, or `cwd` when no ancestor matches (so callers
 * that need a string keep working without explicit `?? cwd` plumbing).
 *
 * NOTE: this is the adapters-side wrapper. The CLI side has the same
 * delegation pattern; the duplication exists because `@viki/adapters`
 * cannot import from `@viki/cli`. Consolidate to a shared util package
 * as future refactor.
 */
export function findVikiRoot(cwd: string): string {
  return findHardenedRoot(cwd) ?? cwd;
}
