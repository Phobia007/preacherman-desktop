# Preacherman × HomeRail 融合验收记录

记录日期：2026-08-12

## 结论

融合代码、产品边界、自动化测试入口和真实验收入口已经落地。新的 DeepSeek 官方凭据已由 HomeRail 加密保存，并通过 Responses、Chat Completions 和 Anthropic 兼容入口的实时 HTTP 200 探测。固定工作流已从 Preacherman Proposal 确认真实完成，父 Task、Attempt、HomeRail Run 和两个 required Artifact 均已校验。

HomeRail 使用显式 Runtime Profile、在线 Node 和 revision 3 固定工作流，三个 Agent 角色均使用只读 `backend_native` 策略。Preacherman 会在创建 Proposal/Task/Attempt 之前执行短时缓存的 Responses 探测，不会仅凭“Key 已保存”显示假 ready。验收目标带有明确、可引用的输入事实；Planner 完成拆分，三个 Worker 并行完成，Verifier 独立验证，且没有自动 handoff fallback。

## 权威边界

| 数据或动作 | 权威方 | 已落实的边界 |
|---|---|---|
| 用户目标、Proposal、父 TaskRun | Preacherman | `TaskService` 是业务状态唯一写入口 |
| 全 DAG 执行 | HomeRail | 每次 Run 只映射为父 Task 下的一个 Attempt |
| 审批展示与决定 | Preacherman | 校验 approval ID、run、node、proposal hash；保存 actor 和决定时间 |
| 原始 DAG 事件与技术证据 | HomeRail | Preacherman 只投影白名单里程碑和来源指纹 |
| 用户 Ledger 与 Artifact 引用 | Preacherman | 多 Artifact 索引、校验后私有缓存和受控内容代理 |
| 数字人、语音和交互状态 | AIRI | 不承载 HomeRail 原始状态或技术按钮 |

## 任务书验收矩阵

| 任务书要求 | 当前状态 | 可复核证据 |
|---|---|---|
| TaskStore v2 与 Canonical TaskService | 已证明 | `task-store-v2-migration.test.mjs`、`task-service.test.mjs` |
| 一个目标只有一个父 TaskRun | 已证明 | 重复 confirm HTTP/面板测试；HomeRail Link 幂等测试 |
| HomeRail Run 是 Attempt，不替代 Task ID | 已证明 | `homeRailExecutionAdapter`、`homeRailLinkStore`、Ledger Attempt 展示 |
| Router 保持 Plugin/MCP 本地执行 | 已证明 | `execution-router.test.mjs` 和全量回归测试 |
| 固定 Workflow revision/hash 漂移失败关闭 | 已证明 | revision `3`、canonical hash 固定；workflow contract 与 execution adapter 测试 |
| 状态和白名单事件投影 | 已证明 | `homerail-event-projector.test.mjs`，内容指纹去重且支持乱序插入 |
| Cancel/steer/resume/retry | 已证明（适配层与 HTTP 假服务） | `homerail-command-adapter.test.mjs`、`homerail-integration-http.test.mjs` |
| Waiting input 与单一审批 | 已证明（适配层与 HTTP 假服务） | approval/event/UI flow 测试；审批历史包含 request、decision、actor、time、proposal hash |
| SSE 中断后历史补偿 | 已证明 | SSE 只作无内容唤醒；Reconciler 有轮询回退和按 Run 指数退避测试 |
| Preacherman 重启恢复 | 已证明（自动化） | Reconciler 扫描非终态 Attempt，状态/历史/Artifact 补偿测试 |
| 多 Artifact、required Artifact 门禁 | 已证明 | Artifact identity、media type、size、SHA-256、Range、required failure 测试 |
| 浏览器不直连 HomeRail、不持有 Token | 已证明 | 浏览器 API 只访问 Preacherman；公开状态和 Workflow catalog 均脱敏 |
| 不增加 HomeRail 主导航或重复操作体系 | 已证明 | 仍为 7 个一级页面；Action Placement 与 UI flow 测试 |
| Light/Dark 与关键页面人工 smoke | 已证明 | Home、Work、Ledger、Settings、Test 已进行双主题浏览器检查，控制台 0 error |
| Test 一键真实融合验收 | 已证明 | `runHomeRailFusionAcceptance` 与 CLI 验收器走真实 Proposal→重复确认→Task→Attempt→Artifact API；Provider 未 ready 时诚实禁用 |
| Proposal 确认后真实固定 Workflow 完成 | 已证明 | Task `run_53dad2d9-f223-4f18-83b6-1fc9d97bd521`、Attempt 1、HomeRail Run `preacherman_run_53dad2d9-f223-4f18-83b6-1fc9d97bd521_1` 均为成功终态 |

## 固定工作流

- Workflow ID：`preacherman-complex-task-v1`
- Revision：`3`
- Canonical SHA-256：`bf7783be10cfc62b5e16154d026ef434c6990c387432401f1604c8b23e52c4ee`
- 成功必需产物：`plan.json`、`verification.json`
- 并行上限：4 个 Worker；计划条目上限：8

## 真实环境证据

- HomeRail Manager 可达。
- 一个 Docker-capable Node 已连接；空闲时 Worker 为 0 属于正常状态。
- 加密 Setting 与 `preacherman-complex-default` Profile 绑定到固定工作流；公开状态始终不暴露凭据。该 Setting 在安全配置流程中更新为本次通过实时探测的 DeepSeek 官方凭据并保持激活。
- 真实 Run `preacherman_run_4f7f0a13-056a-4ec1-b489-dc88d3f3894d_1` 证明 revision 3 已进入 Codex App Server，但 Provider 请求被当前凭据拒绝。
- `/api/llm/models/detect-runtime` 对错误指向 DeepSeek 官方地址的旧 Setting，在 Responses、Chat Completions 与 Anthropic 兼容入口均返回 HTTP 401；错误仅保留脱敏尾号。
- 用户提供的接口说明确认正确 Base URL 为 `https://llm-center.modelbest.co`，并声明 `/v1/responses`；域名在本机解析为私网地址 `10.88.1.54`，但当前 TCP 443 超时，符合页面“内网”说明。
- HomeRail 已创建独立 `modelbest` 自定义 Provider，默认模型暂为不可执行的 `pending-model-discovery`；未创建或激活伪造模型 Setting。
- HomeRail 官方 `public-two-node-template` 曾完成真实 Run `12b8b4ec88349fd4822b777d`，证明 Manager → Node → Docker Worker 基础链路可执行。
- 固定 Preacherman 工作流没有被错误绑定到 deterministic profile，也没有用伪造结果绕过模型依赖。
- DeepSeek 官方 Setting 的 Responses、Chat Completions 与 Anthropic 兼容入口实时探测均为 HTTP 200；推荐 harness 为 `codex_appserver`。
- 成功父 Task：`run_53dad2d9-f223-4f18-83b6-1fc9d97bd521`；状态 `succeeded`；Attempt 数量 1。
- 成功 HomeRail Run：`preacherman_run_53dad2d9-f223-4f18-83b6-1fc9d97bd521_1`；状态 `completed`；Planner、三个 fan-out Worker、fanout 聚合和 Verifier 全部 `COMPLETED`；6 个非空 handoff，0 个自动 handoff。
- `plan.json`：3890 bytes，SHA-256 `39e4037ee0c617b3f487a966c6a9b28218bf823b34ab16c45ada3ecaff19232a`。
- `verification.json`：2818 bytes，SHA-256 `234f6517c463d5ac9754474d6cab9875c97020d7d22984798a0df0f0de393f20`。
- 成功运行中的可选 `verification-failure.json` 按 `publish: failure` 策略诚实标为 `skipped`，不会被误算为 required Artifact 失败。
- 关闭首次嵌入式 Preacherman 服务后，新实例从持久化 TaskStore/LinkStore 重新读取同一 Task，并经内容代理重新验证两个 Artifact 的 byte length 与 SHA-256，证明 Preacherman 重启后没有丢失或误报。

## 复验入口

1. 新执行：运行 `npm run verify:homerail`；它会先要求 Provider ready，再走 Proposal、重复确认、唯一父 Task/Attempt/Run 和 required Artifact 内容校验。
2. 无模型费用复验既有成功 Task：设置 `PREACHERMAN_FUSION_TASK_ID=run_53dad2d9-f223-4f18-83b6-1fc9d97bd521` 后运行同一命令。
3. 只有 `plan.json` 与 `verification.json` 两个 required Artifact 必须 ready；按相反终态策略未发布的可选 Artifact 可以是 skipped。

没有云端 API Key 时，可以改用 LM Studio 本地 `/v1/responses` 服务。当前机器的 32GB RAM、RTX 5070 Ti 16GB VRAM 足以优先尝试 7B–14B 量化、支持工具调用的模型；Docker Actor 通过 `host.docker.internal` 访问宿主服务。最终完成标准不变，仍必须实际跑通固定 Workflow 并校验两项 required Artifact。

## 本轮验证结果

- `npm test`：308/308 通过；新增并覆盖并行 worktree 预览 Origin 的本地白名单约束。
- `npm run typecheck`：通过。
- `npm run build`：通过；Vite 生产包完成（仅保留既有的大 chunk 提示）。
- `git diff --check`：通过。
- 当前融合 worktree 的 Settings → Connections 与 Test：Light/Dark 实际浏览器检查通过，控制台 0 error，桌面窗口控制均可访问；1422 预览只通过显式本地 Origin 白名单访问服务。
- revision 3 首次真实运行：进入 Codex App Server，随后因公司 Key 错指 DeepSeek 官方地址而 401 失败；没有伪造 Artifact。
- 增加 Provider 实测门禁后，`npm run verify:homerail` 按预期以退出码 1 停在 readiness gate，不再创建无意义的 Proposal、Task 或 Attempt。
- 公司网关无凭据网络检查：DNS 成功解析到 `10.88.1.54`，TCP 443 与 `/v1/models`、`/v1/responses` 均超时；未把 Key 发送到不可达端点。
- 新 DeepSeek 官方凭据三协议实时探测均为 HTTP 200。
- 首个有效 Provider Run 暴露验收目标缺少 Track C 来源事实，第三个 Worker诚实返回 failed，fanout 正确 fail-closed；没有伪造成功。
- 修正为显式 FACT A/B/C 后，真实固定工作流在 89 秒内完成，Task/Attempt/Run/Artifact 验收全部通过。
- 验收器现以最终权威 Task 判断重复确认后的唯一 Attempt，并只校验 required Artifact；支持不创建新 Run 的既有 Task 复验。
