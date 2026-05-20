function Arch() {
  const layers = [
    { id: 'cli', name: '@viki/cli', sub: 'CLI + 9 hook bundles', role: 'entry', files: ['bin.ts', 'bin-pre-tool-use.cjs', 'bin-stop.cjs', 'bin-embedder.cjs'] },
    { id: 'adapters', name: '@viki/adapters', sub: '命令式外壳 · imperative shell', role: 'io', files: ['storage', 'llm', 'hook', 'embedding', 'ingest'] },
    { id: 'core', name: '@viki/core', sub: '纯函数学习引擎 · functional core', role: 'logic', files: ['detector', 'extractor', 'matcher', 'calibrator'], emphasize: true },
    { id: 'ports', name: '@viki/ports', sub: '端口接口 + 契约测试', role: 'contract', files: ['StoragePort', 'LLMPort', 'EmbedderPort'] },
    { id: 'types', name: '@viki/types', sub: '纯类型 · 零依赖', role: 'types', files: ['Rule', 'Event', 'Hook'] },
  ];

  const perfFeatures = [
    { title: 'Embedder Daemon', desc: '一个常驻 daemon owns 唯一 ONNX 模型实例。多窗口并发不再撞 GB 级 RAM。', metric: '7GB → 350MB', color: 'var(--green)' },
    { title: 'Thin-client Hooks', desc: 'hook 进程只做"打包数据 + 写 outbox + 退出"，重活全交 daemon。', metric: '<50ms 退出', color: 'var(--blue)' },
    { title: 'Outbox 队列', desc: 'daemon 不在时 hook 不丢数据。文件队列解耦 + per-task 10 分钟硬超时。', metric: '24h max-age', color: 'var(--purple)' },
    { title: '空闲卸载', desc: '模型 5 分钟不用 drop reference；daemon 30 分钟不用自动退出。', metric: '5min / 30min', color: 'var(--amber)' },
    { title: '冷调度', desc: '全量重扫等重活只在 CPU < 60% 时跑，不抢用户敲代码资源。', metric: 'CPU < 60%', color: 'var(--blue)' },
    { title: '离线模式自检', desc: '模型缓存存在时跳过 HuggingFace HEAD 请求，国内网络不卡。', metric: 'auto detect', color: 'var(--green)' },
  ];

  return (
    <section id="arch">
      <div className="container">
        <div className="sec-label"><span>08 · 架构</span></div>
        <h2>Functional Core ·<br/>Imperative Shell.</h2>
        <p className="sub" style={{marginBottom: 48}}>
          依赖方向单向，反向禁止。核心学习逻辑是纯函数，可脱机重放、可单测、可替换 LLM 后端而不动核心。
          所有副作用都在 adapter 层——换操作系统只动 adapter。
        </p>

        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40}} className="arch-grid">
          {/* Left: layered architecture */}
          <div>
            <div className="mono" style={{fontSize: 11, color: 'var(--ink-mute)', letterSpacing: '0.15em', marginBottom: 16}}>
              依赖方向 · cli → adapters → core → ports → types
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
                铁律
              </div>
              <div className="mono" style={{fontSize: 12, color: 'var(--ink-dim)', lineHeight: 1.9}}>
                <div>· <span style={{color:'var(--ink)'}}>@viki/core</span> 禁止任何 IO（no node:fs / child_process）</div>
                <div>· 新 Port 接口先写契约测试再写实现</div>
                <div>· 归因事件走 AttributionBus，不用 console.log</div>
              </div>
            </div>
          </div>

          {/* Right: performance features */}
          <div>
            <div className="mono" style={{fontSize: 11, color: 'var(--ink-mute)', letterSpacing: '0.15em', marginBottom: 16}}>
              daemon-first · 运行稳定性
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
                8 个正交动词 · core verbs
              </div>
              <div style={{display: 'flex', gap: 6, flexWrap: 'wrap'}}>
                {['拦截', '匹配', '识别', '提取', '校验', '校准', '编译', '归因'].map(v => (
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

        {/* Install section */}
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
    { cmd: 'git clone https://github.com/libz-renlab-ai/Matrix-Viki', sub: '拿源码' },
    { cmd: 'pnpm install && pnpm build', sub: '构建 9 个 hook bundle + daemon' },
    { cmd: 'pnpm viki install --yes', sub: '注册 hook + 装 onnxruntime-node' },
    { cmd: 'pnpm viki init', sub: '注入 8 条元原则并向量化' },
    { cmd: 'pnpm viki doctor', sub: '14 项环境自检全 ✅' },
  ];
  return (
    <div style={{marginTop: 80}}>
      <div className="sec-label" style={{marginBottom: 20}}><span>· 一次性成功路径 · install</span></div>
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
        装完重启 Claude Code · 之后什么都不用做，Viki 在背后跑完整闭环。
      </p>
    </div>
  );
}

window.Arch = Arch;
