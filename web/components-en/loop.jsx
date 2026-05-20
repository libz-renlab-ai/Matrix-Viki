function Loop() {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);

  const stages = [
    {
      id: 'correct', title: '01 · Correct', verb: 'CORRECT',
      hook: 'session',
      desc: 'You correct the AI in the conversation — could be explicit ("no, use dayjs"), or you edit the code yourself, paste an error, or switch tech stacks.',
      code: 'user: "wrong — moment is too heavy, switch to dayjs"',
      tag: 'Correction signal',
    },
    {
      id: 'detect', title: '02 · Detect', verb: 'DETECT',
      hook: 'Stop',
      desc: 'Stop hook scans the whole transcript at session end and pinpoints "correction moments" via 7 local heuristics. No LLM yet — cheap filter first.',
      code: 'detector.scan(transcript) → 3 correction moments',
      tag: 'Local heuristics',
    },
    {
      id: 'extract', title: '03 · Extract', verb: 'EXTRACT',
      hook: 'Stop',
      desc: 'Each correction moment is fed to Haiku, which emits an 8-field structured JSON: trigger / wrong_pattern / correct_pattern / channel / scope / …',
      code: '{ trigger: "npm install moment*",\n  wrong: "moment.js",\n  correct: "dayjs / date-fns" }',
      tag: 'LLM structuring',
    },
    {
      id: 'store', title: '04 · Store', verb: 'STORE',
      hook: 'kb',
      desc: 'The new rule is written to a dual-layer SQLite — project-level .viki/knowledge.db or user-level ~/.viki/global.db. Both trigger + pattern get vectorized (multilingual-e5).',
      code: 'INSERT rule · tier=trying · confidence=0.50',
      tag: 'SQLite + 384-d vectors',
    },
    {
      id: 'match', title: '05 · Match', verb: 'MATCH',
      hook: 'PreToolUse',
      desc: 'On any tool call, the args are searched against the KB with hybrid semantic + BM25 retrieval. High confidence → deny; mid → warn; low → silent observe.',
      code: 'PreToolUse(Bash, "npm install moment")\n  → matched seed-pack-universal-moment\n  → action: DENY',
      tag: 'Vector + BM25 + RRF',
    },
    {
      id: 'observe', title: '06 · Observe', verb: 'OBSERVE',
      hook: 'PostToolUse',
      desc: 'PostToolUse watches the real outcome — user accepts / reverts / bypasses. Each block is a micro-experiment that judges the rule itself.',
      code: 'user accepted: dayjs · rule = useful',
      tag: 'Event stream',
    },
    {
      id: 'calibrate', title: '07 · Calibrate', verb: 'CALIBRATE',
      hook: 'kb',
      desc: 'The calibrator promotes or demotes rules based on the event stream. Useful → up (trying → review → stable → norm → enforce). Bypassed → down. Untouched → dormant.',
      code: 'tier: trying → review (confidence 0.72)',
      tag: '6 tiers w/ hysteresis',
    },
  ];

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % stages.length), 2400);
    return () => clearTimeout(t);
  }, [active, playing]);

  const cur = stages[active];

  const R = 200;
  const cx = 280, cy = 280;

  return (
    <section id="loop">
      <div className="container">
        <div className="sec-label"><span>02 · the learning loop</span></div>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center'}} className="loop-grid">
          <div>
            <h2>The full life of<br/>a single rule.</h2>
            <p className="sub" style={{marginTop: 20}}>
              Click any node to jump there, or let it cycle. Each stage maps to a concrete Claude Code hook.
            </p>
            <div style={{marginTop: 28, display: 'flex', gap: 8}}>
              <button className="btn btn-ghost" onClick={() => setPlaying(!playing)}
                style={{fontSize: 12, padding: '8px 16px'}}>
                {playing ? '❚❚ Pause' : '▶ Play'}
              </button>
              <button className="btn btn-ghost" onClick={() => setActive(0)}
                style={{fontSize: 12, padding: '8px 16px'}}>
                ↻ Reset
              </button>
            </div>

            <div style={{marginTop: 36, padding: 24, background: 'var(--bg-card)',
                         border: '1px solid var(--green-dim)', borderRadius: 12, minHeight: 240}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline'}}>
                <div className="mono" style={{fontSize: 11, color: 'var(--green)', letterSpacing: '0.2em'}}>
                  {cur.verb}
                </div>
                <div className="mono" style={{fontSize: 10, color: 'var(--ink-mute)'}}>
                  hook · {cur.hook}
                </div>
              </div>
              <h3 style={{marginTop: 8, fontSize: 22}}>{cur.title}</h3>
              <p style={{color: 'var(--ink-dim)', fontSize: 14, lineHeight: 1.6, marginTop: 12}}>{cur.desc}</p>
              <pre style={{marginTop: 16, padding: 12, background: '#060807',
                           border: '1px solid var(--line)', borderRadius: 6,
                           fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--green)',
                           overflow: 'auto', whiteSpace: 'pre-wrap', margin: 0}}>{cur.code}</pre>
            </div>
          </div>

          <div style={{position: 'relative', height: 560}}>
            <svg viewBox="0 0 560 560" style={{width: '100%', height: '100%', overflow: 'visible'}}>
              <defs>
                <radialGradient id="centerGlow">
                  <stop offset="0%" stopColor="var(--green)" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="var(--green)" stopOpacity="0" />
                </radialGradient>
              </defs>

              <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--line)" strokeWidth="1" strokeDasharray="2 4" />
              <circle cx={cx} cy={cy} r={R - 14} fill="none" stroke="var(--green-dim)" strokeWidth="0.5" strokeDasharray="1 6" opacity="0.5">
                <animateTransform attributeName="transform" type="rotate" from={`0 ${cx} ${cy}`} to={`360 ${cx} ${cy}`} dur="40s" repeatCount="indefinite" />
              </circle>
              <circle cx={cx} cy={cy} r={R + 18} fill="none" stroke="var(--line-strong)" strokeWidth="0.5" strokeDasharray="0.5 12" opacity="0.4">
                <animateTransform attributeName="transform" type="rotate" from={`360 ${cx} ${cy}`} to={`0 ${cx} ${cy}`} dur="60s" repeatCount="indefinite" />
              </circle>
              <circle cx={cx} cy={cy} r={80} fill="url(#centerGlow)" />

              <path id="orbit-path-en" d={`M ${cx + R} ${cy} A ${R} ${R} 0 1 1 ${cx - R} ${cy} A ${R} ${R} 0 1 1 ${cx + R} ${cy}`}
                fill="none" stroke="none" />
              {[
                { r: 2.5, dur: '7s', delay: '0s', color: 'var(--green)' },
                { r: 1.8, dur: '11s', delay: '-3s', color: 'var(--green)' },
                { r: 1.3, dur: '9s', delay: '-5s', color: 'var(--blue)' },
                { r: 2, dur: '13s', delay: '-2s', color: 'var(--green)' },
                { r: 1.2, dur: '15s', delay: '-7s', color: 'var(--purple)' },
              ].map((p, i) => (
                <circle key={i} r={p.r} fill={p.color}
                  style={{filter: 'drop-shadow(0 0 4px currentColor)', color: p.color}}>
                  <animateMotion dur={p.dur} repeatCount="indefinite" begin={p.delay} rotate="auto">
                    <mpath href="#orbit-path-en" />
                  </animateMotion>
                  <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" repeatCount="indefinite" begin={p.delay} />
                </circle>
              ))}

              {stages.map((_, i) => {
                const a1 = (i / stages.length) * Math.PI * 2 - Math.PI / 2;
                const a2 = ((i + 1) / stages.length) * Math.PI * 2 - Math.PI / 2;
                const x1 = cx + Math.cos(a1) * R, y1 = cy + Math.sin(a1) * R;
                const x2 = cx + Math.cos(a2) * R, y2 = cy + Math.sin(a2) * R;
                const isActive = i === active;
                return (
                  <path key={i}
                    d={`M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`}
                    fill="none"
                    stroke={isActive ? 'var(--green)' : 'var(--line-strong)'}
                    strokeWidth={isActive ? 2 : 1}
                    style={{transition: 'all 0.4s'}}
                    opacity={isActive ? 1 : 0.4}
                  />
                );
              })}

              <text x={cx} y={cy - 10} textAnchor="middle"
                fontFamily="var(--mono)" fontSize="10" fill="var(--ink-mute)" letterSpacing="0.3em">
                LEARN · STORE · USE · EVAL
              </text>
              <text x={cx} y={cy + 14} textAnchor="middle"
                fontFamily="var(--sans)" fontSize="20" fontWeight="600" fill="var(--ink)">
                {cur.tag}
              </text>

              {stages.map((s, i) => {
                const angle = (i / stages.length) * Math.PI * 2 - Math.PI / 2;
                const x = cx + Math.cos(angle) * R;
                const y = cy + Math.sin(angle) * R;
                const isActive = i === active;
                return (
                  <g key={s.id} style={{cursor: 'pointer'}}
                     onClick={() => { setActive(i); setPlaying(false); }}>
                    {isActive && (
                      <circle cx={x} cy={y} r="28" fill="var(--green)" opacity="0.15">
                        <animate attributeName="r" values="20;36;20" dur="2s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.25;0;0.25" dur="2s" repeatCount="indefinite" />
                      </circle>
                    )}
                    <circle cx={x} cy={y} r={isActive ? 16 : 10}
                      fill={isActive ? 'var(--green)' : 'var(--bg-card)'}
                      stroke={isActive ? 'var(--green)' : 'var(--line-strong)'}
                      strokeWidth="1.5"
                      style={{transition: 'all 0.3s'}}
                    />
                    <text x={x} y={y + 3} textAnchor="middle"
                      fontFamily="var(--mono)" fontSize="10" fontWeight="600"
                      fill={isActive ? '#051208' : 'var(--ink-dim)'}>
                      {String(i + 1).padStart(2, '0')}
                    </text>

                    {(() => {
                      const labelR = R + 50;
                      const lx = cx + Math.cos(angle) * labelR;
                      const ly = cy + Math.sin(angle) * labelR;
                      const anchor = Math.cos(angle) > 0.3 ? 'start' : Math.cos(angle) < -0.3 ? 'end' : 'middle';
                      return (
                        <text x={lx} y={ly + 4} textAnchor={anchor}
                          fontFamily="var(--mono)" fontSize="11"
                          fill={isActive ? 'var(--green)' : 'var(--ink-dim)'}
                          style={{transition: 'fill 0.3s'}}>
                          {s.verb}
                        </text>
                      );
                    })()}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width: 900px) {
          .loop-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}
window.Loop = Loop;
