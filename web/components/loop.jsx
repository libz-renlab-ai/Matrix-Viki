function Loop() {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);

  const stages = [
    {
      id: 'correct', title: '01 · 纠正', verb: 'CORRECT',
      hook: 'session',
      desc: '你在对话里纠正 AI——可能是显式否定 ("不对，用 dayjs")、可能是你直接改了代码、贴了报错、或者切了技术栈。',
      code: 'user: "不对，moment 太重了，换 dayjs"',
      tag: '纠正信号',
    },
    {
      id: 'detect', title: '02 · 识别', verb: 'DETECT',
      hook: 'Stop',
      desc: 'Stop hook 在会话结束时旁路扫描整段对话，用 7 类启发式信号定位"纠正时刻"。纯本地、无 LLM，只为低成本筛选。',
      code: 'detector.scan(transcript) → 3 correction moments',
      tag: '本地启发式',
    },
    {
      id: 'extract', title: '03 · 提取', verb: 'EXTRACT',
      hook: 'Stop',
      desc: '把每个纠正时刻喂给 LLM (Haiku)，输出 8 字段的结构化 JSON：trigger / wrong_pattern / correct_pattern / channel / scope / …',
      code: '{ trigger: "npm install moment*",\n  wrong: "moment.js",\n  correct: "dayjs / date-fns" }',
      tag: 'LLM 结构化',
    },
    {
      id: 'store', title: '04 · 入库', verb: 'STORE',
      hook: 'kb',
      desc: '新规则写入双层 SQLite——项目级 .viki/knowledge.db 或用户级 ~/.viki/global.db。trigger + pattern 同时向量化（multilingual-e5）。',
      code: 'INSERT rule · tier=试用 · confidence=0.50',
      tag: 'SQLite + 384维向量',
    },
    {
      id: 'match', title: '05 · 匹配', verb: 'MATCH',
      hook: 'PreToolUse',
      desc: '下次任意工具调用前，按入参做语义+BM25 融合检索。命中高置信→ deny；中置信→ warn；低 → 静默观察。',
      code: 'PreToolUse(Bash, "npm install moment")\n  → matched seed-pack-universal-moment\n  → action: DENY',
      tag: '语义 + BM25 + RRF',
    },
    {
      id: 'observe', title: '06 · 观察', verb: 'OBSERVE',
      hook: 'PostToolUse',
      desc: 'PostToolUse 看真实结果：用户接受 / 反悔 / 绕过。每一次拦截都是个微型实验，反过来评价规则本身。',
      code: 'user accepted: dayjs · rule = useful',
      tag: '事件流',
    },
    {
      id: 'calibrate', title: '07 · 校准', verb: 'CALIBRATE',
      hook: 'kb',
      desc: '校准器根据事件流动态升降级。有用→ 升档（试用→考察→稳定→规范→强制）。被绕开→ 降档。长期没人用→ 休眠归档。',
      code: 'tier: 试用 → 考察 (confidence 0.72)',
      tag: '6 档迟滞',
    },
  ];

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % stages.length), 2400);
    return () => clearTimeout(t);
  }, [active, playing]);

  const cur = stages[active];

  // Circular layout math
  const R = 200; // radius
  const cx = 280, cy = 280;

  return (
    <section id="loop">
      <div className="container">
        <div className="sec-label"><span>02 · 学习闭环</span></div>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center'}} className="loop-grid">
          <div>
            <h2>一条规则的<br/>完整生命周期。</h2>
            <p className="sub" style={{marginTop: 20}}>
              点击任何节点跳到那一步，或者让它自动循环。每个节点都映射到一个具体的 Claude Code hook。
            </p>
            <div style={{marginTop: 28, display: 'flex', gap: 8}}>
              <button className="btn btn-ghost" onClick={() => setPlaying(!playing)}
                style={{fontSize: 12, padding: '8px 16px'}}>
                {playing ? '❚❚ 暂停' : '▶ 播放'}
              </button>
              <button className="btn btn-ghost" onClick={() => setActive(0)}
                style={{fontSize: 12, padding: '8px 16px'}}>
                ↻ 重置
              </button>
            </div>

            {/* Stage detail card */}
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

          {/* Circular diagram */}
          <div style={{position: 'relative', height: 560}}>
            <svg viewBox="0 0 560 560" style={{width: '100%', height: '100%', overflow: 'visible'}}>
              <defs>
                <radialGradient id="centerGlow">
                  <stop offset="0%" stopColor="var(--green)" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="var(--green)" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* outer ring */}
              <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--line)" strokeWidth="1" strokeDasharray="2 4" />
              {/* inner glow */}
              <circle cx={cx} cy={cy} r={80} fill="url(#centerGlow)" />

              {/* arrows between nodes */}
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

              {/* center label */}
              <text x={cx} y={cy - 10} textAnchor="middle"
                fontFamily="var(--mono)" fontSize="10" fill="var(--ink-mute)" letterSpacing="0.3em">
                LEARN · STORE · USE · EVAL
              </text>
              <text x={cx} y={cy + 14} textAnchor="middle"
                fontFamily="var(--sans)" fontSize="22" fontWeight="600" fill="var(--ink)">
                {cur.tag}
              </text>

              {/* nodes */}
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

                    {/* label */}
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
