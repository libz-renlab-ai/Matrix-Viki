function Hero() {
  const [phase, setPhase] = useState(0);
  const t1 = useRef(null), t2 = useRef(null), tagline = useRef(null);

  useEffect(() => {
    if (t1.current && window.scrambleText) window.scrambleText(t1.current, 'Known mistakes', { duration: 900 });
    if (t2.current && window.scrambleText) setTimeout(() => t2.current && window.scrambleText(t2.current, "don't happen twice.", { duration: 1200 }), 600);
    if (tagline.current && window.scrambleText) setTimeout(() => tagline.current && window.scrambleText(tagline.current, 'personal learning engine · v0.12.0', { duration: 1000 }), 200);
  }, []);
  const lines = [
    { p: '$', t: 'npm install moment', cls: 'term-user' },
    { p: '↳', t: '🚫 Viki intercepted · matched seed-pack-universal-moment (conf 0.85)', cls: 'term-deny', d: 700 },
    { p: ' ', t: '   moment.js in maintenance since 2020 · suggest dayjs / date-fns', cls: 'term-comment' },
    { p: '$', t: 'npm install dayjs', cls: 'term-user', d: 900 },
    { p: '↳', t: '✓ allowed · added 1 package', cls: 'term-ai' },
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
            <span className="eyebrow" ref={tagline}>personal learning engine · v0.12.0</span>
            <h1 style={{fontSize: 'clamp(40px, 6vw, 88px)'}}>
              <span style={{display: 'block', whiteSpace: 'nowrap'}} ref={t1}>Known mistakes</span>
              <span style={{color: 'var(--green)', display: 'block', whiteSpace: 'nowrap'}} ref={t2}>don't happen twice.</span>
            </h1>
            <p className="sub" style={{marginTop: 28}}>
              Matrix-Viki hooks into Claude Code and distills every "you corrected the AI" moment into a structured rule.
              Next time it's about to repeat the same mistake, it gets caught<span className="accent"> before </span>the tool call runs.
            </p>
            <div style={{display: 'flex', gap: 12, marginTop: 36, flexWrap: 'wrap'}}>
              <a className="btn" href="#demo">▶ See the loop run</a>
              <a className="btn btn-ghost" href="https://github.com/libz-renlab-ai/Matrix-Viki" target="_blank" rel="noreferrer">
                <span style={{fontFamily: 'var(--mono)'}}>↗</span> View on GitHub
              </a>
            </div>

            <div style={{display: 'flex', gap: 40, marginTop: 56}} data-reveal data-reveal-stagger>
              <div>
                <div className="neon-num neon-num-sm">7</div>
                <div className="stat-label">Hook touchpoints</div>
              </div>
              <div>
                <div className="neon-num neon-num-sm">6</div>
                <div className="stat-label">Maturity tiers</div>
              </div>
              <div>
                <div className="neon-num neon-num-sm">350<span style={{fontSize:'0.45em',opacity:0.6}}>MB</span></div>
                <div className="stat-label">Daemon total RAM</div>
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
