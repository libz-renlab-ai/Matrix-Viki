import { findVikiRoot as findHardenedRoot } from "./lib/walk-up.js";

/**
 * Walk up from `cwd` to find the nearest ancestor directory containing
 * `.viki/knowledge.db` (issue #161). Mirrors `git`'s ancestor-walk for `.git/`.
 *
 * Thin wrapper around the hardened `lib/walk-up.ts` helper that:
 *   - requires a project marker in the matched directory,
 *   - caps the walk at `~`,
 *   - rejects symlinks via `lstatSync`.
 *
 * Returns the matched ancestor, or `cwd` when no ancestor matches (so callers
 * that need a string keep working without explicit `?? cwd` plumbing). Use
 * `lib/walk-up.ts#findVikiRoot` directly when the caller needs to
 * distinguish "no project found" from "cwd is the project".
 */
export function findVikiRoot(cwd: string): string {
  return findHardenedRoot(cwd) ?? cwd;
}
