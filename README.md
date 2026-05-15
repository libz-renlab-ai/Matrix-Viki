# Matrix-Viki

> **个人 AI 规则助手** —— 自动从你的 Claude Code 会话里学习，让 AI 不再重复踩同一个坑。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522.5.0-brightgreen)](https://nodejs.org)
[![Status](https://img.shields.io/badge/status-source--install_only-orange)](#项目状态)

```text
你纠正 AI 的某个做法
        │
        ▼  Stop hook（会话结束时旁路扫描）
识别"纠正时刻" → 提取候选规则 → 校验 → 入库
        │
        ▼  PreToolUse hook（下次工具调用前）
匹配规则 → 拦截 / 警告 / 提示
        │
        ▼  PostToolUse hook（执行后）
观察结果 → 校准置信度 → 升降级
```

---

## 一、这是什么

Matrix-Viki 是一个挂在 Claude Code 上的**学习引擎**。它在你日常和 AI 交互的过程中默默做三件事：

1. **识别**你纠正 AI 的瞬间，把纠正蒸馏成一条结构化规则
2. **拦截**下次 AI（或你自己）将要重蹈覆辙的工具调用，在 `PreToolUse` 阶段给出预警
3. **校准**每条规则的置信度 —— 有用就升级，被绕开就降级，长期没人用的自动归档

你不需要改变工作习惯，规则库自己在背后从你的会话里长出来。

> Matrix-Viki 是从团队产品 [TeamBrain](https://github.com/libz-renlab-ai/TeamBrain) 抽出来的**纯个人**子集 —— 去掉了团队可见性、视频录制、跨机同步、A/B 评测等所有团队向功能，只保留 B1「学习引擎」这一层。完整拆分设计见 [`docs/superpowers/specs/2026-05-14-matrix-viki-split-design.md`](docs/superpowers/specs/2026-05-14-matrix-viki-split-design.md)。

---

## 二、为什么存在

传统的"AI 助手 + 文档"模式有一个结构性问题：**每次会话都是空白的**。

- 你昨天纠正 AI 不要再用 `moment.js`，今天它照样推荐
- 你花两小时排查的部署陷阱，下个项目从零再来一遍
- `CLAUDE.md` 里手写的规则越积越多，AI 实际上只读最前面几行

Matrix-Viki 把"纠正"这件事变成**可持续的资产**：

- 每次纠正 → 一条带置信度的规则
- 每条规则 → 在合适的时机（工具调用前）自动出现
- 错的规则 → 被 AI 绕过去时自动降级

核心承诺是：**已知错误不会真的发生第二次**。

---

## 三、核心能力

| 能力 | 触发时机 | 作用 |
|---|---|---|
| 🛡️ **PreToolUse 拦截** | AI 真的要执行工具之前 | 命中高置信规则 → `deny`；中置信 → `warn`；其余放行 |
| 📚 **会话开始注入** | Claude Code 新会话开始 | 把高成熟规则编译成 Skills，会话开始时自动可见 |
| 🪞 **Stop 旁路学习** | 会话结束（或 `/clear`） | 扫描整段对话，识别纠正/成功时刻，提取候选规则 |
| ⚖️ **置信度校准** | 每次拦截事件 | 有用 → 升级；被绕过/被用户 override → 降级；归档老规则 |
| 🌱 **开箱种子** | `viki init` | 注入 8 条元原则 + 58 条跨语言通用经验，第一天就能拦坑 |
| 🔒 **PII 脱敏** | 写入规则库之前 | 清洗 API key / JWT / token，规则库永远不存敏感信息 |
| 🧩 **手动入口** | `viki pitfall` | 你主动记一条坑，不必等会话扫描 |

---

## 四、架构

**Functional Core, Imperative Shell + Ports & Adapters**，依赖方向单向，反向禁止：

```
cli → adapters → core → ports → types
```

| 包 | 角色 | 关键内容 |
|---|---|---|
| `@viki/types` | 纯类型定义 | 零依赖，所有共享类型 |
| `@viki/ports` | 端口接口 + 契约测试 | 任何新 IO 能力先在这里写契约 |
| `@viki/core` | 纯函数学习引擎 | 禁止 `import 'node:fs'` / `'child_process'` 等 IO |
| `@viki/adapters` | 命令式外壳 | storage / llm / hook / embedding / ingest |
| `@viki/cli` | `viki` CLI + Claude Code hook bin | 9 个 hook bundle（CJS）+ 主 CLI |
| `viki` | 发布壳 + seed packs | `seed/packs/universal.jsonl` |

**Why this matters**：核心学习逻辑（什么算纠正、规则怎么校准）是纯函数，可以脱机重放、可以单测、可以替换 LLM 后端而不动核心。所有副作用都在 adapter 层，挪到不同操作系统（Windows / macOS / Linux）只动 adapter。

详细机制设计见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) —— 包括 8 个正交动词（拦截 / 匹配 / 识别 / 提取 / 校验 / 校准 / 编译 / 归因）和一条信号从"原始事件 → 候选规则 → 入库 → 升降 → 投放"的完整生命周期。

---

## 五、安装

详细步骤见 [`INSTALL.md`](./INSTALL.md)。最短路径：

```bash
git clone https://github.com/libz-renlab-ai/Matrix-Viki
cd Matrix-Viki
bash scripts/bootstrap.sh    # = pnpm install + pnpm build + pnpm viki init
# 完整关窗口重开 Claude Code，hook 才会挂上
pnpm viki doctor             # 验证
```

**前置要求**：
- Node ≥ 22.5.0
- pnpm 9.x（`npm install -g pnpm@9.15.9`）
- Claude Code 已安装

**不要用 `npm i -g viki`** —— npm 上的 `viki@0.0.2` 是第三方同名包，跟 Matrix-Viki 无关。本项目尚未发布到 npm。

---

## 六、使用

### 6.1 自动用法（你什么都不用做）

装好之后，Viki 就挂在 Claude Code 的 hook 上工作：

| Claude Code Hook | Viki 做什么 |
|---|---|
| `SessionStart` | 把高成熟规则编译成 Skills 注入 |
| `UserPromptSubmit` | 按用户 prompt 检索相关规则 |
| `PreToolUse` | 用工具调用输入匹配规则库，可能 `deny` / `warn` / `allow` |
| `PostToolUse` | 记录工具执行结果，喂给校准器 |
| `Stop` | 扫描整段会话，提取纠正/成功时刻 → 候选规则 |
| `SessionEnd` | 清理会话级状态 |
| `PreCompact` | 在上下文压缩前 snapshot 关键信息 |

你写代码、纠正 AI，Viki 在背后跑完整的"学—存—用—评"闭环。

**实例**：你输入 `npm install moment`，AI 准备执行 → Viki 在 PreToolUse 阶段命中种子规则：

```
🚫 Viki 拦截 (置信 0.85)
   应改用: dayjs（API 兼容、~2KB）或 date-fns（tree-shakable）
   原因: moment.js 自 2020 起进入 maintenance mode；体积大、mutable API 易引发隐性 bug
   (规则 id: seed-pack-universal-moment)
```

### 6.2 手动命令（你需要时用）

```bash
viki try                    # 30 秒一键演示 5 个经典拦截场景（首次推荐入口）
viki pitfall                # 交互式记一条踩坑经验
viki stats                  # 看规则库内容（按 C/E/S/K 分类）
viki review 10              # 列出最近 10 条规则，供人工复核
viki doctor                 # 环境自检
viki --help                 # 完整命令列表
```

### 6.3 进阶命令

```bash
# 主动学习
viki analyze --commit       # 分析会话日志，LLM 提取成知识条目并入库
viki scan-errors            # 自动从日志采集错误信号 → 候选队列
viki review-candidates      # 交互审核候选规则（[a]批准/[r]拒绝/[s]跳过）

# 校准 & 维护
viki calibrate              # 根据事件重算置信度，归档低分条目
viki migrate-v6 / v7        # 数据 schema 升级
viki bug-report --out=path  # 自动脱敏的诊断报告

# Stack pack（跨项目复用的规则集）
viki pack list              # 列出已安装 / 可用的 pack
viki pack add frontend-js   # 装一个 pack
viki pack remove ops-safety # 删一个 pack

# 编译 & 验证
viki compile --dry-run      # 预览要写哪些 Skills 文件
viki verify                 # 跑 5 个场景验证 PRR/KP 指标
viki verify-anchors         # 静态校验 CLAUDE.md anchor 结构

# 输出
viki daily                  # 跨项目扫今天的 Claude Code 活动，生成日报骨架

# 停用 / 卸载
viki disable                # 临时禁用 hook（保留数据）
viki enable                 # 重新启用
viki uninstall              # 移除 hook，保留数据
viki uninstall --delete-data # 同时删 .viki/
```

### 6.4 单条规则的生命周期（一图流）

```text
你说"不对，应该用 X"             AI 重蹈覆辙
        │                              │
        ▼                              ▼
   ┌─ Stop hook 识别 ─┐         ┌─ PreToolUse 匹配 ─┐
   │                  │         │                   │
   ▼                  ▼         ▼                   ▼
candidate          extract    deny                warn
 → 校验            → 入库      → AI 改道           → AI 看到
   │ pass            │           │                   │
   ▼                 ▼           ▼                   ▼
试用级            实验级 ─── 校准 ───→ 升降级 ──→ 稳定/强制 / 归档
                                  ▲
                            观察结果反馈
```

成熟等级共 6 档：**试用 → 考察 → 稳定 → 规范 → 强制 → 休眠**。等级决定规则进哪个投放通道（不出现 / 只查询 / 进 Skills / 真拦截）。升降都带迟滞，单次偶发信号不会让规则跳变。

---

## 七、配置

### 7.1 环境变量

| 变量 | 作用 | 默认 |
|---|---|---|
| `VIKI_VISIBILITY` | 归因渲染模式：`silent` / `smart` / `verbose` | `verbose` |
| `VIKI_VERBOSE_INIT=1` | `init` 输出恢复 4-step 下一步列表 | 不设置 |
| `VIKI_SKIP_WARMUP=1` | postinstall 跳过 120MB 向量模型预热 | 不设置 |
| `VIKI_FOREGROUND_WARMUP=1` | 前台同步等向量模型下载完 | 不设置（默认后台 detached） |
| `VIKI_POSTINSTALL_DEBUG=1` | postinstall 输出向量依赖检测调试信息 | 不设置 |

### 7.2 文件结构

```
your-project/
├── .viki/
│   ├── knowledge.db        # 项目级规则库（SQLite）
│   └── .project-root       # 标记文件
└── .claude/
    └── settings.local.json # Hook 注册（项目级）

~/.viki/
├── global.db               # 全局规则库（所有项目共享）
├── events.db               # 拦截/校准事件流
├── candidates.db           # 候选规则队列
├── postinstall.log         # 安装诊断日志
├── warmup.log              # 向量模型预热日志
└── sessions/               # 会话快照

~/.claude/
├── settings.json           # Hook 注册（用户级，所有项目都触发）
└── skills/
    └── viki/               # 编译后的 Skills（高成熟规则）
```

### 7.3 `viki init` 关键 flag

```bash
viki init --dry-run              # 预览不写
viki init --structure            # opt-in：用 LLM 从 CLAUDE.md/AGENTS.md/.cursorrules 导入（消耗订阅额度）
viki init --skip-hook            # 不注册 hook
viki init --skip-seed            # 不注入打包规则
viki init --skip-warmup          # 不预热向量模型
viki init --install-plugins      # 同时装团队标配 plugin
viki init --target=claude|codex|both  # 默认 claude
viki init --no-user-level-hook   # 不写 ~/.claude/settings.json
viki init --cwd=<path>           # 改写目标项目目录（CI / 沙盒）
viki init --home=<path>          # 改写用户 home（CI / 沙盒）
```

---

## 八、写给 AI agent

如果你是另一个 AI agent 在帮用户操作这个项目，下面几条是高密度信息：

1. **入口**：源码 install 唯一可靠路径是 `bash scripts/bootstrap.sh`（V1=1 单 Bash 调用）；不要建议 `npm i -g viki`（被第三方占名）
2. **运行时目录**：项目级 `.viki/`，用户级 `~/.viki/` + `~/.claude/skills/viki/`
3. **hook 注册路径**：项目级 `.claude/settings.local.json`、用户级 `~/.claude/settings.json`
4. **诊断**：`viki doctor` / `viki bug-report --out=path` / `~/.viki/postinstall.log` / `~/.viki/warmup.log`
5. **CLAUDE.md 不再写规则块**：规则在 `.viki/knowledge.db` 里，通过 Skills 输出。`viki compile` 默认 `--skills-only`
6. **测试纠正流**：`viki demo hook Bash 'command=npm install moment'` 模拟 PreToolUse 拦截
7. **隔离运行**（CI / judge）：所有命令支持 `--cwd=<path>` 和 `--home=<path>`；注意 `viki doctor` 的 `home-dir` / `plugin-sync` 检查目前仍读真实 home（已知 bug）
8. **核心铁律**（修源码时）：`@viki/core` 禁止任何 IO；新 Port 接口先写契约测试；归因事件走 `AttributionBus` 不用 `console.log`

---

## 九、开发

```bash
pnpm install
pnpm build       # 构建所有包 + 9 个 hook CJS bundle
pnpm typecheck   # tsc --noEmit，必须 0 error
pnpm test        # vitest run，全量
pnpm viki <cmd>  # 本地跑 CLI（= tsx packages/cli/src/bin.ts）

pnpm smoke:llm   # LLM 烟雾测试
pnpm smoke:hook  # hook 烟雾测试
```

**改动约定**（详见 [`CLAUDE.md`](./CLAUDE.md)）：

- 每个 `Edit` / `Write` 后立即按单一关注点做**原子 commit**
- commit message 用 `feat: / fix: / refactor: / chore: / docs:` 前缀
- 改完跑 `pnpm typecheck` + 相关 `pnpm test`，绿了再继续
- 跨平台：`tar` 行为不一致（bsdtar 不支持 `--force-local`）；路径用 `node:path`，别硬编码分隔符
- 新增 Port 接口：**先**在 `packages/ports/src/__tests__/<name>-contract.ts` 写契约测试，再写实现

---

## 十、项目状态

**当前阶段**：源码安装可用，npm 发布 pending。

### 已知问题（不影响核心功能）

| 问题 | 影响 | 状态 |
|---|---|---|
| `viki doctor` 报 `❌ skills-propagated ... missing duck/codex` | doctor 退出码 1，新用户误以为装坏 | 待修（默认 target=claude 时不该 fail） |
| `viki doctor --home=` 没贯彻到所有检查 | `home-dir` / `plugin-sync` 漏到真实 `~/.viki/` | 待修（影响 CI 隔离） |
| `viki demo hook` 不识别 `--cwd` / `--home` | 这俩 flag 会被当成 slot 输入 | 待修（小 UX bug） |
| `release/install.sh` 仍是 TeamBrain 命名 | curl\|bash 路径假装是 Matrix-Viki 但内部还是 `teamagent` | 待 rebrand |
| `.claude/skills/install-walkthrough/SKILL.md` 硬编码 TeamBrain 路径 | install-walkthrough skill 用不了 | 待重写 |

完整的待办 / 已修问题流见 [`CHANGELOG.md`](./CHANGELOG.md)。

### Roadmap

- ✅ B1 学习引擎核心闭环（识别 → 提取 → 校验 → 校准 → 编译）
- ✅ Walking Skeleton（M0）跑通
- 🚧 doctor 隔离 / codex 误报修复
- 🚧 `release/install.sh` rebrand → 真发布 `viki` 到 npm
- 📋 跨项目 stack pack 生态
- 📋 团队模式（从 Matrix-Viki 升回 TeamBrain）

---

## 十一、贡献

欢迎 issue / PR：https://github.com/libz-renlab-ai/Matrix-Viki/issues

提 issue 前请附诊断报告：

```bash
pnpm viki bug-report --out=/tmp/viki-bug.md
```

报告自动脱敏 API key / JWT / token，可以放心粘贴。

---

## 十二、License

MIT —— 详见 [LICENSE](./LICENSE)。
