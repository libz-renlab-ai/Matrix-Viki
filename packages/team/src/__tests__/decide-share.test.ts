import { describe, expect, it } from "vitest";
import { decideShareAction } from "../decide-share.js";
import type { ScopeResult, SecretMatch } from "../types.js";

const noSecrets: SecretMatch[] = [];
const oneSecret: SecretMatch[] = [{ kind: "aws-access-key", preview: "AKIA…", span: [0, 20] }];
const shareableClass: ScopeResult = { class: "shareable", reason: "shareable=2" };
const personalClass: ScopeResult = { class: "personal", reason: "personal=1" };
const uncertainClass: ScopeResult = { class: "uncertain", reason: "personal=0 shareable=0" };

describe("decideShareAction", () => {
  it("blocks on secret regardless of override", () => {
    const r = decideShareAction({
      scan: oneSecret,
      classification: shareableClass,
      userOverride: "team",
    });
    expect(r.kind).toBe("blocked_by_secret");
    if (r.kind === "blocked_by_secret") {
      expect(r.matches).toHaveLength(1);
      expect(r.reason).toContain("aws-access-key");
    }
  });

  it("--scope=team override promotes when no secrets", () => {
    const r = decideShareAction({
      scan: noSecrets,
      classification: uncertainClass,
      userOverride: "team",
    });
    expect(r.kind).toBe("promote_to_l2");
  });

  it("--scope=personal override demotes when no secrets", () => {
    const r = decideShareAction({
      scan: noSecrets,
      classification: shareableClass,
      userOverride: "personal",
    });
    expect(r.kind).toBe("demoted_to_personal");
  });

  it("classifier=shareable → promote_to_l2 (no override)", () => {
    const r = decideShareAction({
      scan: noSecrets,
      classification: shareableClass,
    });
    expect(r.kind).toBe("promote_to_l2");
  });

  it("classifier=personal → demoted_to_personal (no override)", () => {
    const r = decideShareAction({
      scan: noSecrets,
      classification: personalClass,
    });
    expect(r.kind).toBe("demoted_to_personal");
  });

  it("classifier=uncertain (no override) → uncertain_held (conservative default)", () => {
    const r = decideShareAction({
      scan: noSecrets,
      classification: uncertainClass,
    });
    expect(r.kind).toBe("uncertain_held");
  });
});
