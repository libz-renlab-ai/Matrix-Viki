import { describe, expect, it } from "vitest";
import {
  WINDOWS_MAX_PATH_BUDGET,
  estimateTeamRulePathLength,
  isSafeAuthor,
  isSafeRuleId,
  isTeamRulePathLengthSafe,
} from "../path-safety.js";

describe("path-safety", () => {
  describe("isSafeRuleId", () => {
    it("accepts alphanumerics, dot, underscore, dash", () => {
      expect(isSafeRuleId("use-dayjs")).toBe(true);
      expect(isSafeRuleId("v1.2.3_release")).toBe(true);
      expect(isSafeRuleId("abc123")).toBe(true);
    });
    it("rejects path traversal", () => {
      expect(isSafeRuleId("../etc/passwd")).toBe(false);
      expect(isSafeRuleId("..")).toBe(false);
    });
    it("rejects shell metacharacters", () => {
      expect(isSafeRuleId("a;b")).toBe(false);
      expect(isSafeRuleId("a/b")).toBe(false);
      expect(isSafeRuleId("a b")).toBe(false);
    });
    it("respects 200-char length cap", () => {
      expect(isSafeRuleId("a".repeat(200))).toBe(true);
      expect(isSafeRuleId("a".repeat(201))).toBe(false);
      expect(isSafeRuleId("")).toBe(false);
    });
  });

  describe("isSafeAuthor", () => {
    it("accepts typical git usernames", () => {
      expect(isSafeAuthor("alice")).toBe(true);
      expect(isSafeAuthor("alice.bob_99-test")).toBe(true);
    });
    it("rejects spaces and special chars", () => {
      expect(isSafeAuthor("Alice Bob")).toBe(false);
      expect(isSafeAuthor("alice@example.com")).toBe(false);
    });
    it("respects 100-char length cap", () => {
      expect(isSafeAuthor("a".repeat(100))).toBe(true);
      expect(isSafeAuthor("a".repeat(101))).toBe(false);
    });
  });

  describe("path length budget", () => {
    it("estimates path correctly", () => {
      const len = estimateTeamRulePathLength("/r", "a", "b");
      // "/r" + "/" + ".viki" + "/" + "team" + "/" + "a" + "/" + "b" + ".json"
      // = 2 + 1 + 5 + 1 + 4 + 1 + 1 + 1 + 1 + 5 = 22
      expect(len).toBe(22);
    });
    it("flags overlong paths over Windows budget", () => {
      const longRoot = "C:" + "\\dir".repeat(50); // ~200 chars
      const longRule = "a".repeat(100);
      expect(isTeamRulePathLengthSafe(longRoot, "alice", longRule)).toBe(false);
    });
    it("accepts short paths", () => {
      expect(isTeamRulePathLengthSafe("/x", "a", "b")).toBe(true);
    });
    it("exports WINDOWS_MAX_PATH_BUDGET = 250", () => {
      expect(WINDOWS_MAX_PATH_BUDGET).toBe(250);
    });
  });
});
