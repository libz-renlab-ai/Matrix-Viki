function Arch() {
  const layers = [
    { id: 'cli', name: '@viki/cli', sub: 'CLI + 9 hook bundles', role: 'entry', files: ['bin.ts', 'bin-pre-tool-use.cjs', 'bin-stop.cjs', 'bin-embedder.cjs'] },
    { id: 'adapters', name: '@viki/adapters', sub: 'imperative shell', role: 'io', files: ['storage', 'llm', 'hook', 'embedding', 'ingest'] },
    { id: 'core', name: '@viki/core', sub: 'functional core · pure learning engine', role: 'logic', files: ['detector', 'extractor', 'matcher', 'calibrator'], emphasize: true },
    { id: 'ports', name: '@viki/ports', sub: 'port interfaces + contract tests', role: 'contract', files: ['StoragePort', 'LLMPort', 'EmbedderPort'] },
    { id: 'types', name: '@viki/types', sub: 'pure types · zero deps', role: 'types', files: ['Rule', 'Event', 'Hook'] },
  ];

  const perfFeatures = [
    { title: 'Embedder Daemon', desc: 'A long-lived daemon owns the single ONNX model instance. Multi-window concurrency no longer spikes RAM into the GBs.', metric: '7GB → 350MB', color: 'var(--green)' },
    { title: 'Thin-client Hooks', desc: 'Hook processes just package payload, write to outbox, exit. Heavy work goes to the daemon.', metric: '<50ms exit', color: 'var(--blue)' },
    { title: 'Outbox Queue', desc: 'No data loss when daemon is down. File queue decouples; per-task 10-min hard timeout.', metric: '24h max-age', color: 'var(--purple)' },
    { title: 'Idle Unload', desc: 'Model drops reference after 5 min idle; daemon exits after 30 min idle.', metric: '5min / 30min', color: 'var(--amber)' },
    { title: 'Cold Scheduling', desc: 'Heavy full-scan work only runs when CPU < 60% — never competes with you typing.', metric: 'CPU < 60%', color: 'var(--blue)' },
    { title: 'Offline Auto-detect', desc: 'Skip HuggingFace HEAD requests when the model cache is present. Resilient on flaky networks.', metric: 'auto detect', color: 'var(--green)' },
  ];

  return (
    <section id="arch">
      <div className="container">
        <div className="sec-label" data-reveal><span>09 · architecture</span></div>
        <h2>Functional core ·<br/>imperative shell.</h2>
        <p className="sub" style={{marginBottom: 48}}>
          Dependencies flow one way — reverse is forbidden. Core learning logic is pure functions:
          replayable offline, unit-testable, LLM-backend-swappable without touching the core.
          All side effects live in the adapter layer.
        </p>

        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40}} className="arch-grid">
          <div>
            <div className="mono" style={{fontSize: 11, color: 'var(--ink-mute)', letterSpacing: '0.15em', marginBottom: 16}}>
              dependency direction · cli → adapters → core → ports → types
            </div>
            <div style={{display: 'flex', flexDirection: 'column', gap: 4}}>
              {layers.map((l, i) => (
                <div key={l.id} style={{
                  padding: '20px 24px',
                  background: l.emphasize ? 'rgba(74,222,128,0.04)' : 'var(--bg-card)',
                  border: '1px solid ' + (l.emphasize ? 'var(--green-dim)' : 'var(--line)'),
                  borderRadius: 10,
                  position: 'relative',
                  marginLeft: i * 16,
                  marginRight: i * 4,
                }}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 12}}>
                    <div>
                      <div style={{fontFamily: 'var(--mono)', fontSize: 15, fontWeight: 600,
                                   color: l.emphasize ? 'var(--green)' : 'var(--ink)'}}>{l.name}</div>
                      <div style={{fontSize: 12, color: 'var(--ink-dim)', marginTop: 2}}>{l.sub}</div>
                    </div>
                    <div style={{display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end'}}>
                      {l.files.map(f => (
                        <span key={f} className="mono" style={{
                          fontSize: 10, padding: '2px 8px',
                          background: '#060807', border: '1px solid var(--line)',
                          color: 'var(--ink-mute)', borderRadius: 4,
                        }}>{f}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{marginTop: 28, padding: 20, background: 'var(--bg-card)',
                         border: '1px dashed var(--line)', borderRadius: 10}}>
              <div className="mono" style={{fontSize: 11, color: 'var(--green)', letterSpacing: '0.15em', marginBottom: 12}}>
                INVARIANTS
              </div>
              <div className="mono" style={{fontSize: 12, color: 'var(--ink-dim)', lineHeight: 1.9}}>
                <div>· <span style={{color:'var(--ink)'}}>@viki/core</span> forbids IO (no node:fs / child_process)</div>
                <div>· new Port interfaces: contract test first, implementation after</div>
                <div>· attribution events go through AttributionBus, not console.log</div>
              </div>
            </div>
          </div>

          <div>
            <div className="mono" style={{fontSize: 11, color: 'var(--ink-mute)', letterSpacing: '0.15em', marginBottom: 16}}>
              daemon-first · runtime stability
            </div>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12}}>
              {perfFeatures.map((f, i) => (
                <div key={i} style={{
                  padding: 18,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--line)',
                  borderRadius: 10,
                  transition: 'all 0.2s',
                  cursor: 'default',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = f.color; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line)'; }}>
                  <div className="mono" style={{fontSize: 11, color: f.color, letterSpacing: '0.05em'}}>
                    {f.metric}
                  </div>
                  <div style={{fontSize: 15, fontWeight: 600, marginTop: 8, color: 'var(--ink)'}}>{f.title}</div>
                  <p style={{fontSize: 12, color: 'var(--ink-dim)', lineHeight: 1.55, marginTop: 8, margin: 0, marginBlockStart: 8}}>{f.desc}</p>
                </div>
              ))}
            </div>

            <div style={{marginTop: 28, padding: 20, background: '#060807',
                         border: '1px solid var(--line)', borderRadius: 10}}>
              <div className="mono" style={{fontSize: 11, color: 'var(--ink-mute)', letterSpacing: '0.15em', marginBottom: 12}}>
                8 orthogonal core verbs
              </div>
              <div style={{display: 'flex', gap: 6, flexWrap: 'wrap'}}>
                {['intercept', 'match', 'detect', 'extract', 'validate', 'calibrate', 'compile', 'attribute'].map(v => (
                  <span key={v} className="mono" style={{
                    padding: '4px 10px', fontSize: 11,
                    border: '1px solid var(--green-dim)',
                    color: 'var(--green)', borderRadius: 100,
                    background: 'rgba(74,222,128,0.04)',
                  }}>{v}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <Install />
      </div>
      <style>{`
        @media (max-width: 900px) {
          .arch-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}

function Install() {
  const steps = [
    { cmd: 'git clone https://github.com/libz-renlab-ai/Matrix-Viki', sub: 'grab source' },
    { cmd: 'pnpm install && pnpm build', sub: 'build 9 hook bundles + daemon' },
    { cmd: 'pnpm viki install --yes', sub: 'register hooks + install onnxruntime-node' },
    { cmd: 'pnpm viki init', sub: 'inject 8 meta-principles and vectorize' },
    { cmd: 'pnpm viki doctor', sub: '14 health checks should all ✅' },
  ];
  return (
    <div style={{marginTop: 80}}>
      <div className="sec-label" style={{marginBottom: 20}}><span>· first-time success path · install</span></div>
      <div className="terminal">
        <div className="terminal-head">
          <span className="term-dot r"></span><span className="term-dot y"></span><span className="term-dot g"></span>
          <span className="term-title">~/.viki · 5 steps to ready</span>
        </div>
        <div className="terminal-body" style={{padding: '24px 28px'}}>
          {steps.map((s, i) => (
            <div key={i} style={{padding: '12px 0', borderTop: i === 0 ? 'none' : '1px dashed var(--line)'}}>
              <div style={{display: 'flex', alignItems: 'baseline', gap: 12}}>
                <span className="mono" style={{fontSize: 11, color: 'var(--ink-mute)', flexShrink: 0, width: 32}}>
                  ▶ {i + 1}
                </span>
                <span className="mono" style={{fontSize: 14, color: 'var(--green)'}}>{s.cmd}</span>
              </div>
              <div style={{paddingLeft: 44, fontSize: 12, color: 'var(--ink-mute)', marginTop: 4, fontFamily: 'var(--mono)'}}>
                # {s.sub}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="mono" style={{fontSize: 11, color: 'var(--ink-mute)', marginTop: 12, textAlign: 'center'}}>
        restart Claude Code · then forget about it — Viki runs the full loop in the background.
      </p>
    </div>
  );
}

window.Arch = Arch;
