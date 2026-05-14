import { describe } from "vitest";
import { runAttributionBusContract } from "@viki/ports/contracts";
import { InMemoryAttributionBus } from "../in-memory-bus.js";

describe("InMemoryAttributionBus", () => {
  runAttributionBusContract(() => new InMemoryAttributionBus());
});
