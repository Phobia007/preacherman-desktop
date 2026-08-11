# Preacherman × HomeRail 融合验收记录

记录日期：2026-08-12

## 结论

融合代码、产品边界、自动化测试入口和真实验收入口已经落地，但当前机器尚未满足任务书 Definition of Done 的第 1 项，因此本任务 **不能标记为完整完成**。

唯一尚未完成的发布阻塞是：HomeRail 当前没有为固定工作流配置真实模型 Setting 和显式 Runtime Profile，因而还不能从 Preacherman Proposal 确认后完成一次真实的 `preacherman-complex-task-v1` Run。系统对此返回 `configuration-required`，Test/Acceptance 的真实运行按钮保持禁用，不创建模拟 Attempt 或伪造 Artifact。

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
| 固定 Workflow revision/hash 漂移失败关闭 | 已证明 | revision `2`、canonical hash 固定；workflow contract 与 execution adapter 测试 |
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
| Proposal 确认后真实固定 Workflow 完成 | **阻塞** | Manager 和 1 个 Node 在线，但 HomeRail LLM Settings=0、显式 Profile 缺失 |

## 固定工作流

- Workflow ID：`preacherman-complex-task-v1`
- Revision：`2`
- Canonical SHA-256：`a5ea80a2755e94d5e77819507502d4a4f747e72ec3e68d3618f2eebf66c486e2`
- 成功必需产物：`plan.json`、`verification.json`
- 并行上限：4 个 Worker；计划条目上限：8

## 真实环境证据

- HomeRail Manager 可达。
- 一个 Docker-capable Node 已连接；空闲时 Worker 为 0 属于正常状态。
- HomeRail 官方 `public-two-node-template` 曾完成真实 Run `12b8b4ec88349fd4822b777d`，证明 Manager → Node → Docker Worker 基础链路可执行。
- 固定 Preacherman 工作流没有被错误绑定到 deterministic profile，也没有用伪造结果绕过模型依赖。

## 完成最后一项所需操作

1. 在 HomeRail 中配置一个真实 provider-backed LLM Setting。
2. 运行 `npm run configure:homerail -- -Provider deepseek -ModelName deepseek-v4-flash`，或由模板生成私有 Profile；交互脚本只通过 stdin 传递密钥，并显式绑定固定 Workflow。
3. 设置 `PREACHERMAN_HOMERAIL_PROFILE=<profile-name>`，重启 Preacherman。
4. 在 Test → Acceptance 点击“运行融合验收”，或执行 `npm run verify:homerail`。
5. 验证同一个 Proposal 重复确认只产生一个父 Task、一个 Attempt、一个 HomeRail Run，并取得校验通过的 `plan.json` 与 `verification.json`。

只有第 5 步通过后，才能把融合任务标记为完成。

没有云端 API Key 时，可以改用 LM Studio 本地 `/v1/responses` 服务。当前机器的 32GB RAM、RTX 5070 Ti 16GB VRAM 足以优先尝试 7B–14B 量化、支持工具调用的模型；Docker Actor 通过 `host.docker.internal` 访问宿主服务。最终完成标准不变，仍必须实际跑通固定 Workflow 并校验两项 required Artifact。

## 本轮验证结果

- `npm test`：304/304 通过。
- `npm run typecheck`：通过。
- `npm run build`：通过；Vite 生产包完成（仅保留既有的大 chunk 提示）。
- `git diff --check`：通过。
- Settings → Connections：Light/Dark 实际浏览器检查通过，控制台 0 error，桌面窗口控制均可访问。
- `npm run verify:homerail`：按预期以退出码 1 停在 Provider readiness gate；未创建 Proposal、Task、Attempt 或伪造 Artifact。
