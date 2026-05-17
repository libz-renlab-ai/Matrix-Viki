import fs from "node:fs";
import path from "node:path";

/**
 * Ensure ~/.viki/node_modules/ has the daemon's required runtime deps.
 *
 * Why: daemon at ~/.viki/hooks/bin-embedder.cjs needs onnxruntime-node
 * (the only irreducible dep — @xenova/transformers is inlined via tsup
 * noExternal). For monorepo-dev installs, no node_modules exists near
 * ~/.viki/, so the daemon's require("onnxruntime-node") fails. For
 * published npm installs, deps live alongside the bundle and this step
 * is a no-op fast path.
 *
 * Strategy:
 *   1. If ~/.viki/node_modules/onnxruntime-node/package.json exists → skip.
 *   2. Otherwise: write a minimal ~/.viki/package.json, run `npm install`
 *      in ~/.viki/. Use --no-package-lock --no-fund --no-audit for speed.
 *   3. Timeout 5 min — npm install onnxruntime-node fetches ~30 MB of
 *      platform-specific .node binaries; first install on slow networks
 *      can take a couple minutes.
 *
 * Returns: { ok, detail }. Never throws — install failures degrade
 * gracefully to "legacy keyword matcher only" mode.
 */
export async function ensureRuntimeDeps(home: string): Promise<{ ok: boolean; detail: string }> {
  const vikiDir = path.join(home, ".viki");
  const onnxPkg = path.join(vikiDir, "node_modules", "onnxruntime-node", "package.json");
  if (fs.existsSync(onnxPkg)) {
    return { ok: true, detail: "已存在 (skip)" };
  }

  try {
    fs.mkdirSync(vikiDir, { recursive: true });
    const pkgJsonPath = path.join(vikiDir, "package.json");
    if (!fs.existsSync(pkgJsonPath)) {
      fs.writeFileSync(
        pkgJsonPath,
        JSON.stringify(
          {
            name: "viki-runtime",
            version: "0.0.0",
            private: true,
            dependencies: {
              // onnxruntime-node 1.14 is the version @xenova/transformers
              // 2.17 was tested against. Bumping requires testing.
              "onnxruntime-node": "1.14.0",
            },
          },
          null,
          2,
        ),
      );
    } else {
      // package.json already exists (maybe from an earlier vec-deps install).
      // Make sure onnxruntime-node is in dependencies; if not, splice it in.
      try {
        const raw = fs.readFileSync(pkgJsonPath, "utf-8");
        const pkg = JSON.parse(raw) as { dependencies?: Record<string, string> };
        if (!pkg.dependencies || !pkg.dependencies["onnxruntime-node"]) {
          pkg.dependencies = { ...(pkg.dependencies ?? {}), "onnxruntime-node": "1.14.0" };
          fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2));
        }
      } catch {
        /* malformed package.json — let npm install error surface */
      }
    }
  } catch (err) {
    return { ok: false, detail: `mkdir / package.json failed: ${String(err).slice(0, 80)}` };
  }

  const { spawn } = await import("node:child_process");
  return await new Promise<{ ok: boolean; detail: string }>((resolve) => {
    const isWin = process.platform === "win32";
    const child = spawn(
      "npm",
      ["install", "--no-package-lock", "--no-fund", "--no-audit", "--loglevel=error"],
      {
        cwd: vikiDir,
        stdio: "ignore",
        shell: isWin, // Windows needs shell:true to find npm.cmd
      },
    );
    let done = false;
    child.on("exit", (code) => {
      if (done) return;
      done = true;
      // npm install can exit non-zero on warnings (deprecated subdeps, optional
      // native builds that failed without affecting onnxruntime-node itself).
      // Treat the actual target file's presence as the source of truth — if
      // onnxruntime-node landed, the daemon will boot, regardless of exit code.
      if (fs.existsSync(onnxPkg)) {
        resolve({
          ok: true,
          detail: code === 0 ? "npm install 完成 (~30 MB)" : `npm install 完成 (exit ${code}; warnings ignored)`,
        });
      } else {
        resolve({
          ok: false,
          detail: `npm install 退出 ${code}; onnxruntime-node 未安装；daemon 将退化为 legacy matcher`,
        });
      }
    });
    child.on("error", (err) => {
      if (done) return;
      done = true;
      resolve({
        ok: false,
        detail: `spawn npm 失败: ${err.message.slice(0, 80)}`,
      });
    });
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { child.kill(); } catch { /* ignore */ }
      resolve({ ok: false, detail: "npm install timeout 300s" });
    }, 300_000);
    timer.unref?.();
  });
}
