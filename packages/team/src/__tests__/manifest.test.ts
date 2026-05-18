import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { manifestPath, readManifest, writeManifest } from "../manifest.js";
import type { Manifest } from "../types.js";

describe("manifest read/write", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "viki-manifest-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const sample: Manifest = {
    schema_version: 1,
    viki_version: "0.1.0",
    created_at: "2026-05-18T10:00:00Z",
    infected_by: "alice",
  };

  it("round-trip write + read", () => {
    writeManifest(root, sample);
    expect(readManifest(root)).toEqual(sample);
  });

  it("returns null when missing", () => {
    expect(readManifest(root)).toBeNull();
  });

  it("returns null on malformed JSON", () => {
    mkdirSync(join(root, ".viki"), { recursive: true });
    writeFileSync(manifestPath(root), "{not json", "utf-8");
    expect(readManifest(root)).toBeNull();
  });

  it("returns null on schema mismatch", () => {
    mkdirSync(join(root, ".viki"), { recursive: true });
    writeFileSync(manifestPath(root), JSON.stringify({ schema_version: 99 }), "utf-8");
    expect(readManifest(root)).toBeNull();
  });

  it("writes via atomic tmp+rename", () => {
    const written = writeManifest(root, sample);
    expect(written).toBe(manifestPath(root));
    const parsed = JSON.parse(readFileSync(written, "utf-8"));
    expect(parsed.viki_version).toBe("0.1.0");
  });
});
