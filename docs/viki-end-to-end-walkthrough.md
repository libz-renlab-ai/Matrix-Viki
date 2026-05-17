# Viki 全流程思路汇总

> **本文档定位**：完整、详细、不含技术细节的产品 + 设计思路说明。
>
> **生成于**：2026-05-17，stage 0-6 daemon-first 重设全部落地之后。
>
> **特别说明**："优化思路"段落里写的所有 hook 体积、CPU 节省、idle unload 等都是**已落地代码**——本次 7 阶段重设里实际跑通的实现，不是计划。

---

## 一、Viki 是什么

它是一个"看着你写代码、悄悄记下你踩过的坑、下次提前提醒你"的小助手。

它不参与你的代码，不参与你的思考。它只在你和 Claude Code 对话的过程中**旁观**——看你被纠正了什么、看你又重复犯了什么、看你认可了什么做法——然后默默把这些总结成规则，下次同类情况出现时，把规则提前塞到 Claude 面前提醒它。

整个流程可以拆成几个环节：**安装、激活、触发、被纠正瞬间识别、学习、调分、编译对外、辅助功能**。每个环节都有自己的思路，环节之间靠几条不变的"通道"串起来。

---

## 二、安装

### 思路：不在你的电脑上留隐性状态

Viki 装到电脑上时做三件事，**每件事都是看得见、可撤销的**：

1. **建一个家**：在你的用户目录下建一个叫 `.viki` 的文件夹。这是 Viki 自己的家，里面是它的知识库（sqlite 数据库）、日志、临时信箱、状态文件。你的项目目录不被污染。

2. **跟 Claude Code 握手**：往 Claude Code 的配置里加几行——"以后发生这八种事件时，请通知一下 Viki"。这八种事件是：开窗（SessionStart）、关窗（SessionEnd）、用户输入（UserPromptSubmit）、Claude 准备用工具前（PreToolUse）、用了工具之后（PostToolUse）、Claude 说完一段（Stop）、即将压缩对话（PreCompact）、版本检查（updater）。这些通知在 Claude Code 里叫 hook（钩子）。

3. **下一个 AI 模型**：Viki 的"理解力"靠一个 100 MB 左右的小型语言模型（不是大模型，只用来把"文字"转成"数字向量"，方便比较相似度）。这个模型在后台慢慢下载，不挡你装完后立刻用。下载完成后写一个"sticky last-success marker"，避免重复下载。

安装的设计原则是：**装完之后你可以正常用电脑、正常写代码，Viki 在你完全不知情的情况下开始工作**。

### 思路：分层的"金库"

第一次在某个项目里用 Claude Code，Viki 会在该项目根目录建一个 `.viki/` 子目录，里面只放跟**这个项目**有关的规则。换项目不混淆——你在 Python 项目里学到的"别忘了 venv"不会冒到 Rust 项目里。

但**通用规则**（比如"提交前先 typecheck"）会自动放进**用户家**——所有项目都能看到。

进一步还有**团队层**（如果配了团队同步），所有团队成员共享。

层与层之间靠"晋升"机制——一条规则在单个项目里证实多次才"晋升"到用户层；用户层证实多次才到团队层。

### 思路：种子规则集（seed packs）

装完空数据库不好用。Viki 自带一套"通用 pack"——`seed/packs/universal.jsonl`——里面是预制的通用规则（"测试用例命名清晰"、"避免裸 except"等几十条）。装完立刻有得用，不必从零累积。

Pack 这个概念可扩展——以后可以有 "frontend pack"、"python pack"、"security pack" 等主题包，按需装载。

### 思路：可干净卸载

`viki uninstall` 把 Viki 添加到 Claude Code 配置的部分干净拆掉，删除 `.viki/` 目录。不留残留。

---

## 三、激活：daemon 起来

### 思路：一个常驻员工，所有跑腿临时工

电脑开机后，Viki 表面上没占资源。直到你第一次开 Claude Code——这一刻发生两件事：

1. **Claude Code 触发 SessionStart hook**——通知 Viki"开窗了"。Viki 的临时工（hook 程序）跑起来，做一件事就退场。
2. **临时工启动 daemon**——一个长生命周期的程序（叫 embedder daemon）被悄悄拉起来在后台。

**为什么要有 daemon？** 因为后面所有"理解文字"的活儿都要靠那个 100 MB 模型，每次现加载要 3-4 秒、占用 500 MB 内存。daemon 把模型一次性加载好，常驻在后台，谁需要谁来 HTTP 调用一下。

**daemon 不工作时会"打盹"**——空闲 5 分钟自动把模型从内存里卸掉，常驻内存从 500 MB 降到 50 MB。下次有活再 3-4 秒重新加载。算清这笔账：你的机器不会 24 小时被它占着大头内存。**这个功能已落地（stage 4）。**

**daemon 还会监控自己**——空闲 30 分钟整个进程自己退场。下次有事再起来。

**daemon 防多开**——三层锁机制（pid 锁 / health 探测 / 启动文件锁）确保同时只有一个 daemon 在跑。多开 Claude Code 窗口时也不会有 N 个 daemon。

### 思路：daemon 是"工人"，hook 是"信差"

这是整个系统的核心比喻。

- **临时工（hook）**：Claude Code 每发生一件事就拉一个临时工出来。临时工很轻（最重的也只有 200 KB），身上不带模型不带数据库。他只做两件事：把刚发生的事记录在一张便条上，扔到信箱里；然后立刻退场。
- **常驻工（daemon）**：信箱里的便条由这个常驻工慢慢消化。他带着工具（模型 + 数据库），可以做重活。

**信差永远秒退**——所以不会内存泄漏。
**工人按自己节奏干活**——所以不会因为信差催就跑歪。
**信箱保留所有便条**——所以工人就算挂了重启，便条都还在，不会丢工作。

### 思路：daemon 不可达时也要能干活

最关键的设计：如果 daemon 暂时没起来，临时工不会失败——他直接把便条塞到本地信箱文件（`~/.viki/outbox.jsonl`），然后 spawn 一个 daemon 起来。daemon 起来后从信箱里读未处理的便条接着干。

整个系统在 daemon 离线时也是 best-effort 的——可能延迟，但不丢数据。

---

## 四、触发：规则什么时候被用上

### 思路：分三种触发点，每种用在不同时机

**触发点 1：用户输入时（UserPromptSubmit）**

你打了一段话按回车——这一刻 Viki 临时工被拉起来。他做的事是：

把你这段话转成数字向量（通过 daemon HTTP），到知识库里搜"跟这段话最像的几条规则"，然后把这些规则的内容塞回去给 Claude 看。等于在 Claude 真正看到你的话之前，Viki 先在 Claude 耳边说："这哥们以前在类似情况下走过这些弯路，你注意一下"。

**优化（已落地，stage 5）**：你的话如果短于 20 个字符（"继续"、"嗯"、"OK"）就直接跳过——这种话没有语义价值，搜出来的规则也是噪音。可调：`VIKI_PROMPT_MIN_LEN=0` 禁用此门槛。

**触发点 2：Claude 要用工具时（PreToolUse）**

Claude 决定执行某个动作之前（写文件、跑命令、改代码），Viki 临时工被拉起来检查："这个动作有没有匹配到任何'禁止'类规则？"

如果匹配到了，Viki 可以**否决**这次工具调用（permissionDecision: "deny"），或者**警告**让 Claude 自己判断要不要继续（"allow" with system message）。

**优化（已落地，stage 5）**：只对**会改东西的工具**（Bash / Edit / Write / MultiEdit / NotebookEdit）做检查；读文件、搜代码、看网页这些只读工具直接放行——它们不会破坏什么，没必要拦截。这一改省了 60-70% 的 CPU。可调：`VIKI_PRETOOL_ALL=1` 关闭白名单。

**Pre-tool-use 还有一个 fallback**：如果模型还没下载好（warmup state != "ready"），它会**降级到 legacy keyword matcher**——纯字符串匹配，不需要模型。功能不全但能用。

**触发点 3：Claude 用完工具之后（PostToolUse）**

工具跑完了，Viki 记一笔流水账："Claude 在 X 时刻用了 Y 工具，做了 Z 操作"。这流水账后面用于"复盘"——看 Claude 这次的操作有没有触发新规则、有没有违反已有规则。

**优化（已落地，stage 5）**：同样只记可变更类工具的流水。读操作不入账。可调：`VIKI_POSTTOOL_ALL=1` 关闭白名单。

### 思路：触发不是为了"管"，而是为了"提醒"

Viki 的规则**绝大多数是建议性的**，不是禁止性的。它的工作不是当警察拦截 Claude，而是当老朋友提醒——"以前你在这种场景吃过亏哦"。Claude 看到提醒后自己决定要不要听。

只有少数明确标记为"硬规则"的（比如"绝对不要 rm -rf /"）才真的拦截。绝大部分是软规则。

### 思路：三层并行检索

每次触发都会同时查三个数据库：

1. **项目层**（`<repo>/.viki/knowledge.db`）—— 只这个项目相关的规则
2. **用户层**（`~/.viki/knowledge.db`）—— 跨项目通用的规则
3. **工具层**（专门为 PreToolUse 调用准备的索引）—— 按工具名 + 工具参数模式匹配

三层的结果合并后排序、去重，最后注入。这套叫 "三层 retriever"。

---

## 五、"被纠正的瞬间"完整原理

这是整个 Viki 的核心。**规则的所有原料都来自这里**。

### 5.1 为什么是"被纠正"，不是用户主动写规则

主动写规则的工具早就有了（CLAUDE.md、AGENTS.md、.cursorrules）。但 90% 的人不会真的去写、写了不维护、规则会过期。

Viki 的赌注是：**人会忘了规则，但人不会忘了在 Claude 出错时纠正它**。如果能从纠正瞬间自动抓规则，就绕开了"主动写"这个高摩擦动作。

### 5.2 "被纠正"的六种典型形态

Viki 从 Claude Code 的 transcript（每段对话被记录在一个 `.jsonl` 文件里，每行一条消息）里扫描这六种形态：

**形态 A：用户消息中的否定语**

Claude 说完话后，用户的下一条消息里出现：
- 否定词："不对"、"错了"、"别"、"不要"、"不应该"
- 修正词："应该"、"换成"、"改成"、"用 ... 替代"
- 责问词："为什么用 X？"、"X 不行吗？"

如果用户消息以这些词开头或主要由这些词构成，Viki 把"Claude 上一条消息" + "用户这条纠正"配成一对，标记为 correction 候选。

**形态 B：用户拒绝了工具调用**

Claude 准备用工具，弹出 approve/deny。用户点了 deny。这就是最干脆的 correction 信号——直接、明确、无歧义。

Viki 抓到这个事件后，把"Claude 准备做的事 + Claude 给的理由"当作"错的方案"，把"用户拒绝"当作硬负反馈。如果用户接下来又用别的工具完成了任务，那个新工具就是"对的方案"。

**形态 C：用户中途打断**

Claude 在工具调用中、或正在长输出中，用户按 ESC 打断。这是"用户已经看出 Claude 走偏"的强信号。Viki 把"被打断的那段"标记为 correction 候选。

**形态 D：Claude 自己道歉**

Claude 的下一条消息开头出现"抱歉"、"我搞错了"、"让我换一种方式"、"重新尝试"——这是 Claude 自己承认前一步有问题。Viki 把"被道歉的那一步" + "新的尝试"配成一对。

注意 Claude 道歉有时候不是因为做错——可能只是社交润滑。所以这种信号是弱的，必须和其他信号配对（比如 Claude 道歉 + 接下来换了方案）才计入。

**形态 E：Claude 自己换方案**

上一轮 Claude 做了 A，下一轮没有显式原因就改成 B，且 A 和 B 在功能槽位上是替代关系（比如都是 Bash 命令、都是 Edit 同一文件）。这是隐式的 self-correction——往往是工具报错了 Claude 自己看了报错改了思路。

**形态 F：用户复述需求**

用户在多轮对话里反复说同一件事（"我说过要用 yarn 不是 npm"、"再说一次：这个文件不要动"）。复述本身就是"Claude 之前没听懂"的信号。Viki 检测复述模式（用户输入相似度高的句子在窗口期内多次出现），把"Claude 在两次复述之间做的所有事"标记为 correction 候选。

### 5.3 配对：从瞬间到规则原料

每个 correction 候选包含两个版本：

- **错的版本（pre-state）**：Claude 在被纠正前的动作 / 输出 / 工具调用
- **对的版本（post-state）**：Claude 在被纠正后的动作 / 输出 / 工具调用（如果有的话）

光有 pre-state 不行——只知道"错了"但不知道"对了应该怎样"。光有 post-state 也不行——只知道"现在 OK 了"但不知道"原来是怎么错的"。两者配对才是合格的 correction 原料。

但实际上**很多 correction 配对不全**——比如用户只说"不对"就走了，没说应该怎么做。这种半成品 correction 不丢，攒着——后面 Claude 自己重新做了一次相似事情，且没被纠正，那次就当作 post-state 补全。

### 5.4 上下文窗口

光有 pre/post 还不够——需要知道"在什么情境下做错的"。Viki 抓取每个 correction 周围的窗口：

- 之前 N 轮的对话上下文
- 当前正在做的"任务"（从用户最初的需求消息推断）
- 当前打开的文件 / 项目类型 / 调用的工具列表
- 上一个被命中的 Viki 规则（如果有）

这些上下文形成 correction 的"情境快照"。后面提炼规则时，规则的"触发条件"就从情境快照里抽取。

### 5.5 提炼：从原料到规则

抓到的 correction 原料是粗的——它进入知识库前要走一道"提炼"：

1. **泛化**：把具体名字（变量名、路径名）抽象掉。"`my_func` 里别用 `print`" 提炼成 "调试时别用 `print`，用 logger"。
2. **加触发条件**：什么场景下才适用？只在 Python 项目？只在生产代码里？只在某种工具调用前？这个从情境快照里抽取。
3. **加因果**：为什么不该 A 应该 B？没有原因的规则后面没法判断要不要保留。提炼时让 LLM 显式说出"理由"字段。
4. **生成检索描述**：规则要能被语义检索查到。所以为它生成两个描述字段——"trigger description"（什么情境下命中）和 "pattern description"（要拦截/提醒什么模式）。这两个描述被向量化后入库。

这一步靠 LLM 做（调用 Claude 自己），所以是**慢工**——只在 daemon 内部、低优先级时段跑。

### 5.6 候选队列：不直接进库

提炼完的规则**先进候选队列**（`sqlite-candidate-queue`），不直接成为生效规则。候选队列里的规则：

- 已经有完整的触发条件和因果
- 但还没参与匹配，不会真的触发提醒
- 等待"晋升条件"满足

晋升条件可以是：
- LLM 二次审查通过（自动 review）
- 用户主动 review 通过（手动 review，未来 UI）
- 长时间没被反向证据推翻（保守晋升）

晋升后才进入正式 knowledge 表，开始参与匹配。被否决的候选丢到 dead-letter 表里（debug 用）。

### 5.7 也挖"正确"，不只是"错"

经典误区是"只记错的"。但只记错的会让规则变成消极清单——"别做 X、别做 Y、别做 Z"。

Viki 也挖正确的：

- 用户对 Claude 方案的肯定语："对"、"很好"、"就这么办"、"这次靠谱" → 提炼成"在 X 情境下，Y 是个值得复用的方案"
- 用户点了 approve → 类似的肯定信号
- 一种方案被反复使用且没有被纠正 → 隐式肯定

正向规则和负向规则混在一起，构成完整的画像。

### 5.8 学习永远在"对话结束之后"做

**关键原则：学习永不阻塞用户**。

Claude 跟你说完话的那一刻（Stop hook）、你关窗的那一刻（SessionEnd）、对话历史快被压缩的那一刻（PreCompact）——Viki 的临时工在这三个时刻被拉起来，**但他不做学习**。他只是把"这段对话"扔到信箱里，标一句"麻烦消化一下"。

真正的学习——挖 correction、配对、提炼、入候选队列——由 daemon 的常驻工慢慢做。你已经在做下一件事了，他还在后台默默消化上一段。

**优化（已落地，stage 3）**：默认只做**增量消化**（只看新出现的对话部分），每 24 小时做一次**全量消化**（从头看一遍）。全量消化排到"系统空闲"的低优先级队列。

---

## 六、调分：规则的生死

### 思路：规则不是写进库就一辈子在

规则放进库时是"试用期"。它的命运取决于后续表现——经常命中、命中后没被覆盖，得到加分；经常命中却被忽略，扣分；长期没人理，淘汰。

每条规则有一个**置信度分数**（confidence），决定它的"地位"：

- **experimental（试用期）**：低分，仅参考。Viki 用它提醒 Claude，但 Claude 想忽略就忽略。默认权重 × 0.5。
- **probation（观察期）**：中分，强烈建议。Claude 会更倾向于听。默认权重 × 0.7。
- **canonical（金科玉律）**：高分，几乎硬性。除非有特殊原因 Claude 必听。默认权重 × 1.0。
- **archived（归档）**：分数太低或长期不命中。不再参与匹配，但保留在库里，万一未来又相关可以"复活"。

### 思路：分数怎么变（calibrator 算法）

每条规则的分数由几个信号驱动，核心算法是 **Wilson Lower Bound**（一种统计置信区间下界）——它能在样本少的时候保持保守，样本多的时候逐渐逼近真实命中率。

**升分信号**：
- 规则提示后，Claude 接受并按规则行动 → 小幅 +
- 规则提示后，Claude 接受 + 用户没再纠正 → 大幅 +
- 规则反复在不同项目里命中 → 跨项目验证 +
- 用户主动点赞（事件钩子在，UI 还没暴露）

**降分信号**：
- 规则提示后，Claude 接受但用户立刻覆盖了行动 → 小幅 -
- 规则提示后，Claude 直接忽略 → 中等 -
- 规则触发的提醒被用户点 deny → 大幅 -
- 用户在事后纠正了"这条规则不对" → 进入待删

**冷处理信号**：
- 规则超过 N 周没被触发过 → 不扣分，但移到 cold tier，下次匹配排序往后挪
- 连续多个 cold week → archived

### 思路：hard negative（反向证据）

特别重要的一种信号——**hard negative**。

当一条规则被用户主动反驳（"这条规则错了"、"在我项目里这样做反而是对的"），Viki 不只是给该规则扣分，还会把"用户反驳时的语境"作为**反例向量**入库。后面匹配时，如果新输入跟反例向量也接近，那条规则的命中权重会被显著压低。

这样规则不仅自身有分数，还有"在哪些语境下应该被压制"的元信息。比"一刀切扣分"细腻得多。

实现位置：`stop-hard-negative-accumulation.ts`。

### 思路：调分不是即时的

跟学习一样，调分也是 daemon 的活，不在 hot path 上做。

Viki 在 hot path（hook 触发瞬间）只做一件事：**记一笔流水**——"规则 X 在 Y 时刻被命中、命中后 Claude 接受/忽略"。这笔流水进 `events.db` 事件表。

真正的"算分"由 daemon 周期性地批处理——读最近 N 天的事件流水，按规则聚合，重新计算每条规则的分数，更新到 `knowledge.db`。

这种**事件流水 + 周期性聚合**的设计有两个好处：
- hot path 不算分，永远秒回
- 算分逻辑改了，重跑一遍流水就能重算所有历史分数，不需要在每次事件发生时定死算法

---

## 七、规则的对外形态

### 思路：规则不只活在数据库里

光把规则存在 sqlite 里是没用的——Claude Code 没法直接读 sqlite。规则要"编译"成 Claude Code 能消化的格式：

- **CLAUDE.md** / **AGENTS.md**：放在项目根目录，Claude Code 启动时自动加载
- **Cursor rules**：如果你用 Cursor 编辑器，规则编译成 `.cursorrules`
- **Skills**：每条规则编译成一个独立的 skill 文件（按需加载，不会撑大上下文）

这套"编译"也由 daemon 周期性做。规则一变，编译产物自动跟着更新。

### 思路：编译不是导出，是翻译

简单地把规则文本贴到 CLAUDE.md 里是 dumb 做法——会让文件越来越长，最后失控。Viki 的编译是有筛选的：

- 只编译高分规则（canonical + probation）
- 编译时按主题分组（"性能"、"测试"、"安全"、"风格"分别成段）
- 编译时去重（相似的规则合并成一条带"诸如"列表）
- 编译有大小预算（CLAUDE.md 不超过 X 字符）

低分规则（experimental）只活在 sqlite 里，靠"用户输入时实时检索"的路径浮现，不进编译产物。

### 思路：multi-target

`viki compile` 可以指定 target：

- `--target=claude` → 给 Claude Code 出 CLAUDE.md
- `--target=codex` → 给 OpenAI Codex 出 AGENTS.md
- `--target=both` → 都出

不同 target 的格式略有差异（提示语风格、文件位置、Skills 装载机制），但规则源头是同一个数据库。

---

## 八、其他功能

### 8.1 `viki doctor` — 自检

一条命令体检全套：
- daemon 是否在跑、端口是否可达
- 向量数据库 coverage 是不是够（有规则没向量？没法语义检索）
- 模型是否下载完
- 安装的 plugin 是否同步
- 各种 .viki/ 文件是否健康

输出可读 + 给修复建议。

### 8.2 自动更新

`bin-updater` 在 SessionStart 时 detached 跑——后台检查最新版本、下载、跑数据库迁移（schema v1 → v2 → ... → v7）、备份。整个过程对用户透明。

更新完了下次 SessionStart 显示一个 banner："Viki 已自动更新到 vX.Y.Z"。如果更新失败，下次显示 "reinstall banner" 提示用户重装。

数据库 schema 迁移测试覆盖：`migrate-v1-to-v2`、`migrate-v6`、`migrate-v7` 等。

### 8.3 ingest 模块 — 不只是从对话里学

Viki 不只是被动从对话里挖规则。它有主动的 ingest 模块（`packages/adapters/src/ingest/`），从其他信号源主动学：

- **CI failure**：扫 CI 失败日志，找重复出错的模式 → "build 之前先跑 typecheck"
- **git hotspot**：扫 git log，找频繁被改的文件 → "这个文件改动率高，下次修改前先看看 git blame"
- **insights**：从代码仓库的结构推断 → "这个 repo 用 pnpm 不是 npm"
- **npm audit**：从安全审计结果学 → "别用 X 版本，有漏洞"
- **PR review**：从代码 review 评论学 → "我们的 review 反复指出 console.log，改 logger"

这些 ingest 模块的产物跟 correction 学到的规则一起走同一套候选队列 + 调分流程。

### 8.4 recording memory — 跟规则分开的"记忆"

除了"规则"，Viki 还存"记忆"——你跟 Claude 说过的有用的事，但还没成规则。

比如你说"这个 repo 的部署流程是先打 docker，再推到 staging，最后 promote 到 prod"——这不是一条"规则"（不是"做 A 别做 B"的模式），但是有用的项目知识。

UserPromptSubmit 时 Viki 同时检索**规则**和**记忆**，相关的都注入给 Claude。

实现位置：`user-prompt-rule-retriever.ts`。

### 8.5 daily 命令 — 自动汇报

用户输入特定关键字（默认包含 "daily"、"日报"、"汇报"）会触发 `viki daily` 命令——一份自动生成的汇报：

- 过去 N 天学到的规则
- 过去 N 天淘汰的规则
- 当前还在试用的规则（让用户决定要不要 review）
- 跨项目共性规则的统计

实现位置：`commands/daily.ts` + `parseExtraTriggersEnv`。

### 8.6 fixture replay — 把历史重放

`fixture-replay.test.ts` 的能力可以拓展到调试用——把过往一段对话录制成 fixture，重新喂给 Viki 跑一遍，看：

- 哪些规则会触发
- 触发是否符合预期
- 学到的规则跟当时学到的是不是一致

这是开发 Viki 自己时的回归测试机制，但用户也可以用来调试自己的规则集。

### 8.7 viki query — 手动查规则

`viki query "<问题描述>"` 接受一段自然语言，跑同样的语义检索逻辑，返回最相关的几条规则。用来：

- 验证某条规则会不会被某个 prompt 命中
- 看库里到底有些什么规则
- 调试为什么某次该触发的没触发

### 8.8 viki bench — 性能基准

`viki bench` 跑标准化的性能测试——延迟、吞吐、内存。可以用来对比"开 Viki" vs "关 Viki" 的开销。也是这次 7 阶段重设的验收工具。

### 8.9 配置系统

`viki config get/set` 允许每项目配置：

- `stop_mode`: sync / async / 默认 daemon（stage 2 之后）
- `scan_errors_enable`: 是否启用错误流水扫描
- `pretool_whitelist`: 覆盖默认的工具白名单
- 各种 timeout

### 8.10 可见度控制（attribution）

环境变量 `VIKI_VISIBILITY`：

- `silent`：什么都不输出。Viki 完全后台工作。
- `smart`（默认）：只在重要事件输出。规则命中、学到新规则、淘汰规则。
- `verbose`：详细日志。命中分数、检索 top-K、调用了哪个 retriever，全输出。

所有 user-visible 文案都走统一的 `AttributionBus + StdoutRenderer` 通道。每条事件有 kind / severity / source / timestamp，便于过滤和归档。

### 8.11 跨平台 + 找根

`find-viki-root` + `walk-up` 让 Viki 在子目录里运行时也能找到项目根（往上走找 `.viki/`、`.git`、`package.json` 之类的标志）。Windows / macOS / Linux 路径分隔符都统一处理。

### 8.12 log rotation

`log-rotate.ts` 让 `stop-errors.log` / `SessionEnd-errors.log` 等日志文件大了自动轮转，不会无限增长。

### 8.13 plugin 安装

`claude-plugin-installer.ts` 让 Viki 还能装额外的 Claude Code plugins。当前用得不多，但留着以后扩展。

### 8.14 session-rule-injected — 防重复提醒

某条规则在本 session 已经提醒过一次，就不会反复提醒。`session-rule-injected.ts` 跟踪这个状态。这避免了"用户已经被提醒过了，下一句还是被同一条规则烦"。

### 8.15 master kill switch

`VIKI_DISABLED=1` 环境变量 → 所有 hook 立刻 bypass，不做任何 Viki 侧工作。用于对照测试（"开 Viki" vs "关 Viki" 的 token 成本/速度对比）或紧急止 Viki。

---

## 九、不变的通道

这套设计里有几条贯穿始终的通道，所有环节都靠它们串起来：

**通道 1：信箱（outbox.jsonl）**
所有"延迟工作"的传输介质。临时工往里塞，常驻工从里取。文件持久化，挂了不丢。

**通道 2：事件流水（events.db）**
所有"已发生事件"的记账本。规则命中、被忽略、被覆盖、被点赞、被工具拒绝——全在这里。是后面调分的唯一真相源。

**通道 3：知识库（knowledge.db）**
规则本身住的地方。每条规则有 id、内容、分数、tier、所属层（项目/用户/团队）、向量、hard negatives、最后命中时间、统计字段。

**通道 4：候选队列（candidates.db 或 sqlite-candidate-queue）**
学到的原料、待提炼或待晋升的规则。从这里晋升到 knowledge.db 才算正式生效。

**通道 5：归因总线（AttributionBus → StdoutRenderer）**
所有"想让用户看见的事"走这条总线——Viki 拦截了一条命令、Viki 检索到一条规则、Viki 学到一条新规则、Viki 淘汰了一条旧规则。总线根据用户的"声量"设置决定显不显示。

这五条通道是稳定的。环节的具体实现可以重写，只要通道的约定不变，其他部分不受影响。

---

## 十、所有可调参数（env vars）

| 环境变量 | 默认 | 作用 |
|---|---|---|
| `VIKI_DISABLED` | 未设 | 总开关。`=1` 时所有 hook bypass |
| `VIKI_VISIBILITY` | smart | silent / smart / verbose |
| `VIKI_HOOK_STDERR` | 1 | `=0` 关闭 hook 的 stderr 输出 |
| `VIKI_HOOK_VERBOSE` | 未设 | `=1` 详细 hook 进度 |
| `VIKI_MATCHER` | semantic | `=legacy` 强制走字符串匹配 |
| `VIKI_HOME` | `~/.viki` | 覆盖 Viki 家目录 |
| `VIKI_PRETOOL_ALL` | 未设 | `=1` 关闭 pre-tool-use 白名单 |
| `VIKI_POSTTOOL_ALL` | 未设 | `=1` 关闭 post-tool-use 白名单 |
| `VIKI_PROMPT_MIN_LEN` | 20 | UserPromptSubmit 跳过门槛 |
| `VIKI_STOP_INLINE` | 未设 | `=1` bin-stop 回到 inline 模式 |
| `VIKI_EMBED_CONCURRENCY` | 2 | daemon /embed 并发上限 |
| `VIKI_COLD_LOAD_PCT` | 60 | cold task 触发的 CPU 上限百分比 |
| `VIKI_EMBEDDER_FORCE_SPAWN` | 未设 | 绕过 daemon singleton 检查 |
| `VIKI_EMBEDDER_NO_AUTOSTART` | 未设 | 测试用，不自启 daemon |
| `VIKI_M5_AUTOSESSION` | 未设 | 启用某项自动 session pipeline |
| `VIKI_M5_AUTOPUSH` | 未设 | 启用某项自动推送 |
| `HF_ENDPOINT` / `VIKI_HF_ENDPOINT` | 未设 | HuggingFace 模型镜像 |
| `CLAUDE_PROJECT_DIR` | Claude 自动设 | 项目根目录（hook 用） |

---

## 十一、本次 7 阶段重设带来的变化（已全部落地）

| 阶段 | 内容 | 关键 commit |
|---|---|---|
| 0 | hook 进程加 watchdog + 强制 exit，止血 | 6ccc6ef、b0f1a10 |
| 1 | daemon 加信箱（outbox）+ 工人（worker）+ HTTP 协议 | 3a3ed70、4f77c6a、21c11a7、b76f763 |
| 2 | 5 个重 hook → 信差模式（bundle 7.45MB → 200KB） | 15a45dd、f1afb60、d30faad |
| 3 | session-end / pre-compact 默认 incremental，每 24h 一次 cold full | 31b4306 |
| 4 | daemon 模型 idle 5 分钟自动 unload，省 ~450MB | 554de19 |
| 5 | 工具白名单 + 短输入门槛，省 ~60-70% hook CPU | feec080 |
| 6 | /embed 并发上限 + cold scheduler（CPU < 60% 才跑） | adbfd8a、7e6c3c5 |

---

## 十二、一句话总结整个思路

**Viki 是一个"基于你被纠正的瞬间持续提炼经验、提炼出来的经验定期评分淘汰、评分高的经验在下次相似场景时悄悄塞到 Claude 耳边提醒"的旁观者；它把"实时"和"消化"严格分开——临时工只做秒退的旁观记录，常驻工在后台按自己节奏批处理学习、调分、编译；它不打扰你，但它在持续变得更懂你。**
