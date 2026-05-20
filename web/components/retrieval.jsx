function Retrieval() {
  const [tab, setTab] = useState('hybrid');

  return (
    <section id="retrieval">
      <div className="container">
        <div className="sec-label"><span>06 · 检索与匹配</span></div>
        <h2>语义 + 字面 ·<br/>RRF 融合排序。</h2>
        <p className="sub" style={{marginBottom: 40}}>
          用户用中文记的规则，AI 用英文 prompt 触发——光靠字面匹配漏一半。
          但库名、API 名又是字面更准。所以两路检索一起跑，再 RRF 融合。
        </p>

        <div className="tab-row">
          <button className={'tab' + (tab === 'hybrid' ? ' active' : '')} onClick={() => setTab('hybrid')}>
            混合检索演示
          </button>
          <button className={'tab' + (tab === 'dual' ? ' active' : '')} onClick={() => setTab('dual')}>
            双层规则库
          </button>
          <button className={'tab' + (tab === 'channel' ? ' active' : '')} onClick={() => setTab('channel')}>
            多通道分流
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
  const query = 'AI 准备 npm install 一个时间库';

  const semantic = [
    { id: 'r1', text: '禁用 moment.js，改用 dayjs/date-fns', sim: 0.91, rank: 1 },
    { id: 'r3', text: '日期处理避免使用废弃 API', sim: 0.78, rank: 2 },
    { id: 'r7', text: '安装依赖前先 audit 体积', sim: 0.62, rank: 3 },
  ];
  const bm25 = [
    { id: 'r2', text: '"npm install" 前检查 lockfile drift', sim: 0.84, rank: 1 },
    { id: 'r1', text: '禁用 moment.js，改用 dayjs/date-fns', sim: 0.71, rank: 2 },
    { id: 'r5', text: 'npm 包名拼写检查', sim: 0.55, rank: 3 },
  ];
  // RRF: 1/(k+rank), k=60
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
      {/* Query */}
      <div style={{gridColumn: '1 / -1', padding: 20, background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 10}}>
        <div className="mono" style={{fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '0.15em', marginBottom: 8}}>
          INPUT · PreToolUse 上下文
        </div>
        <div className="mono" style={{fontSize: 18, color: 'var(--ink)'}}>{query}</div>
      </div>

      <RankList title="语义检索 · vec" icon="≋" color="var(--blue)" items={semantic}
        sub="multilingual-e5-small · cosine 384维" />
      <RankList title="字面检索 · bm25" icon="#" color="var(--amber)" items={bm25}
        sub="SQLite FTS5 · tokenizer porter" />
      <RankList title="融合 · RRF" icon="◉" color="var(--green)"
        items={fused.slice(0, 3).map((item, i) => ({...item, sim: item.score, rank: i+1, sources: item.sources}))}
        sub="1 / (60 + rank) · 累加排序" highlight />
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
        <div className="mono" style={{fontSize: 10, color: 'var(--blue)', letterSpacing: '0.15em'}}>GLOBAL · 用户级</div>
        <h3 style={{marginTop: 8, fontFamily: 'var(--mono)', fontSize: 18}}>~/.viki/global.db</h3>
        <p style={{color: 'var(--ink-dim)', fontSize: 14, marginTop: 12, lineHeight: 1.6}}>
          跨项目共享。"我个人偏好"、"团队标准"这类长期成立的规则放这。所有项目都触发。
        </p>
        <div style={{marginTop: 24}}>
          {[
            { name: '禁用 moment.js', tier: '强制' },
            { name: 'git push --force 改 PR', tier: '强制' },
            { name: 'PII 不落本地日志', tier: '规范' },
            { name: 'curl 强制 https', tier: '稳定' },
          ].map((r, i) => (
            <div key={i} style={{display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: i === 0 ? '1px solid var(--line)' : '1px dashed var(--line)'}}>
              <span style={{fontSize: 13, color: 'var(--ink)'}}>{r.name}</span>
              <span className="mono" style={{fontSize: 11, color: 'var(--ink-mute)'}}>{r.tier}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{padding: 28, background: 'var(--bg-card)', border: '1px solid var(--green-dim)', borderRadius: 12}}>
        <div className="mono" style={{fontSize: 10, color: 'var(--green)', letterSpacing: '0.15em'}}>PROJECT · 项目级</div>
        <h3 style={{marginTop: 8, fontFamily: 'var(--mono)', fontSize: 18}}>.viki/knowledge.db</h3>
        <p style={{color: 'var(--ink-dim)', fontSize: 14, marginTop: 12, lineHeight: 1.6}}>
          只在当前项目成立。技术栈选择、内部 API 约定、特定的部署陷阱——cd 出去就不触发。
        </p>
        <div style={{marginTop: 24}}>
          {[
            { name: '本项目锁 TS 5.x', tier: '稳定' },
            { name: 'redis 用 ioredis 不要 node-redis', tier: '规范' },
            { name: '部署前必须 pnpm test', tier: '强制' },
            { name: 'imports 走 @/* 别名', tier: '考察' },
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
      desc: '工具入参触发——npm install / git push / Bash 命令等。最严格的通道，可 DENY。',
      ex: 'Bash("rm -rf /") → DENY' },
    { name: 'user-input', hook: 'UserPromptSubmit', color: 'var(--blue)',
      desc: '用户 prompt 语义触发。在 AI 看到 prompt 前注入相关规则到上下文。',
      ex: '"帮我加个时间库" → 注入 moment 规则' },
    { name: 'passive-knowledge', hook: 'SessionStart', color: 'var(--purple)',
      desc: '被动知识。会话开始时一次性注入为 Skills，不参与运行时检索。',
      ex: '"本项目用 pnpm，不要用 npm"' },
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
