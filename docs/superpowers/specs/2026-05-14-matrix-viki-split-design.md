# Matrix-Viki 拆分设计 spec

> 日期：2026-05-14
> 源仓库：TeamBrain `origin/main @ 6f13b4c`
> 目标仓库：`Matrix-Viki`（https://github.com/libz-renlab-ai/Matrix-Viki）
> 性质：从 TeamBrain 忠实子集抽取（faithful subset extraction），不重写、不动架构

---

## 1. 目标

把 TeamBrain 的 **B1 学习引擎**（"新实例不再重复旧错"）单独抽成一个**纯个人**的规则助手 Matrix-Viki：

- 自动从用户的 Claude Code 会话中抓取"用户纠正了 AI"的时刻 → 抽成规则 → 下次要重蹈覆辙时在 PreToolUse 阶段拦截预警；
- 同时保留手动 `pitfall` 录入与规则编辑（自动为主 + 手动补充）；
- 去掉一切团队 / 视频 / 病毒传播 / 跨机同步 / A-B benchmark 的内容。

### 非目标（明确不做）

- 团队可见性 / Leader 视角（TeamBrain B2）
- 视频录制与集中存储（TeamBrain B3）
- 多人知识共享、team-share、team-transfer
- 跨机器同步（用户确认单机即可）
- M5 病毒传播 / 零配置入组
- A/B benchmark 评测
- Cursor / 其他非 Claude Code 工具集成

### 用户需求四轴（brainstorming 已确认）

| 轴 | 用户选择 |
|---|---|
| 交互模型 | 自动为主 + 手动补充（完整 B1 减团队层）|
| 集成层 | 仅 Claude Code |
| 跨机同步 | 不要，单机即可 |
| 抽分方式 | 忠实子集抽取，保留 Ports & Adapters monorepo 架构 |

---

## 2. 架构

保持 TeamBrain 的 **Functional Core, Imperative Shell + Ports & Adapters** 架构不变：

```
cli → adapters → core → ports → types
```

- 依赖方向单向，反向禁止。
- `core` 保持纯函数，禁止 import `fs` / `child_process`。
- 新增 Port 必须先写 `packages/ports/src/__tests__/*-contract.ts` 契约测试。
- 归因走 `AttributionBus`，不直接 `console.log`。

本次工作的本质 = **纯删除 + 依赖剪枝 + 改名**。不写新业务逻辑。

---

## 3. 包级决策（源仓库 12 个包）

| 包 | 决策 | 说明 |
|---|---|---|
| `@teamagent/types` | ✅ 保留 | 删除 `src/m5.ts`（病毒传播类型），其余全留 |
| `@teamagent/ports` | ✅ 保留 | 删除 `github-activity-port*.ts`、`scope-classifier-port.ts`（团队相关）；契约测试一并带走 |
| `@teamagent/core` | ✅ 保留 | 删除 `src/m5/`、`src/presence/`；`src/live-inspection/` 见 §6 triage |
| `@teamagent/adapters` | ✅ 保留 | 删除 `src/m5/`、`src/mcp/`、`src/github-activity/` |
| `@teamagent/cli` | ✅ 保留（裁剪子命令）| 见 §4 |
| `teamagent`（发布壳）| ✅ 保留 | seed packs `seed/packs/universal.jsonl`（12 条开箱避坑规则）是核心资产 |
| `packages/skills/` | ✅ 保留 | 仅含 `pitfall.md`、`teamagent-stats.md` 两个 Claude Code skill，个人相关 |
| `@teamagent/digital-twin` | ❌ 删除 | B2/B3 团队可见性 + 视频 |
| `@teamagent/benchmark` | ❌ 删除 | A/B 评测，个人场景 YAGNI |
| `@teamagent/mcp-server` | ❌ 删除 | 用户仅用 Claude Code，hook 已覆盖集成 |
| `@teamagent/portal` | ❌ 删除 | 门户 |
| `@teamagent/landing-adapter` | ❌ 删除 | 空壳契约 |

---

## 4. CLI 子命令裁剪（69 → 约 35）

### 保留的子命令
`skeleton-demo`、`demo`、`demo-hook`、`pitfall`、`stats`、`verify`、`calibrate`、`analyze`、`review`、`install`、`install-hook`、`install-user-hook`、`install-manifest`、`install-plugins`、`doctor`、`doctor-diff`、`first-run`、`pack`、`init`、`warmup`、`record`、`recent-entries`、`review-candidates`、`reclassify`、`scan-errors`、`bug-report`、`daily`、`try`、`uninstall`、`config`、`compile`、`migrate-*`、`verify-anchors`

### 保留的 hook bin
`bin-stop`、`bin-pre-tool-use`、`bin-post-tool-use`、`bin-session-start`、`bin-session-end`、`bin-pre-compact`、`bin-user-prompt-submit`、`bin-embedder`、`bin-updater`、`bin.ts`

### 删除的子命令
`bpp`、`digital-twin`、`video`、`recording`、`presence`、`inspect-member`、`m5-*`（bootstrap/delete/infect/publish/replay/share/status/sync）、`team-init`、`team-transfer`、`team-transfer-lead`、`git-sync`、`symphony`、`pair`、`docs-propagate`、`dashboard`、`compile-cursor`、`e2e-evaluate`、`pr-cycle`、`required-check`、`dogfood-report`、`ingest`（待 triage）

### 删除的 bin
`bin-digital-twin-tap`、`m5-session-hook`、`m5-default-port`

---

## 5. 跨切面取舍

| 项 | 决策 | 理由 |
|---|---|---|
| 簇 5 团队共享/同步 | ❌ 删除 | 用户选单机；`rule-importer` 底层保留（seed pack 加载用），仅删 `team-transfer*` 命令 |
| 簇 9 benchmark | ❌ 删除 | 个人场景 YAGNI |
| 簇 11 M5 病毒传播 | ❌ 删除 | 纯团队 |
| Cursor 编译器 | ❌ 删除 | 仅用 Claude Code |
| 簇 6 PII 脱敏 (`core/src/pii`) | ✅ **保留** | 文档说它只为团队导出服务，但**自动抓取的会话里会混入用户粘贴的 API key / JWT / token** —— 这是纯个人也存在的风险。体积小、零成本，在写入本地规则库前清洗。 |

---

## 6. 待 triage 的 core 子目录

17 簇 canonical 文档基线偏旧，`origin/main` 的 `packages/core/src/` 多出以下目录。**实现计划阶段每个目录花 ~30 秒确认实际依赖与用途，默认规则：名字带团队味的删，其余留。** 当前预判：

| 目录 | 文件 | 决策 |
|---|---|---|
| `success-detector` | `rule-based.ts` | ✅ 保留（避坑核心的正面信号）|
| `error-collector` | `cross-session-cluster.ts`、`error-batch-builder.ts`、`error-extraction-prompt.ts`、`signal-filter.ts` | ✅ 保留（跨会话错误聚类，个人核心）|
| `daily-summary` | `aggregator.ts`、`scanner.ts`、`rewriter.ts` 等 | ✅ 保留（`daily` 命令，个人日报）|
| `static-user-skills` | `content.ts`、`plan.ts` 等 | ✅ 保留 |
| `scenario` | `dsl.ts`、`runner.ts` | ✅ 保留（测试 harness）|
| `detect-stack` | `index.ts` | ✅ 保留（体积小）|
| `update` | `changelog-parser.ts`、`snooze.ts`、`update-state.ts` 等 | ✅ 保留，但删 `pr-creator-match.ts`（团队 PR 匹配）|
| `taste` | `commit-taste.ts`、`tech-taste.ts` | ✅ 保留（commit/tech 品味，个人向）|
| `rag` | `internet-rag.ts` | ⚠️ 倾向保留（internet RAG，可选；triage 时确认依赖体积）|
| `duck-mode` | `duckify.ts`、`translations.ts` 等 | ✅ **保留**（用户明确要求保留趣味功能）|
| `live-inspection` | `correlate.ts`、`detect-abnormal.ts`、`freeze-incident.ts`、`summarize.ts` | ⚠️ 倾向删除（异常检测 / 事件冻结，偏 B2 团队实时；triage 时确认是否有纯个人价值的子文件）|
| `presence` | `state-machine.ts` | ❌ 删除（B2 团队在线态）|

---

## 7. 顶层脚手架取舍

| 桶 | 内容 |
|---|---|
| **原样搬运** | `tsconfig.base.json`、`vitest.config.ts`、`.editorconfig`、`.npmrc`、`.githooks/` |
| **搬运 + 修改** | `package.json`、`pnpm-workspace.yaml`（删团队包）；`CLAUDE.md`、`AGENTS.md`、`.cursorrules`（去团队语境，去 Cursor 内容）；`release/install.sh`（去 m5 逻辑）；`docs/`（仅搬留存特性对应的 spec / judge / features 文档）；`.claude/skills/`、`.codex/skills/`（去团队 skill）；`fixtures/`、`tests/`（去团队相关部分）|
| **删除** | `landing/`、`apps/`、`audit/`、`docker/`、`release-prep/`、`scripts/m5-auto-demo.sh`、`.teamagent/`（团队 manifest）、`.agents/`、`.pi/`、`.gstack/`、`.judge/`（按 triage 确认）|
| **新建** | `LICENSE`、新的 `README.md`、`pnpm-lock.yaml`（重新生成）|

---

## 8. 改名（rebrand）

**全量改名**，作为实现计划中的机械步骤执行：

| 原 | 新 |
|---|---|
| `@teamagent/types` / `ports` / `core` / `adapters` / `cli` | `@viki/types` / `ports` / `core` / `adapters` / `cli` |
| CLI 命令 `teamagent` | `viki` |
| 配置目录 `~/.teamagent/` | `~/.viki/` |
| 项目内 `.teamagent/` 标记 | `.viki/` |
| `teamagent` 发布壳包 | `viki` |

理由：这是独立的个人产品，保留 `teamagent` 命名会持续误导"这是团队工具"。改名是纯机械替换，不影响逻辑。

> 注：源仓库 TeamBrain **无 LICENSE 文件**，package.json 也无 license 字段（默认 all rights reserved）。两个仓库同属 `libz-renlab-ai`，内部 fork 无授权障碍。Matrix-Viki 将新增一个 LICENSE 文件。

---

## 9. 验证策略

- judge / verify harness 跟随对应特性一起搬运（`docs/plans/<slug>/judge.md`），拆完后留存特性仍可独立验证。
- `pnpm test` 在裁剪后应全绿；删除包 / 子命令后需同步删除其单测与契约测试引用。
- `viki doctor` 应能报告 hook-registered / plugin-sync 状态（mcp-reachable 一项随 mcp-server 删除而移除）。
- 端到端：`viki skeleton-demo` 跑通最小学习闭环 record → compile → attribute。

---

## 10. 结果概览

- 17 个 canonical 簇中 **12 个存活**：簇 1（核心学习闭环）、2（自动抓取）、3（calibrator v2）、4（规则质量与匹配）、7（多工具集成 —— 仅保留 PreToolUse 拦截 + narrative scanner + AttributionBus，删 MCP server 与 Cursor 编译器）、8（doctor/install）、10（CLI 命令子集）、12（first-run）、14（seed packs）、15（pack 管理）、16（demo）、17（two-stage init）。
- 约 **40–45 / 64** 个已验证工程特性留存。
- 删除的簇：5（团队共享/同步）、9（benchmark）、11（M5 病毒传播）。
- 包：保留 6 个 + `packages/skills/`，删除 5 个。

---

## 11. 实现顺序（交给 writing-plans 细化）

1. 把 `origin/main` 的源码引入工作区（clone 或 worktree 到参考位置）。
2. 复制保留的 6 个包 + `packages/skills/` + 顶层脚手架到 Matrix-Viki。
3. 删除各包内的团队子目录 / 文件（§3、§5、§6）。
4. 裁剪 CLI 子命令与 hook bin（§4）。
5. 逐目录 triage §6 的待定项，落定 `rag` / `live-inspection`。
6. 全量改名 `teamagent` → `viki`（§8）。
7. 修改顶层脚手架，新增 `LICENSE` / `README.md`，重新生成 `pnpm-lock.yaml`。
8. 修复编译 —— 剪枝后必然有断裂的 import / 依赖引用。
9. `pnpm test` 跑绿，删除失效测试。
10. `viki skeleton-demo` 端到端验证。
