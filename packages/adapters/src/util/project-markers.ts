import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Project markers — adapter-side mirror of `@viki/cli/lib/project-markers`.
 * Kept identical because `@viki/adapters` cannot import from `@viki/cli`
 * (dependency direction). Consolidate to a shared util package as future refactor.
 */
export const PROJECT_MARKERS = [
  ".git",
  "package.json",
  "pyproject.toml",
  "pnpm-workspace.yaml",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "Gemfile",
  "composer.json",
  path.join(".viki", ".project-root"),
];

export function hasProjectMarker(dir: string): boolean {
  for (const m of PROJECT_MARKERS) {
    if (fs.existsSync(path.join(dir, m))) return true;
  }
  return false;
}
