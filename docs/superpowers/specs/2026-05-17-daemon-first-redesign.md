# Daemon-First Redesign — 思路设计文档

**日期**：2026-05-17
**作者**：Zionjuer + Claude (Opus 4.7)
**起因**：`viki-session-end-hook-leak.md`（桌面）报告 hook 进程泄漏，单机 24h 累计 GB 级内存占用
**性质**：设计文档（思路层，不含实施细节）；实施计划由后续 writing-plans 产出

---

## 0. TL;DR

Matrix-Viki 现在的设计把"高频小事"和"低频大事"用同一套机制处理——每次 hook 都新拉一个进程，每个进程都自带"全套消化能力"。低频大事的进程（7.8 MB bundle，载入 ONNX + sqlite + worker_threads）跑完不能可靠退出，堆出 GB 级内存泄漏。

重设思路：让 hook 进程只当**信差**（写一行便条就退），真正的活由一个长期常驻的**工人**（扩充后的 embedder daemon）按自己的节奏做。信差和工人之间用一个 append-only 的**信箱**解耦。

预期收益：
- 重 hook bundle 从 7.8 MB → ~50 KB（156× 缩小）
- 重 hook 生命周期从 30s–9.5h → <50 ms
- daemon 稳态 RSS 从 ~500 MB → ~50 MB（模型 idle 5 分钟自动卸）
- 工具调用 CPU 下降 60-70%（轻量工具不再走完整 retriever 链）
- 内存泄漏作为一类问题被根除（hook 进程不再有可泄漏的资源）

---

## 1. 现状（思路层，事实经过代码审计验证）

### 1.1 工作的两类

Viki 在 Claude Code 会话期间持续做两类工作：

- **A. 高频小事**：用户每打一个字（UserPromptSubmit）、每点一次工具（PreToolUse / PostToolUse），都要顺手做"看有没有规则要提醒/学习"。
- **B. 低频大事**：每段对话结束（Stop）、关窗（SessionEnd）、压缩 transcript 前（PreCompact）、开窗（SessionStart）、更新（Updater），要把这段经历"消化"成新规则、更新向量、更新索引。

### 1.2 问题：A 和 B 用的是同一套机制

8 个 hook 都被实现为独立的 cjs bundle，每次触发都由 Claude Code 新拉一个 node 子进程。重 hook 把 ONNX runtime + sqlite + ingest pipeline 全打进自己的 bundle（7.8 MB）。后果：

- 每次 SessionEnd 都拉起一个 7.8 MB 重进程，载入 650 MB ONNX 模型，跑完后由于"event loop 自然清空"不可靠，进程要么慢退（30s–2min）要么彻底卡死（实测最长 9.5 小时）。
- Claude Code 多窗口短间隔触发时，重进程堆到 40-50 个并发，总占 1.8-2 GB。
- 已有的"长期常驻办公室"（embedder daemon）只承担一小块工作（向量计算）；其它重活仍在每次现搭。

### 1.3 已经有的部分（不重头做）

代码审计确认这些机制已存在，重设要**复用**而非重造：

- **embedder daemon** (`bin-embedder.ts`)：HTTP server 持有 ONNX 模型；有 /embed、/register、/shutdown、/health 四条 route；状态文件 `~/.viki/.embedder-state.json`；3 层 singleton 锁（pid + health probe + startup file lock）；idle 30 分钟自动退出。
- **HookShell**（`runHook` / `runAdvancedHook`）：标准化的 hook 生命周期（stdin parse + 资源 open/close + bus + try-finally exit 0）。所有 8 个 hook 都已迁移到这套机制。
- **scan-cursor**：transcript 增量扫描的状态文件，增量靠它推进，全量靠它清空。
- **AttributionBus + StdoutRenderer**：所有 user-visible 进度文案的统一管道。
- **DaemonFirstEmbedder**：客户端封装，先试 daemon HTTP（~5 ms），daemon 不可用时**返回零向量 + 异步 spawn daemon**（不做 in-process fallback；这是 issue #315 后的决策）。3 个轻 hook 已经在用。

### 1.4 漏洞所在

- **唯一的泄漏点**：`bin-session-end.ts` 第 163 行 `void main();` —— main resolve 不强制 exit，detached child 跑完后靠 event loop 自然清空，不可靠。`bin-stop` 已经有 `.then/.catch/exit`，所以不漏；`bin-pre-compact` 也有，所以不漏。
- **重活分布**：5 个 hook（stop / session-end / pre-compact / session-start / updater）的 bundle 仍打包 7.8 MB 的 ingest pipeline；只有 3 个轻 hook（pre-tool-use / post-tool-use / user-prompt-submit）已是 thin client。
- **daemon 没有并发上限**：突发 N 个 /embed 同时进来就并行跑 N 路 ONNX 推理，靠操作系统硬撑；leak 文档里观察到的 40 进程突发就是这种。
- **daemon 模型不卸**：启动就 load 650 MB ONNX，直到 idle 30 分钟整个 daemon 进程退出才释放；大部分时间在闲置但占内存。

---

## 2. 改造思路（七条独立思路 + 内在依赖）

### 思路 1：信差和工人分离

现在每次 hook 触发，进程既是**信差**又是**工人**。改成：hook 进程只当信差——记录一下"刚发生了 X"，然后立刻退场。真正的活由长期常驻的工人（扩充后的 daemon）按自己节奏做。

这是整套思路的核心。它把"问题"从 hook 进程里搬走——hook 进程不再加载模型、不再写数据库、不再做分析。**泄漏作为一类问题就消失了**，因为根本不存在能泄漏的资源。

### 思路 2：把"实时"分级

不是所有事都需要立刻做完。把所有工作按"用户能等多久"分三档：

- **必须立刻做的（hot path）**：决定该不该放行这次工具调用、该不该给用户注入提示。`pre-tool-use` 和 `user-prompt-submit` 的同步路径属于这档。
- **可以攒一会儿再做的（warm path）**：把这段对话消化成规则、更新向量、推 cursor。攒到 daemon 空闲时一起做。`stop` 的 12 步 pipeline 大部分属于这档。
- **可以等到系统空闲再做的（cold path）**：全量重建索引、清理过期规则、整理日志、harvest 落地、`scan-errors` 批量处理。每天一次或系统 idle 时触发。

现在的设计把所有事都塞进 hot path，所以每次都很重。重新分级后，大部分工作落到 warm / cold path。

具体哪些步骤落到 cold path（代码审计确认）：`appendHarvest`、`catchUpVectorization`、`scan-errors`、定时的 full rescan。

### 思路 3：信箱

信差写完便条就走了，工人可能正在忙别的或者根本没起。所以中间需要一个"信箱"——一个 append-only 的本地文件，谁都可以随时往里塞便条。工人按顺序读、读完了划掉（位置游标，不删行）。

信箱的关键性质：

- **append-only**：用 `O_APPEND` 原子写，多个 hook 进程并发追加不会乱。
- **持久化**：daemon 挂了重启起来，没读完的便条还在。
- **解耦**：信差永远秒回（写一行文件 + 一个 best-effort HTTP POST 通知 daemon 醒），工人按自己节奏消化。
- **吸收突发**：高峰期（多窗口同时关闭）便条会堆几条，工人慢慢消化，**不会触发"40 个进程同时跑"**。

信箱的位置：`~/.viki/outbox.jsonl`；游标文件：`~/.viki/outbox-cursor`。

### 思路 4：让常驻工人会"打盹"

现有的 daemon 启动就把 650 MB 模型扛在身上一直不放。其实大部分时间它在闲着。

改成：工人闲超过 5 分钟，就把"工具"（ONNX 模型）放下；下次来活再现拿。代价是闲了之后来第一单要等 3 秒，好处是平时只占 ~50 MB 而不是 ~500 MB。

对一个个人开发者机器（Matrix-Viki 定位）这笔账划算。如果以后服务化部署，这条可以反过来配置。

### 思路 5：少喊工人来

很多 hook 现在是无差别触发的——读文件也喊一次、敲个"嗯"也喊一次、连关 5 个窗口喊 5 次。按"信号强度"过滤：

- **工具白名单**：`pre-tool-use` / `post-tool-use` 只对真的会改东西的操作（Bash / Edit / Write / NotebookEdit / MultiEdit）走完整 retriever；Read / Glob / Grep / WebFetch 直接 fast-allow。
- **短输入门槛**：`user-prompt-submit` 在 `prompt.trim().length < 20` 时跳过检索（"继续"、"嗯"这类）。
- **合并去重**：信箱端做去重——同一 session_id 的 session-end / stop 在 30 秒内的多次触发合并成一次。

这条不依赖前面任何思路，单独做就有效，但和思路 3 配合最自然（"合并"由工人端做，比信差端做容易很多）。

### 思路 6：从"全量重做"换成"增量 + 抽查"

现在每次大事都从头扫一遍整段对话历史"以防漏行"。但对话历史是只增不改的，根本不存在前面行变了的可能性。

改成：

- 平时 session-end / pre-compact 只跑增量（用 cursor）；
- 随机抽 10 行已索引行核对一下索引是否对得上（轻量校验）；
- 万一对不上，自动升级到 full rescan（自愈）；
- 兜底：每 24 小时由 cold path 主动触发一次 full rescan。

把"每次都过度防御"换成"平时省、出问题自愈、每天兜底一次"。

### 思路 7：先单独修一个最小止血点

上面 6 条都是架构层的，需要 1 周左右。但泄漏本身有一个**一行代码的根因**：`bin-session-end.ts:163` 的 `void main();` 不强制 exit。

不管后面的架构怎么改，先把这一行单独修了（改成 `.then(()=>process.exit(0)).catch(...)` + 15s watchdog）。半天的事，立刻消灭 GB 级内存问题。其它改造可以慢慢推。

---

## 3. 内在逻辑

```
思路 7（一行修复）           →  立刻止血
思路 1（信差/工人分离）       →  根除"问题在 hook 进程里发生"的可能性
  └─ 思路 3（信箱）            →  信差和工人之间的解耦机制
思路 2（实时分级）            →  界定"工人该多急地干哪些活"
  └─ 思路 6（增量+抽查）       →  把"大事"降维成"小事"
思路 4（工人打盹）            →  常驻成本压到最低
思路 5（少喊工人）            →  从源头减少触发
```

**最小可上线增量**：思路 7。
**最小有意义增量**：思路 7 + 思路 1（含 3）。
**全做完**：Viki 从"几十进程 + 2 GB 内存 + 卡顿"变成"1 个常驻 + 50 MB + 无感"。

---

## 4. 改造范围与非目标

### 4.1 改造范围

- 把 5 个重 hook（stop / session-end / pre-compact / session-start / updater）改成 thin client，bundle 大幅缩小。
- 扩充 embedder daemon：新增持久化信箱、worker 队列、cold scheduler、模型 idle unload、并发上限。
- 降低 3 个轻 hook 的触发频率（工具白名单、短输入门槛）。
- session-end / pre-compact 从 full rescan 改为 incremental + 抽查 + cold 兜底。
- 修复 `bin-session-end.ts` 的兜底 exit（思路 7）。

### 4.2 非目标（这次不做，留给后续）

- 算法层优化（BM25 粗筛、向量量化、ONNX 模型替换）——影响测试覆盖面太广，单独做。
- daemon 重命名 / 重新组织（仍叫 embedder，虽然以后职责扩了）——重命名的迁移成本不值。
- 跨机器 / 服务化部署——Matrix-Viki 定位是个人本地工具。
- 把 daemon 拆成 embedder + rescan 两个进程——复杂度翻倍，单 daemon 已足够。

### 4.3 兼容性

- 信箱文件 `outbox.jsonl` 是新增的，旧版本读不到不影响。
- daemon 新增 route（/enqueue 等）走"老 daemon 不响应就 fallback 到本地 append"路径，平滑迁移。
- DaemonFirstEmbedder 的"daemon 不可用返回零向量"既有行为保留，新设计不破坏。

---

## 5. 风险与缓解

| 风险 | 缓解 |
|---|---|
| daemon 长期挂掉，信箱堆积无人消化 | doctor 命令检测 outbox 长度 + 最老条目年龄；超过阈值告警；提供"强制 spawn daemon"的修复命令 |
| 信箱文件损坏（坏块、被外部进程改） | 每行独立 JSON，解析失败的行写入 outbox-dlq.jsonl，继续读下一行 |
| 模型 idle unload 后冷启动延迟 | 仅在 daemon 已空闲 5 分钟时 unload；hot path（pre-tool-use 等）不依赖模型加载（轻 hook 走 daemon HTTP，daemon 自己处理冷启动）；cold path 接受 3-4s 冷启动罚单 |
| daemon 重启时 in-flight 任务丢失 | 信箱游标只在任务**完全完成 + 副作用持久化**后才推进；崩溃时从上次游标重做最多一条 |
| 多个 Claude Code 实例同时拉起多个 daemon | 现有 3 层锁（pid + health + startup）已防御；不改 |
| 兜底 full rescan 24h 跑一次过慢 | cold scheduler 检测系统负载 < 30% 才跑；用户主动 `viki rescan --full` 可触发即时执行 |

---

## 6. 验收标准

落地后通过以下检查算成功：

1. **泄漏指标**：连续运行 48 小时后，`Get-CimInstance Win32_Process` 中 `bin-session-end` 进程数稳定 ≤ 2，总占用 < 200 MB。
2. **bundle 体积**：`packages/cli/dist/bin-{stop,session-end,pre-compact,session-start,updater}.cjs` 全部 < 100 KB。
3. **稳态 RSS**：daemon 模型 unload 后（最后一次 /embed 之后 5 分钟以上，daemon 进程仍未触发 idle-exit 的窗口）`Get-Process | Where Name=node` 的总 RSS < 100 MB。注意区分两个 idle：模型 idle（5 分钟卸模型，daemon 不退）vs daemon idle（30 分钟 + members 空，daemon 自己退）。
4. **延迟回归**：`pre-tool-use` p99 延迟保持在 80 ms 以下；`session-end` foreground 路径 p99 延迟保持在 50 ms 以下。
5. **功能完整**：现有 viki 测试套件全绿；规则学习闭环（产出新规则 / cursor 推进 / 向量索引更新）端到端通过。
6. **泄漏类测试**：新增一个长期跑的 stress test（连续 100 次 SessionEnd，验证进程不堆积、内存不增长）。

---

## 7. 实施顺序（粗略，由 writing-plans 细化）

| 序号 | 思路 | 依赖 | 大概工作量 |
|---|---|---|---|
| **阶段 0** | 思路 7（兜底 exit + watchdog）| 无 | 半天 |
| **阶段 1** | 思路 1 + 3（daemon outbox + worker）| 阶段 0 | 1.5 天 |
| **阶段 2** | 思路 1 落地（5 个重 hook 变 thin client）| 阶段 1 | 1 天 |
| **阶段 3** | 思路 6（增量 + 抽查替代 full）| 阶段 2 | 半天 |
| **阶段 4** | 思路 4（模型 idle unload）| 阶段 1 | 半天 |
| **阶段 5** | 思路 5（触发频率降低）| 独立 | 半天 |
| **阶段 6** | daemon 并发上限 + cold scheduler | 阶段 1 | 1 天 |

总计：约 5 天实施 + 2 天测试 = ~1 周一人。

阶段 0 可独立 ship，无依赖。其他阶段按列出顺序。

---

## 8. 待回答的开放问题

设计层有几个问题尚未拍板，留给实施 plan 阶段决定：

1. **信箱格式**：每行 JSON 行 vs 用 sqlite 表？倾向 JSON 行（简单、append-only、易调试），但需要确认 worker 端读性能。
2. **daemon 升级时怎么处理 in-flight 信箱**：新 daemon 起来读旧 daemon 留下的信箱是否兼容？需要在信箱条目里加 schema_version。
3. **cold scheduler 怎么测系统负载**：跨平台（Windows wmic vs macOS/Linux loadavg）的统一抽象。
4. **doctor 命令是否新增 outbox 健康检查**：值得加（提供"信箱堆积"早期信号）。

这些不影响整体思路，但实施时要逐个澄清。

---

## 9. 关联文档

- 起因：`viki-session-end-hook-leak.md`（用户桌面，未入库）
- 上一轮架构基线：`docs/superpowers/specs/2026-05-14-matrix-viki-split-design.md`
- HookShell 迁移：`docs/plans/2026-05-07-hookshell-attribution-fused-plan.md`
- 内存爆炸前因：embedder daemon 设计源于 issue #164、issue #315
- CLAUDE.md 架构铁律（functional core, imperative shell + ports & adapters）—— 本次重设不破坏这条铁律：daemon 是 adapter；信箱协议在 ports；worker 调度在 core。
