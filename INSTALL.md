---
date: 2026-05-15
audience: end-user + contributor
schema-version: 2
---

```text
  git clone https://github.com/libz-renlab-ai/Matrix-Viki
      |
      v
  pnpm install        <-- 下载依赖（~30–60s）；末尾会看到
      |                   "源码安装：dist/ 还没构建，跳过 postinstall"
      v                   ← 这是正常的，不是失败
  pnpm build          <-- 编译 + 9 个 Claude Code hook bundle（~30s）
      |
      v
  pnpm viki init      <-- 注册 hook + 注入种子规则 + 后台预热向量模型
      |
      v
  重启 Claude Code    <-- 完整关窗口重开，hook 在新会话才挂上
      |
      v
  pnpm viki doctor    <-- 验证；看到 skills-propagated/codex 红 X 但你不用 codex 的话忽略
      |
      v
    done — 打开任何项目，AI 犯老错时 Viki 会预警
```

# INSTALL.md — Matrix-Viki 安装指南

> 本文同时被 **installer 脚本** 与 **AI 安装向导** 读取，是 4-step 流程的唯一来源。
> 修改下面 `yaml install-step` 块，向导与脚本会自动同步。

**前置要求**：
- Node ≥ 22.5.0（`node -v` 验证）
- pnpm 9.x（`npm install -g pnpm@9.15.9` 装；版本与 `package.json:packageManager` 字段对齐）
- Claude Code 已安装（hook 要挂在它上面）

**当前发布状态**：

| 路径 | 状态 |
|---|---|
| `git clone` + 源码构建 | ✅ 可用（本文主路径） |
| `bash scripts/bootstrap.sh` | ✅ 可用（封装了下面 3 步） |
| `curl ... release/install.sh \| bash` | ⚠️ 脚本内部仍是 TeamBrain 命名（`teamagent` / `.teamagent/`），未完成 rebrand |
| `npm install -g viki` | ❌ 不可用 — npm 上的 `viki@0.0.2` 是第三方同名包，不是 Matrix-Viki |

---

## 推荐路径：源码安装（V1=1, contributors & end-users 通用）

打开终端，复制粘贴以下命令：

```bash
git clone https://github.com/libz-renlab-ai/Matrix-Viki
cd Matrix-Viki
bash scripts/bootstrap.sh
```

`bootstrap.sh` 等价于 `pnpm install && pnpm build && pnpm viki init`，一次 Bash 调用搞定（适合 Claude Code 严格权限模式）。

`bootstrap.sh` 支持的 flag：
- `--preview` — 只看 5 段清单不装
- `--skip-vector-model` — opt-out 120MB 向量模型预热
- `--skip-init` — 装但不自动跑 `viki init`

装完按下面"装完之后"段做验证。

---

## 手动 3 步（想分别看每步输出的开发者）

下面 3 步 YAML schema 是给 AI 向导 / installer 解析用的。每个 `yaml install-step` 块字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | 字符串 | 步骤唯一标识 |
| `command` | 字符串 | 终端命令（可直接复制粘贴） |
| `explanation` | 字符串 | 中文白话解释 |
| `progress` | 字符串 | `"i/N"`，如 `"1/3"` |
| `common_errors` | 列表 | 每项 `pattern`（错误关键词正则）+ `fix`（修复命令） |

```yaml install-step
id: step-1
command: pnpm install
explanation: |
  下载所有依赖。首次约 30–60 秒，看到 "Done in Xs" 即成功。
  末尾会看到 "ℹ️  源码安装：dist/ 还没构建，跳过 postinstall（这是正常的）"，
  不要慌——postinstall 是给 `npm i -g viki` 发布壳用的，源码模式下不该跑。
progress: "1/3"
common_errors:
  - pattern: "command not found.*pnpm|pnpm.*not found|pnpm: No such file"
    fix: "npm install -g pnpm@9.15.9"
  - pattern: "EACCES|permission denied|access denied"
    fix: "sudo chown -R $(whoami) ~/.npm && pnpm install"
  - pattern: "ETIMEDOUT|network timeout|ECONNRESET|ENOTFOUND"
    fix: "pnpm install --prefer-offline   # 或见'踩坑清单 b' 走镜像源"
```

```yaml install-step
id: step-2
command: pnpm build
explanation: |
  把源码编译成可执行 + 生成 9 个 Claude Code hook bundle（CJS, ~30s）。
  没有这一步, `pnpm viki init` 会报 "Hook bundle not found"。
  执行完看到 "Build success in Xms" 即成功。
progress: "2/3"
common_errors:
  - pattern: "Cannot find module|Module not found|ERR_MODULE_NOT_FOUND"
    fix: "pnpm install && pnpm build"
  - pattern: "error TS|TypeScript.*error|Type error"
    fix: "pnpm typecheck 2>&1 | head -40"
  - pattern: "ENOMEM|JavaScript heap out of memory|out of memory"
    fix: "NODE_OPTIONS=--max-old-space-size=4096 pnpm build"
```

```yaml install-step
id: step-3
command: pnpm viki init
explanation: |
  把 Viki 正式装到这台机器：
    · 创建 .viki/ 目录 + 初始化知识库
    · 注入元原则（8 条） + 打包规则（约 58 条）
    · 注册 PreToolUse hook 到项目级 .claude/settings.local.json
      + 用户级 ~/.claude/settings.json (issue #161 viral install)
    · 导出 Skills 到 ~/.claude/skills/viki/
    · 后台预热向量模型（约 120MB，~10 分钟静默完成）

  ⚠ **执行完必须完整关窗口重开 Claude Code**（不是 /clear），新会话才挂上 hook。
  跳过这一步 → hook 不生效 → AI 犯老错时不会预警。

  规则库是**全局共享**的：一次 init，所有项目共用同一份规则。
progress: "3/3"
common_errors:
  - pattern: "Hook bundle not found|bin-pre-tool-use\\.cjs"
    fix: "pnpm --filter @viki/cli build:hook && pnpm viki init"
  - pattern: "EACCES|permission denied.*\\.claude"
    fix: "chmod -R u+rw .claude/ && pnpm viki init"
  - pattern: "warmup.*failed|onnxruntime|model.*download"
    fix: "pnpm viki init --skip-warmup    # 先装 hook, 向量模型晚点热"
  - pattern: "嵌套项目守卫|nested.*viki|already has .viki"
    fix: "cd 到祖先项目，或加 --force-nested-init 创建独立子项目"
```

---

## 装完之后

```bash
pnpm viki try            # 30 秒一键演示 5 个经典拦截场景（推荐首次入口）
pnpm viki stats          # 看规则库内容（应看到 66 条左右）
pnpm viki pitfall        # 交互记一条踩坑经验
pnpm viki doctor         # 环境自检
pnpm viki --help         # 完整命令列表
```

全局安装（让任何项目都能直接 `viki ...` 而不必前缀 `pnpm`）：

```bash
# 进入 packages/viki 后用 npm link 把 dist/bin.js 软链到全局 PATH
cd packages/viki
npm link
viki --version           # 验证全局可用
```

---

## 踩坑清单

### a) `pnpm: command not found`

```bash
npm install -g pnpm@9.15.9    # 锁版本与 package.json:packageManager 一致
```

### b) 中国大陆网络 — `pnpm install` 卡死 / `sharp` / `vips` 超时

走镜像源，**只用临时环境变量**，不要动 `~/.npmrc`（污染全局会影响别的项目）：

```bash
npm_config_registry=https://registry.npmmirror.com \
npm_config_sharp_libvips_binary_host=https://npmmirror.com/mirrors/sharp-libvips \
npm_config_sharp_binary_host=https://npmmirror.com/mirrors/sharp \
pnpm install
```

Windows PowerShell：

```powershell
$env:npm_config_registry = 'https://registry.npmmirror.com'
$env:npm_config_sharp_libvips_binary_host = 'https://npmmirror.com/mirrors/sharp-libvips'
$env:npm_config_sharp_binary_host = 'https://npmmirror.com/mirrors/sharp'
pnpm install
Remove-Item Env:npm_config_registry, Env:npm_config_sharp_libvips_binary_host, Env:npm_config_sharp_binary_host
```

### c) `pnpm viki init` 报 `Hook bundle not found`

hook bundle 没 build 出来：

```bash
pnpm --filter @viki/cli build:hook
pnpm viki init
```

### d) 装完没数据 / hook 不触发？先**彻底重启 Claude Code**

PreToolUse / Stop / SessionStart hook 是在 Claude Code **下次启动**时挂上的。`pnpm viki init` 之后必须**关窗口重开**（不是 `/clear`），hook 才生效。

### e) `viki doctor` 报 `❌ skills-propagated ... missing duck/codex, grill-me/codex`

已知 cosmetic bug：默认 `--target=claude` 时不该把 codex 变体 skill 缺失算 fail。如果你不用 codex，忽略它（其他检查全绿就 OK）。

### f) `viki doctor` 显示 `~/.viki` 路径而非 `--home=` 指定的沙盒路径

已知 bug：doctor 的 `home-dir` / `plugin-sync` 检查没贯彻 `--home=` flag，会读真实 home。如果你在做 CI / judge 隔离测试要绕开。

---

## 卸载

```bash
pnpm viki uninstall                # 移除 hook 注册 + 清 CLAUDE.md 区块；保留数据
pnpm viki uninstall --delete-data  # 同时删 .viki/ 知识库
pnpm viki uninstall --dry-run      # 预览要删哪些文件
```

临时停用（不卸载，保留数据）：

```bash
pnpm viki disable                  # 临时禁用 hook
pnpm viki enable                   # 重新启用
```

---

## 升级

```bash
cd Matrix-Viki
git pull
pnpm install
pnpm build
pnpm viki doctor
```

knowledge.db schema 升级会通过 `viki migrate-v6` / `viki migrate-v7` 自动跑（如有必要）；手动触发见 `pnpm viki --help`。

---

## 遇到没见过的报错

1. 把终端**完整的报错文字**复制下来（不要省略堆栈）
2. 在 Claude Code 里问：`我在执行 pnpm install / pnpm build / pnpm viki init 时遇到了以下报错：<粘贴>`
3. 或者直接提 issue：https://github.com/libz-renlab-ai/Matrix-Viki/issues/new
4. 附诊断报告（自动脱敏）：`pnpm viki bug-report --out=/tmp/viki-bug.md`
