import type { RuleEmbedder, KnowledgeStore } from "@viki/ports";
import type { KnowledgeEntry, PersistedEvent } from "@viki/types";
import { accumulateHardNegative } from "@viki/core";

const HARD_NEGATIVE_KINDS = new Set([
  "ai.override.ignored",
  "ai.override.blocked_circumvented",
  "user.supportive_negation",
  "git.revert.related",
]);

const CORE_KEYS = new Set([
  "id",
  "kind",
  "knowledge_id",
  "tool_use_id",
  "timestamp",
  "schema_version",
]);

export type EventReader = { readLast(n: number): PersistedEvent[] };

/**
 * Minimum store surface this step touches. Both DualLayerStore and
 * SqliteKnowledgeStore satisfy this structurally, so the wrapper accepts
 * either without forcing the caller to upcast to the full KnowledgeStore.
 */
export type HardNegativeStore = {
  getById(id: string): KnowledgeEntry | undefined;
  update(id: string, patch: Partial<KnowledgeEntry>): void;
};

export async function accumulateHardNegativesFromEvents(args: {
  events: EventReader;
  store: HardNegativeStore;
  embedder: RuleEmbedder;
  now: Date;
  scanLimit?: number;
}): Promise<{ scanned: number; updated: number }> {
  const limit = args.scanLimit ?? 200;
  const recent = args.events.readLast(limit);
  let updated = 0;
  for (const ev of recent) {
    if (!ev.kind || !HARD_NEGATIVE_KINDS.has(ev.kind)) continue;
    if (!ev.knowledge_id) continue;
    try {
      const payload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(ev)) {
        if (!CORE_KEYS.has(k)) payload[k] = v;
      }
      const before = args.store.getById(ev.knowledge_id);
      await accumulateHardNegative({
        event: {
          kind: ev.kind,
          knowledge_id: ev.knowledge_id,
          timestamp: ev.timestamp,
          payload,
        },
        store: args.store as unknown as KnowledgeStore,
        embedder: args.embedder,
        now: args.now,
      });
      const after = args.store.getById(ev.knowledge_id);
      if (after?.hard_negatives !== before?.hard_negatives) updated++;
    } catch {
      /* per-event failures must not abort the Stop pipeline */
    }
  }
  return { scanned: recent.length, updated };
}
