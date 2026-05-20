function PitchCTA() {
  const t1 = useRef(null);
  useEffect(() => {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting && t1.current && window.scrambleText) {
        window.scrambleText(t1.current, '不用相信我们。自己跑一遍。', { duration: 1200 });
        io.disconnect();
      }
    }), { threshold: 0.3 });
    if (t1.current) io.observe(t1.current);
    return () => io.disconnect();
  }, []);

  return (
    <section style={{paddingTop: 120, paddingBottom: 120, position: 'relative', overflow: 'hidden'}}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 80% 50% at 50% 100%, rgba(74,222,128,0.08), transparent 60%)',
        pointerEvents: 'none',
      }} />

      <div className="container" style={{textAlign: 'center', position: 'relative'}}>
        <div className="label-sm" data-reveal>· try it ·</div>
        <h2 data-reveal style={{marginTop: 24, fontSize: 'clamp(48px, 7vw, 96px)', maxWidth: 1000, margin: '24px auto 0'}}>
          <span ref={t1}>不用相信我们。<br/>自己跑一遍。</span>
        </h2>
        <p className="sub" data-reveal style={{margin: '36px auto 0', textAlign: 'center', maxWidth: 700}}>
          全部 stdout 在你 terminal 里。所有 commit 在 GitHub 上。一周内有问题——bugs.md 提个 issue。
        </p>

        {/* Real install snippet */}
        <div data-reveal style={{
          marginTop: 56, maxWidth: 760, margin: '56px auto 0',
          background: '#060807', border: '1px solid var(--line)', borderRadius: 12,
          padding: 0, textAlign: 'left',
          fontFamily: 'var(--mono)', fontSize: 13,
        }}>
          <div style={{
            padding: '10px 16px', borderBottom: '1px solid var(--line)',
            fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '0.1em',
            display: 'flex', justifyContent: 'space-between',
          }}>
            <span>$ verbatim from README §5.2</span>
            <span>copy → paste → 5 minutes</span>
          </div>
          <div style={{padding: '20px 24px'}}>
            <div style={{color: 'var(--green)', marginBottom: 4}}>
              <span style={{color: 'var(--ink-mute)'}}>$</span> git clone https://github.com/libz-renlab-ai/Matrix-Viki
            </div>
            <div style={{color: 'var(--green)', marginBottom: 4}}>
              <span style={{color: 'var(--ink-mute)'}}>$</span> cd Matrix-Viki && pnpm install && pnpm build
            </div>
            <div style={{color: 'var(--green)', marginBottom: 4}}>
              <span style={{color: 'var(--ink-mute)'}}>$</span> pnpm viki install --yes
            </div>
            <div style={{color: 'var(--green)', marginBottom: 4}}>
              <span style={{color: 'var(--ink-mute)'}}>$</span> pnpm viki init
            </div>
            <div style={{color: 'var(--green)'}}>
              <span style={{color: 'var(--ink-mute)'}}>$</span> pnpm viki doctor   <span style={{color: 'var(--ink-mute)'}}>{`# expect 14/14 ✅`}</span>
            </div>
          </div>
        </div>

        <div style={{display: 'flex', gap: 12, justifyContent: 'center', marginTop: 48, flexWrap: 'wrap'}}>
          <a className="btn" href="https://github.com/libz-renlab-ai/Matrix-Viki" target="_blank" rel="noreferrer">
            ↗ Clone the repo
          </a>
          <a className="btn btn-ghost" href="https://github.com/libz-renlab-ai/Matrix-Viki/blob/main/INSTALL.md" target="_blank" rel="noreferrer">
            INSTALL.md →
          </a>
          <a className="btn btn-ghost" href="https://github.com/libz-renlab-ai/Matrix-Viki/issues" target="_blank" rel="noreferrer">
            See open issues ({5})
          </a>
        </div>

        <div data-reveal style={{
          marginTop: 80, padding: 20, maxWidth: 800, margin: '80px auto 0',
          background: 'var(--bg-card)', border: '1px dashed var(--line)', borderRadius: 10,
          fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-mute)',
          lineHeight: 1.8,
        }}>
          <div style={{color: 'var(--green)', marginBottom: 8}}>· what this pitch deliberately omits ·</div>
          没有 TAM/SAM 估算图。没有"projected hours saved"。没有用户增长曲线（项目刚拆分出来，1 个 star）。
          没有创始团队简历——和项目实际功能无关。
          想看市场分析或财务模型，等到有真实使用数据后再补。现在 deck = repo。
        </div>
      </div>
    </section>
  );
}

window.PitchCTA = PitchCTA;
