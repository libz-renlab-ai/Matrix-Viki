function Team() {
  const [stage, setStage] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!playing) return;
    if (stage >= 6) {
      const r = setTimeout(() => setStage(0), 3500);
      return () => clearTimeout(r);
    }
    const r = setTimeout(() => setStage(stage + 1), 1400);
    return () => clearTimeout(r);
  }, [stage, playing]);

  return (
    <section id="team">
      <div className="container">
        <div style={{display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 4}}>
          <div className="sec-label" style={{flex: 1, margin: 0}}><span>07 · team rule propagation</span></div>
          <span className="mono" style={{
            fontSize: 11, padding: '4px 10px',
            border: '1px solid var(--amber)', color: 'var(--amber)',
            borderRadius: 100, background: 'rgba(251,191,36,0.06)',
            letterSpacing: '0.1em',
          }}>OPT-IN · v0.12.0+</span>
        </div>
        <h2>Rules can flow<br/>along git too.</h2>
        <p className="sub" style={{marginBottom: 48}}>
          Disabled by default — pure personal use is unaffected. Once you "infect" a project as a team project,
          a single rule can sync to every teammate via git, passing two safety gates and LWW author tracking.
        </p>

        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--line)',
          borderRadius: 14,
          padding: 36,
          marginBottom: 24,
        }}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 12}}>
            <div className="mono" style={{fontSize: 11, color: 'var(--ink-mute)', letterSpacing: '0.15em'}}>
              propagation · share → git → pull → post-merge → local KB
            </div>
            <div style={{display: 'flex', gap: 6}}>
              <button className="btn btn-ghost" onClick={() => setPlaying(!playing)}
                style={{fontSize: 11, padding: '6px 12px'}}>
                {playing ? '❚❚' : '▶'}
              </button>
              <button className="btn btn-ghost" onClick={() => { setStage(0); setPlaying(true); }}
                style={{fontSize: 11, padding: '6px 12px'}}>↻</button>
            </div>
          </div>

          <TeamFlow stage={stage} lang="en" />
        </div>

        <div style={{display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 20}} className="team-grid">
          <div style={{padding: 28, background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12}}>
            <div className="mono" style={{fontSize: 10, color: 'var(--green)', letterSpacing: '0.15em', marginBottom: 16}}>
              VIKI TEAM · namespace
            </div>
            <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
              {[
                { cmd: 'viki team infect', desc: 'Turn the current repo into a "team project" — write a post-merge hook into .githooks/, open the .viki/team/ sync dir', step: 1 },
                { cmd: 'viki team share <rule-id>', desc: 'Commit a rule into git (scrub → classify scope → commit)', step: 2 },
                { cmd: 'git pull / git merge', desc: 'When teammates pull, .githooks/post-merge fires and the rule lands in their local KB', step: 4 },
                { cmd: 'viki team status', desc: 'See which rules are shared in this repo vs. only local', step: 0 },
                { cmd: 'viki team unshare', desc: 'Retract a rule back to local-only', step: 0 },
              ].map((c, i) => (
                <div key={i} style={{
                  padding: '12px 14px',
                  background: '#060807',
                  border: '1px solid ' + (c.step && stage >= c.step ? 'var(--green-dim)' : 'var(--line)'),
                  borderRadius: 8,
                  transition: 'border-color 0.3s',
                }}>
                  <div className="mono" style={{fontSize: 13, color: 'var(--green)'}}>$ {c.cmd}</div>
                  <div style={{fontSize: 12, color: 'var(--ink-dim)', marginTop: 6, lineHeight: 1.5}}>{c.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
            {[
              { id: 1, color: 'var(--amber)', tag: 'GATE 1 · secret scan', title: 'Secret scanning',
                desc: 'Before share, scan for API keys / JWTs / tokens / internal hostnames. Match → reject. The rule stays local.',
                payload: 'blocked: rule contains "sk-..." → not shared' },
              { id: 2, color: 'var(--blue)', tag: 'GATE 2 · scope classifier', title: 'Scope classification',
                desc: 'Decide if a rule is personal preference / team convention / project rule. Only team & project scopes reach git; personal stays local forever.' },
              { id: 3, color: 'var(--purple)', tag: 'GATE 3 · LWW', title: 'Author tracking + conflict resolution',
                desc: 'Each team rule carries author + updated_at. When two people edit the same rule, the latest timestamp wins; older versions go to history.' },
            ].map(g => (
              <div key={g.id} style={{
                padding: 22, background: 'var(--bg-card)',
                border: '1px solid', borderColor: g.color, borderTop: '3px solid ' + g.color,
                borderRadius: 12,
              }}>
                <div className="mono" style={{fontSize: 10, color: g.color, letterSpacing: '0.15em'}}>{g.tag}</div>
                <h3 style={{fontSize: 16, marginTop: 6}}>{g.title}</h3>
                <p style={{fontSize: 13, color: 'var(--ink-dim)', lineHeight: 1.6, marginTop: 8, margin: 0, marginBlockStart: 8}}>{g.desc}</p>
                {g.payload && (
                  <div className="mono" style={{
                    marginTop: 12, padding: '8px 12px', background: '#060807',
                    border: '1px solid var(--line)', borderRadius: 6,
                    fontSize: 11, color: g.color,
                  }}>{g.payload}</div>
                )}
                {g.id === 2 && (
                  <div style={{marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap'}}>
                    {[
                      {l: 'personal', c: 'var(--ink-mute)', e: '→ local only'},
                      {l: 'team', c: 'var(--green)', e: '→ git'},
                      {l: 'project', c: 'var(--green)', e: '→ git'},
                    ].map(t => (
                      <span key={t.l} className="mono" style={{
                        padding: '3px 8px', fontSize: 10,
                        border: '1px solid', borderColor: t.c, color: t.c,
                        borderRadius: 4,
                      }}>{t.l} {t.e}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Rule Gallery */}
        <div style={{marginTop: 72}}>
          <div className="sec-label" style={{marginBottom: 16}}><span>· rules come in many shapes · rule gallery</span></div>
          <p style={{color: 'var(--ink-dim)', fontSize: 15, marginBottom: 24, maxWidth: 720}}>
            Shareable rules aren't just "don't use library X." From a single command intercept,
            to multi-step workflow constraints, to project-wide architectural invariants —
            anything decidable at a hook can become a rule.
          </p>

          <div style={{display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20}}>
            {[
              { id: 'all', label: 'All', count: 12 },
              { id: 'workflow', label: 'Workflow', count: 3 },
              { id: 'tool', label: 'Tool / dep', count: 3 },
              { id: 'style', label: 'Code style', count: 2 },
              { id: 'safety', label: 'Safety', count: 2 },
              { id: 'convention', label: 'Convention', count: 2 },
            ].map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)}
                style={{
                  padding: '6px 14px', fontFamily: 'var(--mono)', fontSize: 11,
                  background: filter === f.id ? 'rgba(74,222,128,0.08)' : 'transparent',
                  border: '1px solid ' + (filter === f.id ? 'var(--green)' : 'var(--line-strong)'),
                  color: filter === f.id ? 'var(--green)' : 'var(--ink-dim)',
                  borderRadius: 100, cursor: 'pointer', transition: 'all 0.15s',
                }}>
                {f.label} <span style={{opacity: 0.6, marginLeft: 4}}>{f.count}</span>
              </button>
            ))}
          </div>

          <RuleGallery filter={filter} lang="en" />
        </div>

        <div style={{
          marginTop: 32, padding: 20, background: 'transparent',
          border: '1px dashed var(--line)', borderRadius: 10,
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          <span className="mono" style={{fontSize: 11, color: 'var(--green)', letterSpacing: '0.15em'}}>
            ⚡ purely additive
          </span>
          <span style={{fontSize: 13, color: 'var(--ink-dim)'}}>
            Personal learning is 100% unchanged — this layer just opt-in shares already-stable rules with the team. You can never use it.
          </span>
        </div>
      </div>
      <style>{`
        @media (max-width: 900px) {
          .team-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}

const RULES_EN = [
  {
    cat: 'workflow', layer: 'meta', color: 'var(--purple)',
    title: 'Check worktree before starting work',
    trigger: 'PreToolUse · first 10 Edit / Write calls of the session',
    detail: 'Before touching code, run git status / git branch / git log -3. Stacking changes on a dirty worktree is a landmine.',
    enforcement: 'warn', tier: 'stable', scope: 'team',
    code: 'on Edit(file) → if !checked_worktree: WARN\n  "editing src/ on a dirty worktree —\n   git stash or branch off first"',
  },
  {
    cat: 'workflow', layer: 'meta', color: 'var(--purple)',
    title: 'Atomic commits · one concern each',
    trigger: 'PostToolUse · Edit followed by Bash("git commit")',
    detail: 'After every Edit/Write, commit by single concern. Committing 5 unrelated files in one go gets a warn.',
    enforcement: 'warn', tier: 'norm', scope: 'team',
    code: 'on git commit → diff.files > 3 distinct concerns\n  → WARN "split into multiple commits"',
  },
  {
    cat: 'workflow', layer: 'meta', color: 'var(--purple)',
    title: 'Run typecheck + test before stopping',
    trigger: 'Stop · session end with edits but no test run',
    detail: 'If the session edited source but never ran pnpm typecheck / pnpm test — SessionEnd prompts you.',
    enforcement: 'warn', tier: 'norm', scope: 'project',
    code: 'on stop → has_edits && !has_run(typecheck)\n  → WARN "edited 4 files but no typecheck"',
  },
  {
    cat: 'tool', layer: 'command', color: 'var(--green)',
    title: 'No moment.js · use dayjs',
    trigger: 'PreToolUse · Bash("npm install moment*")',
    detail: 'moment has been in maintenance since 2020 — heavy and mutable, leads to subtle bugs.',
    enforcement: 'block', tier: 'enforce', scope: 'team',
    code: 'on Bash("npm install moment")\n  → DENY · suggest dayjs / date-fns',
  },
  {
    cat: 'tool', layer: 'command', color: 'var(--green)',
    title: 'This repo uses pnpm, not npm',
    trigger: 'PreToolUse · Bash("npm install*") in this repo',
    detail: 'Lockfile is pnpm-lock.yaml. Mixing package managers corrupts it.',
    enforcement: 'block', tier: 'enforce', scope: 'project',
    code: 'on Bash("npm install*")\n  if cwd has pnpm-lock.yaml → DENY',
  },
  {
    cat: 'tool', layer: 'command', color: 'var(--green)',
    title: 'Redis client: use ioredis',
    trigger: 'PreToolUse · Edit containing require("redis") / from "redis"',
    detail: 'node-redis v4 changed the API; this project has historically used ioredis. Mixing increases complexity.',
    enforcement: 'warn', tier: 'norm', scope: 'team',
    code: 'on Edit → contains \'from "redis"\'\n  → WARN · suggest ioredis',
  },
  {
    cat: 'style', layer: 'pattern', color: 'var(--blue)',
    title: 'No console.log in prod code',
    trigger: 'PreToolUse · Write/Edit · non *.test.* files',
    detail: 'Use logger.debug / logger.info so output respects LOG_LEVEL.',
    enforcement: 'warn', tier: 'stable', scope: 'team',
    code: 'on Write(*.ts) → contains "console.log"\n  && !file.endsWith(".test.ts")\n  → WARN · suggest logger.debug',
  },
  {
    cat: 'style', layer: 'pattern', color: 'var(--blue)',
    title: 'Imports via @/* alias',
    trigger: 'PreToolUse · Write/Edit · TS files',
    detail: 'Disallow ../../../ relative imports — use the tsconfig alias (@/utils, etc.).',
    enforcement: 'warn', tier: 'review', scope: 'project',
    code: 'on Write(*.ts) → contains \'../../\'\n  → WARN · suggest @/* alias',
  },
  {
    cat: 'safety', layer: 'command', color: 'var(--red)',
    title: 'No recursive root delete',
    trigger: 'PreToolUse · Bash("rm -rf /" / "~" / "$*")',
    detail: 'Never let rm -rf target root, home, or unexpanded variables.',
    enforcement: 'block', tier: 'enforce', scope: 'team',
    code: 'on Bash → matches /rm\\s+-rf\\s+(\\/|~|\\$)/\n  → DENY',
  },
  {
    cat: 'safety', layer: 'command', color: 'var(--red)',
    title: 'git push --force → open a PR',
    trigger: 'PreToolUse · Bash("git push --force *")',
    detail: 'Force-pushing main blows away teammates\' local commits. Use --force-with-lease, or just open a PR.',
    enforcement: 'block', tier: 'enforce', scope: 'team',
    code: 'on Bash("git push --force *main")\n  → DENY · suggest PR / --force-with-lease',
  },
  {
    cat: 'convention', layer: 'invariant', color: 'var(--amber)',
    title: '@viki/core forbids any IO',
    trigger: 'PreToolUse · Write packages/core/**/*.ts',
    detail: 'The functional core is pure. No import of node:fs / child_process / fetch — ever.',
    enforcement: 'block', tier: 'enforce', scope: 'project',
    code: 'on Write(packages/core/**)\n  contains import "node:fs" → DENY',
  },
  {
    cat: 'convention', layer: 'process', color: 'var(--amber)',
    title: 'New Port · contract test first',
    trigger: 'PreToolUse · Write packages/adapters/**/*.ts',
    detail: 'A new adapter requires a corresponding contract test in packages/ports/__tests__/ first.',
    enforcement: 'warn', tier: 'norm', scope: 'project',
    code: 'on Write(adapters/X.ts)\n  if !exists(ports/__tests__/X-contract.ts)\n  → WARN',
  },
];

function RuleGallery({ filter, lang }) {
  const rules = lang === 'en' ? RULES_EN : (window.RULES_ZH || []);
  const filtered = filter === 'all' ? rules : rules.filter(r => r.cat === filter);

  return (
    <div style={{display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12}} className="rule-gallery">
      {filtered.map((r, i) => (
        <div key={i} style={{
          padding: 20,
          background: 'var(--bg-card)',
          border: '1px solid var(--line)',
          borderRadius: 10,
          borderLeft: '3px solid ' + r.color,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12}}>
            <div style={{flex: 1, minWidth: 0}}>
              <div style={{display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4, flexWrap: 'wrap'}}>
                <span className="mono" style={{fontSize: 10, color: r.color, letterSpacing: '0.1em'}}>{r.cat.toUpperCase()}</span>
                <span className="mono" style={{fontSize: 10, color: 'var(--ink-mute)'}}>· {r.layer}</span>
              </div>
              <h3 style={{fontSize: 15, lineHeight: 1.3, margin: 0}}>{r.title}</h3>
            </div>
            <span className="mono" style={{
              fontSize: 10, padding: '3px 8px', flexShrink: 0,
              border: '1px solid', borderColor: r.enforcement === 'block' ? 'var(--red)' : r.color,
              color: r.enforcement === 'block' ? 'var(--red)' : r.color,
              borderRadius: 4, letterSpacing: '0.1em',
            }}>{r.enforcement.toUpperCase()}</span>
          </div>

          <div style={{fontSize: 13, color: 'var(--ink-dim)', lineHeight: 1.55}}>{r.detail}</div>

          <div className="mono" style={{fontSize: 10, color: 'var(--ink-mute)'}}>
            trigger: <span style={{color: 'var(--ink-dim)'}}>{r.trigger}</span>
          </div>

          <pre style={{
            margin: 0, padding: 10, background: '#060807',
            border: '1px solid var(--line)', borderRadius: 6,
            fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--green)',
            overflow: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.5,
          }}>{r.code}</pre>

          <div style={{display: 'flex', gap: 12, paddingTop: 4, borderTop: '1px dashed var(--line)'}}>
            <span className="mono" style={{fontSize: 10, color: 'var(--ink-mute)'}}>
              tier: <span style={{color: 'var(--ink-dim)'}}>{r.tier}</span>
            </span>
            <span className="mono" style={{fontSize: 10, color: 'var(--ink-mute)'}}>
              scope: <span style={{color: r.scope === 'team' ? 'var(--green)' : r.scope === 'project' ? 'var(--blue)' : 'var(--ink-dim)'}}>{r.scope}</span>
            </span>
          </div>
        </div>
      ))}
      <style>{`
        @media (max-width: 900px) {
          .rule-gallery { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function TeamFlow({ stage, lang }) {
  const t = {
    devA: 'developer A',
    devB: 'developer B',
    learns: 'learned a rule locally',
    git: 'git remote',
    landed: "rule lands in B's KB",
    rule: 'rule#a3f7 · "use ioredis, not node-redis"',
    commit: 'committed · secret-scan ✓ · scope=team',
  };

  return (
    <svg viewBox="0 0 1000 280" style={{width: '100%', height: 'auto', maxHeight: 320}}>
      <defs>
        <marker id="arr-team-en" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--green)" />
        </marker>
        <marker id="arr-team-en-dim" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--line-strong)" />
        </marker>
      </defs>

      <TeamNode x={140} y={140} label={t.devA} active={stage >= 1} sub="local KB" />
      <TeamNode x={500} y={140} label={t.git} active={stage >= 3} sub=".viki/team/*.json" kind="git" />
      <TeamNode x={860} y={140} label={t.devB} active={stage >= 5} sub="local KB" />

      <FlowArrow x1={200} y1={140} x2={440} y2={140} active={stage >= 2} activeLabel="$ viki team share" />
      <FlowArrow x1={560} y1={140} x2={800} y2={140} active={stage >= 4} activeLabel="$ git pull · post-merge" />

      {stage >= 2 && stage < 6 && (
        <g style={{transition: 'all 0.6s ease-out'}}>
          <rect
            x={stage === 2 ? 220 : stage === 3 ? 440 : stage === 4 ? 580 : 820}
            y={100}
            width="160" height="36" rx="6"
            fill="rgba(74,222,128,0.1)" stroke="var(--green)"
            style={{transition: 'x 0.8s cubic-bezier(.4,0,.2,1)'}}
          />
          <text
            x={stage === 2 ? 300 : stage === 3 ? 520 : stage === 4 ? 660 : 900}
            y={123}
            textAnchor="middle"
            fontFamily="var(--mono)" fontSize="10" fill="var(--green)"
            style={{transition: 'x 0.8s cubic-bezier(.4,0,.2,1)'}}>
            rule#a3f7 · payload
          </text>
        </g>
      )}

      <text x="140" y="220" textAnchor="middle" fontFamily="var(--mono)" fontSize="11" fill="var(--ink-dim)">
        {stage >= 1 ? t.learns : ''}
      </text>
      <text x="500" y="220" textAnchor="middle" fontFamily="var(--mono)" fontSize="11" fill="var(--ink-dim)">
        {stage >= 3 ? t.commit : ''}
      </text>
      <text x="860" y="220" textAnchor="middle" fontFamily="var(--mono)" fontSize="11" fill="var(--ink-dim)">
        {stage >= 5 ? t.landed : ''}
      </text>

      {stage >= 6 && (
        <g>
          <rect x="280" y="248" width="440" height="24" rx="4" fill="var(--bg-card)" stroke="var(--green-dim)" />
          <text x="500" y="264" textAnchor="middle" fontFamily="var(--mono)" fontSize="11" fill="var(--green)">
            {t.rule}
          </text>
        </g>
      )}
    </svg>
  );
}

function TeamNode({ x, y, label, sub, active, kind }) {
  const r = 38;
  const parts = label.split(' ');
  const shortLabel = kind === 'git' ? 'git' : (parts[parts.length - 1] || label).slice(0, 4);
  return (
    <g>
      {active && (
        <circle cx={x} cy={y} r={r + 12} fill="var(--green)" opacity="0.1">
          <animate attributeName="r" values={`${r+4};${r+18};${r+4}`} dur="2.2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.18;0;0.18" dur="2.2s" repeatCount="indefinite" />
        </circle>
      )}
      <circle cx={x} cy={y} r={r}
        fill={active ? 'rgba(74,222,128,0.08)' : 'var(--bg-card)'}
        stroke={active ? 'var(--green)' : 'var(--line-strong)'}
        strokeWidth={1.5}
        strokeDasharray={kind === 'git' ? '4 3' : ''}
        style={{transition: 'all 0.4s'}} />
      <text x={x} y={y + 2} textAnchor="middle"
        fontFamily="var(--mono)" fontSize="13" fontWeight="600"
        fill={active ? 'var(--green)' : 'var(--ink-dim)'}
        style={{transition: 'fill 0.4s'}}>
        {shortLabel}
      </text>
      <text x={x} y={y + 18} textAnchor="middle"
        fontFamily="var(--mono)" fontSize="9" fill="var(--ink-mute)">
        {sub}
      </text>
      <text x={x} y={y + r + 22} textAnchor="middle"
        fontFamily="var(--sans)" fontSize="13"
        fill={active ? 'var(--ink)' : 'var(--ink-dim)'}
        style={{transition: 'fill 0.4s'}}>
        {label}
      </text>
    </g>
  );
}

function FlowArrow({ x1, y1, x2, y2, active, activeLabel }) {
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={active ? 'var(--green)' : 'var(--line-strong)'}
        strokeWidth={active ? 2 : 1}
        strokeDasharray={active ? '' : '3 4'}
        markerEnd={active ? 'url(#arr-team-en)' : 'url(#arr-team-en-dim)'}
        style={{transition: 'all 0.4s'}} />
      {active && activeLabel && (
        <text x={(x1 + x2) / 2} y={y1 - 16} textAnchor="middle"
          fontFamily="var(--mono)" fontSize="11" fill="var(--green)">
          {activeLabel}
        </text>
      )}
    </g>
  );
}

window.Team = Team;
window.RuleGallery = RuleGallery;
window.TeamFlow = TeamFlow;
