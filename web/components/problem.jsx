function Problem() {
  return (
    <section>
      <div className="container">
        <div className="sec-label"><span>01 · 问题</span></div>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 80, alignItems: 'start'}} className="prob-grid">
          <div>
            <h2>每次会话<br/>都是空白的。</h2>
            <p className="sub" style={{marginTop: 24}}>
              传统"AI 助手 + 文档"模式有一个结构性问题：你昨天纠正过的，今天它还会再犯。
              手写的 <span className="mono" style={{color:'var(--ink)'}}>CLAUDE.md</span> 越积越长，
              AI 实际上只读最前面几行。
            </p>
          </div>

          <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
            {[
              {n: '昨天', a: '你说"别再用 moment 了"', b: '今天它照样推荐 moment'},
              {n: '上周', a: '你花两小时排查部署陷阱', b: '新项目从零再来一遍'},
              {n: '一直', a: 'CLAUDE.md 越写越长', b: 'AI 只读最前面几行就停了'},
            ].map((row, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '80px 1fr 24px 1fr',
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
            VIKI 的承诺
          </div>
          <p style={{fontSize: 24, margin: 0, lineHeight: 1.4, textWrap: 'balance'}}>
            把"纠正"这件事变成<span className="accent">可持续的资产</span>——
            每次纠正都生成一条带置信度的规则，在合适的时机（工具调用前）<span className="accent">自动出现</span>。
            错的规则被 AI 绕过去时<span className="accent">自动降级</span>。
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
