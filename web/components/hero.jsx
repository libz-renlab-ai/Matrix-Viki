function Hero() {
  const [phase, setPhase] = useState(0);
  // Auto cycle through a tiny live terminal: correction → extract → match → block
  const lines = [
    { p: '$', t: 'npm install moment', cls: 'term-user' },
    { p: '↳', t: '🚫 Viki 拦截 · 命中规则 seed-pack-universal-moment (置信 0.85)', cls: 'term-deny', d: 700 },
    { p: ' ', t: '   moment.js 自 2020 进入 maintenance · 建议 dayjs / date-fns', cls: 'term-comment' },
    { p: '$', t: 'npm install dayjs', cls: 'term-user', d: 900 },
    { p: '↳', t: '✓ 放行 · added 1 package', cls: 'term-ai' },
  ];

  useEffect(() => {
    if (phase >= lines.length) {
      const r = setTimeout(() => setPhase(0), 3200);
      return () => clearTimeout(r);
    }
    const r = setTimeout(() => setPhase(phase + 1), lines[phase]?.d ?? 480);
    return () => clearTimeout(r);
  }, [phase]);

  return (
    <section style={{paddingTop: 100, paddingBottom: 80, borderTop: 'none'}}>
      <div className="container">
        <div style={{display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 64, alignItems: 'center'}} className="hero-grid">
          <div>
            <span className="eyebrow">个人 AI 规则助手 · personal learning engine</span>
            <h1>
              已知错误<br/>
              <span style={{color: 'var(--green)'}}>不会发生第二次。</span>
            </h1>
            <p className="sub" style={{marginTop: 28}}>
              Matrix-Viki 挂在 Claude Code 上，把每一次"你纠正 AI"的瞬间蒸馏成结构化规则。
              下次它要重蹈覆辙时，在工具调用<span className="accent"> 之前 </span>就被拦下来。
            </p>
            <div style={{display: 'flex', gap: 12, marginTop: 36, flexWrap: 'wrap'}}>
              <a className="btn" href="#demo">▶ 跑一遍核心闭环</a>
              <a className="btn btn-ghost" href="https://github.com/libz-renlab-ai/Matrix-Viki" target="_blank" rel="noreferrer">
                <span style={{fontFamily: 'var(--mono)'}}>↗</span> 看 GitHub
              </a>
            </div>

            <div style={{display: 'flex', gap: 40, marginTop: 56}}>
              <div>
                <div className="stat-num">7</div>
                <div className="stat-label">Hook 接管点</div>
              </div>
              <div>
                <div className="stat-num">6</div>
                <div className="stat-label">规则成熟度档</div>
              </div>
              <div>
                <div className="stat-num">350MB</div>
                <div className="stat-label">daemon 全机内存</div>
              </div>
            </div>
          </div>

          <div>
            <div className="terminal">
              <div className="terminal-head">
                <span className="term-dot r"></span>
                <span className="term-dot y"></span>
                <span className="term-dot g"></span>
                <span className="term-title">~/projects/my-app · claude code</span>
                <span style={{marginLeft: 'auto', fontSize: 11, color: 'var(--green)', fontFamily: 'var(--mono)'}}>
                  ◉ viki: hooked
                </span>
              </div>
              <div className="terminal-body" style={{minHeight: 220}}>
                {lines.slice(0, phase).map((ln, i) => (
                  <div key={i} className="term-line">
                    <span className="term-prompt">{ln.p}</span>
                    <span className={ln.cls}>{ln.t}</span>
                  </div>
                ))}
                {phase < lines.length && (
                  <div className="term-line">
                    <span className="term-prompt">{lines[phase].p}</span>
                    <span className={lines[phase].cls + ' caret'}></span>
                  </div>
                )}
              </div>
            </div>

            <div style={{
              marginTop: 14, fontFamily: 'var(--mono)', fontSize: 11,
              color: 'var(--ink-mute)', display: 'flex', justifyContent: 'space-between'
            }}>
              <span>PreToolUse · matched 1 rule · 12ms</span>
              <span>↻ replaying</span>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width: 900px) {
          .hero-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
        }
      `}</style>
    </section>
  );
}
window.Hero = Hero;
