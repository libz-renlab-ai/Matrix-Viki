# Matrix-Viki — 开发约定

本文件给 Claude Code：在 Matrix-Viki 项目内工作时遵循以下约定。

Matrix-Viki 是从团队产品 [TeamBrain](https://github.com/libz-renlab-ai/TeamBrain) 抽取的**纯个人** AI 规则助手 —— 自动从 Claude Code 会话中学习、提前拦截重复的坑。拆分设计见 `docs/superpowers/specs/2026-05-14-matrix-viki-split-design.md`。

## 架构铁律

**Functional Core, Imperative Shell + Ports & Adapters。** 依赖方向单向，反向禁止：

```
cli → adapters → core → ports → types
```

- `@viki/core` 是**纯函数核心**：禁止 `import` `node:fs` / `node:child_process` 等 IO；所有副作用走 adapters。
- 新增 Port 接口时，**先**在 `packages/ports/src/__tests__/<name>-contract.ts` 写契约测试，再写实现；任何实现都要复用同一套契约测试。
- 归因事件走 `AttributionBus`，不要直接 `console.log`。
- 包私有，不发布到 npm（`viki` 发布壳除外）。

## 包结构

| 包 | 角色 |
|---|---|
| `@viki/types` | 纯类型定义，零依赖 |
| `@viki/ports` | 端口接口 + 契约测试 |
| `@viki/core` | 纯函数学习引擎 |
| `@viki/adapters` | 命令式外壳（storage / llm / hook / embedding / ingest） |
| `@viki/cli` | `viki` 命令行 + 9 个 Claude Code hook bin |
| `viki` | 发布壳 + seed packs（`seed/packs/universal.jsonl`） |

## 常用命令

```bash
pnpm install       # 装依赖
pnpm typecheck     # tsc --noEmit，必须 0 error
pnpm test          # vitest run，全量测试
pnpm build         # pnpm -r build，构建所有包
pnpm viki <cmd>    # 本地跑 CLI（= tsx packages/cli/src/bin.ts）
```

## 改动约定

- 每个 `Write` / `Edit` 后立即按单一关注点做原子 commit。
- commit message 用 `feat: / fix: / refactor: / chore: / docs:` 前缀。
- 改完跑 `pnpm typecheck` + 相关 `pnpm test`，绿了再继续。
- 跨平台：`tar` 在不同平台行为不同（bsdtar 不支持 `--force-local`）；路径用 `node:path`，别硬编码分隔符。
