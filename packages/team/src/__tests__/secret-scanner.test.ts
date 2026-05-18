import { describe, expect, it } from "vitest";
import { scanForSecrets } from "../secret-scanner.js";

describe("scanForSecrets", () => {
  it("returns [] for clean text", () => {
    expect(scanForSecrets("Always prefer dayjs over moment.")).toEqual([]);
  });

  it("detects AWS access key", () => {
    const m = scanForSecrets("key=AKIAIOSFODNN7EXAMPLE rest");
    expect(m).toHaveLength(1);
    expect(m[0]!.kind).toBe("aws-access-key");
    expect(m[0]!.preview.startsWith("AKIAIOSF")).toBe(true);
    expect(m[0]!.preview).toContain("…");
  });

  it("detects GitHub PAT", () => {
    const m = scanForSecrets("token=ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ");
    expect(m.some((x) => x.kind === "github-pat")).toBe(true);
  });

  it("detects OpenAI key", () => {
    const m = scanForSecrets("sk-proj-AbCdEfGhIjKlMnOpQrStUv");
    expect(m.some((x) => x.kind === "openai-key")).toBe(true);
  });

  it("detects Anthropic key", () => {
    const m = scanForSecrets("sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(m.some((x) => x.kind === "anthropic-key")).toBe(true);
  });

  it("detects private IP", () => {
    const m = scanForSecrets("ssh user@192.168.1.50");
    expect(m.some((x) => x.kind === "private-ip-v4")).toBe(true);
  });

  it("detects localhost URL", () => {
    const m = scanForSecrets("server at http://localhost:8080/api");
    expect(m.some((x) => x.kind === "private-url")).toBe(true);
  });

  it("detects absolute home paths (POSIX + Windows)", () => {
    const a = scanForSecrets("/Users/alice/.ssh/id_rsa");
    expect(a.some((x) => x.kind === "absolute-home")).toBe(true);
    const b = scanForSecrets("C:\\Users\\bob\\AppData");
    expect(b.some((x) => x.kind === "absolute-home")).toBe(true);
  });

  it("reports correct span", () => {
    const text = "before AKIAIOSFODNN7EXAMPLE after";
    const m = scanForSecrets(text);
    expect(m[0]!.span[0]).toBe(7);
    expect(m[0]!.span[1]).toBe(7 + 20);
    expect(text.slice(m[0]!.span[0], m[0]!.span[1])).toBe("AKIAIOSFODNN7EXAMPLE");
  });

  it("redacts preview after 8 chars", () => {
    const m = scanForSecrets("AKIAIOSFODNN7EXAMPLE");
    expect(m[0]!.preview).toBe("AKIAIOSF…");
  });
});
