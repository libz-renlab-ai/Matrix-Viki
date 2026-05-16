export const NPMMIRROR_SHARP_LIBVIPS =
  "https://registry.npmmirror.com/-/binary/sharp-libvips/v8.14.5/";

export function detectChinaMirror(env: NodeJS.ProcessEnv): string | null {
  if (env.SHARP_DIST_BASE_URL) return null;
  return NPMMIRROR_SHARP_LIBVIPS;
}

export function isWindowsPlatform(platform: string): boolean {
  return platform === "win32";
}

export function formatSharpFailureMessage(rawError: string): string {
  return [
    "",
    "──────────────────────────────────────────────────────────────",
    "❌ Viki: sharp native binary unavailable — semantic matcher will NOT run.",
    "",
    `   ${rawError.slice(0, 200)}`,
    "",
    "Fix (one shot):",
    "  $env:SHARP_DIST_BASE_URL = \"" + NPMMIRROR_SHARP_LIBVIPS + "\"",
    "  pnpm rebuild sharp",
    "  viki repair-semantic",
    "",
    "Or run `viki repair-semantic` to do this automatically.",
    "──────────────────────────────────────────────────────────────",
    "",
  ].join("\n");
}
