function PitchProblem() {
  return (
    <section id="install">
      <div className="container">
        <div className="label-sm" data-reveal>01 · install walkthrough</div>
        <h2 data-reveal style={{marginTop: 12}}>
          Five steps.<br/><span className="accent">Every line of stdout is in the README.</span>
        </h2>
        <p className="sub" data-reveal style={{marginTop: 24}}>
          The steps and expected output below are copied <strong>verbatim from README §5.2 / §5.3</strong>.
          Run them yourself — if the output doesn't match, that's a bug, file it.
        </p>

        <InstallSteps />

        <div data-reveal style={{
          marginTop: 56, padding: 24,
          background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12,
        }}>
          <div className="label-sm" style={{marginBottom: 16}}>· prerequisites (verbatim from README §5.1)</div>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12}} className="prereq-grid">
            {[
              { k: 'Node', v: '≥ 22.5.0' },
              { k: 'pnpm', v: '9.x' },
              { k: 'git', v: 'any modern' },
              { k: 'Claude Code', v: 'installed' },
              { k: 'Disk', v: '500 MB' },
            ].map(r => (
              <div key={r.k} style={{padding: '12px 14px', background: '#060807', border: '1px solid var(--line)', borderRadius: 6}}>
                <div className="mono" style={{fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '0.1em'}}>{r.k}</div>
                <div className="mono" style={{fontSize: 13, color: 'var(--green)', marginTop: 4}}>{r.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width: 900px) {
          .prereq-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </section>
  );
}

function InstallSteps() {
  const steps = [
    {
      n: 1, cmd: 'git clone https://github.com/libz-renlab-ai/Matrix-Viki',
      sub: 'grab source',
      out: [
        { t: "Cloning into 'Matrix-Viki'...", c: 'd' },
        { t: 'remote: Enumerating objects: 1247, done.', c: 'd' },
        { t: 'Receiving objects: 100% (1247/1247), 2.8 MiB', c: 'd' },
        { t: 'Resolving deltas: 100% (612/612), done.', c: 'd' },
      ],
    },
    {
      n: 2, cmd: 'cd Matrix-Viki && pnpm install && pnpm build',
      sub: 'install deps + build 9 hook bundles',
      out: [
        { t: 'Lockfile is up to date, resolution step is skipped', c: 'd' },
        { t: 'Packages: +812', c: 'd' },
        { t: '++++ done in 47.3s', c: 'd' },
        { t: '', c: 'd' },
        { t: '> matrix-viki@0.12.0 build /Users/u/Matrix-Viki', c: 'd' },
        { t: '> pnpm -r build && node scripts/bundle-hooks.mjs', c: 'd' },
        { t: '', c: 'd' },
        { t: '  ✓ @viki/types  ✓ @viki/ports  ✓ @viki/core', c: 'g' },
        { t: '  ✓ @viki/adapters  ✓ @viki/cli', c: 'g' },
        { t: '  ✓ bundled 9 hook CJS → packages/cli/dist/hooks/', c: 'g' },
      ],
    },
    {
      n: 3, cmd: 'pnpm viki install --yes',
      sub: 'register hooks + install daemon runtime deps',
      out: [
        { t: '▶ [1/3] Installing hooks... ✓ registered at .claude/settings.local.json', c: 'g' },
        { t: '▶ [2/3] Installing plugins... ✓', c: 'g' },
        { t: '▶ [3/3] Installing user hook... ✓ registered at ~/.claude/settings.json', c: 'g' },
        { t: '▶ Ensuring daemon runtime deps in ~/.viki/node_modules/ ...', c: 'd' },
        { t: '  ✓ npm install completed (~30 MB)', c: 'g' },
        { t: '▶ Spawning vector-model warmup in background (pid 84211)', c: 'd' },
        { t: '✓ Install complete.', c: 'g-bold' },
        { t: 'Auto health check: {"status":"ok","hooks":true,"kb":true,"model":"warmup-pending"}', c: 'd' },
      ],
    },
    {
      n: 4, cmd: 'pnpm viki init',
      sub: 'inject 8 meta-principles, vectorize them',
      out: [
        { t: '✅ Seed rules: injected 8 meta-principles', c: 'g' },
        { t: '✅ Vector embedding: 8 rules × (trigger + pattern); semantic match ready', c: 'g' },
        { t: '✅ Hook registration: installed', c: 'g' },
        { t: '✅ Skills: exported X candidate rules to Skills', c: 'g' },
        { t: '✅ Viki ready', c: 'g-bold' },
      ],
    },
    {
      n: 5, cmd: 'pnpm viki doctor',
      sub: '14 environment checks',
      out: [
        { t: '✅ hooks-registered          .claude/settings.local.json', c: 'g' },
        { t: '✅ user-hook-registered      ~/.claude/settings.json', c: 'g' },
        { t: '✅ daemon-bundle-staged      ~/.viki/hooks/bin-embedder.cjs', c: 'g' },
        { t: '✅ node-modules-staged       ~/.viki/node_modules/onnxruntime-node', c: 'g' },
        { t: '✅ vec-coverage              8 active rules × (trigger + pattern)', c: 'g' },
        { t: '✅ kb-schema                 v7 (latest)', c: 'g' },
        { t: '✅ embedder-daemon           healthy (status=running, pid=84211)', c: 'g' },
        { t: '⏭  mcp-reachability          (no MCP configured, skip)', c: 'd' },
        { t: '... 6 more checks            all passing', c: 'd' },
        { t: '', c: 'd' },
        { t: '✓ 14/14 environment checks passing', c: 'g-bold' },
      ],
    },
  ];

  const [active, setActive] = useState(0);
  const cur = steps[active];

  return (
    <div data-reveal style={{
      marginTop: 56,
      display: 'grid', gridTemplateColumns: '260px 1fr', gap: 0,
      background: 'var(--bg-card)', border: '1px solid var(--line)',
      borderRadius: 14, overflow: 'hidden',
    }} className="install-grid">
      <div style={{borderRight: '1px solid var(--line)', background: '#090c0b', padding: 12}}>
        {steps.map((s, i) => (
          <div key={s.n}
            onClick={() => setActive(i)}
            style={{
              padding: '14px 14px', borderRadius: 8,
              cursor: 'pointer', transition: 'background 0.15s',
              background: i === active ? 'rgba(74,222,128,0.08)' : 'transparent',
              border: '1px solid', borderColor: i === active ? 'var(--green-dim)' : 'transparent',
              marginBottom: 4,
            }}>
            <div style={{display: 'flex', alignItems: 'baseline', gap: 8}}>
              <span className="mono" style={{
                fontSize: 11, color: i === active ? 'var(--green)' : 'var(--ink-mute)',
              }}>0{s.n}</span>
              <span className="mono" style={{
                fontSize: 12, color: i === active ? 'var(--green)' : 'var(--ink)',
              }}>{s.cmd.split(' ').slice(-1)[0].length > 12 ? s.cmd.split(' ')[1] || s.cmd.slice(0, 16) : s.cmd.split(' ').slice(-1)[0]}</span>
            </div>
            <div style={{fontSize: 11, color: 'var(--ink-mute)', marginTop: 4, paddingLeft: 22}}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{background: '#060807', padding: '20px 24px', minHeight: 360}}>
        <div style={{display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16, paddingBottom: 12, borderBottom: '1px dashed var(--line)'}}>
          <span style={{color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 14}}>$</span>
          <span style={{color: 'var(--ink)', fontFamily: 'var(--mono)', fontSize: 14, flex: 1}}>{cur.cmd}</span>
          <span className="mono" style={{fontSize: 10, color: 'var(--ink-mute)'}}>step {cur.n}/5</span>
        </div>
        <pre style={{margin: 0, padding: 0, fontFamily: 'var(--mono)', fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap'}}>
          {cur.out.map((line, i) => (
            <div key={i} style={{
              color: line.c === 'g' ? 'var(--green)'
                   : line.c === 'g-bold' ? 'var(--green)'
                   : line.c === 'd' ? 'var(--ink-mute)'
                   : 'var(--ink)',
              fontWeight: line.c === 'g-bold' ? 600 : 400,
            }}>{line.t || '\u00a0'}</div>
          ))}
        </pre>
      </div>
      <style>{`
        @media (max-width: 900px) {
          .install-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

window.PitchProblem = PitchProblem;
