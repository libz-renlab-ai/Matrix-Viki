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

> Matrix-Viki 是从团队产品 [TeamBrain](https://github.com/libz-renlab-ai/TeamBrain) 抽出来的**个人优先**子集 —— 去掉了视频录制、A/B 评测等重型团队功能，专注 B1「学习引擎」这一层。v0.12.0 起增加了 **opt-in 的团队规则传播**（`viki team` 命名空间，通过 git 同步规则；详见 [`docs/team-propagation.md`](docs/team-propagation.md)），但默认不启用，不影响纯个人使用。完整拆分设计见 [`docs/superpowers/specs/2026-05-14-matrix-viki-split-design.md`](docs/superpowers/specs/2026-05-14-matrix-viki-split-design.md)。

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

## 三、所有功能与对应设计思路

每一行先说**做什么**，再说**为什么这样设计**。

### 3.1 学习闭环

| 功能 | 思路 |
|---|---|
| **PreToolUse 拦截** | AI 想跑工具前，先按工具入参检索规则库。命中高置信 → 阻断；中置信 → 提示；放行。思路：错只能在"它发生之前"挡掉，事后日志没用。 |
| **PostToolUse 观察** | 工具执行完后记录结果（成功 / 失败 / 用户改了 / 用户绕过去）。思路：每次拦截都是个微型实验，要看真实结果反过来评价规则本身。 |
| **UserPromptSubmit 检索** | 用户敲完 prompt 还没进入 AI 前，按 prompt 语义召回相关规则，注入上下文。思路：上下文一旦定型 AI 才好做事；规则要在"判断之前"出现，而不是"做错之后"。 |
| **Stop 旁路学习** | 会话结束（或 `/clear` / SessionEnd）时扫描整段对话，找出用户纠正 AI 的瞬间，蒸馏成结构化规则候选。思路：纠正是密度最高的信号 —— 用户花了真实精力告诉 AI "不对"。把这些时刻做成可复用资产是核心价值。 |
| **PreCompact 快照** | 上下文压缩前 snapshot 关键事件（拦截 / override / 命中）。思路：压缩会把"刚发生的纠正"压掉，必须在压缩前抢救出来。 |
| **SessionStart 注入** | 新会话开始时，把高成熟规则编译成 Skills 注入。思路：让 AI 一开始就"知道"规则，而不是出了错才查。 |
| **置信度 + 6 档成熟度** | 每条规则都有 confidence 和 tier（试用 → 考察 → 稳定 → 规范 → 强制 → 休眠）。等级决定它进哪个投放通道。思路：新规则可能是错的，让它在低风险通道试错；只有反复证明有用才升级到真拦截。降级也带迟滞，单次反例不会让规则跳变。 |

### 3.2 检索与匹配

| 功能 | 思路 |
|---|---|
| **双层规则库** | `~/.viki/global.db`（跨项目）+ `<project>/.viki/knowledge.db`（项目级）。思路：有些坑是个人偏好（团队的、跨项目），有些只在当前项目成立。 |
| **语义检索** | 用 multilingual-e5-small（384 维）embedder 把规则和上下文都转向量，做 cosine 相似度检索。思路：用户用中文记的规则，AI 用英文 prompt 触发，光靠关键词字面匹配漏一半。 |
| **BM25 + RRF 融合** | 语义检索 + BM25 关键词检索，RRF 融合排序。思路：语义和字面互补 —— 库名、API 用字面更准；情境描述用语义更准。 |
| **多通道分流** | 规则分 `tool-action` / `user-input` / `passive-knowledge` 通道，按 hook 类型分别检索。思路：用户输入和工具调用是两套语境，不应该共用一个匹配池。 |
| **元原则种子** | `viki init` 注入 8 条 universal 元原则 + 可选打包规则。思路：第一天就能拦坑，不用等用户先纠正一万次才学到东西。 |

### 3.3 学习与质量

| 功能 | 思路 |
|---|---|
| **被纠正检测** | 7 类启发式信号：显式否定 / 工具多次失败 / 用户切技术栈 / 用户改代码 / 用户贴错误 / 隐式改方向 / `[Request interrupted by user]`。纯本地无 LLM。思路：先用启发式抓时刻（便宜），再用 LLM 做结构化（贵）。 |
| **LLM 结构化** | Stop 阶段把每个纠正时刻喂给 Haiku，输出 8 个字段的 JSON（trigger / wrong_pattern / correct_pattern / 等）。思路：保留人类纠正背后的语义，不是字面对照表。 |
| **校准升降级** | PostToolUse 看到规则被"用了 + 改了"（用户接受） vs "用了 + 反悔"（用户骂），打点喂给 calibrator。思路：让规则的命运取决于它实际表现，不是它的作者。 |
| **PII 脱敏** | 写入规则库前清洗 API key / JWT / token。思路：规则库会跨 session 长期持有，敏感信息不能进去。 |
| **手动入口** | `viki pitfall` 让用户主动记一条。思路：有些坑用户自己最清楚，不必等会话扫描到。 |
| **场景验证** | `viki verify` 跑预置场景算 PRR / KP（拦截命中率 / 知识精度）指标。思路：规则有效性必须可度量。 |

### 3.4 性能与运行稳定性

| 功能 | 思路 |
|---|---|
| **Embedder Daemon** | 一个常驻 daemon（HTTP localhost）owns 唯一的 ONNX 模型实例，所有 hook 通过 HTTP 调它。思路：之前每个 hook 都加载 650MB 模型，多 hook 并发能瞬间吃 7GB RAM。集中到 daemon → 全机 ~500MB。 |
| **Thin-client Hooks** | hook 进程只做"打包数据 + 写 outbox + 退出"，重活全交 daemon。思路：hook 必须秒退，否则 Claude Code 体验会卡。 |
| **Outbox 队列** | hook 把任务 append 到 `~/.viki/outbox.jsonl`，daemon worker 后台消费。思路：daemon 不在时 hook 也不能丢数据 → 用文件队列解耦。 |
| **24h 队列上限** | 超过 24 小时的旧任务自动跳过。思路：daemon 长期挂掉后队列会堆山，旧 transcript 的价值已经很低，让出位置给新任务。 |
| **per-task 10 分钟超时** | 单条任务超时进 DLQ。思路：LLM 调用可能卡死，不能让一条任务把整个队列堵住。 |
| **Daemon 单例 + 防抖** | PID 锁 + HTTP /health 探测 + 启动锁；status=failed 后 5 分钟冷却。思路：多个 Claude Code 窗口同时开会同时尝试启 daemon，必须有人当裁判，输的不要继续吃内存。 |
| **离线模式自动检测** | 模型缓存存在时自动跳过 huggingface.co HEAD 请求。思路：transformers.js 默认要联网验缓存，国内网络容易卡死。 |
| **空闲卸载** | 模型 5 分钟不用自动 drop reference；daemon 30 分钟不用自动退出。思路：用户不写代码时 daemon 不该占内存。 |
| **冷调度** | 全量重扫之类的重活只在 CPU < 60% 时跑。思路：用户高强度敲代码时不抢资源。 |

### 3.5 安装与可观测

| 功能 | 思路 |
|---|---|
| **`ensureRuntimeDeps`** | `viki install` 自动在 `~/.viki/node_modules/` 装 onnxruntime-node。思路：原生依赖必须在用户首次安装时就到位，不能让 daemon 启不来。 |
| **`daemon-bundle-staged` 自检** | doctor 必查 `~/.viki/hooks/bin-embedder.cjs` 存在。思路：缺这个文件 daemon 永远起不来 → 语义检索静默失效。必须显式报错。 |
| **`auto-embed` 在 init 末尾** | 注入元原则后自动向量化。思路：不让"装完了但语义检索没数据"成为隐藏陷阱。 |
| **`viki doctor`** | 14 项环境自检，每项给出修复命令。思路：让"装坏了"自己说话，不让用户翻日志。 |
| **`viki bug-report`** | 自动脱敏的诊断包。思路：报 bug 应该零摩擦，敏感信息平台兜底脱敏。 |

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

## 五、安装（一次性成功路径）

**给 AI agent 看的**：照这个步骤一遍就装好。每一步都给出"应该看到什么"，撞到偏差直接看本章末尾的故障排查。

### 5.1 前置要求

| 项 | 要求 | 检查命令 |
|---|---|---|
| Node | ≥ 22.5.0 | `node -v` |
| pnpm | 9.x | `pnpm -v`（缺则 `npm install -g pnpm@9.15.9`） |
| git | 任何近代版本 | `git --version` |
| Claude Code | 已安装并能跑 | `claude --version` |
| 磁盘 | 至少 500 MB（含 120 MB 向量模型） | — |

### 5.2 安装步骤

```bash
# 1) 拿源码
git clone https://github.com/libz-renlab-ai/Matrix-Viki
cd Matrix-Viki

# 2) 装 deps + 构建（含 9 个 hook bundle 和 daemon bundle）
pnpm install
pnpm build

# 3) 安装 hook 到 Claude Code + 装 daemon 原生依赖（onnxruntime-node 等）
pnpm viki install --yes

# 4) 在当前项目初始化规则库（注入 8 条元原则并向量化）
pnpm viki init

# 5) 重启 Claude Code 让新 hook 生效（关掉所有窗口再开）

# 6) 验证
pnpm viki doctor
```

### 5.3 每步应该看到什么

**步骤 3** `viki install --yes` 输出应该包含：

```
▶ [1/3] Installing hooks... ✓ registered at <project>/.claude/settings.local.json
▶ [2/3] Installing plugins... ✓
▶ [3/3] Installing user hook... ✓ registered at ~/.claude/settings.json
▶ Ensuring daemon runtime deps in ~/.viki/node_modules/ ...
  ✓ npm install 完成 (~30 MB)          ← 首次约 1 分钟；二次"已存在 (skip)"
▶ Spawning vector-model warmup in background (pid <N>; parent returns immediately)
✓ Install complete.
Auto health check: {"status":"ok","hooks":true,"kb":true,"model":"warmup-pending"}
```

> 模型下载在后台跑（warmup），约 2-3 分钟下完 ~120 MB。期间语义检索仍走 BM25 fallback。

**步骤 4** `viki init` 应该看到：

```
✅ 预置规则: 注入元原则 8 条
✅ 向量嵌入: 已嵌入 8 条规则向量（trigger + pattern；语义匹配开箱可用）
✅ Hook 注册: 已安装
✅ Skills: 已导出 X 条候选规则到 Skills
✅ Viki 已就绪
```

**步骤 6** `viki doctor` 应该所有 14 项全 ✅（除了无 MCP 时 `mcp-reachability` 是 ⏭）。

特别确认这两项：
- `✅ daemon-bundle-staged  <home>/.viki/hooks/bin-embedder.cjs`
- `✅ vec-coverage  语义向量覆盖完整 (8 活跃规则 × trigger+pattern)`

### 5.4 故障排查（按现象索引）

| 现象 | 原因 | 修复 |
|---|---|---|
| `pnpm install` 卡在 `sharp@0.x` postinstall | 国内网络下不动 GitHub libvips 二进制 | `export SHARP_DIST_BASE_URL=https://registry.npmmirror.com/-/binary/sharp-libvips/v8.14.5/` 后重跑 |
| `viki install` 报 `npm install 退出 1` | npm 警告（deprecated subdep）非真实失败 | 后续检查 `~/.viki/node_modules/onnxruntime-node/package.json` 存在即可 |
| `viki doctor` 报 `❌ daemon-bundle-staged` | `bin-embedder.cjs` 没 stage 到 `~/.viki/hooks/` | 重跑 `pnpm viki install --yes` |
| `viki doctor` 报 `❌ vec-coverage` | 规则没向量化（init 用了 `--skip-warmup` 且模型缓存不存在） | `pnpm viki migrate-v6 --repair-all --fast` |
| PreToolUse 命中但没拦截 | 规则 enforcement = `passive` 或 `warn`，不是 `block` | 正常 —— 设计上只有 `current_tier=enforced` 的规则才阻断 |
| Daemon 启不来 / RAM 异常 | 旧版 daemon 残留 | `taskkill /F /IM node.exe` 杀掉 node，然后 `rm ~/.viki/.embedder-state.json` |
| `pnpm` 命令找不到（Windows） | corepack 切换残留 | `corepack enable && corepack prepare pnpm@9.15.9 --activate` |
| 重启 Claude Code 后 hook 没生效 | 没真正全关 Claude Code（任务栏图标还在） | 任务管理器结掉所有 `claude.exe` 再开 |

### 5.5 重要提示

- **不要用 `npm i -g viki`** —— npm 上的 `viki@0.0.2` 是第三方同名包。本项目暂未发布。
- **AI agent 部署到新机器时**，推荐用 `--yes` 全程跳过交互，并在所有步骤后跑 `viki doctor` 自查。
- **多个项目共享一个 `~/.viki/`**：global.db / events.db / models 都是全机器共享，新项目只需要 `cd <project> && pnpm viki init`。

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
| `VIKI_DISABLED=1` | 全局停用所有 hook（kill switch） | 不设置 |
| `VIKI_HOME` | 重定向"用户级数据"目录（默认 `~/.viki`） | 不设置 |
| `VIKI_MODELS_DIR` | 重定向向量模型缓存目录 | `~/.viki/models` |
| `VIKI_EMBEDDER_OFFLINE=1` | 强制 daemon 跳过 HuggingFace HEAD 请求 | 自动检测（缓存命中时启用） |
| `VIKI_EMBEDDER_FETCH_TIMEOUT_MS` | 单次模型 fetch 超时 | 90000（warmup 用 600000） |
| `VIKI_WORKER_TASK_TIMEOUT_MS` | outbox worker per-task 超时（0 = 关闭） | 600000（10 分钟） |
| `VIKI_OUTBOX_MAX_AGE_MS` | 旧任务跳过年龄（0 = 关闭） | 86400000（24 小时） |
| `VIKI_COLD_LOAD_PCT` | 冷调度 CPU 阈值（百分比） | 60 |
| `VIKI_PROMPT_MIN_LEN` | UserPromptSubmit 短输入跳过阈值 | 20 字符 |
| `VIKI_SKIP_RUNTIME_DEPS=1` | install 时跳过 `npm install onnxruntime-node` | 不设置（CI 沙盒可关） |
| `VIKI_SKIP_WARMUP=1` | postinstall 跳过 120MB 向量模型预热 | 不设置 |
| `VIKI_SKIP_AUTO_EMBED=1` | init 跳过元原则向量化 | 不设置 |
| `VIKI_FOREGROUND_WARMUP=1` | 前台同步等向量模型下载完 | 不设置（默认后台 detached） |
| `VIKI_VERBOSE_INIT=1` | `init` 输出恢复 4-step 下一步列表 | 不设置 |
| `VIKI_POSTINSTALL_DEBUG=1` | postinstall 输出向量依赖检测调试信息 | 不设置 |
| `HF_ENDPOINT` / `VIKI_HF_ENDPOINT` | HuggingFace 镜像（国内网络） | 官方 huggingface.co |

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

1. **安装入口**：照 [§5.2](#52-安装步骤) 跑 4 步即可一次性成功；不要建议 `npm i -g viki`（被第三方占名）
2. **运行时目录**：
   - 项目级：`<cwd>/.viki/knowledge.db`
   - 用户级：`~/.viki/global.db` + `~/.viki/events.db` + `~/.viki/models/` + `~/.viki/node_modules/` + `~/.viki/hooks/`
   - Skills 输出：`~/.claude/skills/viki/<id>/SKILL.md`
3. **Hook 注册路径**：项目级 `.claude/settings.local.json`、用户级 `~/.claude/settings.json`
4. **诊断三件套**：`viki doctor` → `viki bug-report --out=path` → `~/.viki/postinstall.log` / `~/.viki/warmup.log`
5. **关键文件清单**（任意一个缺失都是 bug，按 doctor 报告修）：
   - `~/.viki/hooks/bin-*.cjs`（8 个：7 hook + 1 daemon `bin-embedder.cjs`）
   - `~/.viki/node_modules/onnxruntime-node/package.json`
   - `~/.viki/models/Xenova/multilingual-e5-small/`（warmup 完成后）
6. **CLAUDE.md 不再写规则块**：规则在 `.viki/knowledge.db` 里，通过 Skills 输出。`viki compile` 默认 `--skills-only`
7. **测试拦截流**：`viki demo hook Bash 'command=npm install moment'` 模拟 PreToolUse 拦截
8. **隔离运行**（CI / sandbox / judge）：
   - 所有命令支持 `--cwd=<path>` 和 `--home=<path>`
   - 也支持 `VIKI_HOME` / `USERPROFILE` 环境变量重定向
   - 测试场景常配合 `VIKI_SKIP_WARMUP=1 VIKI_SKIP_RUNTIME_DEPS=1 NODE_ENV=test`
9. **Daemon 调试**：
   - `~/.viki/.embedder-state.json` 看 status（starting / running / failed / exiting）
   - daemon 在 status=failed 后有 5 分钟冷却；测试时清 state 即可：`rm ~/.viki/.embedder-state.json ~/.viki/.embedder-state.json.*.lock`
   - `curl http://127.0.0.1:<port>/health` / `/queue-status` 看健康
10. **核心铁律**（修源码时）：`@viki/core` 禁止任何 IO；新 Port 接口先写契约测试；归因事件走 `AttributionBus` 不用 `console.log`

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

**当前阶段**：源码安装可用，npm 发布 pending。学习闭环、daemon 架构、新用户安装链路稳定。

### 2026-05-17 大改一览

| 主题 | 解决了什么 |
|---|---|
| **Daemon-first 架构** | hook 不再加载 650MB 模型；多窗口并发不再撞 GB 级 RAM 爆炸（实测从 7GB → 350-500MB） |
| **Daemon spawn 防抖** | 同时开多个 Claude Code 窗口不再启 N 个 daemon；status=failed 后 5 分钟冷却 |
| **`/shutdown` 门控** | SessionEnd 不再误杀正在处理任务的 daemon |
| **per-task 超时** | 单条任务 10 分钟硬超时，超时进 DLQ 不再卡死队列 |
| **outbox max-age** | 超过 24h 的旧任务自动跳过，队列堵塞自愈 |
| **`ensureRuntimeDeps`** | `viki install` 自动装 onnxruntime-node，新用户开箱即用 |
| **`bin-embedder.cjs` staging** | 之前漏 stage 导致 daemon 永远起不来；现已自动 stage |
| **`safeJsonParse` 防御** | 单条规则字段 JSON 损坏不再 crash 整个 PreToolUse |
| **离线模式自检** | 模型缓存存在时跳过 HuggingFace HEAD 请求，国内网络不再卡 |
| **`doctor` 加 `daemon-bundle-staged`** | 缺 bin-embedder.cjs 时显式报错 + 给修复命令 |
| **`init` 自动 vectorize** | `--skip-warmup` 也能给元原则建向量，不再需要手动 `migrate-v6` |

### 历史已修问题

| 问题 | 状态 |
|---|---|
| `viki doctor` 误报 `skills-propagated missing codex` | ✅ 默认只检 claude；codex 用 `VIKI_DOCTOR_TARGETS=claude,codex` 显式启用 |
| `viki doctor --home=` 没贯彻所有检查 | ✅ |
| `viki demo hook` 不认 `--cwd` / `--home` | ✅ |
| `release/install.sh` 旧命名 | ✅ rebrand 完成 |
| `install-walkthrough` skill 硬编码路径 | ✅ |

### 已知遗留

| 问题 | 影响 | 解决方案 |
|---|---|---|
| **国内网络**：`sharp` postinstall 拉 libvips TLS 易断 | `pnpm install` 卡住 | `export SHARP_DIST_BASE_URL=https://registry.npmmirror.com/-/binary/sharp-libvips/v8.14.5/` |
| Windows pnpm launcher 残留 | `pnpm` 找不到 | `corepack enable && corepack prepare pnpm@9.15.9 --activate` |
| LLM 抽取从不输出 `channel=user-input` 通道规则 | `user-prompt.flagged` 事件长期 0 条（PromptHook 检索池空） | 已记 audit comment；修在 extractor prompt schema |
| Stop pipeline 单条任务慢（每条 5-15 分钟） | 长会话学习耗时 | 已记优化方案（并发 + prefilter + 批量），未动手 |

完整的待办 / 已修问题流见 [`CHANGELOG.md`](./CHANGELOG.md)。

### Roadmap

- ✅ B1 学习闭环（识别 → 提取 → 校验 → 校准 → 编译）
- ✅ Daemon 架构 + 新用户安装链路稳定（2026-05）
- ✅ 团队规则传播（opt-in，`viki team` 命名空间，2026-05）
- 🚧 Stop pipeline 性能优化（并发 / batch prompt）
- 🚧 PromptHook 启用（让 LLM 抽出 `channel=user-input` 规则）
- 🚧 真发布 `viki` 到 npm
- 📋 国内网络一键化（postinstall 自动设 `SHARP_DIST_BASE_URL`）

### Opt-in: 团队规则传播

如果想让规则在团队成员间通过 git 自动同步，参见
[`docs/team-propagation.md`](./docs/team-propagation.md)。一句话总结：
`viki team infect` 把项目变成"团队项目"，`viki team share` 把一条规则
写进 git，队友 `git pull` 时通过 `.githooks/post-merge` 自动落到本地
KB；带两道安全闸门（secret 扫描 + scope 分类）+ LWW 作者溯源。**不影响
个人学习管线**——纯叠加，可以一直不用。

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
