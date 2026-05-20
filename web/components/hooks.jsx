function Hooks() {
  const hooks = [
    {
      n: 1, name: 'SessionStart', tone: 'blue',
      verb: '注入',
      brief: '把高成熟规则编译成 Skills 注入新会话',
      desc: '会话开始时，Viki 把 .viki/knowledge.db 里 tier ≥ 稳定 的规则编译成 Claude Skills，写入 ~/.claude/skills/viki/，让 AI 一开始就"知道"规则——而不是出错后才被告知。',
      payload: 'enabled rules: 12  ·  skills compiled: 12  ·  context tokens: ~1.8k',
      cli: 'on session_start → compile_skills(tier≥稳定) → inject',
    },
    {
      n: 2, name: 'UserPromptSubmit', tone: 'blue',
      verb: '检索',
      brief: '按 prompt 语义召回相关规则，注入上下文',
      desc: '用户敲完 prompt 但还没进入 AI 前，按语义召回相关规则。思路：上下文一旦定型 AI 才好做事；规则要在"判断之前"出现，而不是"做错之后"。',
      payload: 'prompt: "帮我加个时间格式化" → vec.search() → 3 rules',
      cli: 'on user_prompt → vec_search(prompt) → augment_context',
    },
    {
      n: 3, name: 'PreToolUse', tone: 'red',
      verb: '拦截',
      brief: '工具调用前匹配规则库，可 deny / warn / allow',
      desc: '核心拦截通道。AI 想调任何工具前，按工具入参检索规则库。命中高置信 → DENY 阻断；中置信 → WARN 提示；低 → 放行但记录。错误只能在"它发生之前"挡掉，事后日志没用。',
      payload: 'Bash("npm install moment") → match rule#a3f7 → DENY',
      cli: 'on pre_tool_use(tool, args) → match() → decide(deny|warn|allow)',
    },
    {
      n: 4, name: 'PostToolUse', tone: 'green',
      verb: '观察',
      brief: '工具执行后记录结果，喂给校准器',
      desc: '工具跑完看真实结果：成功 / 失败 / 用户改了 / 用户绕过去。每一次拦截都是个微型实验，要看真实结果反过来评价规则本身。',
      payload: 'result: user_accepted_correction · rule#a3f7 confidence +0.12',
      cli: 'on post_tool_use(result) → emit_event → calibrate',
    },
    {
      n: 5, name: 'PreCompact', tone: 'amber',
      verb: '快照',
      brief: '上下文压缩前 snapshot 关键事件',
      desc: '上下文压缩会把"刚发生的纠正"压掉。必须在压缩前抢救出来——拦截 / override / 命中事件存为快照，等 Stop hook 阶段一起喂给学习管线。',
      payload: 'snapshot 4 events → ~/.viki/sessions/<id>.jsonl',
      cli: 'on pre_compact → snapshot(critical_events) → persist',
    },
    {
      n: 6, name: 'Stop', tone: 'amber',
      verb: '学习',
      brief: '会话结束扫描对话，提取纠正时刻',
      desc: '最贵但最有价值的一步。会话结束（或 /clear / SessionEnd）时扫描整段对话，找出用户纠正 AI 的瞬间。先用 7 类启发式定位（便宜），再喂给 Haiku 做结构化（贵）——蒸馏成候选规则。',
      payload: 'scan 1247 turns → 3 correction moments → 3 rule candidates',
      cli: 'on stop → detect_corrections() → llm_extract() → queue_candidates()',
    },
    {
      n: 7, name: 'SessionEnd', tone: 'amber',
      verb: '清理',
      brief: '清理会话级状态，释放资源',
      desc: '收尾。清理会话级临时状态、关闭 daemon 子任务、把待处理候选规则交给 worker 异步处理。注意：SessionEnd 不会误杀正在处理任务的 daemon——有 /shutdown 门控。',
      payload: 'release session state · daemon stays alive for queue',
      cli: 'on session_end → cleanup_session() · daemon ⟂',
    },
  ];

  const [active, setActive] = useState(0);
  const cur = hooks[active];
  const toneColor = {
    blue: 'var(--blue)', red: 'var(--red)', green: 'var(--green)',
    amber: 'var(--amber)', purple: 'var(--purple)'
  }[cur.tone];

  return (
    <section id="hooks">
      <div className="container">
        <div className="sec-label"><span>04 · 接入 Claude Code</span></div>
        <h2>7 个 Hook · 一条信号管线。</h2>
        <p className="sub" style={{marginBottom: 48}}>
          Viki 不改变你的工作习惯——它挂在 Claude Code 的 7 个 hook 上工作。点开看每一步在做什么。
        </p>

        <div className="pipeline" style={{gridTemplateColumns: '260px 1fr'}}>
          {/* Sidebar list */}
          <div className="pipeline-list">
            {hooks.map((h, i) => (
              <div key={h.n}
                className={'hook-item' + (i === active ? ' active' : '')}
                onClick={() => setActive(i)}>
                <span className="hook-num">{String(h.n).padStart(2, '0')}</span>
                <span>{h.name}</span>
                <span style={{marginLeft: 'auto', fontSize: 10, color: 'currentColor', opacity: 0.6}}>
                  {h.verb}
                </span>
              </div>
            ))}
          </div>

          {/* Detail panel */}
          <div className="pipeline-detail">
            <div style={{display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 4}}>
              <span className="mono" style={{
                fontSize: 11, padding: '4px 10px',
                background: toneColor, color: '#051208',
                borderRadius: 4, fontWeight: 600, letterSpacing: '0.1em',
              }}>{cur.verb.toUpperCase()}</span>
              <span className="mono" style={{fontSize: 13, color: 'var(--ink-dim)'}}>
                hook #{String(cur.n).padStart(2, '0')}
              </span>
            </div>
            <h3 style={{fontSize: 32, marginTop: 12, fontFamily: 'var(--mono)', fontWeight: 500}}>
              {cur.name}
            </h3>
            <p style={{fontSize: 16, color: 'var(--ink-dim)', lineHeight: 1.6, marginTop: 16, maxWidth: 600}}>
              {cur.desc}
            </p>

            <div style={{marginTop: 32, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16}}>
              <div style={{padding: 16, background: '#060807', border: '1px solid var(--line)', borderRadius: 8}}>
                <div className="mono" style={{fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '0.1em', marginBottom: 8}}>
                  EXEC TRACE
                </div>
                <code style={{fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--green)'}}>
                  {cur.cli}
                </code>
              </div>
              <div style={{padding: 16, background: '#060807', border: '1px solid var(--line)', borderRadius: 8}}>
                <div className="mono" style={{fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '0.1em', marginBottom: 8}}>
                  TYPICAL PAYLOAD
                </div>
                <code style={{fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink)'}}>
                  {cur.payload}
                </code>
              </div>
            </div>

            {/* Pipeline flow indicator */}
            <div style={{marginTop: 32, paddingTop: 24, borderTop: '1px dashed var(--line)'}}>
              <div className="mono" style={{fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '0.15em', marginBottom: 12}}>
                信号流位置
              </div>
              <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                {hooks.map((h, i) => (
                  <React.Fragment key={i}>
                    <div style={{
                      width: i === active ? 32 : 12,
                      height: 12,
                      borderRadius: 100,
                      background: i === active ? toneColor : i < active ? 'var(--ink-mute)' : 'var(--line-strong)',
                      transition: 'all 0.3s',
                    }} />
                    {i < hooks.length - 1 && (
                      <span style={{color: 'var(--ink-mute)', fontFamily: 'var(--mono)', fontSize: 10}}>›</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
window.Hooks = Hooks;
