function Retrieval() {
  const [tab, setTab] = useState('hybrid');

  return (
    <section id="retrieval">
      <div className="container">
        <div className="sec-label"><span>06 · retrieval & matching</span></div>
        <h2>Semantic + lexical ·<br/>fused with RRF.</h2>
        <p className="sub" style={{marginBottom: 40}}>
          You write a rule in one language; the AI triggers it with another phrasing —
          purely lexical match misses half. But library names and APIs are still more precise
          when matched literally. So run both, then fuse with RRF.
        </p>

        <div className="tab-row">
          <button className={'tab' + (tab === 'hybrid' ? ' active' : '')} onClick={() => setTab('hybrid')}>
            Hybrid retrieval demo
          </button>
          <button className={'tab' + (tab === 'dual' ? ' active' : '')} onClick={() => setTab('dual')}>
            Dual-layer KB
          </button>
          <button className={'tab' + (tab === 'channel' ? ' active' : '')} onClick={() => setTab('channel')}>
            Multi-channel routing
          </button>
        </div>

        {tab === 'hybrid' && <HybridDemo />}
        {tab === 'dual' && <DualKB />}
        {tab === 'channel' && <Channels />}
      </div>
    </section>
  );
}

function HybridDemo() {
  const query = 'AI about to npm install a date library';

  const semantic = [
    { id: 'r1', text: 'avoid moment.js, use dayjs / date-fns instead', sim: 0.91, rank: 1 },
    { id: 'r3', text: 'avoid deprecated date APIs in this project', sim: 0.78, rank: 2 },
    { id: 'r7', text: 'audit bundle size before adding any dependency', sim: 0.62, rank: 3 },
  ];
  const bm25 = [
    { id: 'r2', text: 'check lockfile drift before "npm install"', sim: 0.84, rank: 1 },
    { id: 'r1', text: 'avoid moment.js, use dayjs / date-fns instead', sim: 0.71, rank: 2 },
    { id: 'r5', text: 'npm package name spell-check', sim: 0.55, rank: 3 },
  ];
  const k = 60;
  const all = {};
  [...semantic, ...bm25].forEach(item => {
    if (!all[item.id]) all[item.id] = { id: item.id, text: item.text, score: 0, sources: [] };
  });
  semantic.forEach(item => { all[item.id].score += 1 / (k + item.rank); all[item.id].sources.push('vec'); });
  bm25.forEach(item => { all[item.id].score += 1 / (k + item.rank); all[item.id].sources.push('bm25'); });
  const fused = Object.values(all).sort((a, b) => b.score - a.score);

  return (
    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 24}} className="hybrid-grid">
      <div style={{gridColumn: '1 / -1', padding: 20, background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 10}}>
        <div className="mono" style={{fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '0.15em', marginBottom: 8}}>
          INPUT · PreToolUse context
        </div>
        <div className="mono" style={{fontSize: 18, color: 'var(--ink)'}}>{query}</div>
      </div>

      <RankList title="Semantic · vec" icon="≋" color="var(--blue)" items={semantic}
        sub="multilingual-e5-small · cosine · 384-d" />
      <RankList title="Lexical · bm25" icon="#" color="var(--amber)" items={bm25}
        sub="SQLite FTS5 · porter tokenizer" />
      <RankList title="Fused · RRF" icon="◉" color="var(--green)"
        items={fused.slice(0, 3).map((item, i) => ({...item, sim: item.score, rank: i+1, sources: item.sources}))}
        sub="1 / (60 + rank) · summed" highlight />
    </div>
  );
}

function RankList({ title, icon, color, items, sub, highlight }) {
  return (
    <div style={{
      padding: 20, background: 'var(--bg-card)',
      border: '1px solid ' + (highlight ? 'var(--green-dim)' : 'var(--line)'),
      borderRadius: 10,
      boxShadow: highlight ? '0 0 0 1px var(--green-dim)' : 'none',
    }}>
      <div style={{display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4}}>
        <span style={{color, fontSize: 16, fontFamily: 'var(--mono)'}}>{icon}</span>
        <span style={{fontSize: 13, fontWeight: 600, color}}>{title}</span>
      </div>
      <div className="mono" style={{fontSize: 10, color: 'var(--ink-mute)', marginBottom: 16}}>{sub}</div>
      <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
        {items.map((item, i) => (
          <div key={i} style={{padding: '10px 12px', background: '#060807', borderRadius: 6, border: '1px solid var(--line)'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4}}>
              <span className="mono" style={{fontSize: 10, color: 'var(--ink-mute)'}}>#{item.rank} · {item.id}</span>
              <span className="mono" style={{fontSize: 10, color}}>
                {item.sim < 0.1 ? item.sim.toFixed(4) : item.sim.toFixed(2)}
                {item.sources && ' · ' + item.sources.join('+')}
              </span>
            </div>
            <div style={{fontSize: 12, color: 'var(--ink)', lineHeight: 1.4}}>{item.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DualKB() {
  return (
    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 24}} className="dual-grid">
      <div style={{padding: 28, background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12}}>
        <div className="mono" style={{fontSize: 10, color: 'var(--blue)', letterSpacing: '0.15em'}}>GLOBAL · user-level</div>
        <h3 style={{marginTop: 8, fontFamily: 'var(--mono)', fontSize: 18}}>~/.viki/global.db</h3>
        <p style={{color: 'var(--ink-dim)', fontSize: 14, marginTop: 12, lineHeight: 1.6}}>
          Shared across projects. Personal preferences and team standards that hold long-term go here. Triggers in every project.
        </p>
        <div style={{marginTop: 24}}>
          {[
            { name: 'avoid moment.js', tier: 'enforce' },
            { name: 'git push --force → open a PR', tier: 'enforce' },
            { name: 'no PII in local logs', tier: 'norm' },
            { name: 'curl must use https', tier: 'stable' },
          ].map((r, i) => (
            <div key={i} style={{display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: i === 0 ? '1px solid var(--line)' : '1px dashed var(--line)'}}>
              <span style={{fontSize: 13, color: 'var(--ink)'}}>{r.name}</span>
              <span className="mono" style={{fontSize: 11, color: 'var(--ink-mute)'}}>{r.tier}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{padding: 28, background: 'var(--bg-card)', border: '1px solid var(--green-dim)', borderRadius: 12}}>
        <div className="mono" style={{fontSize: 10, color: 'var(--green)', letterSpacing: '0.15em'}}>PROJECT · per-project</div>
        <h3 style={{marginTop: 8, fontFamily: 'var(--mono)', fontSize: 18}}>.viki/knowledge.db</h3>
        <p style={{color: 'var(--ink-dim)', fontSize: 14, marginTop: 12, lineHeight: 1.6}}>
          Only applies in the current project. Stack choices, internal API conventions, deploy gotchas — won't trigger once you cd out.
        </p>
        <div style={{marginTop: 24}}>
          {[
            { name: 'this project locks TS 5.x', tier: 'stable' },
            { name: 'use ioredis, not node-redis', tier: 'norm' },
            { name: 'pnpm test required before deploy', tier: 'enforce' },
            { name: 'imports via @/* alias', tier: 'review' },
          ].map((r, i) => (
            <div key={i} style={{display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: i === 0 ? '1px solid var(--line)' : '1px dashed var(--line)'}}>
              <span style={{fontSize: 13, color: 'var(--ink)'}}>{r.name}</span>
              <span className="mono" style={{fontSize: 11, color: 'var(--ink-mute)'}}>{r.tier}</span>
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @media (max-width: 900px) {
          .dual-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function Channels() {
  const channels = [
    { name: 'tool-action', hook: 'PreToolUse', color: 'var(--red)',
      desc: 'Triggered by tool args — npm install / git push / any Bash command. The strictest channel, can DENY.',
      ex: 'Bash("rm -rf /") → DENY' },
    { name: 'user-input', hook: 'UserPromptSubmit', color: 'var(--blue)',
      desc: 'Triggered by prompt semantics. Surfaces relevant rules into context before the AI even sees the prompt.',
      ex: '"add me a date library" → injects moment rules' },
    { name: 'passive-knowledge', hook: 'SessionStart', color: 'var(--purple)',
      desc: 'Background knowledge. Compiled once into Skills at session start. Not part of runtime retrieval.',
      ex: '"this project uses pnpm, not npm"' },
  ];
  return (
    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 24}} className="ch-grid">
      {channels.map((c, i) => (
        <div key={i} style={{padding: 24, background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12,
                              borderTop: '3px solid ' + c.color}}>
          <div className="mono" style={{fontSize: 11, color: c.color, letterSpacing: '0.1em'}}>{c.name}</div>
          <div className="mono" style={{fontSize: 11, color: 'var(--ink-mute)', marginTop: 4}}>via {c.hook}</div>
          <p style={{fontSize: 14, color: 'var(--ink-dim)', lineHeight: 1.6, marginTop: 16}}>{c.desc}</p>
          <div style={{marginTop: 20, padding: 12, background: '#060807', borderRadius: 6, border: '1px solid var(--line)'}}>
            <div className="mono" style={{fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '0.1em', marginBottom: 6}}>EXAMPLE</div>
            <code className="mono" style={{fontSize: 12, color: 'var(--ink)'}}>{c.ex}</code>
          </div>
        </div>
      ))}
      <style>{`
        @media (max-width: 900px) {
          .ch-grid, .hybrid-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

window.Retrieval = Retrieval;
