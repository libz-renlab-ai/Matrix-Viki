import { describe, it, expect } from "vitest";
import { accumulateHardNegativesFromEvents } from "../stop-hard-negative-accumulation.js";
import type { KnowledgeEntry, PersistedEvent } from "@viki/types";
import type { KnowledgeStore, RuleEmbedder } from "@viki/ports";

const stubEmbedder: RuleEmbedder = {
  modelId: "test",
  dim: 4,
  async embed(texts) {
    return texts.map(() => [0.5, 0.5, 0.5, 0.5]);
  },
};

function makeRule(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "rule-A",
    scope: { level: "global" },
    category: "E",
    tags: [],
    type: "avoidance",
    nature: "objective",
    trigger: "x",
    wrong_pattern: "",
    correct_pattern: "y",
    reasoning: "",
    confidence: 0.7,
    enforcement: "warn",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: new Date().toISOString(),
    last_hit_at: "",
    last_validated_at: new Date().toISOString(),
    source: "accumulated",
    conflict_with: [],
    current_tier: "experimental",
    max_tier_ever: "experimental",
    tier_entered_at: new Date().toISOString(),
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    channel: "tool-action",
    fire_threshold: 0.55,
    threshold_alpha: 1.0,
    threshold_beta: 1.0,
    embedder_model_id: "test",
    hard_negatives: undefined,
    ...overrides,
  };
}

function makeInMemoryStore(rules: KnowledgeEntry[]): KnowledgeStore {
  const byId = new Map<string, KnowledgeEntry>(rules.map((r) => [r.id, r]));
  return {
    getAll() { return [...byId.values()]; },
    getActive() { return [...byId.values()]; },
    getById(id: string) { return byId.get(id); },
    query() { return [...byId.values()]; },
    add() { /* noop for these tests */ },
    update(id: string, patch: Partial<KnowledgeEntry>) {
      const cur = byId.get(id);
      if (cur) byId.set(id, { ...cur, ...patch });
    },
    delete() { return false; },
    count() { return byId.size; },
  } as unknown as KnowledgeStore;
}

function ev(overrides: Partial<PersistedEvent> = {}): PersistedEvent {
  return {
    id: "e1",
    kind: "ai.override.ignored",
    knowledge_id: "rule-A",
    timestamp: new Date().toISOString(),
    schema_version: 1,
    ...overrides,
  } as PersistedEvent;
}

describe("accumulateHardNegativesFromEvents", () => {
  it("appends a hard_negative when ai.override.ignored event matches an active rule", async () => {
    const store = makeInMemoryStore([makeRule()]);
    const events = { readLast: () => [ev()] };
    const res = await accumulateHardNegativesFromEvents({
      events, store, embedder: stubEmbedder, now: new Date(),
    });
    expect(res.scanned).toBe(1);
    expect(res.updated).toBe(1);
    const rule = store.getById("rule-A")!;
    const hn = JSON.parse(String(rule.hard_negatives));
    expect(hn).toHaveLength(1);
    expect(hn[0]).toHaveLength(4);
  });

  it("skips events of unrelated kinds without calling the embedder", async () => {
    let embedCalls = 0;
    const countingEmbedder: RuleEmbedder = {
      modelId: "test", dim: 4,
      async embed(texts) { embedCalls++; return texts.map(() => [0.5, 0.5, 0.5, 0.5]); },
    };
    const store = makeInMemoryStore([makeRule()]);
    const events = {
      readLast: () => [ev({ kind: "hook-post.result" } as Partial<PersistedEvent>)],
    };
    const res = await accumulateHardNegativesFromEvents({
      events, store, embedder: countingEmbedder, now: new Date(),
    });
    expect(res.scanned).toBe(1);
    expect(res.updated).toBe(0);
    expect(embedCalls).toBe(0);
  });

  it("swallows per-event errors so a single failure does not abort the Stop pipeline", async () => {
    const store = makeInMemoryStore([makeRule()]);
    let calls = 0;
    const flakyEmbedder: RuleEmbedder = {
      modelId: "test", dim: 4,
      async embed(texts) {
        calls++;
        if (calls === 1) throw new Error("transient embedder failure");
        return texts.map(() => [0.5, 0.5, 0.5, 0.5]);
      },
    };
    const events = {
      readLast: () => [
        ev({ id: "e1" }),
        ev({ id: "e2" }),
      ],
    };
    const res = await accumulateHardNegativesFromEvents({
      events, store, embedder: flakyEmbedder, now: new Date(),
    });
    expect(res.scanned).toBe(2);
    expect(res.updated).toBe(1);
    const rule = store.getById("rule-A")!;
    const hn = JSON.parse(String(rule.hard_negatives));
    expect(hn).toHaveLength(1);
  });

  it("skips events without knowledge_id", async () => {
    let embedCalls = 0;
    const countingEmbedder: RuleEmbedder = {
      modelId: "test", dim: 4,
      async embed(texts) { embedCalls++; return texts.map(() => [0.5, 0.5, 0.5, 0.5]); },
    };
    const store = makeInMemoryStore([makeRule()]);
    const events = {
      readLast: () => [ev({ knowledge_id: undefined } as Partial<PersistedEvent>)],
    };
    const res = await accumulateHardNegativesFromEvents({
      events, store, embedder: countingEmbedder, now: new Date(),
    });
    expect(res.scanned).toBe(1);
    expect(res.updated).toBe(0);
    expect(embedCalls).toBe(0);
  });
});
