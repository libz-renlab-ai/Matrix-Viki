function PitchCTA() {
  const t1 = useRef(null);
  useEffect(() => {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting && t1.current && window.scrambleText) {
        window.scrambleText(t1.current, "Don't trust us. Run it.", { duration: 1200 });
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
          <span ref={t1}>Don't trust us. Run it.</span>
        </h2>
        <p className="sub" data-reveal style={{margin: '36px auto 0', textAlign: 'center', maxWidth: 700}}>
          Every line of stdout above lands in your terminal. Every commit lives on GitHub.
          Hit a snag inside a week — file an issue in bugs.md.
        </p>

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
          <div style={{color: 'var(--green)', marginBottom: 8}}>· what this deck deliberately omits ·</div>
          No TAM/SAM chart. No "projected hours saved." No user-growth curve (project just split out, 1 star).
          No founder bio — irrelevant to the actual product.
          Market analysis and financial models will follow once there's real usage data to anchor them.
          For now: <span style={{color: 'var(--green)'}}>deck = repo</span>.
        </div>
      </div>
    </section>
  );
}

window.PitchCTA = PitchCTA;
