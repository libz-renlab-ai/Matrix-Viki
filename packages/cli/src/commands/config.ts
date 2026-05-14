import fs from "node:fs";
import path from "node:path";
import { findVikiRoot } from "../find-viki-root.js";

export interface VikiConfig {
  stop_mode: "sync" | "async";
  /** Run scan-errors as part of Stop pipeline (writes to ~/.viki/candidates.db). */
  stop_scan_errors: boolean;
  /** Timeout budget (ms) for the scan-errors step inside Stop. */
  stop_scan_errors_timeout_ms: number;
}

const DEFAULTS: VikiConfig = {
  stop_mode: "async",
  stop_scan_errors: true,
  stop_scan_errors_timeout_ms: 90_000,
};

export function readVikiConfig(cwd: string): VikiConfig {
  const root = findVikiRoot(cwd);
  const file = path.join(root, ".viki", "config.json");
  if (!fs.existsSync(file)) return { ...DEFAULTS };
  try {
    const raw = fs.readFileSync(file, "utf-8");
    return { ...DEFAULTS, ...JSON.parse(raw) } as VikiConfig;
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeVikiConfig(cwd: string, patch: Partial<VikiConfig>): void {
  const dir = path.join(cwd, ".viki");
  const file = path.join(dir, "config.json");
  fs.mkdirSync(dir, { recursive: true });
  const existing = readVikiConfig(cwd);
  const merged = { ...existing, ...patch };
  fs.writeFileSync(file, JSON.stringify(merged, null, 2) + "\n", "utf-8");
}

export interface ConfigOptions {
  subcommand: "stop-mode" | "show";
  value?: string;
  cwd?: string;
}

export function executeConfig(opts: ConfigOptions): string {
  const cwd = opts.cwd ?? process.cwd();

  if (opts.subcommand === "stop-mode") {
    const val = opts.value;
    if (val !== "sync" && val !== "async") {
      throw new Error(`Invalid stop-mode value: "${val}". Use "sync" or "async".`);
    }
    writeVikiConfig(cwd, { stop_mode: val });
    return `stop_mode set to "${val}"`;
  }

  if (opts.subcommand === "show") {
    const cfg = readVikiConfig(cwd);
    return JSON.stringify(cfg, null, 2);
  }

  throw new Error(`Unknown config subcommand: "${opts.subcommand}"`);
}
