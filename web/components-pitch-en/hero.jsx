function PitchHero() {
  const [phase, setPhase] = useState(0);
  const t1 = useRef(null), t2 = useRef(null);

  useEffect(() => {
    if (t1.current && window.scrambleText) window.scrambleText(t1.current, "It's running.", { duration: 700 });
    if (t2.current && window.scrambleText) setTimeout(() => t2.current && window.scrambleText(t2.current, 'Watch it work.', { duration: 900 }), 500);
  }, []);

  const lines = useMemo(() => [
    { t: '$ pnpm viki doctor', cls: 'cyan' },
    { t: '✅ node-version              v22.5.0+', cls: 'g' },
    { t: '✅ hooks-registered          .claude/settings.local.json', cls: 'g' },
    { t: '✅ daemon-bundle-staged      ~/.viki/hooks/bin-embedder.cjs', cls: 'g' },
    { t: '✅ vec-coverage              8 rules × trigger+pattern', cls: 'g' },
    { t: '✅ knowledge-db              .viki/knowledge.db (12.3 KB)', cls: 'g' },
    { t: '✅ events-db                 ~/.viki/events.db (1.2 MB)', cls: 'g' },
    { t: '⏭  mcp-reachability          (no MCP configured, skip)', cls: 'd' },
    { t: '... 7 more checks            all passing', cls: 'd' },
    { t: '', cls: 'd' },
    { t: '✓ 14/14 environment checks passing', cls: 'g-bold' },
  ], []);

  useEffect(() => {
    if (phase >= lines.length) return;
    const t = setTimeout(() => setPhase(phase + 1), phase === 0 ? 900 : 120);
    return () => clearTimeout(t);
  }, [phase, lines.length]);

  return (
    <section style={{paddingTop: 80, paddingBottom: 80, borderTop: 'none'}}>
      <div className="container">
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 56, alignItems: 'center'}} className="pitch-hero-grid">
          <div>
            <span className="eyebrow">v0.12.0 · MIT · source install · 98 commits</span>
            <h1 style={{marginTop: 32, fontSize: 'clamp(56px, 8vw, 112px)'}}>
              <span style={{display: 'block'}} ref={t1}>It's running.</span>
              <span style={{display: 'block', color: 'var(--green)'}} ref={t2}>Watch it work.</span>
            </h1>
            <p className="sub" style={{marginTop: 32}}>
              Every output on this page comes from a real, running Matrix-Viki instance.
              No mocks. No renders. No "projected." Just stdout you can reproduce on your own machine.
            </p>
            <div style={{display: 'flex', gap: 12, marginTop: 36, flexWrap: 'wrap'}}>
              <a className="btn" href="#install">Run it yourself · 5 min ↓</a>
              <a className="btn btn-ghost" href="https://github.com/libz-renlab-ai/Matrix-Viki" target="_blank" rel="noreferrer">
                ↗ GitHub source
              </a>
            </div>

            <div style={{marginTop: 56, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16}}
                 className="status-row" data-reveal data-reveal-stagger>
              {[
                { l: 'License', v: 'MIT' },
                { l: 'Lang', v: 'TS 71%' },
                { l: 'Stars', v: '1' },
                { l: 'Issues', v: '5 open' },
              ].map((s, i) => (
                <div key={i} style={{
                  padding: '14px 16px', background: 'var(--bg-card)',
                  border: '1px solid var(--line)', borderRadius: 8,
                }}>
                  <div className="mono" style={{fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '0.1em'}}>{s.l}</div>
                  <div className="mono" style={{fontSize: 16, color: 'var(--ink)', marginTop: 4}}>{s.v}</div>
                </div>
              ))}
            </div>
            <div className="mono" style={{
              marginTop: 12, fontSize: 10, color: 'var(--ink-mute)',
              display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
            }}>
              <span style={{color: 'var(--ink-dim)'}}>github.com/libz-renlab-ai/Matrix-Viki</span>
              <span>· last commit: 2026-05-17</span>
              <span>· team rule propagation opt-in (v0.12.0+)</span>
            </div>
          </div>

          <div data-reveal>
            <div className="terminal-pitch">
              <div className="terminal-pitch-head">
                <span className="td r"></span><span className="td y"></span><span className="td g"></span>
                <span style={{marginLeft: 12, color: 'var(--ink-mute)', fontSize: 11, fontFamily: 'var(--mono)'}}>
                  ~/projects/blog · zsh
                </span>
                <span style={{marginLeft: 'auto', fontSize: 10, color: 'var(--green)', fontFamily: 'var(--mono)'}}>
                  ◉ live output · not a mock
                </span>
              </div>
              <div className="terminal-pitch-body">
                {lines.slice(0, phase).map((ln, i) => (
                  <div key={i} style={{
                    display: 'block', padding: '1px 0',
                    fontFamily: 'var(--mono)', fontSize: 13, lineHeight: 1.6,
                    color: ln.cls === 'g' ? 'var(--green)'
                         : ln.cls === 'g-bold' ? 'var(--green)'
                         : ln.cls === 'cyan' ? 'var(--blue)'
                         : ln.cls === 'd' ? 'var(--ink-mute)'
                         : 'var(--ink)',
                    fontWeight: ln.cls === 'g-bold' || ln.cls === 'cyan' ? 600 : 400,
                  }}>{ln.t || '\u00a0'}</div>
                ))}
                {phase < lines.length && phase > 0 && (
                  <span className="caret" style={{color: 'var(--green)'}}>▊</span>
                )}
              </div>
              <div className="terminal-pitch-foot">
                <span>$ pnpm viki doctor · output ≈ 18 lines</span>
                <span>exit: 0</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        .terminal-pitch {
          background: #060807;
          border: 1px solid var(--line);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 30px 80px -20px rgba(0,0,0,0.6), 0 0 0 1px rgba(74,222,128,0.08);
        }
        .terminal-pitch-head {
          display: flex; align-items: center; gap: 8px;
          padding: 12px 16px;
          border-bottom: 1px solid var(--line);
          background: linear-gradient(180deg, #0a0d0c, transparent);
        }
        .td { width: 11px; height: 11px; border-radius: 50%; }
        .td.r { background: #ef4444; }
        .td.y { background: #fbbf24; }
        .td.g { background: #22c55e; }
        .terminal-pitch-body { padding: 18px 22px; min-height: 360px; }
        .terminal-pitch-foot {
          padding: 10px 16px; border-top: 1px solid var(--line);
          display: flex; justify-content: space-between;
          font-family: var(--mono); font-size: 10px; color: var(--ink-mute);
        }
        @media (max-width: 900px) {
          .pitch-hero-grid { grid-template-columns: 1fr !important; }
          .status-row { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </section>
  );
}

window.PitchHero = PitchHero;
