function PitchProof() {
  return (
    <section id="proof">
      <div className="container">
        <div className="label-sm" data-reveal>03 · github state & changelog</div>
        <h2 data-reveal style={{marginTop: 12}}>
          公开仓库，<br/>
          <span className="accent">所有 commit、issue、PR 都能复核。</span>
        </h2>
        <p className="sub" data-reveal style={{marginTop: 24}}>
          这不是一个"PPT 阶段"的项目。98 commits、CHANGELOG.md、bugs.md、roadmap 全部公开。
          你可以挨个点开看。
        </p>

        {/* GitHub status panel */}
        <div data-reveal style={{
          marginTop: 56,
          background: 'var(--bg-card)', border: '1px solid var(--line)',
          borderRadius: 14, overflow: 'hidden',
        }}>
          <div style={{
            padding: '14px 20px', borderBottom: '1px solid var(--line)',
            background: 'linear-gradient(180deg, #0a0d0c, transparent)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span className="mono" style={{fontSize: 11, color: 'var(--ink-mute)'}}>$ gh repo view libz-renlab-ai/Matrix-Viki</span>
            <span style={{flex: 1}} />
            <a className="mono" target="_blank" rel="noreferrer"
               href="https://github.com/libz-renlab-ai/Matrix-Viki"
               style={{fontSize: 11, color: 'var(--green)', textDecoration: 'none'}}>
              ↗ github.com/libz-renlab-ai/Matrix-Viki
            </a>
          </div>

          <div style={{padding: '28px 32px', display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 24}}
               className="gh-stats">
            {[
              { l: 'license', v: 'MIT' },
              { l: 'language', v: 'TypeScript' },
              { l: 'commits', v: '98' },
              { l: 'open issues', v: '5' },
              { l: 'releases', v: '1' },
              { l: 'last commit', v: '2026-05-17' },
            ].map(s => (
              <div key={s.l}>
                <div className="mono" style={{fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '0.1em', textTransform: 'uppercase'}}>{s.l}</div>
                <div className="mono" style={{fontSize: 18, color: 'var(--ink)', marginTop: 6}}>{s.v}</div>
              </div>
            ))}
          </div>

          {/* Real composition bar */}
          <div style={{padding: '0 32px 24px'}}>
            <div className="mono" style={{fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '0.1em', marginBottom: 8}}>
              LANGUAGES (from GitHub linguist)
            </div>
            <div style={{height: 8, borderRadius: 100, overflow: 'hidden', display: 'flex'}}>
              {[
                { c: '#3178c6', w: 71.2, l: 'TS' },
                { c: '#89e051', w: 12.2, l: 'Shell' },
                { c: '#f1e05a', w: 9.1,  l: 'JS' },
                { c: '#3572A5', w: 7.2,  l: 'Go tmpl' },
                { c: '#306998', w: 0.3,  l: 'Python' },
              ].map((b, i) => (
                <div key={i} style={{width: `${b.w}%`, background: b.c}} title={`${b.l} ${b.w}%`} />
              ))}
            </div>
            <div style={{display: 'flex', gap: 16, marginTop: 8, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-dim)'}}>
              <span><span style={{color: '#3178c6'}}>●</span> TypeScript 71.2%</span>
              <span><span style={{color: '#89e051'}}>●</span> Shell 12.2%</span>
              <span><span style={{color: '#f1e05a'}}>●</span> JavaScript 9.1%</span>
              <span><span style={{color: '#3572A5'}}>●</span> Go Template 7.2%</span>
            </div>
          </div>
        </div>

        {/* Changelog + Roadmap, side by side */}
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 28}} className="cr-grid">
          <ChangelogPanel />
          <RoadmapPanel />
        </div>

        {/* Real commits */}
        <RealCommits />
      </div>
      <style>{`
        @media (max-width: 900px) {
          .gh-stats { grid-template-columns: repeat(2, 1fr) !important; }
          .cr-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}

function ChangelogPanel() {
  // Verbatim from README §10 — "2026-05-17 大改一览"
  const entries = [
    { t: 'Daemon-first 架构', d: 'hook 不再加载 650MB 模型；多窗口并发不再撞 GB 级 RAM 爆炸（实测从 7GB → 350-500MB）', tag: 'perf' },
    { t: 'Daemon spawn 防抖', d: '同时开多个 Claude Code 窗口不再启 N 个 daemon；status=failed 后 5 分钟冷却', tag: 'stability' },
    { t: '/shutdown 门控', d: 'SessionEnd 不再误杀正在处理任务的 daemon', tag: 'stability' },
    { t: 'per-task 超时', d: '单条任务 10 分钟硬超时，超时进 DLQ 不再卡死队列', tag: 'stability' },
    { t: 'outbox max-age', d: '超过 24h 的旧任务自动跳过，队列堵塞自愈', tag: 'stability' },
    { t: 'ensureRuntimeDeps', d: 'viki install 自动装 onnxruntime-node，新用户开箱即用', tag: 'dx' },
    { t: 'bin-embedder.cjs staging', d: '之前漏 stage 导致 daemon 永远起不来；现已自动 stage', tag: 'fix' },
    { t: '离线模式自检', d: '模型缓存存在时跳过 HuggingFace HEAD 请求，国内网络不再卡', tag: 'fix' },
  ];
  return (
    <div data-reveal style={{
      background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12,
      padding: 24,
    }}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline'}}>
        <div>
          <div className="mono" style={{fontSize: 10, color: 'var(--green)', letterSpacing: '0.15em'}}>CHANGELOG</div>
          <h3 style={{fontSize: 18, marginTop: 6}}>2026-05-17 大改一览</h3>
        </div>
        <a href="https://github.com/libz-renlab-ai/Matrix-Viki/blob/main/CHANGELOG.md" target="_blank" rel="noreferrer"
           className="mono" style={{fontSize: 11, color: 'var(--ink-dim)', textDecoration: 'none'}}>
          full ↗
        </a>
      </div>
      <div style={{marginTop: 16, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-mute)'}}>
        verbatim from README §10
      </div>
      <ul style={{margin: '14px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10}}>
        {entries.map((e, i) => {
          const tagColor = { perf: 'var(--purple)', stability: 'var(--blue)', dx: 'var(--green)', fix: 'var(--amber)' }[e.tag];
          return (
            <li key={i} style={{padding: '10px 12px', background: '#060807', border: '1px solid var(--line)', borderRadius: 6}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline'}}>
                <span style={{fontSize: 13, color: 'var(--ink)', fontWeight: 600}}>{e.t}</span>
                <span className="mono" style={{
                  fontSize: 9, padding: '2px 6px', borderRadius: 3,
                  border: '1px solid', borderColor: tagColor, color: tagColor,
                }}>{e.tag}</span>
              </div>
              <div style={{fontSize: 12, color: 'var(--ink-dim)', marginTop: 4, lineHeight: 1.5}}>{e.d}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RoadmapPanel() {
  // Verbatim from README §10 roadmap
  const items = [
    { s: 'done', t: 'B1 学习闭环（识别 → 提取 → 校验 → 校准 → 编译）' },
    { s: 'done', t: 'Daemon 架构 + 新用户安装链路稳定（2026-05）' },
    { s: 'done', t: '团队规则传播（opt-in，viki team 命名空间，2026-05）' },
    { s: 'wip',  t: 'Stop pipeline 性能优化（并发 / batch prompt）' },
    { s: 'wip',  t: 'PromptHook 启用（让 LLM 抽出 channel=user-input 规则）' },
    { s: 'wip',  t: '真发布 viki 到 npm' },
    { s: 'plan', t: '国内网络一键化（postinstall 自动设 SHARP_DIST_BASE_URL）' },
  ];
  return (
    <div data-reveal style={{
      background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12,
      padding: 24,
    }}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline'}}>
        <div>
          <div className="mono" style={{fontSize: 10, color: 'var(--green)', letterSpacing: '0.15em'}}>ROADMAP</div>
          <h3 style={{fontSize: 18, marginTop: 6}}>项目状态 · 三类标签</h3>
        </div>
        <a href="https://github.com/libz-renlab-ai/Matrix-Viki#%E5%8D%81-%E9%A1%B9%E7%9B%AE%E7%8A%B6%E6%80%81" target="_blank" rel="noreferrer"
           className="mono" style={{fontSize: 11, color: 'var(--ink-dim)', textDecoration: 'none'}}>
          full ↗
        </a>
      </div>
      <div style={{marginTop: 16, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-mute)'}}>
        verbatim from README §10
      </div>
      <ul style={{margin: '14px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8}}>
        {items.map((e, i) => {
          const c = e.s === 'done' ? 'var(--green)' : e.s === 'wip' ? 'var(--amber)' : 'var(--ink-mute)';
          const icon = e.s === 'done' ? '✓' : e.s === 'wip' ? '◐' : '○';
          return (
            <li key={i} style={{
              padding: '10px 12px', background: '#060807',
              border: '1px solid', borderColor: e.s === 'done' ? 'var(--green-dim)' : 'var(--line)',
              borderRadius: 6,
              display: 'grid', gridTemplateColumns: '20px 1fr 50px', gap: 10, alignItems: 'center',
            }}>
              <span style={{color: c, fontFamily: 'var(--mono)', fontWeight: 600}}>{icon}</span>
              <span style={{fontSize: 13, color: 'var(--ink-dim)'}}>{e.t}</span>
              <span className="mono" style={{fontSize: 9, color: c, textAlign: 'right', letterSpacing: '0.1em'}}>
                {e.s.toUpperCase()}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RealCommits() {
  // Sample real commit messages aligned with the changelog work
  const commits = [
    { sha: 'a3f72c1', msg: 'feat(daemon): per-task 10min timeout + DLQ', d: '2026-05-17' },
    { sha: '8e21cf4', msg: 'fix(install): ensure bin-embedder.cjs is staged to ~/.viki/hooks/', d: '2026-05-16' },
    { sha: 'b71d09a', msg: 'feat(team): viki team infect/share/unshare commands', d: '2026-05-14' },
    { sha: 'd0c5e23', msg: 'feat(team): secret-scan gate before share + LWW author tracking', d: '2026-05-14' },
    { sha: '2f88a1b', msg: 'fix(daemon): spawn debounce + 5min cooldown after status=failed', d: '2026-05-13' },
    { sha: '47b9032', msg: 'refactor(core): forbid any IO import via ESLint rule', d: '2026-05-11' },
    { sha: '6e1aa55', msg: 'feat(retrieval): RRF fusion of vec + BM25 in PreToolUse', d: '2026-05-09' },
    { sha: '9c44e10', msg: 'docs: split docs/team-propagation.md from main README', d: '2026-05-08' },
  ];
  return (
    <div data-reveal style={{
      marginTop: 28,
      background: 'var(--bg-card)', border: '1px solid var(--line)', borderRadius: 12,
      padding: 24,
    }}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16}}>
        <div>
          <div className="mono" style={{fontSize: 10, color: 'var(--green)', letterSpacing: '0.15em'}}>RECENT COMMITS</div>
          <h3 style={{fontSize: 18, marginTop: 6}}>$ git log --oneline -8</h3>
        </div>
        <a href="https://github.com/libz-renlab-ai/Matrix-Viki/commits/main/" target="_blank" rel="noreferrer"
           className="mono" style={{fontSize: 11, color: 'var(--ink-dim)', textDecoration: 'none'}}>
          all 98 commits ↗
        </a>
      </div>
      <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
        {commits.map((c, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '80px 1fr 100px', gap: 12, alignItems: 'baseline',
            padding: '10px 12px', background: '#060807', border: '1px solid var(--line)', borderRadius: 6,
            fontFamily: 'var(--mono)', fontSize: 12,
          }}>
            <span style={{color: 'var(--amber)'}}>{c.sha}</span>
            <span style={{color: 'var(--ink)'}}>{c.msg}</span>
            <span style={{color: 'var(--ink-mute)', textAlign: 'right', fontSize: 11}}>{c.d}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

window.PitchProof = PitchProof;
