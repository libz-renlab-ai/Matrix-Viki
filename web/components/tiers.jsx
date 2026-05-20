function Tiers() {
  const tiers = [
    {
      id: 'try', name: '试用', en: 'TRYING', conf: '0.50 – 0.60',
      color: 'var(--ink-mute)',
      channel: '不投放',
      desc: '新规则刚入库。可能是错的，不能让它直接拦坑。只在影子模式下观察。',
      action: '观察',
      effect: '不显形',
    },
    {
      id: 'review', name: '考察', en: 'REVIEW', conf: '0.60 – 0.70',
      color: 'var(--blue)',
      channel: '只查询',
      desc: '小规模生效。当 AI 触发匹配时，规则会被静默检索但不阻断——给用户一个隐性提示。',
      action: '检索',
      effect: '上下文出现',
    },
    {
      id: 'stable', name: '稳定', en: 'STABLE', conf: '0.70 – 0.80',
      color: 'var(--purple)',
      channel: '进 Skills',
      desc: '通过反复使用证明有用。编译为 Claude Skills，SessionStart 时注入新会话。',
      action: '注入 skills',
      effect: 'AI 主动避免',
    },
    {
      id: 'norm', name: '规范', en: 'NORM', conf: '0.80 – 0.90',
      color: 'var(--green)',
      channel: 'warn',
      desc: '已经是项目/个人的准则。AI 试图违反时，PreToolUse 给出黄色警告，但仍可执行。',
      action: 'WARN',
      effect: '黄色警告',
    },
    {
      id: 'enforce', name: '强制', en: 'ENFORCE', conf: '0.90 – 1.00',
      color: 'var(--red)',
      channel: 'block',
      desc: '不可违反。PreToolUse 命中即 DENY 阻断工具调用。仅极少数核心规则进得来。',
      action: 'DENY',
      effect: '阻断执行',
    },
    {
      id: 'dormant', name: '休眠', en: 'DORMANT', conf: '归档',
      color: 'var(--amber)',
      channel: '归档',
      desc: '长期没人用 / 被反复绕开。降级到休眠区，不再进任何投放通道，但保留可复活。',
      action: '归档',
      effect: '从投放退出',
    },
  ];

  const [active, setActive] = useState(3);
  const cur = tiers[active];

  return (
    <section id="tiers">
      <div className="container">
        <div className="sec-label"><span>05 · 成熟度</span></div>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'start'}} className="tiers-grid">
          <div>
            <h2>规则不是<br/>一锤定音的。</h2>
            <p className="sub" style={{marginTop: 20}}>
              每条规则都有 confidence 和 tier。低风险通道试错，反复证明有用才升级到真拦截。
              单次反例不会让规则跳变——升降都带迟滞。
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
                  <div className="mono" style={{fontSize: 9, color: 'var(--ink-mute)', letterSpacing: '0.1em'}}>通道</div>
                  <div className="mono" style={{fontSize: 13, marginTop: 4, color: cur.color}}>{cur.channel}</div>
                </div>
                <div>
                  <div className="mono" style={{fontSize: 9, color: 'var(--ink-mute)', letterSpacing: '0.1em'}}>动作</div>
                  <div className="mono" style={{fontSize: 13, marginTop: 4, color: cur.color}}>{cur.action}</div>
                </div>
                <div>
                  <div className="mono" style={{fontSize: 9, color: 'var(--ink-mute)', letterSpacing: '0.1em'}}>用户感知</div>
                  <div className="mono" style={{fontSize: 13, marginTop: 4, color: 'var(--ink)'}}>{cur.effect}</div>
                </div>
              </div>
            </div>
          </div>

          <div>
            {/* Tier ladder */}
            <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
              {tiers.map((tier, i) => (
                <div key={tier.id}
                  onClick={() => setActive(i)}
                  style={{
                    cursor: 'pointer',
                    display: 'grid',
                    gridTemplateColumns: '32px 80px 1fr 110px',
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
                  {/* Confidence bar */}
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

            {/* Migration arrows hint */}
            <div className="mono" style={{
              marginTop: 20, padding: 16, background: 'var(--bg-card)',
              border: '1px dashed var(--line)', borderRadius: 8,
              fontSize: 12, color: 'var(--ink-dim)', lineHeight: 1.7,
            }}>
              <div><span style={{color: 'var(--green)'}}>↑</span> 升档：用户接受 → confidence + 0.12</div>
              <div><span style={{color: 'var(--red)'}}>↓</span> 降档：用户绕过 → confidence − 0.08</div>
              <div><span style={{color: 'var(--amber)'}}>⤓</span> 归档：30 天未触发 → 进 dormant</div>
              <div style={{marginTop: 6, color: 'var(--ink-mute)', fontStyle: 'italic'}}>
                单次事件 ≤ 0.15 步长，避免抖动。
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
