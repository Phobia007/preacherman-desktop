# 应用界面 API 需求清单

- Figma 文件：[应用界面 Copy](https://www.figma.com/design/lWtoH8PCoOoPP3ttwMUBP6/应用界面--Copy-)
- 编写日期：2026-07-14
- 当前版本：`Draft v0.1`
- 依据：[03-user-flows.md](./03-user-flows.md)、[04-interaction-matrix.csv](./04-interaction-matrix.csv)、[05-data-dictionary.md](./05-data-dictionary.md)
- 用途：把页面交互转换成可评审、可估时、可实现的后端 API 需求

## 1. 这份文件解决什么问题

这份文件回答后端最常问的六个问题：

1. 前端需要调用哪些接口。
2. 每个接口由哪个页面动作触发。
3. 请求需要提交什么，成功后返回什么。
4. 哪些操作是同步请求，哪些操作会创建异步任务。
5. 哪些写入必须防重复、处理版本冲突或写入审计日志。
6. 前端如何在刷新、断线和失败后恢复页面状态。

本文件是 API 需求，不是最终 OpenAPI 文件，也不是数据库建表设计。后端可根据现有技术栈调整内部服务划分，但对前端暴露的业务语义、状态和关键规则应保持一致。

## 2. 已确认的产品规则

以下规则来自已确认的用户流程，接口设计不得自行改变：

| 编号 | 规则 | API 影响 |
|---|---|---|
| R-01 | 用户已有自己的 State 后，每次进入 APP 的主页面是 `SCR-001 home` | `GET /home` 必须返回 Current State 和 Monitor 摘要 |
| R-02 | `SCR-014` 是 `SCR-013` 的按钮完整版本 | 结果查询使用同一套 TaskResult 接口，不为两页创建两套数据模型 |
| R-03 | `SCR-055` 草稿不采纳 | 不为该页面增加接口 |
| R-04 | `Save & Re-test` 保存后直接进入测试 | 使用一个原子复合接口，同时保存 StateDraft 并创建 TestRun |
| R-05 | 新 State 测试完成后不自动发布 | TestRun 成功只更新测试结果，State 保持 Draft/Unpublished |
| R-06 | `preacherman lab 2` 是正式页面 | State Lab 接口以该正式流程为准 |
| R-07 | `Blank Skill 空白创建 1-5` 是正式创建流程 | 五步共用一个 SkillDraft，并以 `draft_revision` 防覆盖 |
| R-08 | `Skills 页面 5-9` 是废页 | 不纳入 API 范围 |
| R-09 | 暂不处理人工 Skill 发布审核 | 发布前只做系统校验，不设计人工审批状态机 |
| R-10 | 导出支持分享链接和后端可用的多种格式 | 格式必须由后端动态返回，前端不得写死 |
| R-11 | State 安装后由用户在 Lab 手动激活 | Install 与 Activate 必须是两个独立接口 |
| R-12 | Restore 只创建新的 StateDraft | Restore 不切换 Current State；用户在 Lab 另行决定是否启用 |
| R-13 | 一个用户只能有一个 Current State | Activate 必须原子替换旧 Current State，并保证唯一约束 |
| R-14 | Use this Result 的保存位置由用户选择 | 保存 API 必须接收用户选择的 Workspace 和目标容器 ID |

## 3. 全局 API 约定

### 3.1 基础约定

| 项目 | 约定 |
|---|---|
| Base URL | `/api/v1` |
| 传输 | HTTPS + JSON；文件上传使用预签名 URL 或 `multipart/form-data` |
| 认证 | `Authorization: Bearer <access_token>` |
| 字段命名 | 与数据字典一致，统一 `snake_case` |
| 时间 | ISO 8601 UTC，例如 `2026-07-14T10:21:32Z` |
| 资源 ID | 不透明 `ID`，前端不得解析 ID 含义 |
| 请求追踪 | 客户端可传 `X-Request-ID`，后端必须在响应中回传 |
| 创建防重 | 创建、运行、发布、安装、导出等请求传 `Idempotency-Key` |
| 草稿并发 | 修改 Draft/Profile 时传 `If-Match: <revision>` 或请求体中的 `draft_revision` |
| 分页 | Cursor 分页：`?cursor=...&limit=20`，默认 20，最大值由后端配置 |
| 排序 | `sort` + `order=asc\|desc`，后端返回实际采用的排序 |
| 软删除 | 有审计价值的数据默认软删除，删除接口成功返回 `204` |
| API 版本 | 破坏性修改通过 `/api/v2` 或显式版本字段升级 |

### 3.2 标准成功响应

单个资源：

```json
{
  "data": {
    "state_id": "st_01...",
    "name": "Strategy Operator"
  },
  "meta": {
    "request_id": "req_01..."
  }
}
```

列表资源：

```json
{
  "data": [],
  "meta": {
    "request_id": "req_01...",
    "next_cursor": null,
    "has_more": false
  }
}
```

### 3.3 标准异步响应

创建 TaskRun、TestRun、ValidationRun、ImportJob 或 ExportJob 时返回 `202 Accepted`：

```json
{
  "data": {
    "operation_type": "test_run",
    "operation_id": "tr_01...",
    "status": "queued",
    "status_url": "/api/v1/test-runs/tr_01...",
    "events_url": "/api/v1/test-runs/tr_01.../events"
  },
  "meta": {
    "request_id": "req_01..."
  }
}
```

### 3.4 标准错误响应

```json
{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "The draft was updated in another session.",
    "field_errors": [],
    "retryable": false,
    "details": {
      "current_revision": 12
    }
  },
  "meta": {
    "request_id": "req_01..."
  }
}
```

错误 `message` 用于人类阅读，前端逻辑只允许依赖稳定的 `error.code`。

### 3.5 HTTP 状态码

| 状态码 | 使用场景 |
|---:|---|
| `200` | 查询成功或同步更新成功 |
| `201` | 同步创建资源成功 |
| `202` | 已接受异步处理，返回 Run/Job ID |
| `204` | 删除、撤销或无响应体操作成功 |
| `400` | 请求结构不合法 |
| `401` | 未登录、令牌失效 |
| `403` | 已登录但无资源权限 |
| `404` | 资源不存在或用户不可见 |
| `409` | 重复安装、版本冲突、幂等键内容冲突 |
| `410` | UploadSession、下载地址或 ShareLink 已过期/撤销 |
| `412` | `If-Match` 或 revision 已过期 |
| `413` | 上传文件超过当前 purpose 的大小限制 |
| `415` | 上传文件类型不受当前 purpose 支持 |
| `422` | 业务校验不通过，例如 Draft 缺少必填项 |
| `429` | 请求过快或额度限制 |
| `500` | 未预期服务错误 |
| `503` | 依赖服务暂不可用，可按响应建议重试 |

## 4. API 总目录

表中对象名称均引用 `05-data-dictionary.md`。`执行`列含义：

- `同步`：在一次 HTTP 请求内返回最终结果。
- `异步`：返回 `202` 和 Run/Job ID，前端通过状态查询及事件流恢复。
- `幂等`：必须支持 `Idempotency-Key`。
- `乐观锁`：必须校验资源 revision。

### 4.1 账号、Session 与通知

| API-ID | Method | Path | 用途 | 对应交互 | 主要输入 | 主要输出 | 执行 | 优先级 |
|---|---|---|---|---|---|---|---|---|
| API-001 | GET | `/auth/session` | 应用启动时校验 Session | `INT-008` | access token | `Session`、`User`、`UserProfile` | 同步 | P0 |
| API-002 | POST | `/auth/login` | 邮箱密码登录并创建 Session | `INT-010` | `email`、`password`、`device_info` | `Session`、`UserProfile` | 幂等、防暴力破解 | P0 |
| API-003 | POST | `/auth/logout` | 注销当前 Session | `INT-004` | `session_id` | 无响应体 | 幂等 | P0 |
| API-004 | POST | `/users` | 创建账号并自动登录 | `INT-012` | `email`、`password`、`agreement_acceptance` | `User`、`Session` | 幂等 | P0 |
| API-005 | GET | `/users/me/profile` | 获取当前用户资料 | `INT-001` | 无 | `UserProfile` | 同步 | P1 |
| API-006 | PATCH | `/users/me/profile` | 保存姓名、头像和偏好 | `INT-014` | profile fields、`revision` | 更新后的 `UserProfile` | 乐观锁 | P0 |
| API-007 | POST | `/users/me/onboarding/complete` | 完成引导并初始化首页 | `INT-015` | `profile_revision` | onboarding 状态、HomeSummary | 幂等 | P0 |
| API-008 | GET | `/notifications` | 获取通知和未读数量 | `INT-002`、`INT-016` | `cursor`、`unread_only` | `Notification[]`、`unread_count` | 同步 | P1 |
| API-009 | POST | `/notifications/{notification_id}/read` | 标记单条通知已读 | `INT-002` | notification ID | 更新后的 `Notification` | 幂等 | P2 |

### 4.2 Home、Current State 与 Monitor

| API-ID | Method | Path | 用途 | 对应交互 | 主要输入 | 主要输出 | 执行 | 优先级 |
|---|---|---|---|---|---|---|---|---|
| API-010 | GET | `/home` | 加载正式主 Home/Monitor | `INT-001`、`INT-015`、`INT-016`、`INT-148` | 无 | Current State、health、usage、activity、unread summary | 同步聚合 | P0 |
| API-011 | GET | `/runtime/status` | 获取 Live、连接和自动保存状态 | `INT-006` | `resource_type`、`resource_id` | `live`、`autosaved_at`、`connection_state` | 同步 | P1 |
| API-012 | GET | `/operations/{operation_id}` | 刷新后恢复任意异步任务 | `INT-007` | operation ID | operation type、status、progress、resource link | 同步 | P0 |
| API-013 | GET | `/states/{state_id}/health-summary` | 展开最新健康摘要 | `INT-017` | state ID | `StateHealthSnapshot` | 同步 | P1 |
| API-014 | GET | `/states/{state_id}/monitor` | 获取 Monitor 详细数据 | `INT-018`、`INT-149`、`INT-150` | `time_range`、`sections` | health、token、API、activity、log summary | 同步聚合 | P1 |
| API-015 | GET | `/states/{state_id}/monitor/events` | 订阅 Monitor 增量事件和系统日志 | `INT-018`、`INT-019`、`INT-151`、`INT-152`、`INT-153` | `after_sequence` | `MonitorEvent` 流 | SSE、断线续传 | P1 |
| API-016 | GET | `/states/current` | 获取用户当前激活 State 摘要 | `INT-020` | 无 | `State`、active `StateVersion` | 同步 | P0 |
| API-017 | GET | `/states/{state_id}` | 获取 State 详情与当前版本 | `INT-021`、`INT-133` | state ID | `State`、`StateVersion`、skills、permissions | 同步 | P0 |
| API-018 | GET | `/states/{state_id}/passport` | 获取 State Passport | `INT-024`、`INT-136` | state ID、可选 `need` | capability、permission、validation、match reason | 同步 | P1 |
| API-019 | GET | `/states/{state_id}/learnings` | 分页获取 State Learnings | `INT-025` | `cursor`、`type` | `StateLearning[]` | 同步 | P1 |
| API-020 | GET | `/states/{state_id}/available-skills` | 获取可挂载 Skill 和兼容性摘要 | `INT-022` | filters、cursor | SkillVersion 摘要列表 | 同步 | P1 |
| API-021 | GET | `/states/{state_id}/editable-draft` | 找到或创建可编辑 StateDraft | `INT-023` | `source_version_id` | `StateDraft`、permissions | 同步创建时幂等 | P0 |
| API-022 | GET | `/states/{state_id}/test-summary` | 获取可测试版本和最近测试 | `INT-026`、`INT-116` | state ID | versions、recent tests、default settings | 同步 | P0 |
| API-023 | GET | `/states/{state_id}/ledger-summary` | 获取版本和分支摘要 | `INT-027` | state ID | versions、branches、latest events | 同步 | P1 |

### 4.3 对话、语音、分享与导出

| API-ID | Method | Path | 用途 | 对应交互 | 主要输入 | 主要输出 | 执行 | 优先级 |
|---|---|---|---|---|---|---|---|---|
| API-024 | GET | `/conversations/recent` | 获取人模入口的最近会话摘要 | `INT-028` | `state_id`、limit | Conversation 摘要 | 同步 | P1 |
| API-025 | POST | `/conversations` | 创建新会话 | `INT-029` | `state_id`、`mode` | `Conversation` | 幂等 | P0 |
| API-026 | GET | `/conversations/{conversation_id}` | 恢复指定或最近会话 | `INT-029`、`INT-034` | conversation ID | `Conversation` | 同步 | P0 |
| API-027 | GET | `/conversations/{conversation_id}/messages` | 获取、搜索和分页消息 | `INT-034`、`INT-035` | `cursor`、`query`、`before` | `Message[]` | 同步 | P1 |
| API-028 | POST | `/conversations/{conversation_id}/messages` | 保存用户消息并启动回复 | `INT-030` | `content`、attachments、`client_message_id` | user Message、`response_run_id` | 幂等、异步 | P0 |
| API-029 | GET | `/conversations/{conversation_id}/events` | 接收 State 流式回复 | `INT-032` | `after_sequence` | `reply.delta/completed/failed` | SSE、断线续传 | P0 |
| API-030 | POST | `/conversations/{conversation_id}/responses/{response_run_id}/retry` | 继续或重试中断回复 | `INT-033` | retry mode | 新 `response_run_id` | 幂等、异步 | P0 |
| API-031 | POST | `/audio/transcriptions` | 将录音转换为文字 | `INT-031` | audio asset、language | transcript、confidence | 异步或短任务同步 | P1 |
| API-032 | POST | `/conversations/{conversation_id}/actions` | 执行 Summarize、Brainstorm、Help me plan | `INT-039` | `action_type`、optional prompt | response run | 幂等、异步 | P1 |
| API-033 | POST | `/conversations/{conversation_id}/task-drafts` | 从会话生成 TaskDraft | `INT-038` | selected message IDs、goal hint | `TaskDraft` | 幂等 | P0 |
| API-034 | POST | `/share-links` | 为对话、Skill 或 Artifact 创建分享链接 | `INT-036`、`INT-113` | resource type/ID、scope、expires_at | `ShareLink` | 幂等 | P1 |
| API-035 | DELETE | `/share-links/{share_link_id}` | 撤销分享链接 | `INT-036` | share link ID | 无响应体 | 幂等、审计 | P1 |
| API-036 | GET | `/exports/formats` | 动态获取资源可用导出格式 | `INT-037`、`INT-112`、`INT-126` | `resource_type`、resource ID | formats、限制、预计大小 | 同步 | P1 |
| API-037 | POST | `/export-jobs` | 创建多格式导出任务 | `INT-037`、`INT-113`、`INT-126` | resource、format、options | `ExportJob` | 幂等、异步 | P1 |
| API-038 | GET | `/export-jobs/{export_job_id}` | 查询导出进度和下载地址 | `INT-037`、`INT-113`、`INT-126` | export job ID | `ExportJob`、download URL | 同步 | P1 |

### 4.4 Task Draft、TaskRun 与结果

| API-ID | Method | Path | 用途 | 对应交互 | 主要输入 | 主要输出 | 执行 | 优先级 |
|---|---|---|---|---|---|---|---|---|
| API-039 | GET | `/task-drafts/{task_draft_id}` | 加载由对话生成的任务草稿 | `INT-040` | task draft ID | `TaskDraft`、sources、context、suggestions | 同步 | P0 |
| API-040 | PATCH | `/task-drafts/{task_draft_id}` | 编辑或保存 TaskDraft | `INT-041`、`INT-049` | changed fields、`draft_revision` | 更新后的 `TaskDraft` | 乐观锁 | P0 |
| API-041 | GET | `/task-templates` | 获取任务模板 | `INT-042` | filters、cursor | template summaries | 同步 | P1 |
| API-042 | POST | `/task-drafts/{task_draft_id}/apply-template` | 将模板应用到 TaskDraft | `INT-042` | `template_id`、`draft_revision` | 更新后的 `TaskDraft` | 幂等、乐观锁 | P1 |
| API-043 | POST | `/task-drafts/{task_draft_id}/sources` | 添加文件、文字、链接或数据连接 | `INT-043`、`INT-044` | source input、`draft_revision` | `Source`、updated revision | 幂等、可异步解析 | P0 |
| API-044 | DELETE | `/task-drafts/{task_draft_id}/sources/{source_id}` | 从草稿解除 Source | `INT-045` | `draft_revision` | 更新后的 revision | 幂等、乐观锁 | P0 |
| API-045 | POST | `/task-drafts/{task_draft_id}/context-tags` | 添加 ContextTag | `INT-046` | tag、`draft_revision` | `ContextTag`、revision | 幂等、乐观锁 | P1 |
| API-046 | DELETE | `/task-drafts/{task_draft_id}/context-tags/{context_tag_id}` | 删除 ContextTag | `INT-047` | `draft_revision` | 更新后的 revision | 幂等、乐观锁 | P1 |
| API-047 | POST | `/task-drafts/{task_draft_id}/actions` | 执行 Clarify、Expand、Check、Simulate | `INT-048` | `action_type`、draft snapshot | suggestions、optional draft patch | 幂等、可异步 | P1 |
| API-048 | POST | `/task-runs` | 校验 TaskDraft 并创建一次任务执行 | `INT-050` | `task_draft_id`、`draft_revision`、`state_version_id` | `TaskRun` | 幂等、异步 | P0 |
| API-049 | GET | `/task-runs/{task_run_id}` | 恢复和查询任务执行状态 | `INT-007`、`INT-051` | task run ID | `TaskRun`、progress、latest event | 同步 | P0 |
| API-050 | GET | `/task-runs/{task_run_id}/events` | 接收任务执行阶段和日志 | `INT-051` | `after_sequence` | `RunEvent` 流 | SSE、断线续传 | P0 |
| API-051 | POST | `/task-runs/{task_run_id}/retry` | 重试失败阶段或恢复运行 | `INT-052` | retry mode、failed stage | 新 run attempt 或更新后的 TaskRun | 幂等、异步 | P0 |
| API-052 | GET | `/task-runs/{task_run_id}/result` | 获取完成结果、评分和 Artifacts | `INT-053` | task run ID | overview、`Artifact[]`、quality scores | 同步 | P0 |
| API-053 | POST | `/task-runs/{task_run_id}/refine-draft` | 基于原任务创建可编辑 TaskDraft | `INT-054` | selected result context | 新 `TaskDraft` | 幂等 | P1 |
| API-054 | POST | `/task-runs/{task_run_id}/state-adjustment-draft` | 提取任务差距并创建/加载 StateDraft | `INT-055` | selected gaps、state ID | `StateDraft`、recommendations | 幂等 | P0 |
| API-055 | GET | `/artifacts/{artifact_id}/download-url` | 获取短期下载地址 | `INT-056` | artifact ID | signed URL、expires_at、mime type | 同步、审计 | P0 |

### 4.5 State Lab、StateDraft 与 Skill 挂载

| API-ID | Method | Path | 用途 | 对应交互 | 主要输入 | 主要输出 | 执行 | 优先级 |
|---|---|---|---|---|---|---|---|---|
| API-056 | GET | `/state-lab` | 获取 Draft、Recent States、Templates 和权限 | `INT-064` | 无 | LabHome 聚合对象 | 同步 | P0 |
| API-057 | GET | `/state-templates` | 获取 State 模板 | `INT-064`、`INT-066` | filters、cursor | template summaries | 同步 | P1 |
| API-058 | POST | `/state-drafts` | 创建空白或模板 StateDraft | `INT-066`、`INT-067` | `creation_mode`、optional `template_id` | `StateDraft` | 幂等 | P0 |
| API-059 | GET | `/state-drafts/{state_draft_id}` | 恢复或加载 StateDraft | `INT-057`、`INT-065` | state draft ID | `StateDraft`、mounts、permissions | 同步 | P0 |
| API-060 | PATCH | `/state-drafts/{state_draft_id}` | 保存 State 目标、配置和普通字段 | `INT-070`、`INT-073` | changed fields、`draft_revision` | 更新后的 `StateDraft` | 乐观锁 | P0 |
| API-061 | POST | `/state-drafts/{state_draft_id}/analyze-intent` | 分析目标并推荐能力和 Skill | `INT-068` | goal、constraints、revision | recommendation operation | 幂等、异步 | P0 |
| API-062 | GET | `/state-drafts/{state_draft_id}/recommendations` | 获取任务差距和 Skill 推荐 | `INT-057`、`INT-068` | optional operation ID | capabilities、Skill recommendations | 同步 | P0 |
| API-063 | POST | `/state-drafts/{state_draft_id}/skill-compatibility` | 校验推荐 Skill 的权限和兼容性 | `INT-058` | `skill_version_id` | compatibility result、conflicts | 同步 | P0 |
| API-064 | POST | `/state-drafts/{state_draft_id}/skill-mounts` | 将 Skill 添加到 StateDraft | `INT-069` | skill version、config、revision | `StateSkillMount`、new revision | 幂等、乐观锁 | P0 |
| API-065 | PUT | `/state-drafts/{state_draft_id}/skill-mounts/order` | 保存 Skill 组合、顺序和环上位置 | `INT-070` | ordered mounts、revision | updated mounts、new revision | 乐观锁 | P1 |
| API-066 | POST | `/state-drafts/{state_draft_id}/imports` | 将外部 Skill 导入任务关联到 StateDraft | `INT-071` | repo/file source | `ImportJob` | 幂等、异步 | P0 |
| API-067 | POST | `/state-drafts/{state_draft_id}/save-and-retest` | 原子保存 StateDraft 并创建 TestRun | `INT-061` | draft patch、revision、task/test snapshot | state draft ID、new revision、test run ID | 幂等、原子、异步 | P0 |
| API-068 | POST | `/state-drafts/{state_draft_id}/lab-tests` | 为新 StateDraft 创建 Lab Test | `INT-072` | test case、revision | `TestRun` | 幂等、异步 | P0 |
| API-069 | POST | `/state-drafts/{state_draft_id}/save-unpublished` | 测试后保存私人未发布 StateDraft | `INT-073` | `test_run_id`、revision | unpublished `StateDraft` | 幂等；禁止 publish/activate | P0 |

### 4.6 Skill 创建、导入、验证与发布

| API-ID | Method | Path | 用途 | 对应交互 | 主要输入 | 主要输出 | 执行 | 优先级 |
|---|---|---|---|---|---|---|---|---|
| API-070 | GET | `/skills` | 获取用户可见 Skill 列表 | `INT-074` | cursor、filters、status | Skill/SkillVersion summaries | 同步 | P0 |
| API-071 | GET | `/skill-templates` | 获取 Skill 模板 | `INT-077` | filters、cursor | templates | 同步 | P1 |
| API-072 | POST | `/skill-drafts` | 按 Blank、Template 或 Import 初始化 SkillDraft | `INT-080`、`INT-096` | `creation_mode`、template/import ID | `SkillDraft` | 幂等 | P0 |
| API-073 | GET | `/skill-drafts/{skill_draft_id}` | 加载 SkillDraft 和当前步骤 | `INT-081`、`INT-097` | skill draft ID | `SkillDraft`、capabilities、config | 同步 | P0 |
| API-074 | PATCH | `/skill-drafts/{skill_draft_id}` | 保存 Blank 1-5、基础信息与 Behavior | `INT-081`、`INT-082`、`INT-083`、`INT-084`、`INT-085`、`INT-097`、`INT-098`、`INT-099`、`INT-100`、`INT-101` | changed sections、`draft_revision` | 更新后的 `SkillDraft` | 乐观锁 | P0 |
| API-075 | GET | `/skill-drafts/{skill_draft_id}/files/{file_path}` | 获取 Developer Mode 文件 | `INT-086`、`INT-088` | encoded file path | `SkillFile` | 同步 | P1 |
| API-076 | PUT | `/skill-drafts/{skill_draft_id}/files/{file_path}` | 保存 skill.md、schema 或 test case | `INT-086` | content、checksum、revision | 更新后的 `SkillFile` | 乐观锁 | P0 |
| API-077 | GET | `/skill-drafts/{skill_draft_id}/sources` | 获取 Skill Sources | `INT-087` | cursor | `Source[]` | 同步 | P1 |
| API-078 | POST | `/skill-drafts/{skill_draft_id}/sources` | 添加或管理 Skill Source | `INT-087` | source input、revision | `Source`、new revision | 幂等、可异步解析 | P1 |
| API-079 | POST | `/skill-drafts/{skill_draft_id}/versions` | 保存命名草稿版本 | `INT-089` | version name、notes、revision | draft `SkillVersion` | 幂等 | P1 |
| API-080 | POST | `/import-jobs` | 从仓库或文件启动 Skill 导入 | `INT-092`、`INT-093` | source type、repo/asset、branch | `ImportJob` | 幂等、异步 | P0 |
| API-081 | GET | `/import-jobs/{import_job_id}` | 查询导入状态和检查摘要 | `INT-092`、`INT-093`、`INT-095` | import job ID | `ImportJob`、checks | 同步 | P0 |
| API-082 | GET | `/import-jobs/{import_job_id}/checks/{check_id}` | 查看未通过检查详情 | `INT-094` | check ID | evidence、risk、suggested fix | 同步 | P1 |
| API-083 | POST | `/import-jobs/{import_job_id}/save-for-later` | 保存未完成导入草稿 | `INT-095` | optional notes | updated `ImportJob` | 幂等 | P1 |
| API-084 | POST | `/import-jobs/{import_job_id}/convert-to-draft` | 将通过检查的导入转为 SkillDraft | `INT-096` | selected capabilities | `SkillDraft` | 幂等 | P0 |
| API-085 | POST | `/skill-drafts/{skill_draft_id}/validation-runs` | 创建 Skill 验证运行 | `INT-090`、`INT-102`、`INT-105` | revision、test set IDs、mode | `ValidationRun` | 幂等、异步 | P0 |
| API-086 | GET | `/validation-runs/{validation_run_id}` | 获取验证汇总与指标 | `INT-090`、`INT-102`、`INT-105` | validation run ID | `ValidationRun`、metrics、review count | 同步 | P0 |
| API-087 | GET | `/validation-runs/{validation_run_id}/events` | 接收验证阶段和进度 | `INT-090`、`INT-102`、`INT-105` | `after_sequence` | `RunEvent` 流 | SSE、断线续传 | P0 |
| API-088 | POST | `/skill-drafts/{skill_draft_id}/test-sets` | 创建或关联 TestSet | `INT-103` | name、cases 或 existing ID | `TestSet` | 幂等 | P1 |
| API-089 | GET | `/validation-runs/{validation_run_id}/review-items/{review_item_id}` | 查看验证问题和证据 | `INT-104` | review item ID | `ReviewItem` | 同步 | P1 |
| API-090 | POST | `/skill-drafts/{skill_draft_id}/publish-check` | 检查系统发布前置条件 | `INT-106` | revision、validation run ID | readiness、blocking issues | 幂等、同步 | P0 |
| API-091 | GET | `/skill-drafts/{skill_draft_id}/eligible-state-drafts` | 获取可挂载目标 StateDraft | `INT-107` | cursor、filters | StateDraft summaries | 同步 | P1 |
| API-092 | PATCH | `/skill-drafts/{skill_draft_id}/publish-settings` | 保存目标 State 和发布设置草稿 | `INT-109` | destination、activation mode、revision | updated publish settings | 乐观锁 | P1 |
| API-093 | POST | `/skill-drafts/{skill_draft_id}/publish` | 创建正式 SkillVersion 并挂载到 StateDraft | `INT-110` | revision、destination state draft、validation ID | published SkillVersion、mount、new StateDraft revision | 幂等、原子、审计 | P0 |
| API-094 | POST | `/skill-drafts/{skill_draft_id}/exportable-versions` | 创建可导出的 SkillVersion | `INT-111` | version name、notes、revision | immutable `SkillVersion` | 幂等 | P1 |
| API-095 | GET | `/skill-versions/{skill_version_id}/diff` | 获取 Base 与当前版本差异 | `INT-114` | optional base version ID | structured diff | 同步 | P1 |
| API-096 | POST | `/skill-versions/{skill_version_id}/mounts` | 将 SkillVersion 挂载到 StateDraft | `INT-115` | state draft ID、config、revision | `StateSkillMount` | 幂等、乐观锁 | P0 |

### 4.7 State Test、TestRun、Artifact 与 Workspace

| API-ID | Method | Path | 用途 | 对应交互 | 主要输入 | 主要输出 | 执行 | 优先级 |
|---|---|---|---|---|---|---|---|---|
| API-097 | POST | `/test-drafts` | 为 State 创建测试草稿 | `INT-116`、`INT-135` | state/version、optional task | `TestDraft` | 幂等 | P0 |
| API-098 | GET | `/test-drafts/{test_draft_id}` | 加载测试设置 | `INT-116` | test draft ID | `TestDraft`、recent tests | 同步 | P0 |
| API-099 | POST | `/test-drafts/{test_draft_id}/sources` | 添加测试文件、文字、链接或数据连接 | `INT-118`、`INT-119` | source input、revision | `Source`、new revision | 幂等、可异步解析 | P0 |
| API-100 | POST | `/test-runs` | 校验额度并创建测试 | `INT-122`、`INT-127` | test draft/snapshot、state version、mode | `TestRun` | 幂等、异步 | P0 |
| API-101 | GET | `/test-runs/{test_run_id}` | 查询或恢复测试状态 | `INT-007`、`INT-062`、`INT-123` | test run ID | `TestRun`、progress、latest event | 同步 | P0 |
| API-102 | GET | `/test-runs/{test_run_id}/events` | 接收测试阶段和指标 | `INT-062`、`INT-123` | `after_sequence` | `RunEvent` 流 | SSE、断线续传 | P0 |
| API-103 | GET | `/test-runs/{test_run_id}/result` | 获取测试结果、评分、Artifacts 和建议 | `INT-063`、`INT-124` | test run ID | `TestResult`、`Artifact[]` | 同步；不得自动发布 | P0 |
| API-104 | GET | `/artifacts/{artifact_id}/preview` | 获取 Artifact 预览或打开地址 | `INT-125` | artifact ID | preview URL/type/metadata | 同步、审计 | P1 |
| API-105 | POST | `/test-runs/{test_run_id}/state-adjustment-draft` | 根据测试缺口创建/加载 StateDraft | `INT-128` | selected gaps | `StateDraft`、recommendations | 幂等 | P0 |
| API-106 | POST | `/artifacts/{artifact_id}/workspace-items` | 将测试结果保存到用户选择的位置 | `INT-129` | selected workspace/container、name | workspace item reference | 幂等 | P0 |

### 4.8 State Match、Passport、Sandbox、安装与激活

| API-ID | Method | Path | 用途 | 对应交互 | 主要输入 | 主要输出 | 执行 | 优先级 |
|---|---|---|---|---|---|---|---|---|
| API-107 | GET | `/state-market` | 获取推荐 State、分类和已有安装 | `INT-130` | cursor、filters | state cards、categories、installation summary | 同步 | P0 |
| API-108 | POST | `/state-matches` | 根据任务或 Quick Intent 计算 Fit Score | `INT-131`、`INT-132` | need text、intent、constraints | ranked states、fit reasons | 幂等、可异步 | P0 |
| API-109 | GET | `/state-versions/{state_version_id}/market-summary` | 获取选中 State 卡片详情 | `INT-133` | optional match ID | summary、fit score、proof summary | 同步 | P1 |
| API-110 | GET | `/state-versions/{state_version_id}/proof` | 获取验证证据和运行证明 | `INT-134` | optional match ID | verified runs、metrics、provenance | 同步 | P1 |
| API-111 | POST | `/sandbox-sessions` | 创建临时 Sandbox/Test Session | `INT-137` | state version、task snapshot、limits | `SandboxSession` | 幂等、异步准备 | P0 |
| API-112 | POST | `/state-installations` | 安装 State，但不激活 | `INT-138` | state version、license acceptance | `StateInstallation(status=installed_inactive)` | 幂等、审计 | P0 |
| API-113 | POST | `/state-installations/{installation_id}/activate` | 用户在 Lab 手动激活安装项并替换唯一 Current State | `INT-139` | expected current state、revision | active installation、previous current state | 幂等、原子、审计 | P0 |
| API-114 | POST | `/state-installations/{installation_id}/deactivate` | 停用已安装 State | `INT-139` | reason、revision | inactive installation | 幂等、审计 | P1 |
| API-115 | DELETE | `/state-installations/{installation_id}` | 卸载未被运行依赖占用的 State | `INT-139` | installation ID | 无响应体 | 幂等、审计 | P1 |

### 4.9 State Ledger、版本、分支与恢复

| API-ID | Method | Path | 用途 | 对应交互 | 主要输入 | 主要输出 | 执行 | 优先级 |
|---|---|---|---|---|---|---|---|---|
| API-116 | GET | `/states/{state_id}/ledger` | 获取版本、分支、来源任务和指定视图 | `INT-140`、`INT-141` | view、cursor、filters | versions、branches、events、summary | 同步 | P1 |
| API-117 | GET | `/state-versions/{state_version_id}` | 获取版本详情和保留内容 | `INT-142` | state version ID | `StateVersion`、learnings、quality | 同步 | P1 |
| API-118 | GET | `/state-versions/{state_version_id}/diff/{other_version_id}` | 比较两个 StateVersion | `INT-143` | two version IDs | structured diff | 同步或异步大对象 | P1 |
| API-119 | POST | `/states/{state_id}/branches` | 基于所选版本创建 Draft Branch | `INT-144` | source version、name | new `StateDraft`、LedgerEvent | 幂等、审计 | P1 |
| API-120 | POST | `/states/{state_id}/restores` | 基于历史版本创建新的 StateDraft | `INT-145` | source version、expected current version、confirmation token | new StateDraft、unchanged Current State、LedgerEvent | 幂等、原子、审计 | P0 |
| API-121 | GET | `/states/{state_id}/evolution` | 获取可回放的版本演化事件 | `INT-146` | from/to version、cursor | ordered LedgerEvents | 同步 | P2 |
| API-122 | GET | `/states/{state_id}/timeline` | 获取完整时间线 | `INT-147` | cursor、event types、date range | `LedgerEvent[]` | 同步 | P1 |

### 4.10 通用上传与 Source 状态

这些接口被 Task、Test、Skill、头像等多个页面复用，不应由每个业务模块重新实现一套上传协议。

| API-ID | Method | Path | 用途 | 对应交互 | 主要输入 | 主要输出 | 执行 | 优先级 |
|---|---|---|---|---|---|---|---|---|
| API-123 | POST | `/uploads` | 创建上传任务或预签名地址 | `INT-013`、`INT-043`、`INT-093`、`INT-118` | filename、size、mime type、purpose | upload ID、upload URL、headers | 幂等 | P0 |
| API-124 | POST | `/uploads/{upload_id}/complete` | 确认上传并生成 Asset/Source | `INT-013`、`INT-043`、`INT-093`、`INT-118` | checksum、parts | asset/source ID、parse status | 幂等、可异步解析 | P0 |
| API-125 | GET | `/sources/{source_id}` | 查询资料解析与安全扫描状态 | `INT-043`、`INT-044`、`INT-071`、`INT-093`、`INT-118`、`INT-119` | source ID | `Source`、parse result、failure reason | 同步 | P0 |
| API-126 | POST | `/sources/{source_id}/retry-parse` | 重试失败的资料解析 | `INT-043`、`INT-044`、`INT-071`、`INT-093`、`INT-118`、`INT-119` | parser options | parse operation | 幂等、异步 | P1 |
| API-127 | GET | `/operations/{operation_id}/events` | 订阅没有专属 Run 事件接口的通用异步任务 | `INT-037`、`INT-048`、`INT-068`、`INT-092`、`INT-093`、`INT-113`、`INT-131` | `after_sequence` | 通用 OperationEvent 流 | SSE、断线续传 | P1 |
| API-128 | GET | `/runtime/events` | 订阅 Live、连接和 Autosave 状态 | `INT-006` | `resource_type`、`resource_id`、`after_sequence` | RuntimeEvent 流 | SSE、断线续传 | P1 |

## 5. 关键接口行为

### 5.1 登录

`POST /api/v1/auth/login`

```json
{
  "email": "user@example.com",
  "password": "********",
  "device_info": {
    "platform": "macos",
    "app_version": "1.0.0"
  }
}
```

成功返回 Session 和最少必要的 UserProfile。密码、密码哈希、第三方密钥不得出现在响应、普通日志或 AuditLog 详情中。

### 5.2 发送对话消息

`POST /api/v1/conversations/{conversation_id}/messages`

```json
{
  "client_message_id": "client_msg_01...",
  "content": "Help me create a board brief.",
  "attachment_source_ids": []
}
```

响应返回已持久化的用户 Message 和 `response_run_id`。State 回复通过事件流发送，不应让单个 HTTP 请求一直等待完整生成结果。

### 5.3 启动 TaskRun

`POST /api/v1/task-runs`

```json
{
  "task_draft_id": "td_01...",
  "draft_revision": 7,
  "state_version_id": "stv_01..."
}
```

同一个 `Idempotency-Key` 重试时必须返回同一个 TaskRun，不能重复扣额度或重复创建 Artifact。

### 5.4 Save & Re-test

`POST /api/v1/state-drafts/{state_draft_id}/save-and-retest`

```json
{
  "draft_revision": 12,
  "changes": {
    "skill_mounts": []
  },
  "test_input": {
    "source_task_run_id": "trun_01...",
    "mode": "deep"
  }
}
```

成功返回：

```json
{
  "data": {
    "state_draft_id": "std_01...",
    "draft_revision": 13,
    "test_run_id": "testrun_01...",
    "test_run_status": "queued"
  }
}
```

强制规则：

1. 保存 Draft 和创建 TestRun 必须属于同一个业务事务。
2. 创建 TestRun 失败时，不得让前端误以为已进入测试。
3. 相同幂等键重试时返回同一 `test_run_id`。
4. 测试成功不得自动发布 State，也不得替换当前激活版本。

### 5.5 发布 Skill

`POST /api/v1/skill-drafts/{skill_draft_id}/publish`

```json
{
  "draft_revision": 18,
  "validation_run_id": "vr_01...",
  "destination": {
    "state_draft_id": "std_01..."
  }
}
```

发布成功后 `SkillVersion` 不可变。发布和挂载到目标 StateDraft 必须原子执行；任一部分失败时不得留下“已发布但页面显示未挂载”的半完成状态。当前阶段只做系统校验，不创建人工审批单。

### 5.6 安装和激活 State

安装：

```http
POST /api/v1/state-installations
```

```json
{
  "state_version_id": "stv_market_01...",
  "license_acceptance": true
}
```

安装成功必须返回：

```json
{
  "data": {
    "installation_id": "ins_01...",
    "status": "installed_inactive",
    "is_current": false
  }
}
```

用户随后在 Lab 手动激活：

```http
POST /api/v1/state-installations/{installation_id}/activate
```

后端不得在安装接口中隐式激活，也不得因安装完成自动替换 Current State。一个用户只能有一个 Current State；Activate 必须在同一事务中替换旧 Current State。

## 6. 异步任务与实时事件

### 6.1 需要异步执行的对象

| 对象 | 典型动作 | 最低状态集合 |
|---|---|---|
| `TaskRun` | 执行用户任务 | `queued`、`running`、`completed`、`failed`、`cancelled` |
| `TestRun` | 测试或重测 State | `queued`、`running`、`completed`、`failed`、`cancelled` |
| `ValidationRun` | 验证 Skill | `queued`、`running`、`completed`、`failed`、`cancelled` |
| `ImportJob` | 读取仓库/文件并检查 | `queued`、`scanning`、`completed`、`needs_review`、`failed` |
| `ExportJob` | 生成导出包 | `queued`、`processing`、`completed`、`failed`、`expired` |

### 6.2 SSE 事件格式

首版建议使用 Server-Sent Events。需要双向控制时，控制命令仍通过普通 POST API 提交。

```text
id: 42
event: run.progress
data: {"run_id":"testrun_01...","sequence":42,"stage":"research","progress":0.63,"occurred_at":"2026-07-14T10:21:32Z"}
```

每个事件必须包含：

| 字段 | 说明 |
|---|---|
| `event_id` | 事件唯一 ID |
| `sequence` | 在单个 stream 内单调递增 |
| `event_type` | 稳定事件类型 |
| `resource_type` | `task_run`、`test_run` 等 |
| `resource_id` | 对应 Run/State ID |
| `occurred_at` | 服务端 UTC 时间 |
| `payload` | 事件数据 |

断线重连时，前端发送 `Last-Event-ID` 或 `after_sequence`。后端应补发未收到的事件；若保留窗口已过期，则返回需要重新查询完整状态的错误码。

### 6.3 最低事件类型

| 事件类型 | 用途 |
|---|---|
| `run.queued` | 已排队 |
| `run.started` | 开始执行 |
| `run.stage_changed` | 阶段变化 |
| `run.progress` | 进度更新 |
| `run.log` | 可展示的执行日志 |
| `artifact.created` | 新结果可用 |
| `run.completed` | 成功完成 |
| `run.failed` | 失败并携带稳定错误码 |
| `reply.delta` | 对话回复增量 |
| `reply.completed` | 对话回复完成 |
| `monitor.metric_updated` | Monitor 指标变化 |
| `monitor.system_event` | 系统日志/健康事件 |

## 7. 权限要求

### 7.1 角色级别

| 角色 | 最低权限 |
|---|---|
| 访客 | Welcome、Login、Sign up 及公开 Passport |
| 已登录用户 | 自己的 Profile、通知、安装项、会话和可见市场内容 |
| State Viewer | 查看 State、Passport、结果和允许的 Ledger 数据 |
| State Editor | 修改 StateDraft、挂载 Skill、创建 TestRun |
| State Owner | 发布/恢复/分支、激活安装项、管理权限 |
| Skill Creator | 创建和修改自己的 SkillDraft |
| Skill Publisher | 发布 SkillVersion 并挂载到有权限的 StateDraft |

### 7.2 对象级权限

每次请求必须同时校验：

1. 用户是否已登录。
2. 用户是否能访问该对象。
3. 用户是否能执行当前动作。
4. Source、Message、Artifact 等子资源是否属于同一授权边界。
5. 分享链接是否仍有效、是否被撤销、是否达到访问限制。

只隐藏前端按钮不能替代后端权限校验。

### 7.3 必须写 AuditLog 的操作

- 登录安全事件、退出和 Session 撤销。
- 创建或撤销 ShareLink。
- 下载敏感 Artifact 或 Source。
- 发布 SkillVersion。
- 安装、激活、停用和卸载 State。
- 创建 State 分支和恢复版本。
- 权限、Guardrails、外部数据连接的修改。
- 阻止恶意文件，以及生成高风险导出。

## 8. 幂等、并发与版本规则

### 8.1 必须支持幂等键的动作

- 创建 User、Conversation、TaskRun、TestRun、ValidationRun。
- 创建 StateDraft、SkillDraft、ImportJob、ExportJob。
- Save & Re-test。
- 发布 Skill、安装/激活 State、创建分支、恢复版本。
- 将 Artifact 保存到 Workspace。

同一个用户、同一个 endpoint、同一个 `Idempotency-Key`：

1. 请求体相同，返回首次请求结果。
2. 请求体不同，返回 `409 IDEMPOTENCY_CONFLICT`。
3. 幂等记录保留时长至少覆盖前端正常重试窗口，具体时长由后端方案确认。

### 8.2 Draft 乐观锁

TaskDraft、StateDraft、SkillDraft、TestDraft 和 UserProfile 的更新必须校验 revision。过期写入返回 `412 REVISION_CONFLICT`，并返回当前 revision；不得静默覆盖另一页面或另一设备的更改。

### 8.3 不可变版本

`StateVersion` 和已发布的 `SkillVersion` 创建后不可原地编辑。修改必须基于旧版本创建新的 Draft/Version。Restore 只创建新的 StateDraft，不删除或覆盖历史版本，也不改变 Current State。

## 9. 稳定错误码

| 错误码 | HTTP | 前端处理建议 |
|---|---:|---|
| `AUTH_INVALID_CREDENTIALS` | 401 | 保留邮箱，清空密码，允许重试 |
| `AUTH_SESSION_EXPIRED` | 401 | 保存可恢复本地状态后进入登录页 |
| `RESOURCE_FORBIDDEN` | 403 | 隐藏不可执行动作并说明无权限 |
| `RESOURCE_NOT_FOUND` | 404 | 返回上一级，并刷新列表 |
| `REVISION_CONFLICT` | 412 | 提示内容已更新，重新加载或人工合并 |
| `IDEMPOTENCY_CONFLICT` | 409 | 不自动重试，记录 request ID |
| `VALIDATION_FAILED` | 422 | 按 `field_errors` 标记对应输入 |
| `INSUFFICIENT_QUOTA` | 422/429 | 显示所需额度和当前额度 |
| `SOURCE_PARSE_FAILED` | 422 | 保留 Source，提供重试/替换入口 |
| `SOURCE_UNSAFE` | 422 | 阻止继续并显示安全原因 |
| `UPLOAD_TOO_LARGE` | 413 | 保留其他文件，要求更换或压缩当前文件 |
| `UPLOAD_UNSUPPORTED_TYPE` | 415 | 显示允许类型并要求更换文件 |
| `UPLOAD_EXPIRED` | 410 | 创建新 UploadSession，不复用旧签名 URL |
| `UPLOAD_INCOMPLETE` | 409 | 恢复分片或重新上传 |
| `UPLOAD_CHECKSUM_MISMATCH` | 422 | 当前对象不可用，重新上传 |
| `MALWARE_DETECTED` | 422 | 阻止预览、下载和解析；显示安全说明 |
| `URL_FETCH_BLOCKED` | 422 | 要求更换 URL，不暴露内部网络细节 |
| `PREVIEW_UNAVAILABLE` | 422 | 按权限提供原文件下载或其他格式 |
| `DOWNLOAD_URL_EXPIRED` | 410 | 重新授权生成短期下载地址 |
| `SHARE_LINK_EXPIRED` | 410 | 不返回资源，由 owner 创建新链接 |
| `SHARE_LINK_REVOKED` | 410/404 | 不返回资源或所有者信息 |
| `RUN_FAILED` | 422/500 | 显示失败阶段和 Retry/Resume 能力 |
| `RUN_NOT_RETRYABLE` | 409 | 隐藏重试，允许创建新 Run |
| `VERSION_CONFLICT` | 409 | 刷新版本或目标 StateDraft |
| `ALREADY_INSTALLED` | 409 | 返回已有 Installation ID |
| `STATE_NOT_ACTIVATABLE` | 422 | 显示缺失权限、依赖或兼容性信息 |
| `EXPORT_FORMAT_UNAVAILABLE` | 422 | 刷新格式列表，要求重新选择 |
| `EXPORT_FAILED` | 422/500 | 保留 ExportJob 并允许重试 |
| `RATE_LIMITED` | 429 | 读取 `Retry-After` 后再重试 |
| `EVENT_CURSOR_EXPIRED` | 409 | 停止补流，重新 GET 完整 Run/Monitor 状态 |
| `DEPENDENCY_UNAVAILABLE` | 503 | 指数退避，不重复创建写入资源 |

## 10. 后端验收标准

### 10.1 功能覆盖

- 本文件已覆盖交互矩阵中 138 条需要后端参与的交互，其中 117 条完全依赖后端、21 条部分依赖后端。
- 归档/废弃页面不应产生额外 API。
- 每个 P0 交互都能找到对应 API-ID。
- 每个写入接口都定义权限、幂等或 revision 处理方式。
- 每个异步动作都能通过 Run/Job ID 在刷新后恢复。

### 10.2 行为验收

| 场景 | 必须通过的验证 |
|---|---|
| 用户双击 Run State | 只创建一个 TaskRun |
| Save & Re-test 请求超时后重试 | 返回原 TestRun，不重复测试 |
| 两个页面同时编辑 SkillDraft | 旧 revision 更新收到 412，不覆盖新版本 |
| TestRun 完成 | State 保持 Draft，不自动 Publish/Activate |
| Install State 完成 | status 为 `installed_inactive`，Current State 不变 |
| 用户在 Lab 激活安装项 | 原子替换唯一 Current State；同一用户不能同时拥有多个 Current State |
| SSE 断线重连 | 根据 sequence 补齐遗漏事件，不重复展示 |
| 导出格式变化 | 前端重新查询 `/exports/formats` 后正常工作 |
| 版本 Restore | 创建新的 StateDraft，保留旧版本和 AuditLog，Current State 不变 |

### 10.3 非功能最低要求

具体数值需要后端结合部署环境确认，首轮评审至少要给出：

1. 普通查询、聚合查询和写入接口的 P95 延迟目标。
2. Run/Job 最大执行时间和超时处理。
3. SSE 最大并发连接、事件保留窗口和重连策略。
4. Source/Artifact 的文件大小、类型和保存时长限制。
5. ShareLink、下载 URL 和 access token 的过期策略。
6. 日志脱敏、审计保留和备份恢复策略。
7. 用户级和组织级额度、限流与并发 Run 限制。

## 11. 下一份技术文件的输入

后端评审本文件后，应把确认结果继续写入：

1. `07-realtime-and-async-events.md`：确定 SSE/WebSocket、事件 payload、断线续传和 Run 状态机。
2. `08-error-and-empty-states.md`：把稳定错误码映射到每个页面的提示、恢复动作和 Empty 状态。
3. OpenAPI 3.1 文件：把已确认接口转换为可生成前端 Client 和 Mock Server 的机器可读契约。

## 12. 仍需产品或后端确认的问题

这些问题不阻塞接口目录，但必须在 OpenAPI 定稿前确认：

1. 调整 State 后，成功测试结果是仅更新现有 StateDraft，还是同时生成候选 StateVersion。
2. TaskRun Retry 是在原 Run 中增加 attempt，还是创建新的 TaskRun 并通过 `parent_run_id` 关联。
3. 外部数据连接首版支持哪些 provider，以及 OAuth token 的保存责任。
4. 公开 ShareLink 是否允许未登录访问，是否需要密码和访问次数上限。
5. 导出格式的首版白名单、最大文件尺寸和过期时间。
6. Skill 发布后挂载失败时采用整笔回滚，还是允许发布成功后人工重试挂载。本文件当前要求整笔回滚。
7. SandboxSession 的最长时长、数据隔离级别和是否消耗用户额度。
8. Monitor 原始日志对普通用户的可见范围和脱敏规则。
