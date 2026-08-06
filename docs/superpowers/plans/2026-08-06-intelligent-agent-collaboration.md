# Preacherman 智能对话与 A/B 协作升级计划

> 状态：下一阶段规划，尚未实施。
>
> 本文描述目标架构和实施顺序，不代表当前版本已经具备这些能力。当前实现状态与限制见仓库根目录的 `project_session_log.md`。

## 1. 目标与产品形态

下一阶段要把当前的“聊天入口 + 独立生成器”升级为一个统一、自然且可持续协作的智能伙伴：

- 用户始终只和 **Preacherman** 对话，不出现 A、B 或 Agent 的自称。
- B 在后台执行任务，默认隐藏；用户可按需展开执行依据、进度、修改记录和产物。
- A 理解当前上下文、指代、用户偏好和正在运行的任务。
- 低风险本地任务自动开始；发布、删除、付费和外部发送等风险操作必须确认。
- 用户在执行期间补充要求时，A 将相关内容作为 `steer` 指令交给当前任务。
- B 完成后，A 读取真实 `TaskResult` 和产物摘要，再向用户总结，不使用固定完成文案。

## 2. 对话与分层记忆

会话上下文改由服务端维护，前端只提交当前消息和 `conversation_id`，不再自行拼接历史记录。

每个会话保存：

- 最近 20 条原始消息，用于理解指代、语气和短期上下文。
- 滚动摘要，用于较长对话。
- 当前工作状态：目标、已确认事实、约束、未解决问题和活动任务。
- 最多 200 条可回看的消息；超出模型上下文预算时，仅发送滚动摘要、结构化状态和最近消息。
- 用户确认过的长期记忆引用。

长期记忆只保存稳定偏好和项目事实：

1. A 提议“是否记住这点”。
2. 用户确认后写入长期记忆；拒绝后不重复建议同一事实。
3. 设置页支持查看、修改和删除。
4. 不自动保存密钥、音频、临时要求或明显敏感内容。

建议的数据结构：

```ts
interface MemoryCandidate {
  id: string;
  kind: "preference" | "project_fact";
  scope: "user" | "project";
  text: string;
  sourceMessageId: string;
  status: "proposed" | "confirmed" | "rejected";
}
```

## 3. A 的职责与模型配置

A 负责快速对话、上下文理解、关键澄清、意图判断、任务拆解、记忆建议和结果转述。

默认模型配置：

- 模型：`deepseek-v4-flash`
- 思考模式：`disabled`
- 输出：JSON Object
- 目标：低延迟、自然回复和稳定的结构化路由

参考：[DeepSeek 模型与定价](https://api-docs.deepseek.com/quick_start/pricing)、[思考模式](https://api-docs.deepseek.com/guides/thinking_mode)、[JSON Output](https://api-docs.deepseek.com/guides/json_mode/)。

A 每轮返回：

```ts
interface CompanionTurn {
  message: string;
  speechText: string;
  intent: "reply" | "clarify" | "delegate" | "steer";
  statePatch: {
    currentGoal?: string;
    confirmedFacts?: string[];
    constraints?: string[];
    openQuestions?: string[];
  };
  taskDraft?: {
    objective: string;
    successCriteria: string[];
    constraints: string[];
    contextMessageIds: string[];
    allowedActions: string[];
    riskLevel: "low" | "medium" | "high";
  };
  memoryCandidates: MemoryCandidate[];
  diagnostics: ProviderDiagnostics;
}
```

行为规则：

- 只有缺失信息会显著改变结果方向时才追问。
- 其余情况明确合理假设后继续。
- 不再使用关键词正则决定是否创建任务。
- JSON 解析失败时保留模型自然语言，并记录诊断。
- JSON 空结果自动重试一次；仍失败则明确显示本地兜底原因。
- 人格提示词独立版本化，统一称呼、主动程度、回复长度和语音风格。

## 4. A/B v1 协作协议

将仓库已有的 A/B v1 草案提升为真实服务链路，替换当前独立的 `proposal Map + pitchRuns Map` 简化实现。

```text
用户消息
→ A 理解上下文
→ 必要时澄清
→ 生成 TaskEnvelope
→ Orchestrator 判断风险
→ 低风险自动执行 / 高风险等待确认
→ B 执行并产生有序 TaskEvent
→ 校验成功标准
→ 必要时自动修正一次
→ TaskResult 返回 A
→ A 基于真实结果总结并提出下一步
```

协议对象：

- `TaskEnvelope`：原始表达、规范化目标、成功标准、约束、上下文引用、允许动作和审批策略。
- `TaskEvent`：开始、进度、需要输入、等待批准、暂停、恢复、完成和失败。
- `ControlCommand`：`steer`、`cancel`、`pause`、`resume`、`provide_input` 和 `approve`。
- `TaskResult`：真实摘要、事实、产物、未解决问题和副作用。
- `TaskRunView`：服务视图，额外包含状态、当前 revision、事件序列和验收结果。

每个会话首版只允许一个活动 B 任务。新的独立任务顺序排队，普通聊天不受影响。

## 5. B 的职责、实时 Steering 与验收

B 负责高质量异步执行，不直接维护用户人格或主对话。

默认模型配置：

- 模型：`deepseek-v4-pro`
- 思考模式：`enabled`
- `reasoning_effort: high`
- 内部推理内容不存储、不展示；只保存最终输出、工具结果和安全的进度摘要

用户在 B 执行期间输入内容时，A 将其分类为：

- 当前任务补充：发送 `steer`。
- 与当前任务无关的普通聊天：直接回答。
- 新任务：加入待执行队列。
- 无法确定：询问“这是补充当前任务吗？”

`steer` 规则：

1. 当前 execution revision 加一。
2. 中止尚未完成的模型请求。
3. 合并所有已确认补充要求。
4. 从最新稳定阶段重新执行。
5. 丢弃旧 revision 的迟到结果。
6. 若原任务已经完成，则创建修订任务。

PitchKit 作为首个完整执行器，采用确定性流水线：

1. 读取 `TaskEnvelope`、上下文引用和 PitchKit Brief。
2. 使用 B 模型生成 PitchKit。
3. 校验必需章节、成功标准和用户约束。
4. 不合格时把具体失败项交回 B，自动修正一次。
5. 再次失败时返回 `partially_succeeded` 并列出缺陷，不伪装成功。
6. A 读取 `TaskResult` 和真实产物摘要后生成完成反馈。

## 6. 服务接口与持久化

计划接口：

- `POST /api/conversations/:id/turn`：提交用户消息，服务端加载上下文。
- `GET /api/conversations/:id`：恢复消息、工作状态和活动任务。
- `GET /api/tasks/:id`：获取任务快照和有序事件。
- `POST /api/tasks/:id/commands`：提交 steering、取消、审批等命令。
- `GET /api/memories`：读取已确认记忆和候选。
- `POST /api/memories/:id/confirm`：确认记忆。
- `PUT /api/memories/:id`：修改记忆。
- `DELETE /api/memories/:id`：删除记忆。

旧 `/api/agent/turn` 和 `/api/agent/runs/*` 保留一个迁移周期，内部转发到新服务。

本地数据拆分为三个版本化、原子写入且权限为 `0600` 的文件：

- `conversation-store.v2.json`
- `memory-store.v1.json`
- `task-store.v1.json`

现有 conversation ledger 首次启动时导入 v2；旧记录不自动推断长期记忆。应用重启后，未完成任务显示为“执行中断、可重试”，不假装自动续跑。

## 7. 用户界面与语音联动

主聊天区只显示 Preacherman：

- 任务开始时自然确认目标和正在执行的动作。
- 执行超过 15 秒时，最多主动播报一次有意义的进展。
- 需要输入、完成或失败时主动语音通知。
- 技术阶段日志只显示在可展开的“执行详情”中，不逐条朗读。
- 完成消息包含真实产物要点、未解决问题和可选下一步。
- 记忆候选显示确认与拒绝操作。
- 执行详情显示目标、成功标准、revision、steering 记录、验收结果和产物入口。
- 新状态继续使用 `--demo-theme-*` 语义变量，并验证浅色与深色模式。

## 8. 实施顺序

1. **统一协议与持久化**：对齐 TypeScript 类型与 A/B v1 JSON Schema，建立会话、任务和记忆存储。
2. **升级 A**：实现服务端上下文组装、滚动摘要、工作状态、结构化意图和记忆候选。
3. **升级 B**：把 PitchKit 改造成真实 TaskEnvelope 执行器，支持取消、steering、验收和单次修正。
4. **完成 A→B→A 闭环**：A 使用 TaskResult 和真实产物摘要回复，删除固定 `completionSummary`。
5. **完善界面与语音**：增加折叠执行详情、记忆管理和语音事件编排。

## 9. 验收场景

1. “我想做一个 AI 产品路演”信息不足时，A 只追问真正影响方向的问题。
2. 用户补充受众后，A 能引用上一轮内容，不重复询问。
3. 低风险 PitchKit 自动启动，主聊天不中断。
4. 执行中说“重点强调隐私和本地存储”，任务 revision 增加，最终产物包含要求。
5. 执行中询问无关问题，A 正常回答且不修改 B 的任务。
6. B 首次产物缺少成功标准时自动修正一次。
7. A 的完成回复引用真实产物内容，不出现固定模板。
8. 用户确认长期偏好后，新对话能够应用；删除后不再应用。
9. DeepSeek 超时、空 JSON、无效 JSON 和余额不足时均显示明确诊断。
10. 应用重启后恢复会话与已完成任务；中断任务显示可重试。
11. 语音开始、长任务进度、等待输入和完成事件只播报一次。
12. 浅色、深色、窄窗口和 Windows 打包环境均可使用。

验证命令：

```bash
cd contracts
npm run contracts:ab

cd ../apps/preacherman-demo-host
npm run check
```

还需完成真实 DeepSeek 沙盒测试、双主题浏览器流程、语音中断测试和 Windows sidecar 启动测试。
