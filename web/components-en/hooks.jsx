function Hooks() {
  const hooks = [
    {
      n: 1, name: 'SessionStart', tone: 'blue',
      verb: 'inject',
      brief: 'Compile mature rules into Skills, inject into new session',
      desc: 'At session start, Viki compiles rules with tier ≥ stable from .viki/knowledge.db into Claude Skills under ~/.claude/skills/viki/. The AI knows the rules from turn one — not after it makes the mistake.',
      payload: 'enabled rules: 12  ·  skills compiled: 12  ·  context tokens: ~1.8k',
      cli: 'on session_start → compile_skills(tier≥stable) → inject',
    },
    {
      n: 2, name: 'UserPromptSubmit', tone: 'blue',
      verb: 'retrieve',
      brief: 'Surface relevant rules by prompt semantics before the AI sees it',
      desc: 'After you hit enter but before the AI receives the prompt, Viki retrieves semantically related rules and augments the context. Rules must appear "before the judgment" — not after the mistake.',
      payload: 'prompt: "add a date-format dep" → vec.search() → 3 rules',
      cli: 'on user_prompt → vec_search(prompt) → augment_context',
    },
    {
      n: 3, name: 'PreToolUse', tone: 'red',
      verb: 'intercept',
      brief: 'Match rules before any tool runs — deny / warn / allow',
      desc: 'The core interception path. Before the AI runs any tool, Viki searches the KB against the tool args. High confidence → DENY. Mid → WARN. Low → allow but record. Mistakes only get blocked before they happen — logs after the fact are useless.',
      payload: 'Bash("npm install moment") → match rule#a3f7 → DENY',
      cli: 'on pre_tool_use(tool, args) → match() → decide(deny|warn|allow)',
    },
    {
      n: 4, name: 'PostToolUse', tone: 'green',
      verb: 'observe',
      brief: 'Record the real outcome and feed the calibrator',
      desc: 'After the tool runs, watch the real result — success / failure / user changed it / user bypassed. Each interception is a micro-experiment that lets the rule itself be judged by reality.',
      payload: 'result: user_accepted_correction · rule#a3f7 confidence +0.12',
      cli: 'on post_tool_use(result) → emit_event → calibrate',
    },
    {
      n: 5, name: 'PreCompact', tone: 'amber',
      verb: 'snapshot',
      brief: 'Snapshot critical events before context compaction',
      desc: 'Context compaction would crush a just-happened correction. Pre-compact rescues it — interception / override / hit events are persisted to a session snapshot, picked up by the Stop pipeline.',
      payload: 'snapshot 4 events → ~/.viki/sessions/<id>.jsonl',
      cli: 'on pre_compact → snapshot(critical_events) → persist',
    },
    {
      n: 6, name: 'Stop', tone: 'amber',
      verb: 'learn',
      brief: 'At session end, scan the transcript and extract correction moments',
      desc: 'The most expensive step — and the most valuable. At session end (or /clear / SessionEnd), Viki scans the full conversation. Cheap 7-signal heuristic pinpoints "correction moments" first, then Haiku structures each one into a rule candidate.',
      payload: 'scan 1247 turns → 3 correction moments → 3 rule candidates',
      cli: 'on stop → detect_corrections() → llm_extract() → queue_candidates()',
    },
    {
      n: 7, name: 'SessionEnd', tone: 'amber',
      verb: 'cleanup',
      brief: 'Release session-scoped state',
      desc: 'Tear-down. Releases per-session state, hands pending candidates to the worker for async processing. Note: SessionEnd does NOT kill a daemon mid-task — there is a /shutdown gate.',
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
        <div className="sec-label" data-reveal><span>05 · plugged into claude code</span></div>
        <h2>7 hooks · one signal pipeline.</h2>
        <p className="sub" style={{marginBottom: 48}}>
          Viki doesn't change how you work — it lives on Claude Code's 7 hooks. Click any to see what happens at that step.
        </p>

        <div className="pipeline" style={{gridTemplateColumns: '260px 1fr'}}>
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

            <div style={{marginTop: 32, paddingTop: 24, borderTop: '1px dashed var(--line)'}}>
              <div className="mono" style={{fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '0.15em', marginBottom: 12}}>
                position in the signal flow
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
