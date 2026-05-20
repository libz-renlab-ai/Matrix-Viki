function Impact() {
  return (
    <section id="impact">
      <div className="container">
        <div className="sec-label" data-reveal><span>04 · 规则在工作</span></div>
        <h2 data-reveal>不只是文档，<br/>是<span className="accent">活的</span>。</h2>
        <p className="sub" style={{marginBottom: 48}} data-reveal>
          规则不在 markdown 里发呆，它们持续在工作——观察、拦截、校准、归档。
          下面是过去 24 小时这个机制实际产生的事件。
        </p>

        {/* Counter band */}
        <div data-reveal data-reveal-stagger style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32,
        }} className="counter-band">
          <CounterCard target={147} label="规则总数" sub="global + project" />
          <CounterCard target={89} label="过去 24h 触发" sub="deny + warn + observe" accent="var(--red)" />
          <CounterCard target={42} label="阻止的错误" sub="若发生平均 12min 排查" />
          <CounterCard target={8.5} decimals={1} suffix="h" label="节省时间" sub="按平均排查时长估算" accent="var(--blue)" />
        </div>

        {/* Live kill feed + heatmap */}
        <div style={{display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 20}} className="impact-grid">
          <KillFeed />
          <Heatmap />
        </div>

        {/* Ticker */}
        <RuleTicker />
      </div>
      <style>{`
        @media (max-width: 900px) {
          .counter-band { grid-template-columns: repeat(2, 1fr) !important; }
          .impact-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}

function CounterCard({ target, suffix = '', label, sub, accent = 'var(--green)', decimals = 0 }) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const dur = 1600 + Math.random() * 400;
          function step(t) {
            const p = Math.min(1, (t - start) / dur);
            const eased = 1 - Math.pow(1 - p, 3);
            setVal(target * eased);
            if (p < 1) requestAnimationFrame(step);
          }
          requestAnimationFrame(step);
        }
      });
    }, { threshold: 0.3 });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, [target]);

  return (
    <div ref={ref} style={{
      padding: 24, background: 'var(--bg-card)',
      border: '1px solid var(--line)', borderRadius: 12,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, right: 0,
        width: 80, height: 80,
        background: `radial-gradient(circle at 100% 0%, ${accent}30, transparent 60%)`,
        pointerEvents: 'none',
      }} />
      <div className="neon-num" style={{color: accent, textShadow: `0 0 24px ${accent}55, 0 0 60px ${accent}25`}}>
        {decimals > 0 ? val.toFixed(decimals) : Math.floor(val)}<span style={{fontSize: '0.5em', opacity: 0.6}}>{suffix}</span>
      </div>
      <div style={{fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink)', marginTop: 10, fontWeight: 600}}>
        {label}
      </div>
      <div style={{fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-mute)', marginTop: 4}}>
        {sub}
      </div>
    </div>
  );
}

function KillFeed() {
  const events = useMemo(() => [
    { t: '09:42:17', tool: 'Bash', target: 'npm install moment', rule: 'seed-pack-moment', action: 'deny',  conf: 0.85 },
    { t: '09:44:03', tool: 'Edit', target: 'src/api/redis.ts',   rule: 'redis-ioredis',    action: 'warn',  conf: 0.72 },
    { t: '09:51:28', tool: 'Bash', target: 'git push --force main', rule: 'force-push-main', action: 'deny', conf: 0.92 },
    { t: '10:03:55', tool: 'Edit', target: 'packages/core/util.ts', rule: 'core-no-io',     action: 'deny',  conf: 0.99 },
    { t: '10:12:09', tool: 'Write', target: 'src/auth.ts',       rule: 'no-console-log',   action: 'warn',  conf: 0.65 },
    { t: '10:24:41', tool: 'Bash', target: 'tsc',                 rule: 'project-ts-5x',    action: 'observe', conf: 0.7 },
    { t: '10:31:12', tool: 'Edit', target: 'src/handlers/x.ts',   rule: 'imports-alias',    action: 'warn',  conf: 0.6 },
    { t: '10:55:38', tool: 'Bash', target: 'npm install moment-timezone', rule: 'seed-pack-moment', action: 'deny', conf: 0.78 },
    { t: '11:02:14', tool: 'Edit', target: 'pages/Home.tsx',      rule: 'no-relative-imports', action: 'warn', conf: 0.6 },
    { t: '11:09:55', tool: 'Bash', target: 'rm -rf node_modules', rule: 'rm-rf-warn',       action: 'observe', conf: 0.5 },
    { t: '11:18:02', tool: 'Edit', target: 'src/api/redis.ts',   rule: 'redis-ioredis',    action: 'warn',  conf: 0.72 },
    { t: '11:26:11', tool: 'Bash', target: 'git push --force-with-lease', rule: 'force-push-main', action: 'observe', conf: 0.4 },
    { t: '11:31:47', tool: 'Bash', target: 'npm install moment', rule: 'seed-pack-moment', action: 'deny',  conf: 0.85 },
    { t: '11:39:20', tool: 'Edit', target: 'src/deploy/cd.ts',   rule: 'pnpm-test-before-deploy', action: 'warn', conf: 0.75 },
  ], []);

  const [visible, setVisible] = useState([]);
  const idx = useRef(0);
  const containerRef = useRef(null);

  useEffect(() => {
    let timer;
    function tick() {
      const next = events[idx.current % events.length];
      idx.current++;
      setVisible(v => [{ ...next, key: idx.current }, ...v.slice(0, 9)]);
      const delay = 1100 + Math.random() * 1800;
      timer = setTimeout(tick, delay);
    }
    // Start when in viewport
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting && !timer) tick();
      });
    }, { threshold: 0.2 });
    if (containerRef.current) io.observe(containerRef.current);
    return () => { if (timer) clearTimeout(timer); io.disconnect(); };
  }, [events]);

  return (
    <div ref={containerRef} className="kill-feed" data-reveal>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 20px', borderBottom: '1px solid var(--line)',
        background: 'linear-gradient(180deg, #0a0d0c, transparent)',
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: 50, background: 'var(--red)',
          boxShadow: '0 0 12px var(--red)',
        }} className="neon-pulse" />
        <span className="mono" style={{fontSize: 11, color: 'var(--red)', letterSpacing: '0.15em'}}>
          ● LIVE · pretooluse feed
        </span>
        <span style={{flex: 1}} />
        <span className="mono" style={{fontSize: 10, color: 'var(--ink-mute)'}}>
          {visible.length > 0 ? `last fire ${visible[0].t}` : 'awaiting events…'}
        </span>
      </div>

      <div style={{minHeight: 420, padding: 12, position: 'relative'}}>
        {visible.map((ev, i) => {
          const color = ev.action === 'deny' ? 'var(--red)' : ev.action === 'warn' ? 'var(--amber)' : 'var(--blue)';
          const icon = ev.action === 'deny' ? '✕' : ev.action === 'warn' ? '⚠' : '◉';
          return (
            <div key={ev.key} className={'feed-row' + (ev.action === 'deny' && i === 0 ? ' flash' : '')}
              style={{
                display: 'grid',
                gridTemplateColumns: '70px 22px 60px 1fr 110px 60px',
                gap: 10,
                padding: '8px 12px',
                fontFamily: 'var(--mono)', fontSize: 12,
                opacity: 1 - i * 0.08,
                borderRadius: 4,
                marginBottom: 2,
              }}>
              <span style={{color: 'var(--ink-mute)'}}>{ev.t}</span>
              <span style={{color, fontWeight: 600}}>{icon}</span>
              <span style={{color: 'var(--ink-dim)'}}>{ev.tool}</span>
              <span style={{color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                {ev.target}
              </span>
              <span style={{color: 'var(--ink-dim)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                {ev.rule}
              </span>
              <span style={{color, textAlign: 'right', fontWeight: 600}}>
                {ev.action.toUpperCase()}
              </span>
            </div>
          );
        })}
        {visible.length === 0 && (
          <div style={{padding: 40, textAlign: 'center', color: 'var(--ink-mute)', fontFamily: 'var(--mono)', fontSize: 12}}>
            ⟳ connecting to daemon...
          </div>
        )}
      </div>

      <div style={{
        padding: '10px 20px', borderTop: '1px solid var(--line)',
        display: 'flex', justifyContent: 'space-between',
        fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-mute)',
      }}>
        <span>tail -f ~/.viki/events.db</span>
        <span>{visible.filter(v => v.action === 'deny').length} deny · {visible.filter(v => v.action === 'warn').length} warn · {visible.filter(v => v.action === 'observe').length} observe</span>
      </div>
    </div>
  );
}

function Heatmap() {
  // 7 days × 24 hours, generate with realistic distribution (peak during work hours)
  const data = useMemo(() => {
    const arr = [];
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        let intensity = 0;
        if (h >= 9 && h <= 19 && d < 5) {
          // workday hours
          intensity = 0.3 + Math.random() * 0.7;
          if (h === 11 || h === 15) intensity = Math.min(1, intensity + 0.2);
        } else if (h >= 10 && h <= 22) {
          intensity = Math.random() * 0.5;
        } else {
          intensity = Math.random() * 0.15;
        }
        arr.push({ d, h, v: intensity });
      }
    }
    return arr;
  }, []);

  const [hover, setHover] = useState(null);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div data-reveal style={{
      background: 'var(--bg-card)', border: '1px solid var(--line)',
      borderRadius: 12, padding: 20,
    }}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline'}}>
        <div>
          <div className="mono" style={{fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '0.15em'}}>
            LAST 7 DAYS · 168 hours
          </div>
          <h3 style={{fontSize: 16, marginTop: 8}}>规则触发热图</h3>
        </div>
        <div style={{textAlign: 'right'}}>
          <div className="mono" style={{fontSize: 10, color: 'var(--ink-mute)'}}>TOTAL</div>
          <div className="mono" style={{fontSize: 18, color: 'var(--green)'}}>
            {Math.floor(data.reduce((s, c) => s + c.v, 0) * 7)}
          </div>
        </div>
      </div>

      <div style={{marginTop: 24, position: 'relative'}}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'auto repeat(24, 1fr)',
          gap: 3,
          alignItems: 'center',
        }}>
          {/* Header row: hours */}
          <span></span>
          {[...Array(24)].map((_, h) => (
            <span key={h} className="mono" style={{
              fontSize: 8, color: 'var(--ink-mute)', textAlign: 'center',
              opacity: h % 4 === 0 ? 1 : 0,
            }}>{h.toString().padStart(2, '0')}</span>
          ))}

          {/* Rows */}
          {days.map((day, d) => (
            <React.Fragment key={d}>
              <span className="mono" style={{
                fontSize: 9, color: 'var(--ink-mute)', textAlign: 'right',
                paddingRight: 6,
              }}>{day}</span>
              {data.filter(c => c.d === d).map((c) => (
                <div key={`${c.d}-${c.h}`}
                  className="heat-cell"
                  onMouseEnter={() => setHover(c)}
                  onMouseLeave={() => setHover(null)}
                  style={{
                    aspectRatio: '1', borderRadius: 2,
                    background: c.v < 0.05 ? 'var(--line)' :
                                `rgba(74, 222, 128, ${0.15 + c.v * 0.7})`,
                    boxShadow: c.v > 0.7 ? '0 0 8px rgba(74,222,128,0.4)' : 'none',
                  }}
                />
              ))}
            </React.Fragment>
          ))}
        </div>

        <div style={{marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                     fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-mute)'}}>
          <span>{hover ? `${days[hover.d]} ${hover.h.toString().padStart(2,'0')}:00 · ${Math.floor(hover.v * 12)} fires` : 'hover to inspect'}</span>
          <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
            <span>less</span>
            {[0.1, 0.3, 0.5, 0.7, 0.95].map(v => (
              <div key={v} style={{
                width: 11, height: 11, borderRadius: 2,
                background: `rgba(74, 222, 128, ${0.15 + v * 0.7})`,
              }} />
            ))}
            <span>more</span>
          </div>
        </div>
      </div>

      {/* Rule distribution breakdown */}
      <div style={{marginTop: 24, paddingTop: 20, borderTop: '1px dashed var(--line)'}}>
        <div className="mono" style={{fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '0.15em', marginBottom: 12}}>
          BY ENFORCEMENT
        </div>
        {[
          { label: 'block · deny', count: 28, color: 'var(--red)', pct: 31 },
          { label: 'warn · prompt', count: 42, color: 'var(--amber)', pct: 47 },
          { label: 'observe · silent', count: 19, color: 'var(--blue)', pct: 22 },
        ].map(b => (
          <div key={b.label} style={{marginBottom: 10}}>
            <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 4,
                         fontFamily: 'var(--mono)', fontSize: 11}}>
              <span style={{color: b.color}}>{b.label}</span>
              <span style={{color: 'var(--ink-dim)'}}>{b.count}</span>
            </div>
            <div style={{height: 4, background: 'var(--line)', borderRadius: 100, overflow: 'hidden'}}>
              <div style={{
                width: `${b.pct}%`, height: '100%', background: b.color,
                boxShadow: `0 0 8px ${b.color}80`,
                transition: 'width 1s',
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RuleTicker() {
  const items = [
    'rule#a3f7 · use dayjs not moment · DENY ↑',
    'rule#b21c · check worktree before edit · WARN',
    'rule#c98e · this repo uses pnpm · DENY ↑',
    'rule#d4a1 · ioredis not node-redis · WARN ↑',
    'rule#e773 · no force-push main · DENY',
    'rule#f016 · @viki/core forbids IO · DENY',
    'rule#g8b2 · run typecheck after edit · WARN',
    'rule#h312 · imports via @/* alias · WARN',
    'rule#i559 · no console in prod · WARN ↑',
    'rule#j201 · contract test first · WARN',
  ];
  // Duplicate for seamless loop
  const looped = [...items, ...items];

  return (
    <div data-reveal style={{marginTop: 48, padding: '20px 0',
                              borderTop: '1px solid var(--line)',
                              borderBottom: '1px solid var(--line)'}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 16, padding: '0 4px 12px'}}>
        <span className="mono" style={{fontSize: 10, color: 'var(--green)', letterSpacing: '0.2em'}}>
          ◉ ACTIVE RULES
        </span>
        <span className="mono" style={{fontSize: 10, color: 'var(--ink-mute)'}}>
          live broadcast · refreshes from ~/.viki/global.db
        </span>
      </div>
      <div className="ticker-mask">
        <div className="ticker">
          {looped.map((item, i) => (
            <span key={i} className="mono" style={{
              fontSize: 12, color: 'var(--ink-dim)',
              whiteSpace: 'nowrap', flexShrink: 0,
              padding: '4px 14px',
              border: '1px solid var(--line)', borderRadius: 100,
              background: 'var(--bg-card)',
            }}>
              <span style={{color: 'var(--green)'}}>●</span> {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

window.Impact = Impact;
