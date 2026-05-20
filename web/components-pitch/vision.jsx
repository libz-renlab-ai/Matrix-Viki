function PitchVision() {
  return (
    <section>
      <div className="container">
        <div className="label-sm" data-reveal>04 · team sharing — real git artifact</div>
        <h2 data-reveal style={{marginTop: 12}}>
          团队规则 = <br/>
          <span className="accent">一个 git commit。</span>
        </h2>
        <p className="sub" data-reveal style={{marginTop: 24}}>
          v0.12.0 起 opt-in 的 <span className="mono accent">viki team</span> 命名空间。
          下面是一个真实的 share 动作产生的 git diff——任何 reviewer 都能看懂、能 review。
        </p>

        {/* Real team share artifacts */}
        <div style={{marginTop: 56, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16}} className="share-grid">
          {/* CLI command + output */}
          <div data-reveal>
            <div className="label-sm" style={{marginBottom: 10}}>· $ viki team share rule-a3f7 (real stdout)</div>
            <CodeBlock lang="viki team share">
<>{`Sharing rule#a3f7 to team scope...

▶ Gate 1: secret scan ........... `}<span style={{color: 'var(--green)'}}>{`✓ pass`}</span>{`
  - scanned 4 string fields, 0 matches
▶ Gate 2: scope classifier ...... `}<span style={{color: 'var(--green)'}}>{`✓ team`}</span>{`
  - mentions package name, no personal identifiers
▶ Gate 3: LWW stamp ............. `}<span style={{color: 'var(--green)'}}>{`✓ author=alice@team.io`}</span>{`

Writing .viki/team/rule-a3f7.json (348 bytes)
Staging for commit...

[main 7c4f9d2] viki:team share rule-a3f7
 1 file changed, 21 insertions(+)
 create mode 100644 .viki/team/rule-a3f7.json

Tip: run \`git push\` to broadcast.
Teammates will receive on next \`git pull\` via post-merge hook.
`}</>
            </CodeBlock>
          </div>

          {/* The actual file */}
          <div data-reveal>
            <div className="label-sm" style={{marginBottom: 10}}>· git diff · .viki/team/rule-a3f7.json</div>
            <CodeBlock lang="diff +21 lines">
<>{`+ {
+   "id": "rule-a3f7",
+   "trigger": "Edit src/api/redis.ts | from \\"redis\\"",
+   "wrong_pattern": "node-redis (npm \\"redis\\")",
+   "correct_pattern": "ioredis",
+   "reason": "this project standardizes on ioredis v5; mixing breaks tests",
+   "scope": "team",
+   "channel": "tool-action",
+   "enforcement": "warn",
+   "confidence": 0.72,
+   "current_tier": "norm",
+
+   "shared": {
+     "author": "alice@team.io",
+     "shared_at": "2026-05-17T14:09:33Z",
+     "lww_version": 1,
+     "secret_scan": "pass",
+     "scope_classifier": "team"
+   }
+ }
`}</>
            </CodeBlock>
          </div>
        </div>

        {/* Post-merge hook */}
        <div data-reveal style={{marginTop: 28}}>
          <div className="label-sm" style={{marginBottom: 10}}>
            · teammates auto-apply on `git pull` (real .githooks/post-merge script)
          </div>
          <CodeBlock lang=".githooks/post-merge — installed by viki team infect">
<>{`#!/usr/bin/env bash
# Installed by: viki team infect (2026-05-14)
# Removed by:   viki team uninstall

set -e

CHANGED=$(git diff --name-only HEAD@{1} HEAD -- .viki/team/ 2>/dev/null || true)
if [ -z "$CHANGED" ]; then
  exit 0
fi

# Hand off to viki daemon — non-blocking; failures don't break the merge
echo "$CHANGED" | viki team apply --from-stdin --silent &
exit 0
`}</>
          </CodeBlock>
        </div>

        {/* What it does — the receiving side */}
        <div data-reveal style={{marginTop: 28}}>
          <div className="label-sm" style={{marginBottom: 10}}>· receiving side · $ git pull on a teammate's machine</div>
          <CodeBlock lang="git pull + auto-apply">
<>{`$ git pull
remote: Enumerating objects: 7, done.
...
Fast-forward
 .viki/team/rule-a3f7.json |  21 +++++++++

[viki team apply] ingesting 1 rule from .viki/team/
  + rule-a3f7  (norm · warn · scope=team · author=alice@team.io)
  → wrote to .viki/knowledge.db
  → vectorized (trigger + pattern, 384-d × 2)
  → registered for PreToolUse path

✓ 1 team rule applied. No restart needed.
`}</>
          </CodeBlock>
        </div>

        {/* Architecture honesty */}
        <div data-reveal style={{marginTop: 80}}>
          <div className="label-sm" style={{marginBottom: 16}}>· what's NOT here yet (honest list)</div>
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--line)',
            borderRadius: 12, padding: 28,
          }}>
            <p style={{margin: 0, fontSize: 16, color: 'var(--ink-dim)', lineHeight: 1.6}}>
              务实清单——直接从 bugs.md / README §10 已知遗留搬下来。这些是已经写在公开仓库里的、
              没掩盖的"还没做完"项：
            </p>
            <ul style={{margin: '20px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10}}>
              {[
                { i: '○', t: '没发布到 npm', d: 'npm 上的 viki@0.0.2 是第三方占名包；本项目仍是 git clone + pnpm 源码安装。' },
                { i: '○', t: 'PromptHook 通道空跑', d: 'LLM 抽取从不输出 channel=user-input 规则 → UserPromptSubmit 检索池长期空。已记 audit comment。' },
                { i: '○', t: 'Stop pipeline 慢', d: '长会话每条候选规则要 5–15 分钟过 LLM；已有优化方案（并发 + prefilter + 批量）但未动手。' },
                { i: '○', t: '国内网络 sharp 卡住', d: 'pnpm install 会卡在 sharp postinstall 拉 GitHub libvips。需手动设 SHARP_DIST_BASE_URL。' },
                { i: '○', t: '1 个 star', d: '项目刚拆分出来，没做任何 marketing 或 launch。' },
              ].map((x, i) => (
                <li key={i} style={{
                  padding: '12px 14px', background: '#060807',
                  border: '1px solid var(--line)', borderRadius: 6,
                  display: 'grid', gridTemplateColumns: '20px 1fr', gap: 12, alignItems: 'baseline',
                }}>
                  <span className="mono" style={{color: 'var(--amber)', fontSize: 14}}>{x.i}</span>
                  <div>
                    <div style={{fontSize: 14, color: 'var(--ink)', fontWeight: 600}}>{x.t}</div>
                    <div style={{fontSize: 12, color: 'var(--ink-dim)', marginTop: 4, lineHeight: 1.5}}>{x.d}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width: 900px) {
          .share-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}

window.PitchVision = PitchVision;
