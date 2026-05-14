# Matrix-Viki

**个人 AI 规则助手** —— 自动从你的 Claude Code 会话中学习，让你和 AI 不再重复踩同一个坑。

Viki 挂在你的 Claude Code hook 上：当你纠正 AI 的某个做法时，它自动把这次纠正抽成一条规则；下次你或 AI 要重蹈覆辙时，它在 `PreToolUse` 阶段拦截并预警。你也可以随时手动记录踩过的坑。

> Matrix-Viki 是从团队产品 [TeamBrain](https://github.com/libz-renlab-ai/TeamBrain) 抽取的**纯个人**子集 —— 去掉了团队可见性、视频录制、病毒传播、跨机同步、A/B 评测等所有团队向功能，只保留 B1「学习引擎」。拆分设计见 `docs/superpowers/specs/2026-05-14-matrix-viki-split-design.md`。

## 核心能力

- **自动抓取** —— 每个 Claude Code 会话结束（Stop hook）自动检测「你纠正了 AI」的时刻，抽成规则。
- **提前拦截** —— `PreToolUse` 阶段匹配规则，在你/AI 要重犯之前预警。
- **手动记录** —— `viki pitfall` 主动记录踩过的坑。
- **置信度校准** —— 规则随有用/无用信号自动升降权，陈旧规则自动降级。
- **开箱即用** —— 内置 12 条跨语言通用避坑规则（seed pack）。
- **PII 脱敏** —— 写入本地规则库前清洗 API key / JWT / token 等敏感信息。

## 架构

Functional Core, Imperative Shell + Ports & Adapters，单向依赖 `cli → adapters → core → ports → types`：

| 包 | 角色 |
|---|---|
| `@viki/types` | 纯类型定义 |
| `@viki/ports` | 端口接口 + 契约测试 |
| `@viki/core` | 纯函数学习引擎（禁止 IO） |
| `@viki/adapters` | 命令式外壳（storage / llm / hook / embedding） |
| `@viki/cli` | `viki` 命令行 + Claude Code hook bin |
| `viki` | 发布壳 + seed packs |

## 安装

需要 Node ≥ 22 和 pnpm。

```bash
pnpm install
pnpm build
```

## 常用命令

```bash
viki init             # 初始化规则库（全局单次，所有项目共享）
viki install-hook     # 注册 Claude Code hook
viki doctor           # 检查 hook / 插件安装状态
viki skeleton-demo    # 跑一遍最小学习闭环 demo
viki pitfall          # 手动记录一个踩过的坑
viki stats            # 看规则库学了多少经验
viki --help           # 完整命令列表
```

## 开发

```bash
pnpm typecheck        # 类型检查
pnpm test             # 跑测试
pnpm build            # 构建所有包
```

## License

MIT —— 见 [LICENSE](./LICENSE)。
