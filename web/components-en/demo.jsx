function Demo({ autoplay = true }) {
  const [step, setStep] = useState(0);
  const [auto, setAuto] = useState(autoplay);
  useEffect(() => setAuto(autoplay), [autoplay]);

  const steps = [
    { label: 'Idle', sub: 'Ready to begin' },
    { label: 'Yesterday · you correct the AI', sub: 'Stop hook observes' },
    { label: 'Stop hook detects', sub: '7 local heuristics' },
    { label: 'LLM extracts the rule', sub: 'Haiku · structured JSON' },
    { label: 'Write to dual KB', sub: 'knowledge.db + vectorize' },
    { label: 'Today · new session', sub: 'Same mistake about to happen' },
    { label: 'PreToolUse intercepts', sub: 'Mistake never happens' },
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
        <div className="sec-label"><span>03 · the live loop</span></div>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'end', flexWrap: 'wrap', gap: 24}}>
          <div>
            <h2>Correct → rule → intercept.</h2>
            <p className="sub">Watch what happens to the same mistake across two sessions.</p>
          </div>
          <div style={{display: 'flex', gap: 8}}>
            <button className="btn btn-ghost" onClick={() => { setStep(0); setAuto(true); }}
              style={{fontSize: 12, padding: '8px 16px'}}>↻ Replay</button>
            <button className="btn btn-ghost" onClick={() => setAuto(!auto)}
              style={{fontSize: 12, padding: '8px 16px'}}>
              {auto ? '❚❚ Pause' : '▶ Play'}
            </button>
          </div>
        </div>

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

        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20}} className="demo-grid">
          <SessionTerminal
            title="session#A · yesterday 14:32"
            subtitle="~/projects/blog · claude code"
            phase={step >= 1 ? Math.min(step, 4) : 0}
            kind="yesterday"
          />
          <SessionTerminal
            title="session#B · today 09:15"
            subtitle="~/projects/blog · claude code"
            phase={step >= 5 ? step - 4 : 0}
            kind="today"
            disabled={step < 5}
          />
        </div>

        <RuleInspector visible={step >= 3} step={step} />
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
    [
      { p: '$', t: 'npm install moment', c: 'term-user' },
      { p: '↳', t: 'added 1 package · 67 packages audited', c: 'term-ai' },
      { p: '⚑', t: 'user: no — moment is too heavy (~290kb) and in maintenance since 2020', c: 'term-user', delay: 800 },
      { p: ' ', t: '       use dayjs instead — 2KB, API-compatible.', c: 'term-user' },
      { p: '↳', t: 'AI: got it, switched to dayjs.', c: 'term-ai', delay: 600 },
    ],
    [
      { p: '◉', t: '[Stop hook] scanning full transcript ...', c: 'term-info', delay: 200 },
      { p: '↳', t: '🔍 heuristic signals matched (3/7):', c: 'term-info' },
      { p: ' ', t: '   · explicit_negation  ("no")', c: 'term-comment' },
      { p: ' ', t: '   · user_replaced_tech ("use dayjs instead")', c: 'term-comment' },
      { p: ' ', t: '   · ai_acknowledged    ("got it, switched")', c: 'term-comment' },
      { p: '↳', t: 'correction moment localized @ turn 4', c: 'term-info' },
    ],
    [
      { p: '◉', t: '[LLM] claude-haiku-4-5 · structured extraction', c: 'term-info' },
      { p: ' ', t: '   ⟳ thinking...', c: 'term-comment', delay: 400 },
      { p: '↳', t: 'extracted: rule-candidate { 8 fields }', c: 'term-rule' },
      { p: ' ', t: '   trigger     : "npm install moment*"', c: 'term-rule' },
      { p: ' ', t: '   wrong       : "moment.js"', c: 'term-rule' },
      { p: ' ', t: '   correct     : "dayjs / date-fns"', c: 'term-rule' },
      { p: ' ', t: '   scope       : project · channel: tool-action', c: 'term-rule' },
    ],
    [
      { p: '◉', t: '[KB] validate → vectorize → insert', c: 'term-info' },
      { p: ' ', t: '   ✓ PII scrub pass', c: 'term-comment' },
      { p: ' ', t: '   ✓ embed (multilingual-e5-small) 384-d × 2', c: 'term-comment' },
      { p: ' ', t: '   ✓ INSERT into .viki/knowledge.db', c: 'term-comment' },
      { p: '↳', t: 'rule#a3f7 stored · tier=trying · confidence=0.50', c: 'term-rule' },
      { p: ' ', t: '   awaiting real usage for promotion/demotion.', c: 'term-comment' },
    ],
  ];

  const todayLines = [
    [
      { p: '◉', t: '[SessionStart] injecting 12 mature rules into Skills ...', c: 'term-info', delay: 200 },
      { p: '↳', t: 'context loaded · includes rule#a3f7 (trying channel)', c: 'term-info' },
      { p: '$', t: 'user: add me a date-formatting dependency', c: 'term-user', delay: 700 },
      { p: '↳', t: 'AI: installing moment...', c: 'term-ai', delay: 500 },
      { p: '$', t: 'AI calls: Bash("npm install moment")', c: 'term-user' },
    ],
    [
      { p: '◉', t: '[PreToolUse] intercepted tool call ...', c: 'term-info', delay: 200 },
      { p: ' ', t: '   ⟳ retrieving rules (vec + bm25) ... 12ms', c: 'term-comment' },
      { p: '↳', t: '🚫 matched rule#a3f7 (cosine 0.91)', c: 'term-deny' },
      { p: ' ', t: '   "known mistake" — learned just last week', c: 'term-deny' },
      { p: '↳', t: 'AI: viki intercepted, switching to dayjs.', c: 'term-ai', delay: 600 },
      { p: '$', t: 'AI calls: Bash("npm install dayjs") · ✓ allowed', c: 'term-user' },
      { p: '◉', t: '[PostToolUse] user accepted → rule#a3f7 conf 0.50 → 0.62', c: 'term-info', delay: 500 },
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
            <span>waiting for rule to land before today's session…</span>
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
          { k: 'channel', v: 'tool-action', t: 'PreToolUse path' },
          { k: 'enforcement', v: 'warn', t: 'trying tier' },
          { k: 'confidence', v: step >= 6 ? '0.62 ↑' : '0.50', t: 'event-driven', highlight: step >= 6 },
          { k: 'current_tier', v: 'trying → review', t: '6 tiers · hysteresis', highlight: step >= 6 },
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
    { id: 'r1', trigger: ['npm install moment', 'yarn add moment'], wrong: 'moment.js', correct: 'dayjs / date-fns', conf: 0.85, tier: 'enforce', action: 'deny' },
    { id: 'r2', trigger: ['rm -rf /', 'rm -rf ~', 'rm -rf $'], wrong: 'dangerous delete', correct: 'use a specific path or trash-cli', conf: 0.99, tier: 'enforce', action: 'deny' },
    { id: 'r3', trigger: ['git push --force', 'git push -f main'], wrong: 'force-push main', correct: 'open a PR / use --force-with-lease', conf: 0.92, tier: 'enforce', action: 'deny' },
    { id: 'r4', trigger: ['npm install --save-dev typescript@3', 'tsc'], wrong: 'old TS', correct: 'project locked to TS 5.x', conf: 0.7, tier: 'stable', action: 'warn' },
    { id: 'r5', trigger: ['console.log'], wrong: 'console in prod code', correct: 'use logger.debug', conf: 0.6, tier: 'review', action: 'warn' },
    { id: 'r6', trigger: ['curl http:'], wrong: 'plaintext http request', correct: 'enforce https', conf: 0.55, tier: 'trying', action: 'observe' },
  ];

  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);

  const examples = ['npm install moment', 'rm -rf /', 'git push --force main', 'npm install dayjs', 'tsc -v', 'console.log("hi")'];

  const evaluate = (cmd) => {
    const text = cmd.toLowerCase().trim();
    if (!text) { setResult(null); return; }
    const matches = seedRules.map(r => {
      const score = Math.max(...r.trigger.map(t => {
        const tl = t.toLowerCase();
        if (text.includes(tl)) return 1.0;
        if (tl.includes(text)) return 0.6;
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
      <div className="sec-label" style={{marginBottom: 20}}><span>· try it yourself · pretooluse simulator</span></div>
      <p style={{color: 'var(--ink-dim)', maxWidth: 600, fontSize: 15, marginBottom: 24}}>
        Imagine these 6 rules are already in the KB. Type a command — see how PreToolUse decides deny / warn / allow.
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
              placeholder="type a shell command…"
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
                  <span style={{color: 'var(--green)'}}>allowed · no rule matched</span>
                </div>
              ) : (
                result.matches.slice(0, 3).map(m => {
                  const action = m.rule.action;
                  const color = action === 'deny' ? 'var(--red)' : action === 'warn' ? 'var(--amber)' : 'var(--blue)';
                  const icon = action === 'deny' ? '🚫' : action === 'warn' ? '⚠' : '◉';
                  const label = action === 'deny' ? 'DENY · block' : action === 'warn' ? 'WARN · prompt user' : 'OBSERVE · silent';
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
        <span className="mono" style={{fontSize: 11, color: 'var(--ink-mute)'}}>try:</span>
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
