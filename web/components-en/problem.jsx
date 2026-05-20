function Problem() {
  return (
    <section>
      <div className="container">
        <div className="sec-label"><span>01 · the problem</span></div>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 80, alignItems: 'start'}} className="prob-grid">
          <div>
            <h2>Every session<br/>starts from zero.</h2>
            <p className="sub" style={{marginTop: 24}}>
              The "AI assistant + docs" pattern has a structural flaw — you corrected it yesterday,
              it does the same thing today. Your hand-written <span className="mono" style={{color:'var(--ink)'}}>CLAUDE.md</span> grows
              longer, but the AI only reads the first few lines.
            </p>
          </div>

          <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
            {[
              {n: 'yesterday', a: 'You said "stop using moment"', b: 'Today it suggests moment again'},
              {n: 'last week',  a: 'You spent 2h on a deploy gotcha', b: 'New project, same gotcha from scratch'},
              {n: 'always',     a: 'CLAUDE.md keeps growing',         b: 'AI reads the top few lines and stops'},
            ].map((row, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '92px 1fr 24px 1fr',
                gap: 20, alignItems: 'center', padding: '20px 24px',
                background: 'var(--bg-card)', border: '1px solid var(--line)',
                borderRadius: 10
              }}>
                <span className="mono" style={{fontSize: 11, color: 'var(--ink-mute)', letterSpacing: '0.1em'}}>{row.n}</span>
                <span style={{color: 'var(--ink-dim)'}}>{row.a}</span>
                <span style={{textAlign: 'center', color: 'var(--ink-mute)', fontFamily: 'var(--mono)'}}>→</span>
                <span style={{color: 'var(--amber)'}}>{row.b}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{marginTop: 80, padding: '32px 36px', background: 'var(--bg-card)',
                     border: '1px solid var(--green-dim)', borderRadius: 12,
                     borderLeft: '3px solid var(--green)'}}>
          <div className="mono" style={{fontSize: 11, letterSpacing: '0.15em', color: 'var(--green)', marginBottom: 12}}>
            VIKI'S PROMISE
          </div>
          <p style={{fontSize: 24, margin: 0, lineHeight: 1.4, textWrap: 'balance'}}>
            Turn "corrections" into a <span className="accent">durable asset</span> —
            every correction becomes a rule with confidence, surfaced <span className="accent">automatically</span> at
            the right moment (before the tool call). Bad rules <span className="accent">demote themselves</span> when
            the AI works around them.
          </p>
        </div>
      </div>
      <style>{`
        @media (max-width: 900px) {
          .prob-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
        }
      `}</style>
    </section>
  );
}
window.Problem = Problem;
