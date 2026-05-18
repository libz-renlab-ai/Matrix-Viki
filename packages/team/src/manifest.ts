/**
 * `.viki/manifest.json` — the marker file written by `viki team infect`.
 * Its presence in a checkout tells `team-bootstrap` and SessionStart that
 * this project is a Viki team project and `team-sync --apply` should run
 * on first open.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Manifest } from "./types.js";

export function manifestPath(projectRoot: string): string {
  return path.join(projectRoot, ".viki", "manifest.json");
}

export function readManifest(projectRoot: string): Manifest | null {
  const p = manifestPath(projectRoot);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw) as Partial<Manifest>;
    if (
      parsed.schema_version !== 1 ||
      typeof parsed.viki_version !== "string" ||
      typeof parsed.created_at !== "string" ||
      typeof parsed.infected_by !== "string"
    ) {
      return null;
    }
    return parsed as Manifest;
  } catch {
    return null;
  }
}

export function writeManifest(projectRoot: string, m: Manifest): string {
  const p = manifestPath(projectRoot);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  fs.writeFileSync(tmp, JSON.stringify(m, null, 2) + "\n", "utf-8");
  fs.renameSync(tmp, p);
  return p;
}
