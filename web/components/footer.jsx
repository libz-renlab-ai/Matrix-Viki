function SiteFooter() {
  return (
    <>
      <section style={{padding: '120px 0'}}>
        <div className="container" style={{textAlign: 'center'}}>
          <span className="eyebrow">v0.12.0 · source install</span>
          <h2 style={{fontSize: 'clamp(40px, 5vw, 72px)', margin: '32px auto 24px', maxWidth: 900}}>
            让 AI 不再重复<br/>踩同一个坑。
          </h2>
          <p className="sub" style={{margin: '0 auto', maxWidth: 600}}>
            你不需要改变工作习惯。规则库自己在背后从你的会话里长出来。
          </p>
          <div style={{display: 'flex', gap: 12, justifyContent: 'center', marginTop: 40, flexWrap: 'wrap'}}>
            <a className="btn" href="https://github.com/libz-renlab-ai/Matrix-Viki" target="_blank" rel="noreferrer">
              ↗ github.com/libz-renlab-ai/Matrix-Viki
            </a>
            <a className="btn btn-ghost" href="https://github.com/libz-renlab-ai/Matrix-Viki/blob/main/docs/ARCHITECTURE.md" target="_blank" rel="noreferrer">
              架构详解 ARCHITECTURE.md
            </a>
          </div>

          {/* Quick command tour */}
          <div style={{marginTop: 80, textAlign: 'left'}}>
            <div className="mono" style={{fontSize: 11, color: 'var(--ink-mute)', letterSpacing: '0.2em', textAlign: 'center', marginBottom: 24}}>
              · 你手动想用的几个命令 ·
            </div>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12}} className="cmd-grid">
              {[
                { cmd: 'viki try', desc: '30 秒一键演示 5 个经典拦截场景' },
                { cmd: 'viki pitfall', desc: '交互式记一条踩坑经验' },
                { cmd: 'viki stats', desc: '看规则库内容 · 按 C/E/S/K 分类' },
                { cmd: 'viki review 10', desc: '列出最近 10 条规则供人工复核' },
                { cmd: 'viki daily', desc: '跨项目扫今天的活动 · 生成日报' },
                { cmd: 'viki doctor', desc: '14 项环境自检 · 每项给修复命令' },
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
            <span style={{color: 'var(--ink-mute)', opacity: 0.7}}>· MIT License · 个人 AI 规则助理（拆分）</span>
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
