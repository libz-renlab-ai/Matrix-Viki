function Demo({ autoplay = true }) {
  const [step, setStep] = useState(0);
  const [auto, setAuto] = useState(autoplay);
  useEffect(() => setAuto(autoplay), [autoplay]);

  // step 0 idle, 1 yesterday correction, 2 stop hook detects, 3 LLM extracts, 4 store, 5 next session, 6 pretooluse blocks
  const steps = [
    { label: '空闲', sub: '准备开始' },
    { label: '昨天 · 你在纠正 AI', sub: 'Stop hook 旁路观察' },
    { label: 'Stop hook 识别', sub: '7 类启发式信号' },
    { label: 'LLM 提取规则', sub: 'Haiku · 结构化 JSON' },
    { label: '写入双层规则库', sub: 'knowledge.db + 向量化' },
    { label: '今天 · 新会话', sub: '相同的错误即将发生' },
    { label: 'PreToolUse 拦截', sub: '错误没有真的发生' },
  ];

  useEffect(() => {
    if (!auto) return;
    if (step >= steps.length - 1) {
      const r = setTimeout(() => setStep(0), 4500);
      return () => clearTimeout(r);
    }
    const r = setTimeout(() => setStep(step + 1), 2200);
    return () => clearTimeout(r);
  }, [step, auto]);

  return (
    <section id="demo">
      <div className="container">
        <div className="sec-label"><span>03 · 核心交互</span></div>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'end', flexWrap: 'wrap', gap: 24}}>
          <div>
            <h2>纠正 → 规则 → 拦截。</h2>
            <p className="sub">观察同一个错误在两次会话之间发生的事。</p>
          </div>
          <div style={{display: 'flex', gap: 8}}>
            <button className="btn btn-ghost" onClick={() => { setStep(0); setAuto(true); }}
              style={{fontSize: 12, padding: '8px 16px'}}>↻ 重播</button>
            <button className="btn btn-ghost" onClick={() => setAuto(!auto)}
              style={{fontSize: 12, padding: '8px 16px'}}>
              {auto ? '❚❚ 暂停' : '▶ 继续'}
            </button>
          </div>
        </div>

        {/* Progress rail */}
        <div style={{margin: '40px 0 32px'}}>
          <div style={{display: 'flex', gap: 4}}>
            {steps.slice(1).map((s, i) => {
              const idx = i + 1;
              const active = step >= idx;
              const current = step === idx;
              return (
                <div key={i} onClick={() => { setStep(idx); setAuto(false); }}
                  style={{
                    flex: 1, cursor: 'pointer', paddingBottom: 12,
                    borderTop: '2px solid ' + (active ? 'var(--green)' : 'var(--line)'),
                    transition: 'border-color 0.3s',
                    paddingTop: 12,
                  }}>
                  <div className="mono" style={{
                    fontSize: 10, color: active ? 'var(--green)' : 'var(--ink-mute)',
                    letterSpacing: '0.1em', transition: 'color 0.3s'
                  }}>STEP {String(idx).padStart(2, '0')}</div>
                  <div style={{
                    fontSize: 13, marginTop: 4,
                    color: current ? 'var(--ink)' : active ? 'var(--ink-dim)' : 'var(--ink-mute)',
                    fontWeight: current ? 600 : 400,
                    transition: 'all 0.3s'
                  }}>{s.label}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Two-column session terminals */}
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20}} className="demo-grid">
          <SessionTerminal
            title="session#A · 昨天 14:32"
            subtitle="~/projects/blog · claude code"
            phase={step >= 1 ? Math.min(step, 4) : 0}
            kind="yesterday"
          />
          <SessionTerminal
            title="session#B · 今天 09:15"
            subtitle="~/projects/blog · claude code"
            phase={step >= 5 ? step - 4 : 0}
            kind="today"
            disabled={step < 5}
          />
        </div>

        {/* Rule extraction inspector */}
        <RuleInspector visible={step >= 3} step={step} />

        {/* Try-it-yourself */}
        <TryIt />
      </div>
      <style>{`
        @media (max-width: 900px) {
          .demo-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}

function SessionTerminal({ title, subtitle, phase, kind, disabled }) {
  const yesterdayLines = [
    // phase 1: user corrects
    [
      { p: '$', t: 'npm install moment', c: 'term-user' },
      { p: '↳', t: 'added 1 package · 67 packages audited', c: 'term-ai' },
      { p: '⚑', t: 'user: 不对，moment 太重了 (~290kb)，2020 起进入 maintenance', c: 'term-user', delay: 800 },
      { p: ' ', t: '       换成 dayjs 吧，2KB API 兼容。', c: 'term-user' },
      { p: '↳', t: 'AI: 好的，已切换到 dayjs。', c: 'term-ai', delay: 600 },
    ],
    // phase 2: stop hook detects
    [
      { p: '◉', t: '[Stop hook] 扫描整段 transcript ...', c: 'term-info', delay: 200 },
      { p: '↳', t: '🔍 启发式信号命中 (3/7):', c: 'term-info' },
      { p: ' ', t: '   · explicit_negation  ("不对")', c: 'term-comment' },
      { p: ' ', t: '   · user_replaced_tech ("换成 dayjs")', c: 'term-comment' },
      { p: ' ', t: '   · ai_acknowledged    ("好的，已切换")', c: 'term-comment' },
      { p: '↳', t: 'correction moment localized @ turn 4', c: 'term-info' },
    ],
    // phase 3: LLM extracts
    [
      { p: '◉', t: '[LLM] claude-haiku-4-5 · structured extraction', c: 'term-info' },
      { p: ' ', t: '   ⟳ thinking...', c: 'term-comment', delay: 400 },
      { p: '↳', t: 'extracted: rule-candidate { 8 fields }', c: 'term-rule' },
      { p: ' ', t: '   trigger     : "npm install moment*"', c: 'term-rule' },
      { p: ' ', t: '   wrong       : "moment.js"', c: 'term-rule' },
      { p: ' ', t: '   correct     : "dayjs / date-fns"', c: 'term-rule' },
      { p: ' ', t: '   scope       : project · channel: tool-action', c: 'term-rule' },
    ],
    // phase 4: store
    [
      { p: '◉', t: '[KB] validate → vectorize → insert', c: 'term-info' },
      { p: ' ', t: '   ✓ PII 脱敏检查 pass', c: 'term-comment' },
      { p: ' ', t: '   ✓ embed (multilingual-e5-small) 384维 × 2', c: 'term-comment' },
      { p: ' ', t: '   ✓ INSERT into .viki/knowledge.db', c: 'term-comment' },
      { p: '↳', t: 'rule#a3f7 stored · tier=试用 · confidence=0.50', c: 'term-rule' },
      { p: ' ', t: '   等待真实使用反馈以升降级。', c: 'term-comment' },
    ],
  ];

  const todayLines = [
    // phase 1: new session, AI tries same thing
    [
      { p: '◉', t: '[SessionStart] 注入 12 条高成熟规则到 Skills ...', c: 'term-info', delay: 200 },
      { p: '↳', t: 'context loaded · 包含 rule#a3f7 (试用通道)', c: 'term-info' },
      { p: '$', t: 'user: 帮我加一个时间格式化的依赖', c: 'term-user', delay: 700 },
      { p: '↳', t: 'AI: 我来安装 moment...', c: 'term-ai', delay: 500 },
      { p: '$', t: 'AI 调用: Bash("npm install moment")', c: 'term-user' },
    ],
    // phase 2: PreToolUse blocks
    [
      { p: '◉', t: '[PreToolUse] 截获工具调用 ...', c: 'term-info', delay: 200 },
      { p: ' ', t: '   ⟳ retrieving rules (vec + bm25) ... 12ms', c: 'term-comment' },
      { p: '↳', t: '🚫 命中 rule#a3f7 (cosine 0.91)', c: 'term-deny' },
      { p: ' ', t: '   "已知错误"——这条规则上周才学到', c: 'term-deny' },
      { p: '↳', t: 'AI: 检测到 viki 拦截，改用 dayjs。', c: 'term-ai', delay: 600 },
      { p: '$', t: 'AI 调用: Bash("npm install dayjs") · ✓ 放行', c: 'term-user' },
      { p: '◉', t: '[PostToolUse] 用户接受 → rule#a3f7 confidence 0.50 → 0.62', c: 'term-info', delay: 500 },
    ],
  ];

  const phaseLines = kind === 'yesterday' ? yesterdayLines : todayLines;
  const visibleLines = phaseLines.slice(0, phase).flat();

  return (
    <div className="terminal" style={{opacity: disabled ? 0.35 : 1, transition: 'opacity 0.4s'}}>
      <div className="terminal-head">
        <span className="term-dot r"></span>
        <span className="term-dot y"></span>
        <span className="term-dot g"></span>
        <span className="term-title">{subtitle}</span>
        <span style={{marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-mute)'}}>
          {title}
        </span>
      </div>
      <div className="terminal-body" style={{minHeight: 280}}>
        {disabled ? (
          <div className="term-line" style={{color: 'var(--ink-mute)', fontStyle: 'italic', paddingTop: 80, textAlign: 'center', justifyContent: 'center'}}>
            <span>等待规则入库后开始今天的会话…</span>
          </div>
        ) : (
          visibleLines.map((ln, i) => (
            <div key={i} className="term-line">
              <span className="term-prompt" style={{
                color: ln.p === '◉' ? 'var(--blue)' :
                       ln.p === '↳' ? 'var(--ink-mute)' :
                       ln.p === '⚑' ? 'var(--amber)' :
                       ln.p === '🚫' ? 'var(--red)' : 'var(--green)'
              }}>{ln.p}</span>
              <span className={ln.c}>{ln.t}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function RuleInspector({ visible, step }) {
  if (!visible) return null;
  return (
    <div style={{
      marginTop: 32,
      background: 'var(--bg-card)',
      border: '1px solid var(--green-dim)',
      borderRadius: 12,
      padding: 28,
      transition: 'all 0.4s',
    }}>
      <div className="mono" style={{fontSize: 11, color: 'var(--green)', letterSpacing: '0.2em', marginBottom: 16}}>
        ◉ RULE INSPECTOR · rule#a3f7
      </div>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20}} className="rule-grid">
        {[
          { k: 'trigger', v: 'npm install moment*', t: 'string · BM25' },
          { k: 'wrong_pattern', v: 'moment.js', t: 'string + vec' },
          { k: 'correct_pattern', v: 'dayjs · date-fns', t: 'string + vec' },
          { k: 'scope', v: 'project', t: '.viki/knowledge.db' },
          { k: 'channel', v: 'tool-action', t: 'PreToolUse 通道' },
          { k: 'enforcement', v: 'warn', t: '试用档' },
          { k: 'confidence', v: step >= 6 ? '0.62 ↑' : '0.50', t: '依赖事件流校准', highlight: step >= 6 },
          { k: 'current_tier', v: '试用 → 考察', t: '6 档迟滞', highlight: step >= 6 },
        ].map(f => (
          <div key={f.k} style={{padding: '14px 0', borderTop: '1px solid var(--line)'}}>
            <div className="mono" style={{fontSize: 10, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.1em'}}>
              {f.k}
            </div>
            <div className="mono" style={{
              fontSize: 14, marginTop: 6,
              color: f.highlight ? 'var(--green)' : 'var(--ink)',
              transition: 'color 0.4s'
            }}>{f.v}</div>
            <div className="mono" style={{fontSize: 10, color: 'var(--ink-mute)', marginTop: 4}}>{f.t}</div>
          </div>
        ))}
      </div>
      <style>{`
        @media (max-width: 900px) {
          .rule-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}

function TryIt() {
  const seedRules = [
    { id: 'r1', trigger: ['npm install moment', 'yarn add moment'], wrong: 'moment.js', correct: 'dayjs / date-fns', conf: 0.85, tier: '强制', action: 'deny' },
    { id: 'r2', trigger: ['rm -rf /', 'rm -rf ~', 'rm -rf $'], wrong: '危险删除', correct: '使用具体路径或 trash-cli', conf: 0.99, tier: '强制', action: 'deny' },
    { id: 'r3', trigger: ['git push --force', 'git push -f main'], wrong: '强推主分支', correct: '改 PR / git push --force-with-lease', conf: 0.92, tier: '强制', action: 'deny' },
    { id: 'r4', trigger: ['npm install --save-dev typescript@3', 'tsc'], wrong: '旧版 TS', correct: '本项目锁 5.x', conf: 0.7, tier: '稳定', action: 'warn' },
    { id: 'r5', trigger: ['console.log'], wrong: '生产代码 console', correct: '改用 logger.debug', conf: 0.6, tier: '考察', action: 'warn' },
    { id: 'r6', trigger: ['curl http:'], wrong: 'http 明文请求', correct: '强制 https', conf: 0.55, tier: '试用', action: 'observe' },
  ];

  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);

  const examples = ['npm install moment', 'rm -rf /', 'git push --force main', 'npm install dayjs', 'tsc -v', 'console.log("hi")'];

  const evaluate = (cmd) => {
    const text = cmd.toLowerCase().trim();
    if (!text) { setResult(null); return; }
    // simple fuzzy match
    const matches = seedRules.map(r => {
      const score = Math.max(...r.trigger.map(t => {
        const tl = t.toLowerCase();
        if (text.includes(tl)) return 1.0;
        if (tl.includes(text)) return 0.6;
        // token overlap
        const tokens = tl.split(/\s+/);
        const txTokens = text.split(/\s+/);
        const overlap = tokens.filter(tok => txTokens.some(tx => tx.includes(tok) || tok.includes(tx))).length;
        return overlap / tokens.length * 0.7;
      }));
      return { rule: r, score };
    }).filter(m => m.score > 0.5).sort((a, b) => b.score - a.score);

    setResult({ cmd, matches });
  };

  return (
    <div style={{marginTop: 60}}>
      <div className="sec-label" style={{marginBottom: 20}}><span>· 你来试试 · pretooluse simulator</span></div>
      <p style={{color: 'var(--ink-dim)', maxWidth: 600, fontSize: 15, marginBottom: 24}}>
        假设规则库里已经躺着这 6 条规则。敲一个命令，看 PreToolUse 怎么决定 deny / warn / allow。
      </p>

      <div className="terminal" style={{marginBottom: 16}}>
        <div className="terminal-head">
          <span className="term-dot r"></span><span className="term-dot y"></span><span className="term-dot g"></span>
          <span className="term-title">PreToolUse · live</span>
        </div>
        <div className="terminal-body" style={{minHeight: 'auto', padding: '16px 22px'}}>
          <div className="term-line">
            <span className="term-prompt">$</span>
            <input
              type="text"
              value={input}
              placeholder="输入一个 shell 命令…"
              onChange={(e) => { setInput(e.target.value); evaluate(e.target.value); }}
              onKeyDown={(e) => { if (e.key === 'Enter') evaluate(input); }}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--ink)', fontFamily: 'var(--mono)', fontSize: 13
              }}
            />
          </div>
          {result && (
            <div style={{marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--line)'}}>
              {result.matches.length === 0 ? (
                <div className="term-line">
                  <span className="term-prompt" style={{color: 'var(--green)'}}>✓</span>
                  <span style={{color: 'var(--green)'}}>放行 · 无规则命中</span>
                </div>
              ) : (
                result.matches.slice(0, 3).map(m => {
                  const action = m.rule.action;
                  const color = action === 'deny' ? 'var(--red)' : action === 'warn' ? 'var(--amber)' : 'var(--blue)';
                  const icon = action === 'deny' ? '🚫' : action === 'warn' ? '⚠' : '◉';
                  const label = action === 'deny' ? 'DENY · 阻断' : action === 'warn' ? 'WARN · 提示' : 'OBSERVE · 静默';
                  return (
                    <div key={m.rule.id} style={{marginTop: 6}}>
                      <div className="term-line">
                        <span className="term-prompt" style={{color}}>{icon}</span>
                        <span style={{color}}>{label}</span>
                        <span style={{color: 'var(--ink-mute)', marginLeft: 'auto', fontSize: 11}}>
                          cosine {m.score.toFixed(2)} · tier {m.rule.tier} · conf {m.rule.conf}
                        </span>
                      </div>
                      <div className="term-line">
                        <span> </span>
                        <span style={{color: 'var(--ink-dim)'}}>
                          {m.rule.wrong} → <span style={{color: 'var(--ink)'}}>{m.rule.correct}</span>
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center'}}>
        <span className="mono" style={{fontSize: 11, color: 'var(--ink-mute)'}}>试试：</span>
        {examples.map(ex => (
          <button key={ex} onClick={() => { setInput(ex); evaluate(ex); }}
            style={{
              padding: '4px 10px', fontFamily: 'var(--mono)', fontSize: 11,
              background: 'transparent', border: '1px solid var(--line-strong)',
              color: 'var(--ink-dim)', borderRadius: 6, cursor: 'pointer',
              transition: 'all 0.15s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.color = 'var(--green)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line-strong)'; e.currentTarget.style.color = 'var(--ink-dim)'; }}>
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}

window.Demo = Demo;
