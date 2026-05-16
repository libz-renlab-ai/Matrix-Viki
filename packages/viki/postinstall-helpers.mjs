// Mirrored from packages/cli/src/postinstall-helpers.ts
// Keep in sync manually — this file ships standalone with the tarball so that
// postinstall.mjs can import it without any build step or cross-package path.

export const NPMMIRROR_SHARP_LIBVIPS =
  "https://registry.npmmirror.com/-/binary/sharp-libvips/v8.14.5/";

export function detectChinaMirror(env) {
  if (env.SHARP_DIST_BASE_URL) return null;
  return NPMMIRROR_SHARP_LIBVIPS;
}

export function isWindowsPlatform(platform) {
  return platform === "win32";
}

export function formatSharpFailureMessage(rawError) {
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
