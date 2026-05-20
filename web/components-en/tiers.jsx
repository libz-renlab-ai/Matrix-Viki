function Tiers() {
  const tiers = [
    {
      id: 'try', name: 'Trying', en: 'TRYING', conf: '0.50 – 0.60',
      color: 'var(--ink-mute)',
      channel: 'no output',
      desc: 'A new rule. Might be wrong — too risky to block on it. Only observed in shadow mode.',
      action: 'observe',
      effect: 'invisible',
    },
    {
      id: 'review', name: 'Review', en: 'REVIEW', conf: '0.60 – 0.70',
      color: 'var(--blue)',
      channel: 'retrieve-only',
      desc: 'Quietly active. On match, the rule is silently retrieved into context but never blocks — a soft nudge.',
      action: 'retrieve',
      effect: 'appears in context',
    },
    {
      id: 'stable', name: 'Stable', en: 'STABLE', conf: '0.70 – 0.80',
      color: 'var(--purple)',
      channel: 'compile to skills',
      desc: 'Proven useful through repeated use. Compiled into Claude Skills and injected at SessionStart.',
      action: 'inject as skill',
      effect: 'AI avoids on its own',
    },
    {
      id: 'norm', name: 'Norm', en: 'NORM', conf: '0.80 – 0.90',
      color: 'var(--green)',
      channel: 'warn',
      desc: 'Project or personal standard. PreToolUse fires an amber warning but the tool still runs.',
      action: 'WARN',
      effect: 'amber warning',
    },
    {
      id: 'enforce', name: 'Enforce', en: 'ENFORCE', conf: '0.90 – 1.00',
      color: 'var(--red)',
      channel: 'block',
      desc: 'Non-negotiable. PreToolUse match → DENY blocks the tool call. Only core rules reach this tier.',
      action: 'DENY',
      effect: 'execution blocked',
    },
    {
      id: 'dormant', name: 'Dormant', en: 'DORMANT', conf: 'archived',
      color: 'var(--amber)',
      channel: 'archived',
      desc: 'Unused long-term or repeatedly bypassed. Retired from every output channel but still revivable.',
      action: 'archive',
      effect: 'out of rotation',
    },
  ];

  const [active, setActive] = useState(3);
  const cur = tiers[active];

  return (
    <section id="tiers">
      <div className="container">
        <div className="sec-label"><span>05 · maturity</span></div>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'start'}} className="tiers-grid">
          <div>
            <h2>Rules aren't<br/>set in stone.</h2>
            <p className="sub" style={{marginTop: 20}}>
              Every rule carries confidence and a tier. Low-risk channels let new rules try themselves out;
              only proven ones graduate to real blocking. Promotion and demotion both have hysteresis —
              one counterexample won't flip a rule.
            </p>
            <div style={{marginTop: 36, padding: 24, background: 'var(--bg-card)',
                         border: '1px solid', borderColor: cur.color, borderRadius: 12,
                         transition: 'border-color 0.3s'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline'}}>
                <div>
                  <div className="mono" style={{fontSize: 11, letterSpacing: '0.2em', color: cur.color}}>
                    {cur.en} · TIER 0{active + 1}
                  </div>
                  <h3 style={{fontSize: 28, marginTop: 8, fontWeight: 600}}>{cur.name}</h3>
                </div>
                <div style={{textAlign: 'right'}}>
                  <div className="mono" style={{fontSize: 10, color: 'var(--ink-mute)'}}>CONFIDENCE</div>
                  <div className="mono" style={{fontSize: 14, color: cur.color, marginTop: 4}}>{cur.conf}</div>
                </div>
              </div>
              <p style={{color: 'var(--ink-dim)', marginTop: 16, lineHeight: 1.6, fontSize: 15}}>{cur.desc}</p>
              <div style={{marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12,
                           paddingTop: 16, borderTop: '1px solid var(--line)'}}>
                <div>
                  <div className="mono" style={{fontSize: 9, color: 'var(--ink-mute)', letterSpacing: '0.1em'}}>CHANNEL</div>
                  <div className="mono" style={{fontSize: 13, marginTop: 4, color: cur.color}}>{cur.channel}</div>
                </div>
                <div>
                  <div className="mono" style={{fontSize: 9, color: 'var(--ink-mute)', letterSpacing: '0.1em'}}>ACTION</div>
                  <div className="mono" style={{fontSize: 13, marginTop: 4, color: cur.color}}>{cur.action}</div>
                </div>
                <div>
                  <div className="mono" style={{fontSize: 9, color: 'var(--ink-mute)', letterSpacing: '0.1em'}}>USER SEES</div>
                  <div className="mono" style={{fontSize: 13, marginTop: 4, color: 'var(--ink)'}}>{cur.effect}</div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
              {tiers.map((tier, i) => (
                <div key={tier.id}
                  onClick={() => setActive(i)}
                  style={{
                    cursor: 'pointer',
                    display: 'grid',
                    gridTemplateColumns: '32px 110px 1fr 130px',
                    alignItems: 'center',
                    gap: 16,
                    padding: '18px 20px',
                    background: i === active ? 'var(--bg-card)' : 'transparent',
                    border: '1px solid ' + (i === active ? tier.color : 'var(--line)'),
                    borderRadius: 10,
                    transition: 'all 0.2s',
                  }}>
                  <div className="mono" style={{fontSize: 11, color: 'var(--ink-mute)'}}>
                    0{i + 1}
                  </div>
                  <div>
                    <div style={{fontSize: 16, fontWeight: 600, color: i === active ? tier.color : 'var(--ink)'}}>
                      {tier.name}
                    </div>
                    <div className="mono" style={{fontSize: 9, color: 'var(--ink-mute)', letterSpacing: '0.1em', marginTop: 2}}>
                      {tier.en}
                    </div>
                  </div>
                  <div style={{position: 'relative', height: 4, background: 'var(--line)', borderRadius: 100}}>
                    <div style={{
                      position: 'absolute', height: '100%', borderRadius: 100,
                      background: tier.color,
                      width: tier.id === 'dormant' ? '20%' : `${(i + 1) / 5 * 100}%`,
                      transition: 'all 0.3s',
                      boxShadow: i === active ? `0 0 12px ${tier.color}` : 'none',
                    }} />
                  </div>
                  <div className="mono" style={{
                    fontSize: 11, textAlign: 'right', color: i === active ? tier.color : 'var(--ink-mute)',
                    letterSpacing: '0.05em'
                  }}>
                    {tier.channel}
                  </div>
                </div>
              ))}
            </div>

            <div className="mono" style={{
              marginTop: 20, padding: 16, background: 'var(--bg-card)',
              border: '1px dashed var(--line)', borderRadius: 8,
              fontSize: 12, color: 'var(--ink-dim)', lineHeight: 1.7,
            }}>
              <div><span style={{color: 'var(--green)'}}>↑</span> promote: user accepts → confidence + 0.12</div>
              <div><span style={{color: 'var(--red)'}}>↓</span> demote: user bypasses → confidence − 0.08</div>
              <div><span style={{color: 'var(--amber)'}}>⤓</span> archive: untouched 30 days → dormant</div>
              <div style={{marginTop: 6, color: 'var(--ink-mute)', fontStyle: 'italic'}}>
                Single events capped at ≤ 0.15 step to avoid jitter.
              </div>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width: 900px) {
          .tiers-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
        }
      `}</style>
    </section>
  );
}
window.Tiers = Tiers;
