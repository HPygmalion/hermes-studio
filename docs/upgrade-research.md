# 上游版本特性 / UI 移植调研报告

> 基线：当前 LTS = EKKOLearnAI/hermes-studio **v0.6.4**（已本地定制）
> 目标：对比上游 **v0.7.16 / v1.0.1**，按「UI 现代化 + 纯粹 Hermes WebUI 定位」原则评估移植建议与难度。

## 一、上游版本现状

| 版本 | 日期 | 说明 |
| --- | --- | --- |
| v0.6.4 | 2026-07-21 | 当前 LTS 基线 |
| v0.6.47 | 2026-08-16 | 0.6 系列末尾，仅 bug 修复 |
| v0.7.0 | 2026-08-29 | 大型重构：Ekko 合并 / Agent 运行时统一 / 模块边界重构 |
| v0.7.16 | 2026-09-02 | 7 系列最新，多轮修复后收敛 |
| v1.0.1 | 2026-09-02 | 7 系列之上的里程碑 tag |

> 上游持续高频发版。7 系列是「重构 → 密集修复 → 收敛」曲线，v0.7.16 位于末端。

## 二、对比要点（按你的关注项）

### 1. UI 现代化
- v0.7.16 的 `ChatPanel.vue`/`ChatInput.vue` 分别 ~4261 / ~2577 行（当前 0.6.4 为 2341 / 1017），
  组件结构与交互有较大演进（会话上下文、推理展示、附件、消息流渲染等），观感更现代。
- 但**对话界面整体是增量演进**，不是推倒重来；主题/布局体系与 0.6.4 同源（Vue3 + Naive UI），
  因此「现代化」主要是组件与交互打磨，不是换框架。

### 2. 纯粹 Hermes WebUI 定位
- 上游 7 系列侧栏仍存在 `github.com/EKKOLearnAI/hermes-studio` 与 `hermes-studio.ai` 链接、
  版本号控件（`version-text`），并含「版本预览」等 Studio 运营功能——**这些你明确不要**。
- 上游保留了很多 Studio 平台功能（群聊、工作流、看板、设备互联、Agent 管理、Ekko、编码 Agent…）
  超出「纯 Hermes 聊天 + 模型/配置」定位。

### 3. 对话内模型切换
- 上游有独立的 `ModelSelector.vue`/`ModelPickerModal.vue`，支持 `appStore.switchModel(model, provider)`；
  对话输入区/会话列表已有模型切换入口。这**契合你说想要的「对话内模型切换」**，是值得移植的能力。

### 4. 多 Agent（grok / pi 等）
- 上游 Agent 运行时统一为 `hermes / ekko / claude-code / codex / pi` 等，通过 provider/model 选择器暴露；
  grok 作为 **provider（xAI）** 走模型切换。即：**多 agent 由 provider + 模型选择实现**，不需要独立的
  Agent 管理页也能用——符合你「不排斥 grok/pi，不引入 agent 之外新功能」的诉求。
- 注意：上游把 Ekko 合并进 Studio，且带 Ekko 记忆/技能/设置专属 UI——**Ekko 是 Studio 自带 Agent，
  你之前明确不要**（「内置的那个啥 agent 去掉」）。

## 三、给你的移植建议（建议 / 不建议 + 难度）

| 特性 | 建议 | 难度 | 理由 |
| --- | --- | --- | --- |
| **对话内模型切换**（ModelSelector / model picker 进聊天区和会话列表） | ✅ 建议 | ⭐⭐⭐ 中 | 契合核心诉求；从上游抽取 `ModelSelector`/`switchModel` 逻辑，依赖 provider 目录（已有 opencode-free/octopus 等，可无缝叠加） |
| **会话上下文 / 推理 / 附件等聊天 UI 打磨** | ✅ 建议精选 | ⭐⭐⭐⭐ 较高 | 量大且牵扯 streaming 协议；建议只挑高感知项（如推理折叠、上下文条），不全量搬 |
| **版本号 / 仓库链接** | ❌ 不移植 | — | 你已明确不要；上游还有 `webui_version`/版本检查 UI，保持当前「纯文字 Hermes Studio LTS」即可 |
| **群聊 / 工作流 / 看板 / 设备互联 / 版本预览** | ❌ 不移植 | — | 明确超出纯 Hermes 定位（且当前 LTS 已删群聊） |
| **Ekko 相关（记忆/技能/设置/Agent 页）** | ❌ 不移植 | — | Studio 自带 Agent，你明确不需要 |
| **多 agent 支持（grok/pi 走 provider/model）** | ✅ 通过 provider 承接 | ⭐⭐ 低 | 已有 opencode-free/octopus；grok(xai)、pi 作为 provider 预设即可，无需 Agent 管理页 |
| **直接升到 v0.7.16 / v1.0.1 整体替换** | ⚠️ 需权衡 | ⭐⭐⭐⭐⭐ 很高 | 会引入大量 Studio 功能 + 全部分叉改动需重做（去广告/去群聊/去 Ekko/opencode-free 适配都失效），且上游 7 系列仍在快速发版，维护成本高 |

## 四、结论与建议路线

1. **不建议整体升级到 v0.7.16/v1.0.1**——会把已做的所有去 Studio 化 + 去广告 + opencode-free 适配推翻，
   且 7 系列发版过密、迭代未完，作为长期稳定基线风险高。
2. **推荐增量回移**：在当前 v0.6.4 LTS 基础上，**只移植高感知、低耦合的现代 UI 点**：
   - 对话内模型切换（优先）；
   - 精选的聊天展示打磨（推理/上下文）。
   这些通过 npm/源码局部引入即可，不影响现有去 Studio 化的定位。
3. **多 agent 用 provider 承接**：grok(xai)/pi 等以 provider 预设加入，需 key 的走设置页，keyless 的免配置。
4. **保持纯粹定位**：不引入仓库链接、版本号推广、群聊/工作流/看板/Ekko 等 Studio 功能。

## 五、待确认
- 是否要我现在开始**第一期增量移植**（对话内模型切换 + 精选聊天 UI 打磨）？
- 若同意，我将先从上游抽取 `ModelSelector`/`switchModel` 适配到当前 provider 体系，逐一 build + 测试验证。
