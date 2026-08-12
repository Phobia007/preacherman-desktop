# Preacherman × HomeRail 融合验收记录

记录日期：2026-08-12

## 结论

融合代码、产品边界、自动化测试入口和真实验收入口已经落地，但当前提供的模型凭据被 DeepSeek 官方 Responses 接口以 HTTP 401 拒绝，因此本任务 **不能标记为完整完成**。

HomeRail 已有加密模型 Setting、显式 Runtime Profile 和在线 Node。首次真实运行还暴露并修复了 Codex App Server 与 Claude 风格 `allowed_builtin_tools` 不兼容的问题，固定工作流已升级为 revision 3，三个 Agent 角色均使用显式只读的 `backend_native` 策略。随后真实 Provider 探测确认当前凭据无效。Preacherman 现在会在创建 Proposal/Task/Attempt 之前执行短时缓存的 Responses 探测，并诚实返回 `configuration-required`，不会仅凭“Key 已保存”显示假 ready。

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
| Test 一键真实融合验收 | 已落实但受配置阻塞 | `runHomeRailFusionAcceptance` 走真实 Proposal→重复确认→Task→Attempt→Artifact API；Provider 未 ready 时诚实禁用 |
| Proposal 确认后真实固定 Workflow 完成 | **阻塞** | Setting/Profile/Node 均存在；DeepSeek Responses 实测返回 HTTP 401，当前凭据无效 |

## 固定工作流

- Workflow ID：`preacherman-complex-task-v1`
- Revision：`3`
- Canonical SHA-256：`bf7783be10cfc62b5e16154d026ef434c6990c387432401f1604c8b23e52c4ee`
- 成功必需产物：`plan.json`、`verification.json`
- 并行上限：4 个 Worker；计划条目上限：8

## 真实环境证据

- HomeRail Manager 可达。
- 一个 Docker-capable Node 已连接；空闲时 Worker 为 0 属于正常状态。
- 加密 Setting 与 `preacherman-complex-default` Profile 已绑定到固定工作流；公开状态不暴露凭据。
- 真实 Run `preacherman_run_4f7f0a13-056a-4ec1-b489-dc88d3f3894d_1` 证明 revision 3 已进入 Codex App Server，但 Provider 请求被当前凭据拒绝。
- `/api/llm/models/detect-runtime` 对同一 Setting 的 Responses、Chat Completions 与 Anthropic 兼容入口均返回 HTTP 401；错误仅保留脱敏尾号。
- HomeRail 官方 `public-two-node-template` 曾完成真实 Run `12b8b4ec88349fd4822b777d`，证明 Manager → Node → Docker Worker 基础链路可执行。
- 固定 Preacherman 工作流没有被错误绑定到 deterministic profile，也没有用伪造结果绕过模型依赖。

## 完成最后一项所需操作

1. 用有效的 DeepSeek API Key 重新运行 `npm run configure:homerail -- -Provider deepseek -ModelName deepseek-v4-flash -AgentType codex_appserver`；脚本只通过 stdin 传递密钥，HomeRail 加密保存，并在激活 Profile 前真实探测 Responses API。探测失败不会改写 Preacherman 激活配置。
2. 执行 `npm run verify:homerail`；Provider 探测必须先返回 ready。
3. 验证同一个 Proposal 重复确认只产生一个父 Task、一个 Attempt、一个 HomeRail Run，并取得校验通过的 `plan.json` 与 `verification.json`。

只有第 5 步通过后，才能把融合任务标记为完成。

没有云端 API Key 时，可以改用 LM Studio 本地 `/v1/responses` 服务。当前机器的 32GB RAM、RTX 5070 Ti 16GB VRAM 足以优先尝试 7B–14B 量化、支持工具调用的模型；Docker Actor 通过 `host.docker.internal` 访问宿主服务。最终完成标准不变，仍必须实际跑通固定 Workflow 并校验两项 required Artifact。

## 本轮验证结果

- `npm test`：305/305 通过。
- `npm run typecheck`：通过。
- `npm run build`：通过；Vite 生产包完成（仅保留既有的大 chunk 提示）。
- `git diff --check`：通过。
- Settings → Connections：Light/Dark 实际浏览器检查通过，控制台 0 error，桌面窗口控制均可访问。
- revision 3 首次真实运行：进入 Codex App Server，随后因 Provider 401 失败；没有伪造 Artifact。
- 增加 Provider 实测门禁后，`npm run verify:homerail` 按预期以退出码 1 停在 readiness gate，不再创建无意义的 Proposal、Task 或 Attempt。
