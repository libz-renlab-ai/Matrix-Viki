function PitchVision() {
  return (
    <section>
      <div className="container">
        <div className="label-sm" data-reveal>04 · team sharing — real git artifact</div>
        <h2 data-reveal style={{marginTop: 12}}>
          A team rule =<br/>
          <span className="accent">a git commit.</span>
        </h2>
        <p className="sub" data-reveal style={{marginTop: 24}}>
          v0.12.0 introduced the opt-in <span className="mono accent">viki team</span> namespace.
          Below is a real share action — every reviewer on your team can read it, diff it, revert it.
        </p>

        <div style={{marginTop: 56, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16}} className="share-grid">
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

        <div data-reveal style={{marginTop: 80}}>
          <div className="label-sm" style={{marginBottom: 16}}>· what's NOT here yet (honest list)</div>
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--line)',
            borderRadius: 12, padding: 28,
          }}>
            <p style={{margin: 0, fontSize: 16, color: 'var(--ink-dim)', lineHeight: 1.6}}>
              Pragmatic list — pulled directly from bugs.md and README §10 "known limitations." These are
              in the public repo, no spin:
            </p>
            <ul style={{margin: '20px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10}}>
              {[
                { i: '○', t: 'Not published to npm yet', d: 'npm viki@0.0.2 is a third-party squat. This project is git clone + pnpm source-install only.' },
                { i: '○', t: 'PromptHook channel currently empty', d: 'LLM extractor never emits channel=user-input rules → UserPromptSubmit retrieval pool stays empty. Audit comment logged in code.' },
                { i: '○', t: 'Stop pipeline is slow', d: 'Each candidate rule takes 5–15 min through the LLM in long sessions. Optimization plan (concurrency + prefilter + batch) is written but not implemented.' },
                { i: '○', t: 'sharp postinstall stalls on China network', d: 'pnpm install can hang at sharp pulling libvips from GitHub. Workaround: set SHARP_DIST_BASE_URL manually.' },
                { i: '○', t: '1 star on GitHub', d: 'Project was just split out of its parent repo. No marketing, no launch — yet.' },
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
