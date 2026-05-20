function SiteFooter() {
  return (
    <>
      <section style={{padding: '120px 0'}}>
        <div className="container" style={{textAlign: 'center'}}>
          <span className="eyebrow">v0.12.0 · source install</span>
          <h2 style={{fontSize: 'clamp(40px, 5vw, 72px)', margin: '32px auto 24px', maxWidth: 900}}>
            Stop stepping on<br/>the same rake.
          </h2>
          <p className="sub" style={{margin: '0 auto', maxWidth: 600}}>
            You don't change how you work. The rule library grows itself from your sessions, in the background.
          </p>
          <div style={{display: 'flex', gap: 12, justifyContent: 'center', marginTop: 40, flexWrap: 'wrap'}}>
            <a className="btn" href="https://github.com/libz-renlab-ai/Matrix-Viki" target="_blank" rel="noreferrer">
              ↗ github.com/libz-renlab-ai/Matrix-Viki
            </a>
            <a className="btn btn-ghost" href="https://github.com/libz-renlab-ai/Matrix-Viki/blob/main/docs/ARCHITECTURE.md" target="_blank" rel="noreferrer">
              ARCHITECTURE.md
            </a>
          </div>

          <div style={{marginTop: 80, textAlign: 'left'}}>
            <div className="mono" style={{fontSize: 11, color: 'var(--ink-mute)', letterSpacing: '0.2em', textAlign: 'center', marginBottom: 24}}>
              · commands you'll actually run ·
            </div>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12}} className="cmd-grid">
              {[
                { cmd: 'viki try', desc: '30-sec tour of 5 classic interception scenarios' },
                { cmd: 'viki pitfall', desc: 'Interactively log a gotcha you just learned' },
                { cmd: 'viki stats', desc: 'Inspect the rule library · grouped by C/E/S/K' },
                { cmd: 'viki review 10', desc: 'List 10 most recent rules for human review' },
                { cmd: 'viki daily', desc: 'Cross-project digest of today\'s Claude Code activity' },
                { cmd: 'viki doctor', desc: '14 environment checks · each with a fix command' },
              ].map((c, i) => (
                <div key={i} style={{
                  padding: '14px 16px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  cursor: 'default',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--green-dim)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line)'; }}>
                  <div className="mono" style={{fontSize: 13, color: 'var(--green)'}}>{c.cmd}</div>
                  <div style={{fontSize: 12, color: 'var(--ink-dim)', marginTop: 6}}>{c.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <style>{`
          @media (max-width: 900px) {
            .cmd-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </section>

      <footer>
        <div className="container" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16}}>
          <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
            <div className="brand-mark"><span></span><span></span><span></span><span></span></div>
            <span>MATRIX·VIKI</span>
            <span style={{color: 'var(--ink-mute)', opacity: 0.7}}>· MIT License · personal AI rule assistant</span>
          </div>
          <div style={{display: 'flex', gap: 24}}>
            <a href="https://github.com/libz-renlab-ai/Matrix-Viki" target="_blank" rel="noreferrer">github</a>
            <a href="https://github.com/libz-renlab-ai/Matrix-Viki/blob/main/CHANGELOG.md" target="_blank" rel="noreferrer">changelog</a>
            <a href="https://github.com/libz-renlab-ai/Matrix-Viki/issues" target="_blank" rel="noreferrer">issues</a>
            <a href="https://github.com/libz-renlab-ai/TeamBrain" target="_blank" rel="noreferrer">teambrain</a>
          </div>
        </div>
      </footer>
    </>
  );
}
window.SiteFooter = SiteFooter;
