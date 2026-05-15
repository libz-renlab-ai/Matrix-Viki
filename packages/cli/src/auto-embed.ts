/**
 * Shared helper: backfill trigger/pattern descriptions + vec0 vectors for any
 * rules that were inserted with bare `store.add()` (i.e. without descriptions
 * or embedder). Used by every rule-ingest entry point so semantic match works
 * out of the box no matter how the rule arrived.
 *
 * Wraps `executeMigrateV6({ fast: true, repairAll: false })`:
 *   - fast=true   → no LLM call (uses buildFallbackDescriptions)
 *   - repairAll=false → only processes rules with empty trigger_description
 *     (idempotent on re-run; ~no-op if everything's already embedded)
 *
 * Best-effort: errors are swallowed and reported via the returned shape so the
 * host command (pitfall / pack add / review-candidates / init project import)
 * never fails over a missing embedder, dead daemon, or absent vector deps.
 *
 * Returns:
 *   { embedded: number; error?: string }
 *   - embedded ≥ 0 — count of newly-vectored rules; 0 means nothing to do.
 *   - error present → embedding failed; rules are still in the DB but vec
 *     tables remain empty for them. Doctor's `vec-coverage` check will surface
 *     this on the next run.
 */
export async function ensureNewRulesEmbedded(
  dbPath: string,
): Promise<{ embedded: number; error?: string }> {
  if (process.env["VIKI_SKIP_AUTO_EMBED"] === "1") {
    return { embedded: 0 };
  }
  if (process.env["NODE_ENV"] === "test" || process.env["VITEST"] === "true") {
    return { embedded: 0 };
  }
  try {
    const { executeMigrateV6 } = await import("./commands/migrate-v6.js");
    const result = await executeMigrateV6({
      dryRun: false,
      dbPath,
      fast: true,
      repairAll: false,
    });
    return { embedded: result.migrated };
  } catch (err) {
    return { embedded: 0, error: String(err).slice(0, 200) };
  }
}
