import { describe } from "vitest";
import { runKnowledgeStoreContract } from "@viki/ports/contracts";
import { InMemoryKnowledgeStore } from "../in-memory-store.js";

describe("InMemoryKnowledgeStore", () => {
  runKnowledgeStoreContract(() => new InMemoryKnowledgeStore());
});
