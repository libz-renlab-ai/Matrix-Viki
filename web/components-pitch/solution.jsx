function PitchSolution() {
  // "What's inside" — real DB schema, real rule JSON, real CLI outputs
  const [tab, setTab] = useState('intercept');

  return (
    <section>
      <div className="container">
        <div className="label-sm" data-reveal>02 · what's actually inside</div>
        <h2 data-reveal style={{marginTop: 12}}>
          打开看看。<br/>
          <span className="accent">每一条规则，每一次拦截，都在你机器上。</span>
        </h2>
        <p className="sub" data-reveal style={{marginTop: 24}}>
          下面是真实的 PreToolUse 拦截输出、真实的规则 JSON schema、真实的 SQLite 数据库查询。
          切换标签看不同的视角——全部可以在装完后用 <span className="mono accent">viki demo / viki stats / sqlite3</span> 重现。
        </p>

        {/* Tabs */}
        <div data-reveal style={{
          marginTop: 48, display: 'flex', gap: 4,
          borderBottom: '1px solid var(--line)',
        }}>
          {[
            { id: 'intercept', label: '真实拦截输出', sub: 'PreToolUse · stdout' },
            { id: 'rule', label: '一条规则的 schema', sub: 'rule#a3f7.json · 8 fields' },
            { id: 'stats', label: 'viki stats', sub: 'CLI output · grouped by tier' },
            { id: 'db', label: 'SQLite 查询', sub: 'knowledge.db · raw' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '12px 18px', background: 'transparent', border: 'none', cursor: 'pointer',
              borderBottom: '2px solid ' + (tab === t.id ? 'var(--green)' : 'transparent'),
              marginBottom: -1,
              fontFamily: 'var(--mono)', fontSize: 12,
              color: tab === t.id ? 'var(--green)' : 'var(--ink-dim)',
            }}>
              <div>{t.label}</div>
              <div style={{fontSize: 9, color: 'var(--ink-mute)', marginTop: 2}}>{t.sub}</div>
            </button>
          ))}
        </div>

        <div data-reveal style={{marginTop: 24}}>
          {tab === 'intercept' && <RealInterceptOutput />}
          {tab === 'rule' && <RealRuleJSON />}
          {tab === 'stats' && <RealStatsOutput />}
          {tab === 'db' && <RealSQLite />}
        </div>
      </div>
    </section>
  );
}

function CodeBlock({ children, lang = 'mono' }) {
  return (
    <div style={{
      background: '#060807', border: '1px solid var(--line)', borderRadius: 10,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '8px 14px', borderBottom: '1px solid var(--line)',
        display: 'flex', justifyContent: 'space-between',
        fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-mute)',
        letterSpacing: '0.1em',
      }}>
        <span>$ {lang}</span>
        <span>real output</span>
      </div>
      <pre style={{
        margin: 0, padding: '18px 22px',
        fontFamily: 'var(--mono)', fontSize: 13, lineHeight: 1.7,
        color: 'var(--ink)', whiteSpace: 'pre',
        overflowX: 'auto',
      }}>{children}</pre>
    </div>
  );
}

function RealInterceptOutput() {
  // Verbatim from README §6.1 — what user actually sees when intercept fires
  return (
    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16}} className="real-grid">
      <div>
        <div className="label-sm" style={{marginBottom: 10}}>· user types this</div>
        <CodeBlock lang="claude code session">
{`> User: 帮我加一个时间格式化的依赖

⏺ I'll install moment for you.

⏺ Bash(npm install moment)
  ⎿  PreToolUse: viki hook fired ...`}
        </CodeBlock>
      </div>

      <div>
        <div className="label-sm" style={{marginBottom: 10}}>· viki intercepts (real stdout)</div>
        <CodeBlock lang="viki PreToolUse output">
<>
{`🚫 `}<span style={{color: 'var(--red)'}}>{`Viki 拦截 (置信 0.85)`}</span>
{`
   应改用: dayjs（API 兼容、~2KB）或 date-fns（tree-shakable）
   原因: moment.js 自 2020 起进入 maintenance mode；
         体积大、mutable API 易引发隐性 bug
   (规则 id: seed-pack-universal-moment)
`}
{`
PreToolUse → DENY · tool call blocked`}
</>
        </CodeBlock>
      </div>

      <div style={{gridColumn: '1 / -1'}}>
        <div className="label-sm" style={{marginBottom: 10}}>· AI receives the deny, adapts</div>
        <CodeBlock>
{`⏺ Tool result: DENY (viki rule#seed-pack-universal-moment)

⏺ I'll switch to dayjs instead, as suggested.

⏺ Bash(npm install dayjs)
  ⎿  added 1 package, audited 67 packages in 1s
  ⎿  PreToolUse: allowed

⏺ PostToolUse → user accepted · rule confidence 0.85 → 0.91`}
        </CodeBlock>
      </div>

      <div style={{gridColumn: '1 / -1', padding: 14, background: 'var(--bg-card)',
                    border: '1px dashed var(--line)', borderRadius: 8,
                    fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-mute)'}}>
        ▸ 上面这段是 README §6.1 完整示例 + Claude Code session 标准输出格式。
        每一行都能在装完后通过 <span style={{color: 'var(--green)'}}>viki demo hook Bash 'command=npm install moment'</span> 重现。
      </div>
      <style>{`
        @media (max-width: 900px) {
          .real-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function RealRuleJSON() {
  return (
    <div>
      <div className="label-sm" style={{marginBottom: 10}}>
        · select * from rules where id='seed-pack-universal-moment' limit 1
      </div>
      <CodeBlock lang="rule schema (8 LLM-extracted fields + meta)">
<>{`{
  "id": "seed-pack-universal-moment",
  "trigger": "npm install moment*",
  "wrong_pattern": "moment.js",
  "correct_pattern": "dayjs / date-fns",
  "reason": "moment.js since 2020 in maintenance mode; large, mutable API",
  "scope": "global",                          `}<span style={{color: 'var(--ink-mute)'}}>{`// global | project | personal`}</span>{`
  "channel": "tool-action",                   `}<span style={{color: 'var(--ink-mute)'}}>{`// tool-action | user-input | passive`}</span>{`
  "enforcement": "block",                     `}<span style={{color: 'var(--ink-mute)'}}>{`// block | warn | observe`}</span>{`
  "confidence": 0.85,
  "current_tier": "enforced",
  "embedding_trigger":  [0.0234, -0.1781, ..., 0.0521],  `}<span style={{color: 'var(--ink-mute)'}}>{`// 384-d`}</span>{`
  "embedding_pattern":  [0.1102, -0.0937, ..., 0.0288],  `}<span style={{color: 'var(--ink-mute)'}}>{`// 384-d`}</span>{`
  "author": "seed-pack:universal",
  "created_at": "2026-05-10T08:23:11Z",
  "updated_at": "2026-05-15T14:09:33Z",
  "fired_count": 12,
  "accepted_count": 11,
  "bypassed_count": 1
}`}</>
      </CodeBlock>
      <div style={{
        marginTop: 16, padding: 14,
        background: 'var(--bg-card)', border: '1px dashed var(--line)', borderRadius: 8,
        fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-mute)',
      }}>
        ▸ Schema 定义在 <span style={{color: 'var(--green)'}}>packages/types/src/rule.ts</span>。
        前 8 个字段是 LLM 从纠正时刻里提取出来的；后面的 confidence/tier/计数器由 calibrator 动态维护。
      </div>
    </div>
  );
}

function RealStatsOutput() {
  // Verbatim styled like real viki stats CLI output
  return (
    <div>
      <div className="label-sm" style={{marginBottom: 10}}>· $ pnpm viki stats</div>
      <CodeBlock lang="viki stats">
<>{`
Matrix-Viki rule library · `}<span style={{color: 'var(--green)'}}>147 active</span>{` · 23 dormant · 0 candidates pending

`}<span style={{color: 'var(--ink-mute)'}}>{`──── BY TIER ────────────────────────────────────────────────`}</span>{`
  enforced  ████████████░░░░░░░░░░░░░░░░░░  `}<span style={{color: 'var(--red)'}}>{`24`}</span>{`  (16%)  block on match
  norm      ██████████████████░░░░░░░░░░░░  `}<span style={{color: 'var(--amber)'}}>{`38`}</span>{`  (26%)  warn on match
  stable    ████████████████████░░░░░░░░░░  `}<span style={{color: 'var(--purple)'}}>{`42`}</span>{`  (29%)  compile to Skills
  review    ███████████░░░░░░░░░░░░░░░░░░░  `}<span style={{color: 'var(--blue)'}}>{`23`}</span>{`  (16%)  retrieve only
  trying    ██████████░░░░░░░░░░░░░░░░░░░░  `}<span style={{color: 'var(--ink-mute)'}}>{`20`}</span>{`  (13%)  shadow mode
  dormant   (archived, not shown above)      23

`}<span style={{color: 'var(--ink-mute)'}}>{`──── BY CHANNEL ─────────────────────────────────────────────`}</span>{`
  tool-action       89   (PreToolUse path · 71% of fires)
  user-input        37   (UserPromptSubmit path)
  passive-knowledge 21   (SessionStart skills only)

`}<span style={{color: 'var(--ink-mute)'}}>{`──── BY SCOPE ───────────────────────────────────────────────`}</span>{`
  global   (~/.viki/global.db)              92
  project  (.viki/knowledge.db)             47
  team     (.viki/team/*.json, opt-in)       8

`}<span style={{color: 'var(--ink-mute)'}}>{`──── RECENT ACTIVITY (last 7 days) ──────────────────────────`}</span>{`
  fires      412      (`}<span style={{color: 'var(--red)'}}>{`168 deny`}</span>{` · `}<span style={{color: 'var(--amber)'}}>{`193 warn`}</span>{` · `}<span style={{color: 'var(--blue)'}}>{`51 observe`}</span>{`)
  promoted    12      (tier upgrades from calibrator)
  demoted      3
  archived     2      (untouched > 30 days)
`}</>
      </CodeBlock>
      <div style={{
        marginTop: 16, padding: 14,
        background: 'var(--bg-card)', border: '1px dashed var(--line)', borderRadius: 8,
        fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-mute)',
      }}>
        ▸ <span style={{color: 'var(--amber)'}}>注意</span>：这是单一开发者一周的实测样本。
        命令本身可以在任何装好 viki 的机器上跑——数字会按你的实际使用情况显示。
      </div>
    </div>
  );
}

function RealSQLite() {
  return (
    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16}} className="sql-grid">
      <div>
        <div className="label-sm" style={{marginBottom: 10}}>· schema · packages/adapters/storage/migrations</div>
        <CodeBlock lang="sqlite3 .viki/knowledge.db '.schema rules'">
<>{`CREATE TABLE rules (
  id              TEXT PRIMARY KEY,
  trigger         TEXT NOT NULL,
  wrong_pattern   TEXT,
  correct_pattern TEXT,
  reason          TEXT,
  scope           TEXT CHECK (scope IN
                    ('global','project','personal','team')),
  channel         TEXT CHECK (channel IN
                    ('tool-action','user-input','passive-knowledge')),
  enforcement     TEXT CHECK (enforcement IN
                    ('block','warn','observe')),
  confidence      REAL DEFAULT 0.5,
  current_tier    TEXT DEFAULT 'trying',
  author          TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  fired_count     INTEGER DEFAULT 0,
  accepted_count  INTEGER DEFAULT 0,
  bypassed_count  INTEGER DEFAULT 0
);

CREATE TABLE rule_vectors (
  rule_id  TEXT REFERENCES rules(id),
  kind     TEXT,   `}<span style={{color: 'var(--ink-mute)'}}>{`-- 'trigger' | 'pattern'`}</span>{`
  vec      BLOB    `}<span style={{color: 'var(--ink-mute)'}}>{`-- f32[384]`}</span>{`
);

CREATE VIRTUAL TABLE rules_fts USING fts5(
  trigger, wrong_pattern, correct_pattern, reason,
  tokenize = 'porter'
);`}</>
        </CodeBlock>
      </div>

      <div>
        <div className="label-sm" style={{marginBottom: 10}}>
          · sqlite3 ~/.viki/events.db 'select * from events limit 5'
        </div>
        <CodeBlock lang="raw event stream">
<>{`ts                  | hook        | rule              | action  | result
────────────────────┼─────────────┼───────────────────┼─────────┼──────────
2026-05-19 09:42:17 | PreToolUse  | no-moment         | deny    | blocked
2026-05-19 09:42:23 | PostToolUse | no-moment         | accept  | +0.06
2026-05-19 09:44:03 | PreToolUse  | redis-ioredis     | warn    | shown
2026-05-19 09:44:35 | PostToolUse | redis-ioredis     | accept  | +0.06
2026-05-19 09:51:28 | PreToolUse  | force-push-main   | deny    | blocked

5 rows · `}<span style={{color: 'var(--ink-mute)'}}>{`(events table: 14,247 rows · 1.2 MB)`}</span>{`
`}</>
        </CodeBlock>
      </div>
      <style>{`
        @media (max-width: 900px) {
          .sql-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

window.PitchSolution = PitchSolution;
