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
          <div className="sec-label" data-reveal style={{flex: 1, margin: 0}}><span>08 · 团队规则传播</span></div>
          <span className="mono" style={{
            fontSize: 11, padding: '4px 10px',
            border: '1px solid var(--amber)', color: 'var(--amber)',
            borderRadius: 100, background: 'rgba(251,191,36,0.06)',
            letterSpacing: '0.1em',
          }}>OPT-IN · v0.12.0+</span>
        </div>
        <h2>规则也可以<br/>沿着 git 流动。</h2>
        <p className="sub" style={{marginBottom: 48}}>
          默认不启用，不影响纯个人使用。一旦你把项目"感染"为团队项目，
          一条规则可以通过 git 自动同步给所有队友——经过两道安全闸门 + LWW 作者溯源。
        </p>

        {/* Flow diagram */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--line)',
          borderRadius: 14,
          padding: 36,
          marginBottom: 24,
        }}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 12}}>
            <div className="mono" style={{fontSize: 11, color: 'var(--ink-mute)', letterSpacing: '0.15em'}}>
              传播链路 · share → git → pull → post-merge → local KB
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

          <TeamFlow stage={stage} lang="zh" />
        </div>

        {/* Two columns: commands + safety gates */}
        <div style={{display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 20}} className="team-grid">
          <div style={{padding: 28, background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12}}>
            <div className="mono" style={{fontSize: 10, color: 'var(--green)', letterSpacing: '0.15em', marginBottom: 16}}>
              VIKI TEAM · 命名空间
            </div>
            <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
              {[
                { cmd: 'viki team infect', desc: '把当前项目变成"团队项目"——在 .githooks/ 写入 post-merge 钩子，开启 .viki/team/ 同步目录', step: 1 },
                { cmd: 'viki team share <rule-id>', desc: '把一条规则写进 git（脱敏 → scope 分类 → 提交）', step: 2 },
                { cmd: 'git pull / git merge', desc: '队友 pull 时 .githooks/post-merge 自动触发，规则落到本地 KB', step: 4 },
                { cmd: 'viki team status', desc: '查看本仓库哪些规则已共享、哪些只在本地', step: 0 },
                { cmd: 'viki team unshare', desc: '把一条规则撤回到 local-only', step: 0 },
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
              { id: 1, color: 'var(--amber)', tag: 'GATE 1 · secret scan', title: '敏感信息扫描',
                desc: 'share 前先扫一遍 API key / JWT / token / 内部 hostname。命中即拒绝提交，规则留在 local。',
                payload: 'blocked: rule contains "sk-..." → not shared' },
              { id: 2, color: 'var(--blue)', tag: 'GATE 2 · scope classifier', title: 'scope 分类',
                desc: '判断规则属于个人偏好 / 团队约定 / 项目内规。只有 team / project scope 进 git，personal 永远 local。' },
              { id: 3, color: 'var(--purple)', tag: 'GATE 3 · LWW', title: '作者溯源 + 冲突解决',
                desc: '每条 team 规则带 author + updated_at；多人改同一条规则，时间戳最新的胜出，旧版本进 history。' },
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

        {/* Rule Gallery — diverse rules across layers */}
        <div style={{marginTop: 72}}>
          <div className="sec-label" style={{marginBottom: 16}}><span>· 规则不止一种粒度 · rule gallery</span></div>
          <p style={{color: 'var(--ink-dim)', fontSize: 15, marginBottom: 24, maxWidth: 720}}>
            团队里能流动的规则远不止"别用 moment 这种包"。从单条命令拦截，到多步工作流约束，
            到项目级架构铁律——只要能在 hook 阶段判定，就能成为规则。
          </p>

          {/* Category filter */}
          <div style={{display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20}}>
            {[
              { id: 'all', label: '全部', count: 12 },
              { id: 'workflow', label: '工作流', count: 3, color: 'var(--purple)' },
              { id: 'tool', label: '工具/依赖', count: 3, color: 'var(--green)' },
              { id: 'style', label: '代码风格', count: 2, color: 'var(--blue)' },
              { id: 'safety', label: '安全', count: 2, color: 'var(--red)' },
              { id: 'convention', label: '项目约定', count: 2, color: 'var(--amber)' },
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

          <RuleGallery filter={filter} lang="zh" />
        </div>

        <div style={{
          marginTop: 32, padding: 20, background: 'transparent',
          border: '1px dashed var(--line)', borderRadius: 10,
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          <span className="mono" style={{fontSize: 11, color: 'var(--green)', letterSpacing: '0.15em'}}>
            ⚡ 纯叠加
          </span>
          <span style={{fontSize: 13, color: 'var(--ink-dim)'}}>
            个人学习管线 100% 不变——这一层只是把已经稳定的规则按需共享出去。可以一直不用。
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

const RULES_ZH = [
  {
    cat: 'workflow', layer: 'meta', color: 'var(--purple)',
    title: '开工前检查 worktree 状态',
    trigger: 'PreToolUse · Edit / Write 前 10 次工具调用',
    detail: '动手改代码之前，先 git status / git branch / git log -3。脏 worktree 上叠改动会埋雷。',
    enforcement: 'warn', tier: '稳定', scope: 'team',
    code: 'on Edit(file) → if !checked_worktree: WARN\n  "在脏 worktree 上改 ' + 'src/' + ' ——\n   建议先 git stash 或新建分支"',
  },
  {
    cat: 'workflow', layer: 'meta', color: 'var(--purple)',
    title: '原子 commit · 一个关注点一条',
    trigger: 'PostToolUse · Edit + 之后的 Bash("git commit")',
    detail: '每次 Edit/Write 后立即按单一关注点 commit。一次改 5 个不相关的文件会被 warn。',
    enforcement: 'warn', tier: '规范', scope: 'team',
    code: 'on git commit → diff.files > 3 distinct concerns\n  → WARN "建议拆成多个 commit"',
  },
  {
    cat: 'workflow', layer: 'meta', color: 'var(--purple)',
    title: '改完跑 typecheck + test',
    trigger: 'Stop · 会话结束前若有未跑的 test',
    detail: '会话内改了源码却没跑 pnpm typecheck / pnpm test ——SessionEnd 时提示。',
    enforcement: 'warn', tier: '规范', scope: 'project',
    code: 'on stop → has_edits && !has_run(typecheck)\n  → WARN "改了 4 个文件但没 typecheck"',
  },
  {
    cat: 'tool', layer: 'command', color: 'var(--green)',
    title: '禁用 moment.js · 改 dayjs',
    trigger: 'PreToolUse · Bash("npm install moment*")',
    detail: 'moment 2020 起进入 maintenance，体积大、mutable API 易引发隐性 bug。',
    enforcement: 'block', tier: '强制', scope: 'team',
    code: 'on Bash("npm install moment")\n  → DENY · suggest dayjs / date-fns',
  },
  {
    cat: 'tool', layer: 'command', color: 'var(--green)',
    title: '本项目用 pnpm 不用 npm',
    trigger: 'PreToolUse · Bash("npm install*") in this repo',
    detail: '本仓库 lockfile 是 pnpm-lock.yaml，混用包管理器会脏 lockfile。',
    enforcement: 'block', tier: '强制', scope: 'project',
    code: 'on Bash("npm install*")\n  if cwd has pnpm-lock.yaml → DENY',
  },
  {
    cat: 'tool', layer: 'command', color: 'var(--green)',
    title: 'redis 客户端用 ioredis',
    trigger: 'PreToolUse · Edit 中出现 require("redis") / from "redis"',
    detail: 'node-redis v4 API 变了；本项目历史上用 ioredis，混用会增加复杂度。',
    enforcement: 'warn', tier: '规范', scope: 'team',
    code: 'on Edit → contains \'from "redis"\'\n  → WARN · suggest ioredis',
  },
  {
    cat: 'style', layer: 'pattern', color: 'var(--blue)',
    title: '生产代码不留 console.log',
    trigger: 'PreToolUse · Write/Edit · 非 *.test.* 文件',
    detail: '改用 logger.debug / logger.info，让日志能被 LOG_LEVEL 控制。',
    enforcement: 'warn', tier: '稳定', scope: 'team',
    code: 'on Write(*.ts) → contains "console.log"\n  && !file.endsWith(".test.ts")\n  → WARN · suggest logger.debug',
  },
  {
    cat: 'style', layer: 'pattern', color: 'var(--blue)',
    title: 'imports 走 @/* 别名',
    trigger: 'PreToolUse · Write/Edit · TS 文件',
    detail: '禁止 ../../../ 这样的相对路径——配 tsconfig 别名后用 @/utils 之类。',
    enforcement: 'warn', tier: '考察', scope: 'project',
    code: 'on Write(*.ts) → contains \'../../\'\n  → WARN · suggest @/* alias',
  },
  {
    cat: 'safety', layer: 'command', color: 'var(--red)',
    title: '禁止递归删根目录',
    trigger: 'PreToolUse · Bash("rm -rf /" / "rm -rf ~" / "rm -rf $*")',
    detail: '永远不让 rm -rf 命中根目录、家目录或未展开变量。',
    enforcement: 'block', tier: '强制', scope: 'team',
    code: 'on Bash → matches /rm\\s+-rf\\s+(\\/|~|\\$)/\n  → DENY',
  },
  {
    cat: 'safety', layer: 'command', color: 'var(--red)',
    title: 'git push --force 改 PR',
    trigger: 'PreToolUse · Bash("git push --force *")',
    detail: '强推主分支会让其他人的本地 commit 丢失。改用 --force-with-lease，或开 PR。',
    enforcement: 'block', tier: '强制', scope: 'team',
    code: 'on Bash("git push --force *main")\n  → DENY · suggest PR / --force-with-lease',
  },
  {
    cat: 'convention', layer: 'invariant', color: 'var(--amber)',
    title: '@viki/core 禁止任何 IO',
    trigger: 'PreToolUse · Write packages/core/**/*.ts',
    detail: '功能核心层是纯函数，禁止 import node:fs / child_process / fetch 等。',
    enforcement: 'block', tier: '强制', scope: 'project',
    code: 'on Write(packages/core/**)\n  contains import "node:fs" → DENY',
  },
  {
    cat: 'convention', layer: 'process', color: 'var(--amber)',
    title: '新 Port 接口 · 契约测试先行',
    trigger: 'PreToolUse · Write packages/adapters/**/*.ts',
    detail: '新增 adapter 之前必须先在 packages/ports/__tests__/ 有对应的 contract 测试。',
    enforcement: 'warn', tier: '规范', scope: 'project',
    code: 'on Write(adapters/X.ts)\n  if !exists(ports/__tests__/X-contract.ts)\n  → WARN',
  },
];

function RuleGallery({ filter, lang }) {
  const rules = lang === 'zh' ? RULES_ZH : RULES_EN;
  const filtered = filter === 'all' ? rules : rules.filter(r => r.cat === filter);

  const t = lang === 'zh' ? {
    block: 'BLOCK', warn: 'WARN', observe: 'OBSERVE',
    enf: 'enforcement', tier: 'tier', scope: 'scope',
    trigger: 'trigger', layer: 'layer',
  } : {
    block: 'BLOCK', warn: 'WARN', observe: 'OBSERVE',
    enf: 'enforcement', tier: 'tier', scope: 'scope',
    trigger: 'trigger', layer: 'layer',
  };

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
          {/* header */}
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
            }}>{r.enforcement === 'block' ? t.block : r.enforcement === 'warn' ? t.warn : t.observe}</span>
          </div>

          {/* detail */}
          <div style={{fontSize: 13, color: 'var(--ink-dim)', lineHeight: 1.55}}>{r.detail}</div>

          {/* trigger */}
          <div className="mono" style={{fontSize: 10, color: 'var(--ink-mute)'}}>
            {t.trigger}: <span style={{color: 'var(--ink-dim)'}}>{r.trigger}</span>
          </div>

          {/* code */}
          <pre style={{
            margin: 0, padding: 10, background: '#060807',
            border: '1px solid var(--line)', borderRadius: 6,
            fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--green)',
            overflow: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.5,
          }}>{r.code}</pre>

          {/* footer meta */}
          <div style={{display: 'flex', gap: 12, paddingTop: 4, borderTop: '1px dashed var(--line)'}}>
            <span className="mono" style={{fontSize: 10, color: 'var(--ink-mute)'}}>
              {t.tier}: <span style={{color: 'var(--ink-dim)'}}>{r.tier}</span>
            </span>
            <span className="mono" style={{fontSize: 10, color: 'var(--ink-mute)'}}>
              {t.scope}: <span style={{color: r.scope === 'team' ? 'var(--green)' : r.scope === 'project' ? 'var(--blue)' : 'var(--ink-dim)'}}>{r.scope}</span>
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
  const t = lang === 'zh' ? {
    devA: '开发者 A',
    devB: '开发者 B',
    learns: '在本地学到一条规则',
    git: 'git 远端',
    landed: '规则落到 B 的 KB',
    rule: 'rule#a3f7 · "use ioredis, not node-redis"',
    commit: 'committed · secret-scan ✓ · scope=team',
  } : {
    devA: 'developer A',
    devB: 'developer B',
    learns: 'learned a rule locally',
    git: 'git remote',
    landed: 'rule lands in B\'s KB',
    rule: 'rule#a3f7 · "use ioredis, not node-redis"',
    commit: 'committed · secret-scan ✓ · scope=team',
  };

  const arrowA = lang === 'zh' ? '$ viki team share' : '$ viki team share';
  const arrowB = lang === 'zh' ? '$ git pull · post-merge' : '$ git pull · post-merge';

  return (
    <svg viewBox="0 0 1000 280" style={{width: '100%', height: 'auto', maxHeight: 320}}>
      <defs>
        <marker id="arr-team" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--green)" />
        </marker>
        <marker id="arr-team-dim" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--line-strong)" />
        </marker>
      </defs>

      <TeamNode x={140} y={140} label={t.devA} active={stage >= 1} sub="local KB" />
      <TeamNode x={500} y={140} label={t.git} active={stage >= 3} sub=".viki/team/*.json" kind="git" />
      <TeamNode x={860} y={140} label={t.devB} active={stage >= 5} sub="local KB" />

      <FlowArrow x1={200} y1={140} x2={440} y2={140} active={stage >= 2} activeLabel={arrowA} />
      <FlowArrow x1={560} y1={140} x2={800} y2={140} active={stage >= 4} activeLabel={arrowB} />

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
  const shortLabel = kind === 'git' ? 'git' : (label.split(' ').pop() || label).slice(0, 4);
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
        markerEnd={active ? 'url(#arr-team)' : 'url(#arr-team-dim)'}
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
window.RULES_ZH = RULES_ZH;
