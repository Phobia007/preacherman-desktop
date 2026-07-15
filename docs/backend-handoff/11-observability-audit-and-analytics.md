# 11. Observability、Audit 与 Analytics 规范

- 项目：Preacherman
- 用途：统一请求追踪、结构化日志、指标、Trace、AuditLog、产品埋点和 Run 用量成本
- 适用范围：`02-screen-index` 至 `10-file-upload-export-and-sharing` 中所有正式页面、API、异步任务、实时事件和文件链路
- 依赖：`03-user-flows.md`、`04-interaction-matrix.csv`、`05-data-dictionary.md`、`06-api-requirements.md`、`07-realtime-and-async-events.md`、`08-error-and-empty-states.md`、`09-permissions-and-roles.md`、`10-file-upload-export-and-sharing.md`
- 状态：后端、前端、运维和数据共同评审稿

## 1. 这份文件解决什么问题

这份文件让团队能够回答五类问题：

1. 用户点击按钮后，请求经过了哪些 API、队列、Worker、模型和文件处理阶段。
2. 某次失败是前端、网络、权限、业务校验、第三方服务还是异步任务造成的。
3. 哪些高风险动作由谁、何时、对什么资源执行，结果是成功还是失败。
4. 用户真正使用了哪些流程，在哪一步退出，哪些功能有效。
5. 每次 Conversation、TaskRun、TestRun、ValidationRun、ImportJob 和 ExportJob 消耗了多少 Token、API、计算和存储资源。

它不替代业务数据库、Ledger 或安全权限系统，也不允许团队为了排障把用户私密内容复制到日志和分析平台。

## 2. 三套数据必须分开

| 数据面 | 主要用途 | 典型使用者 | 是否作为业务事实 | 是否允许抽样 |
|---|---|---|---:|---:|
| Observability | 排障、性能、容量、可用性 | 后端、SRE、值班人员 | 否 | 日志和 Trace 可抽样；关键指标不可 |
| AuditLog | 安全追责、敏感动作证据 | 安全、合规、授权管理员 | 是，只记录动作事实 | 否 |
| Product Analytics | 漏斗、采用率、体验改进 | 产品、设计、数据 | 否 | 可按明确策略抽样 |
| UsageRecord | 额度、成本、内部计费依据 | 后端、财务、产品 | 是，服务端生成 | 否 |

禁止混用：

- 产品埋点不能证明权限动作确实发生。
- 普通应用日志不能代替不可变 AuditLog。
- AuditLog 不保存页面浏览、Hover 或营销漏斗。
- UsageRecord 不信任前端上报的 Token 或费用。
- Monitor 的用户可见日志是脱敏后的产品数据，不等于内部完整日志。

## 3. 全链路关联 ID

### 3.1 ID 定义

| 字段 | 生成方 | 生命周期 | 用途 | 可进入哪里 |
|---|---|---|---|---|
| `request_id` | API 网关或首个后端服务 | 单次 HTTP 请求 | 关联响应、日志、错误和 AuditLog | 日志、Trace、AuditLog、前端错误上报 |
| `trace_id` | 客户端 SDK、网关或首个服务 | 一条分布式调用链 | 串联 HTTP、队列、Worker、数据库和外部调用 | Trace、内部日志 |
| `span_id` | 每个调用节点 | 单个操作 | 标识某个 HTTP/DB/Worker/模型调用 | Trace、内部日志 |
| `correlation_id` | 首个业务动作服务 | 一次用户意图 | 串联多请求和多异步任务 | 日志、Trace、AuditLog、内部事件 |
| `operation_id` | 异步任务创建服务 | 一次 Operation | 关联状态查询、事件和终态 | API、SSE、日志、UsageRecord |
| `run_id` / `job_id` | 业务服务 | 单次 Run/Job | 关联运行快照、事件、结果和成本 | 业务库、日志、Trace、UsageRecord |
| `event_id` | 事件生产者 | 单个事件 | 幂等消费和排障 | SSE、消息队列、事件存储 |
| `stream_id` + `sequence` | Stream 生产者 | 单个事件流 | 断线续传和去重 | SSE、事件存储 |
| `client_event_id` | 前端 | 单条埋点/错误事件 | 批量重试去重 | Analytics、客户端错误采集 |
| `idempotency_key` | 前端 | 单个写入意图 | 防止双击或超时重试造成重复写入 | 请求头、幂等存储、内部日志哈希 |

### 3.2 生成和信任规则

1. 客户端可以发送 `X-Request-ID`，网关必须校验格式和长度；无效值丢弃并重新生成。
2. 后端始终在响应头和响应 `meta.request_id` 中回传最终 `request_id`。
3. 同一 `request_id` 只代表一次 HTTP 请求；Retry 必须使用新 `request_id`。
4. 同一用户意图的 Retry 可保留原 `correlation_id`，但创建新 Run 时必须产生新 `run_id`。
5. `trace_id` 使用标准 Trace Context 传播；不得把 User ID、邮箱或资源类型编码进 ID。
6. 队列消息必须携带 `trace_id`、`correlation_id`、`operation_id` 和来源 `request_id`。
7. `idempotency_key` 只用于防重，不作为安全凭证；日志仅记录哈希或受控短值。

### 3.3 端到端传播示例

```text
INT-050 Click Run State
  -> POST /task-runs
     request_id=req_01
     trace_id=trace_01
     correlation_id=corr_01
     idempotency_key_hash=idem_h_01
  -> TaskRun(task_run_id=tr_01)
  -> Operation(operation_id=op_01)
  -> Queue message(trace_01, corr_01, op_01, tr_01)
  -> Worker spans: plan -> research -> synthesize -> output
  -> RunEvent(stream_id=tr_01, sequence=1..n)
  -> Artifact(owner_id=tr_01)
  -> UsageRecord(operation_id=op_01, resource_id=tr_01)
```

### 3.4 前端保留范围

- 当前页面内保留 `request_id`、`operation_id`、`run_id` 和最后 `sequence`，用于错误提示和恢复。
- 页面刷新后只持久化恢复 Operation 所需的最少 ID，不持久化 access token、signed URL 或事件正文。
- 给用户显示的排障编号优先使用 `request_id`；不得显示 `trace_id`、堆栈或内部服务名。

## 4. 结构化日志规范

### 4.1 格式

所有服务输出结构化 JSON。禁止依赖无法稳定解析的自由文本作为唯一排障依据。

```json
{
  "timestamp": "2026-07-14T10:21:32.123Z",
  "level": "INFO",
  "service": "task-worker",
  "environment": "production",
  "event_name": "task_run.stage_completed",
  "message": "Task stage completed",
  "request_id": "req_01...",
  "trace_id": "trace_01...",
  "span_id": "span_01...",
  "correlation_id": "corr_01...",
  "operation_id": "op_01...",
  "resource_type": "task_run",
  "resource_id": "tr_01...",
  "stage": "research",
  "duration_ms": 1840,
  "outcome": "success",
  "error_code": null,
  "schema_version": 1
}
```

### 4.2 公共字段

| 字段 | 必填条件 | 说明 |
|---|---:|---|
| `timestamp` | 全部 | 服务端 UTC，毫秒精度 |
| `level` | 全部 | `DEBUG`、`INFO`、`WARN`、`ERROR` |
| `service` | 全部 | 稳定服务名，不使用临时 Pod 名作为服务名 |
| `environment` | 全部 | `development`、`staging`、`production` |
| `event_name` | 全部 | 稳定机器可读名称，例如 `export_job.failed` |
| `message` | 全部 | 安全的人类摘要，不承载唯一结构化信息 |
| `request_id` | 有请求时 | 最终请求 ID |
| `trace_id`、`span_id` | 已接入 Trace 时 | 分布式链路 |
| `correlation_id` | 业务动作 | 多请求业务关联 |
| `operation_id` | 异步操作 | Operation ID |
| `resource_type`、`resource_id` | 有资源时 | 内部检索使用，受日志权限保护 |
| `actor_type` | 写操作 | `user`、`system`、`admin`、`share_link` |
| `outcome` | 完成或失败 | `success`、`failure`、`denied`、`cancelled` |
| `error_code` | 失败时 | 稳定业务错误码，不仅是异常类名 |
| `duration_ms` | 完成时 | 非负整数 |
| `schema_version` | 全部 | 日志结构版本 |

### 4.3 日志级别

| Level | 使用条件 | 示例 |
|---|---|---|
| `DEBUG` | 本地或受控短期开启；生产默认关闭/高比例采样 | 状态机判断分支、缓存诊断 |
| `INFO` | 关键生命周期和正常结果 | Run 创建、阶段完成、Export 完成 |
| `WARN` | 可恢复异常、降级、用户输入导致的拒绝 | Retry、限流、扫描服务暂时不可用 |
| `ERROR` | 需要调查的失败 | 任务异常终止、数据库写失败、审计管道失败 |

用户输错密码、普通 404 或预期中的 `REVISION_CONFLICT` 不应全部记为 `ERROR`；应按安全规则或业务预期使用 `INFO/WARN` 并用指标计数。

### 4.4 允许和禁止记录

| 可记录 | 只允许摘要/哈希 | 绝对禁止明文 |
|---|---|---|
| 状态、阶段、耗时、计数、大小、MIME、parser version | User ID、resource ID、IP、User-Agent、文件名 | 密码、password hash、`access_token`、`refresh_token` |
| 稳定错误码、重试次数、HTTP 状态 | Idempotency-Key、ShareLink ID、文件 checksum | Share token、signed URL、storage key |
| provider/model 标识、Token 数量、费用估算 | 输入长度、输出长度、Conversation/Source 指纹 | 完整 Conversation、Message、Source、Task 输入 |
| capability/format 等受控枚举 | 邮箱域、URL host、仓库标识 | API key、OAuth secret、仓库凭证 |
| scan/parse/export 结果 | 安全分类标签 | 模型隐藏 prompt、系统 prompt、完整模型响应 |

额外规则：

- HTTP 请求头使用 allowlist；`Authorization`、Cookie 和签名参数必须剔除。
- Query string 默认不记录，仅记录允许字段；分享和下载 URL 整体不得落日志。
- Exception stack 只进入受限内部日志，不进入 API、SSE、Analytics 或用户界面。
- 文件名可能包含个人信息，默认记录扩展名和哈希；仅在受限排障日志中记录脱敏名称。
- 日志脱敏失败时选择丢弃字段，不选择原样写入。

### 4.5 高频日志和采样

- API 完成日志、终态失败、权限拒绝和审计管道状态不可完全采样掉。
- `run.progress`、`reply.delta`、SSE heartbeat 和轮询日志默认聚合或抽样。
- 同一错误的重复堆栈按指纹聚合，保留首次、状态变化和周期摘要。
- 采样决策写入 `sampled` 和 `sampling_rate`，方便解释数量差异。
- Metric 不应从已抽样日志反推准确业务总量。

## 5. Metrics 指标规范

### 5.1 命名和标签

- 名称使用稳定前缀和单位，例如 `http_server_request_duration_seconds`。
- Counter 只增不减；Gauge 表示当前值；Histogram 记录时延和大小分布。
- 标签只放低基数维度：service、environment、route template、method、status class、operation type、stage、format、provider、outcome、error code。
- 禁止把 `user_id`、`request_id`、`resource_id`、URL、文件名、邮箱作为 Metric label。
- route 使用 `/task-runs/{task_run_id}` 模板，不使用真实路径。

### 5.2 API RED 指标

| 指标 | 类型 | 关键维度 |
|---|---|---|
| `http_server_requests_total` | Counter | route、method、status_class、service |
| `http_server_request_duration_seconds` | Histogram | route、method、service |
| `http_server_errors_total` | Counter | route、error_code、service |
| `http_server_in_flight_requests` | Gauge | service |
| `auth_denials_total` | Counter | reason、route；不含用户 ID |
| `rate_limit_rejections_total` | Counter | policy、route |

### 5.3 异步运行和队列

| 指标 | 类型 | 关键维度 |
|---|---|---|
| `operation_created_total` | Counter | operation_type |
| `operation_completed_total` | Counter | operation_type、outcome、error_code |
| `operation_queue_wait_seconds` | Histogram | operation_type、queue |
| `operation_duration_seconds` | Histogram | operation_type、outcome |
| `operation_stage_duration_seconds` | Histogram | operation_type、stage |
| `operation_retries_total` | Counter | operation_type、stage、reason |
| `operation_running` | Gauge | operation_type |
| `queue_depth` | Gauge | queue |
| `queue_oldest_message_age_seconds` | Gauge | queue |
| `dead_letter_messages_total` | Counter | queue、reason |

### 5.4 SSE 和实时事件

| 指标 | 类型 | 关键维度 |
|---|---|---|
| `sse_connections` | Gauge | stream_type |
| `sse_connections_total` | Counter | stream_type、outcome |
| `sse_reconnects_total` | Counter | stream_type、reason |
| `sse_events_total` | Counter | stream_type、event_type |
| `sse_delivery_lag_seconds` | Histogram | stream_type |
| `sse_replay_events_total` | Counter | stream_type |
| `sse_replay_window_miss_total` | Counter | stream_type |

### 5.5 文件、Source 和导出

| 指标 | 类型 | 关键维度 |
|---|---|---|
| `upload_sessions_total` | Counter | purpose、outcome |
| `upload_bytes` | Histogram | purpose、mime_family |
| `file_scan_duration_seconds` | Histogram | scanner、outcome |
| `file_scan_blocked_total` | Counter | reason、mime_family |
| `source_parse_duration_seconds` | Histogram | source_type、parser_version、outcome |
| `preview_generation_total` | Counter | artifact_type、outcome |
| `export_jobs_total` | Counter | format、outcome |
| `export_duration_seconds` | Histogram | format、outcome |
| `share_link_access_total` | Counter | scope、outcome、reason |
| `storage_bytes` | Gauge | retention_class、artifact_type |
| `orphan_storage_objects` | Gauge | storage_class |

### 5.6 State、测试和质量

| 指标 | 类型 | 关键维度 |
|---|---|---|
| `state_health_status` | Gauge | status；不得用 state ID 标签 |
| `state_installations_total` | Counter | outcome |
| `state_activations_total` | Counter | outcome |
| `task_runs_total` | Counter | mode、outcome |
| `test_runs_total` | Counter | mode、outcome |
| `validation_runs_total` | Counter | outcome |
| `test_score` | Histogram | metric、mode |
| `validation_review_items` | Histogram | category |
| `skill_publish_total` | Counter | outcome |

### 5.7 模型、Token、API 与成本

| 指标 | 类型 | 关键维度 |
|---|---|---|
| `model_calls_total` | Counter | provider、model、operation_type、outcome |
| `model_call_duration_seconds` | Histogram | provider、model、operation_type |
| `model_tokens_total` | Counter | provider、model、token_type |
| `tool_calls_total` | Counter | tool_category、operation_type、outcome |
| `estimated_cost_minor_total` | Counter | provider、model、currency、operation_type |
| `quota_consumed_total` | Counter | quota_type、operation_type |
| `quota_remaining` | Gauge | quota_type、plan；不含用户 ID |

## 6. 分布式 Trace

### 6.1 必须建 Span 的节点

- API 网关和每个后端 HTTP handler。
- 数据库、缓存和对象存储调用。
- 消息发布、队列等待和 Worker 消费。
- 模型调用、工具调用和外部 API。
- 上传确认、扫描、解析、预览和导出阶段。
- SSE 订阅建立、恢复查询和批量重放。

### 6.2 Span 属性

允许记录：

- route template、method、status code、service、environment。
- operation type、stage、provider/model、Token 数、文件类型/大小区间。
- 稳定 error code、retry count、cache hit、queue name。

禁止记录：

- Prompt、Message、Source、Task、文件正文或模型完整输出。
- access token、Share token、signed URL、第三方密钥。
- 用户邮箱、姓名和可直接识别个人的信息。

### 6.3 抽样

- 生产环境采用可配置采样，不能把采样率写死在业务代码。
- 错误、异常高延迟、关键发布/恢复链路可提高保留率。
- 抽样不能影响 AuditLog、UsageRecord 或准确业务 Counter。
- Trace 保留周期短于业务数据；具体周期由安全、成本和排障需要共同确认。

## 7. AuditLog 规范

### 7.1 必须审计的动作

| action code | 触发动作 | 成功和失败 | 必要摘要 |
|---|---|---:|---|
| `auth.session_revoked` | Logout/安全撤销 | 是 | actor、session、reason |
| `share_link.created` | 创建分享链接 | 是 | resource、scope、expiry |
| `share_link.revoked` | 撤销分享链接 | 是 | resource、link ID |
| `share_link.access_denied` | 分享访问被安全策略拒绝 | 建议 | reason、resource type |
| `artifact.downloaded` | 下载敏感 Artifact | 是 | artifact、parent、actor |
| `export.sensitive_created` | 生成高风险导出 | 是 | resource、format、policy |
| `upload.malware_blocked` | 恶意文件被阻止 | 是 | purpose、MIME、scanner result |
| `skill.published` | 发布 SkillVersion | 是 | draft、version、validation |
| `skill.mounted` | 挂载 Skill | 是 | skill version、state draft |
| `state.installed` | 安装 State | 是 | state version、installation |
| `state.activated` | 激活 State | 是 | before/after Current State |
| `state.deactivated` | 停用 State | 是 | installation、reason |
| `state.uninstalled` | 卸载 State | 是 | installation、version |
| `state.branched` | 创建分支 | 是 | source version、draft |
| `state.restored` | 基于历史版本创建恢复 Draft | 是 | source version、result StateDraft、unchanged Current State |
| `permission.changed` | 授权变化 | 是 | principal、resource、before/after |
| `admin.accessed_sensitive_data` | 管理员读取敏感数据 | 是 | reason、scope、approval reference |

### 7.2 写入时机

1. 后端完成授权判断后创建审计上下文。
2. 成功动作必须与业务提交可靠关联；不能出现业务已成功但审计永久丢失。
3. 高风险动作被拒绝或执行失败也写 AuditLog，`outcome` 分别为 `denied` 或 `failure`。
4. 异步动作记录“请求已接受”和“最终成功/失败”两个阶段，并共享 `correlation_id`、`operation_id`。
5. AuditLog 写入失败必须产生高优先级内部告警；高风险动作是否 fail closed 由安全评审逐项决定。

### 7.3 字段和内容限制

完整字段见 `05-data-dictionary.md`。最低要求：actor、action、resource、outcome、request/correlation ID、时间和稳定 error code。

`before_summary`、`after_summary` 和 `metadata` 只能保存：

- 发生变化的字段名。
- 版本号、状态和受控枚举。
- ID 或已脱敏摘要。
- 权限、范围和有效期等必要证据。

不得保存密码、Token、API key、完整 Source、Conversation、Task、Prompt、文件正文或 signed URL。

### 7.4 不可变和访问

- AuditLog 只追加；业务 API 不提供 Update/Delete。
- 存储账户与业务写库账户分权，读取权限只给安全或经授权的管理员。
- 对导出、批量读取和管理员查询 AuditLog 的动作继续审计。
- 可增加分区签名、哈希链或外部不可变存储提高防篡改能力。
- 保留时长由安全和法律评审确认，不在前端代码中写死。
- 账户删除后，个人标识按合法保留要求匿名化或受限保留；不能简单破坏审计链。

## 8. Product Analytics 产品埋点

### 8.1 事件命名

使用小写的 `domain.action`；动作包含对象时可使用 `domain.object_action`。名称必须描述已经发生的事实：

- 正确：`task.run_started`、`test.completed`、`state.activated`。
- 不正确：`button_clicked_2`、`user_did_something`、动态拼接资源 ID。
- UI 层点击事件只有在不能由服务端事实替代时才记录。

### 8.2 公共事件字段

| 字段 | 必填 | 说明 |
|---|---:|---|
| `client_event_id` | 是 | 前端生成，批量重试去重 |
| `event_name` | 是 | 注册表中的稳定名称 |
| `schema_version` | 是 | 事件版本 |
| `occurred_at_client` | 客户端事件 | 客户端 UTC 时间 |
| `received_at` | 服务端写入 | Collector 接收时间 |
| `user_pseudo_id` | 登录后 | 服务端或受控 SDK 生成的假名 ID |
| `anonymous_id_hash` | 未登录时 | 本地随机 ID 的受控哈希 |
| `session_id_hash` | 建议 | 产品会话哈希，不是认证 Session token |
| `screen_id` | 页面事件 | `SCR-xxx` |
| `interaction_id` | 交互事件 | `INT-xxx` |
| `flow_id` | 建议 | `FLOW-01` 至 `FLOW-10` |
| `outcome` | 完成事件 | `success`、`failure`、`cancelled`、`denied` |
| `error_code` | 失败时 | 稳定错误码 |
| `duration_ms` | 有持续时间时 | 客户端或服务端计算来源需标明 |
| `app_version` | 是 | 前端版本 |
| `environment` | 是 | 环境隔离 |
| `properties` | 否 | 事件注册表允许的低风险字段 |

用户身份字段由接收端依据 Session 补充；前端提交的 `user_id` 不可信，也不用于授权。

### 8.3 首版事件目录

| 事件 | 主要来源 | 关键属性 | 对应流程 |
|---|---|---|---|
| `app.opened` | 前端 | entry、has_current_state | GLOBAL/FLOW-01 |
| `auth.login_completed` | 服务端 | method、outcome | FLOW-01 |
| `onboarding.completed` | 服务端 | profile completeness | FLOW-01 |
| `home.monitor_viewed` | 前端 | health section、entry | FLOW-02 |
| `conversation.started` | 服务端 | mode | FLOW-03 |
| `conversation.message_sent` | 服务端 | attachment_count、content_length_bucket | FLOW-03 |
| `conversation.response_completed` | 服务端 | outcome、duration bucket、token bucket | FLOW-03 |
| `conversation.export_started` | 服务端 | format | FLOW-03 |
| `task.draft_created` | 服务端 | source、template used | FLOW-04 |
| `task.run_started` | 服务端 | mode、source_count bucket | FLOW-04 |
| `task.run_completed` | 服务端 | outcome、duration bucket、artifact_count | FLOW-04 |
| `task.result_action_selected` | 前端 | action=`refine/adjust/download/workspace` | FLOW-04 |
| `state.adjustment_saved` | 服务端 | changes bucket | FLOW-05 |
| `state.retest_started` | 服务端 | source screen | FLOW-05 |
| `state.draft_created` | 服务端 | blank/template/import | FLOW-06 |
| `state.skill_mounted` | 服务端 | compatibility result、skill category | FLOW-05/06 |
| `state.lab_test_completed` | 服务端 | outcome、score bucket | FLOW-06 |
| `skill.draft_created` | 服务端 | blank/template/import | FLOW-07 |
| `skill.import_completed` | 服务端 | source type、outcome、review count | FLOW-07 |
| `skill.validation_completed` | 服务端 | outcome、pass/review/fail buckets | FLOW-07 |
| `skill.published` | 服务端 | destination type、outcome | FLOW-07 |
| `test.started` | 服务端 | mode、source count bucket | FLOW-08 |
| `test.completed` | 服务端 | outcome、score bucket、duration bucket | FLOW-08 |
| `market.match_submitted` | 服务端 | quick intent、result count | FLOW-09 |
| `market.passport_viewed` | 前端 | entry、match score bucket | FLOW-09 |
| `market.sandbox_started` | 服务端 | outcome | FLOW-09 |
| `state.installed` | 服务端 | outcome | FLOW-09 |
| `state.activated` | 服务端 | outcome | FLOW-09 |
| `ledger.version_compared` | 服务端 | version distance bucket | FLOW-10 |
| `ledger.state_branched` | 服务端 | outcome | FLOW-10 |
| `ledger.state_restored` | 服务端 | outcome | FLOW-10 |
| `monitor.stream_reconnected` | 前端/服务端 | reason、gap bucket | FLOW-02/10 |

### 8.4 页面和交互关联

- 页面进入记录 `navigation.screen_viewed` 时必须携带 `screen_id`，页面名称只作显示属性。
- 关键按钮使用 `interaction_id`，直接引用 `04-interaction-matrix.csv`，不另造一套 Button ID。
- 同一交互的前端点击和服务端成功事件使用不同事件名，不能把“点击”当成“成功”。
- `Hover`、动画、滚动等高频行为首版不采集，除非有明确产品假设。
- 废页和归档页不产生正式漏斗事件。

### 8.5 埋点接收

可由自建 Collector 或受控第三方 SDK 实现，逻辑契约如下：

```json
{
  "events": [
    {
      "client_event_id": "cev_01...",
      "event_name": "market.passport_viewed",
      "schema_version": 1,
      "occurred_at_client": "2026-07-14T10:21:32Z",
      "screen_id": "SCR-040",
      "interaction_id": "INT-136",
      "flow_id": "FLOW-09",
      "properties": {
        "entry": "state_match",
        "match_score_bucket": "90_100"
      }
    }
  ]
}
```

规则：

- 批量发送，失败时有限重试；Analytics 失败不阻塞业务操作。
- Collector 对 event name、schema、字段数、单字段长度和批量大小做 allowlist 校验。
- 登录用户 ID 由服务端补充；匿名事件在登录后通过受控 alias 连接。
- 未确认采用自建还是第三方前，不把 Collector 计入 `06-api-requirements.md` 的产品 API-ID。

## 9. UsageRecord、额度与成本

### 9.1 权威来源

- UsageRecord 只能由服务端、Worker 或经过认证的 provider 回执生成。
- 前端展示的 Token、API 和费用是服务端聚合结果，不参与结算。
- Run 的 `metrics` 保存便于展示的摘要；UsageRecord 保存可累加、可核对的明细。
- provider 后补用量时允许追加 adjustment 记录，不覆盖原记录。

### 9.2 记录粒度

每个模型调用、工具/API 调用、导出或重要计算单元至少产生一条 UsageRecord；低价值高频单位可在同一 Operation 内按明确窗口聚合。

关键字段见 `05-data-dictionary.md`，至少包括：

- user、operation、Run/Job、State/Skill version 关联。
- provider、model、usage type。
- input/output/cache Token、API calls、compute duration、storage bytes。
- estimated cost、currency、billable units、quota delta。
- provider receipt/reference、occurred_at、adjustment relation。

### 9.3 成本展示

| 页面/能力 | 数据来源 | 展示规则 |
|---|---|---|
| Home/Monitor Token Balance | UsageRecord + quota ledger 聚合 | 显示余额、上限、更新时间 |
| State Monitor Token Usage | 按 State/时间窗口聚合 | 不显示其他用户或无权限 State |
| Task/Test 结果 | 按 Run 聚合 | 可显示耗时、Token 摘要；费用是否显示由产品决定 |
| 内部成本 Dashboard | provider invoice + UsageRecord | 区分估算和已核对成本 |

### 9.4 模型调用隐私

默认只记录 provider/model、Token、时延、状态、工具类别、输入/输出长度、缓存命中和安全分类。Prompt、模型响应、Source 内容和内部指令默认不进入 Observability 或 Analytics。

如为专项质量评估保留内容，必须使用独立受控数据集、明确采样和保留策略、去标识化、访问审批，并与普通日志分离。

## 10. Client Error 与前端性能

### 10.1 可上报字段

沿用 `08-error-and-empty-states.md`：

- `screen_id`、`interaction_id`、`error_code`、`request_id`。
- `operation_type`、`operation_id`、`failed_stage`、`retry_count`。
- `connection_state`、app version、browser/OS 大版本、release ID。
- 错误指纹、受控 stack frame、source map 后的代码位置。
- 页面加载、API 等待、首次可交互和长任务等性能数值。

### 10.2 禁止字段

不得上报表单正文、密码、Token、对话、Source、私有下载 URL、API key、内部 prompt、DOM 全量快照或未脱敏网络请求。

### 10.3 行为

- 客户端错误采集失败不能影响主要操作。
- 同一指纹短时间内去重和限流。
- Source map 只对授权工程人员开放，不公开部署源码。
- 用户关闭可选 Analytics 后，必要安全和崩溃数据的范围由隐私政策明确区分。

## 11. Monitor 用户可见数据

Monitor 页面使用产品化摘要，不直接查询原始日志平台。

| UI 区域 | 服务端来源 | 普通用户可见内容 |
|---|---|---|
| State Health | 聚合 Metric + HealthSnapshot | 状态、最近检查、可行动说明 |
| Token Balance/Usage | UsageRecord + quota | 余额、上限、时间窗口 |
| Active APIs | StateVersion 配置 +运行状态 | 数量、允许的 API 名称/状态 |
| Recent Activity | 安全业务事件 | 用户可理解的动作摘要 |
| System Stream | 脱敏 MonitorEvent | 稳定 code、阶段、时间、用户可见 message |

禁止通过 Monitor 返回：内部堆栈、数据库错误、Prompt、Source、密钥、完整请求头、其他用户 ID 或平台级 AuditLog。

## 12. Dashboard 交付要求

### 12.1 API 与服务健康

- 请求量、P50/P95/P99 时延、5xx 和稳定错误码。
- 按 service、route template、release 和 environment 过滤。
- 数据库、缓存、对象存储和第三方依赖健康。

### 12.2 Run 与队列

- TaskRun、TestRun、ValidationRun、ImportJob、ExportJob 的创建量和终态。
- queue wait、总耗时、阶段耗时、Retry、timeout、cancel。
- 队列深度、最老消息、dead letter。

### 12.3 文件链路

- Upload 完成率、扫描阻止率、解析失败率、Preview 失败率。
- 按 purpose、MIME family、parser version、export format 分析。
- 存储增长、孤儿对象、生命周期删除。

### 12.4 Token 与成本

- provider/model 调用量、Token、时延、错误和估算成本。
- 按 operation type、State/Skill version 的受控内部聚合。
- quota 耗尽、异常用量、provider 回执差异。

### 12.5 安全与 Audit

- 高风险动作成功/失败/拒绝量。
- 管理员敏感访问、恶意上传、分享拒绝、权限拒绝。
- Audit pipeline 延迟、写入失败和存储完整性。

### 12.6 产品漏斗

- 注册 -> Onboarding -> 首次 Current State。
- Conversation -> Turn into Task -> Run -> Result action。
- State 创建 -> Skill mounted -> Test -> Save unpublished/Publish。
- Skill 创建/导入 -> Configure -> Validate -> Publish。
- State Match -> Passport -> Sandbox -> Install -> Lab Activate。

## 13. SLI、SLO 和告警

### 13.1 定义模板

每个 SLO 必须明确：owner、SLI 公式、目标、统计窗口、排除条件、数据源、告警阈值、Runbook 和用户影响。具体数字由后端根据部署和产品承诺确认，不能从设计稿猜测。

### 13.2 最低 SLI

| 能力 | SLI | 不应只看 |
|---|---|---|
| Login/Home | 成功请求比例、P95 时延 | Pod 是否存活 |
| Task/Test/Validation | 在允许时间内到达成功终态的比例 | 仅创建成功 |
| Queue | queue wait、oldest age | 总消息数 |
| SSE | 建连成功、重连恢复、delivery lag | 当前连接数 |
| Upload/Source | 完成、扫描、解析成功和耗时 | 上传请求 200 |
| Export/Download | Job 完成、URL 可用、下载授权成功 | 只看 Export 创建 |
| Audit | 写入成功率和延迟 | 业务 API 成功率 |
| Usage | provider 用量回执完整率、聚合延迟 | 前端显示值 |

### 13.3 告警等级

| 等级 | 条件 | 动作 |
|---|---|---|
| Critical | 安全审计持续丢失、核心登录/Run 大面积不可用、数据完整性风险 | 立即值班响应，必要时停用高风险写入 |
| High | 核心流程显著失败、队列持续堆积、扫描服务不可用 | 值班响应并执行 Runbook |
| Medium | 单一格式/provider/阶段退化、成本异常增长 | 工作时间调查或自动降级 |
| Info | 短暂恢复、发布后变化、容量趋势 | 记录和观察 |

## 14. 隐私与数据治理

### 14.1 数据最小化

- 先定义问题，再采集字段；不能以“以后可能有用”为由复制用户内容。
- Analytics 属性必须经过事件注册表 allowlist。
- Observability 使用 ID、枚举、计数、长度、哈希和区间替代正文。
- IP 和 User-Agent 属于敏感数据，限制权限并设置短保留。

### 14.2 身份处理

- Analytics 使用 `user_pseudo_id`，不直接使用邮箱或姓名。
- 匿名 ID 不得用于跨产品、跨设备的隐蔽追踪。
- 登录前后身份连接只用于已说明的产品分析。
- Metric 标签不包含用户或资源标识。

### 14.3 保留和删除

| 数据 | 原则 |
|---|---|
| Debug/Trace | 最短满足排障需求，环境和采样策略可配置 |
| 应用日志 | 按安全级别和排障周期分层保留 |
| Analytics | 按事件目的和隐私政策保留，支持删除/匿名化流程 |
| UsageRecord | 按额度、对账和财务要求保留 |
| AuditLog | 按安全和法律要求受限保留，不随普通业务删除直接消失 |

具体时长、地域和用户权利处理需要隐私/法律评审，本文件不替代法律意见。

### 14.4 环境隔离

- Development、staging、production 使用不同项目、凭证、索引和 Dashboard。
- 非生产环境不得复制生产 Conversation、Source、Prompt 或密钥。
- 测试账户和合成流量应带稳定标记，在产品漏斗中可排除。
- 告警和 Audit 数据不可发送到个人聊天机器人或未审批服务。

## 15. Schema Registry 与数据质量

### 15.1 注册内容

每个日志、事件、Audit action 和 ProductEvent 注册：

- 名称、owner、用途、生产者、消费者。
- schema version、必填字段、枚举和字段敏感级别。
- 样例、保留、采样、Dashboard 和告警依赖。
- 变更记录和下线日期。

### 15.2 兼容规则

- 新增可选字段可保持版本；删除/改名/改变语义必须升版本。
- 消费端忽略未知可选字段，但不能默默接受未知 event name。
- 非法 Analytics 事件进入隔离计数，不写正式数据集。
- 时间以服务端 `received_at` 为排序基准，客户端时间只用于体验分析。
- Event 重放依赖 `event_id` 或 `client_event_id` 去重。

### 15.3 质量检查

- schema validation failure rate。
- 必填字段缺失、枚举未知、时间漂移、重复事件。
- Analytics 与服务端业务事实的数量差异。
- UsageRecord 与 provider 回执/账单差异。
- AuditLog 与高风险业务提交的覆盖差异。

## 16. 发布和变更观测

每次前后端发布至少携带：

- `release_id`、commit/version、deployment time、environment。
- 数据库 migration version、事件 schema version。
- feature flag/experiment 版本。
- 发布标记显示在 Dashboard 和 Trace 中。

发布后比较错误率、P95、Run 成功率、queue wait、Token 成本和关键漏斗。发生回滚时保留原发布标记，不能覆盖历史。

## 17. 实施顺序

### P0：在联调前完成

1. request/trace/correlation/operation ID 传播。
2. 统一 JSON 日志和秘密字段脱敏。
3. API、Run、队列、SSE、文件链路核心 Metrics。
4. `09-permissions-and-roles.md` 规定的 AuditLog。
5. UsageRecord 服务端权威记录。
6. 错误响应 `request_id` 与日志可关联。

### P1：在首轮内测前完成

1. 首版 ProductEvent 注册表和核心漏斗。
2. 前端错误、release 和性能采集。
3. Dashboard、SLO、告警和 Runbook。
4. provider 用量核对和异常成本告警。
5. AuditLog 完整性检查。

### P2：上线后优化

1. Tail-based Trace sampling 和容量优化。
2. 更细的质量分析、实验和转化分群。
3. Audit 防篡改增强和长期归档。
4. 自动异常检测和成本优化建议。

## 18. 前端实现清单

- 每次 API 错误保留并显示安全的 `request_id`。
- 每个关键交互引用 `INT-xxx`，每次页面进入引用 `SCR-xxx`。
- 客户端生成 `client_event_id` 并批量发送；有限重试和去重。
- Analytics/错误采集失败不阻塞 Login、Save、Run、Publish、Install 等业务。
- 不把 access token、signed URL、Share token、正文、Prompt 或 DOM 快照发送到采集平台。
- SSE 记录 connection state、重连原因和 gap，不记录事件正文。
- 发送 app/release/environment/schema version。
- 尊重隐私和用户设置，清晰区分必要安全数据与可选 Analytics。

## 19. 后端实现清单

- 网关生成和回传 request ID，服务间传播 Trace Context。
- 队列和 Worker 传播 correlation/operation/run IDs。
- 所有服务使用结构化日志和统一脱敏中间件。
- Metric 标签有基数预算和 allowlist。
- 高风险业务提交与 AuditLog 可靠关联，失败也记录稳定结果。
- UsageRecord 由服务端生成，支持 adjustment 和核对。
- 用户可见 Monitor 数据经过专用聚合和权限裁剪。
- Analytics Collector 校验 schema、限流、去重，不信任身份字段。
- 建立 Dashboard、告警、Runbook、release marker 和数据质量任务。
- 对日志、Trace、Audit、Analytics、Usage 分别设置访问与保留策略。

## 20. 验收测试

| 测试 | 预期结果 |
|---|---|
| INT-050 创建 TaskRun | API、队列、Worker、RunEvent、Artifact 和 UsageRecord 可用 correlation/operation ID 串联 |
| API 返回业务错误 | 前端得到 request ID，日志能查到同一 ID，响应无堆栈 |
| 请求超时后用同一 Idempotency-Key 重试 | 新 request ID，同一业务结果，不重复扣用量 |
| SSE 断线重连 | reconnect Metric 增加，Run 不重复，事件按 sequence 补齐 |
| RunEvent 高频 progress | UI 正常，内部日志经采样/聚合，不影响准确终态 Metric |
| 创建并撤销 ShareLink | 两条成功 AuditLog 可关联请求，普通日志无 token/URL |
| 非 Owner 尝试 Restore | 403，拒绝 AuditLog 有 outcome/error code，不暴露资源内容 |
| 上传恶意文件 | 文件被阻止，Metric 和安全 AuditLog 产生，日志无文件正文 |
| Export 完成 | format、耗时、结果和 UsageRecord 可核对，signed URL 不进日志 |
| 模型调用 | 可见 provider/model/token/latency/outcome，看不到 Prompt/Response |
| Analytics 批量重复提交 | 按 client_event_id 去重，不影响业务响应 |
| Analytics 含未知字段/事件名 | 被拒绝或隔离，产生 schema failure Metric |
| Metric 标签检查 | 不存在 user/resource/request/file/url 等高基数标签 |
| Audit 存储短暂失败 | 产生高优先级告警，并按动作策略 fail closed 或可靠补写 |
| 账户删除流程 | Analytics 可删除/匿名化，Audit 按策略受限保留，引用不破坏 |
| staging 测试 | 数据只出现在 staging 项目，不污染 production 漏斗 |

## 21. 交付验收标准

完成本文件实施时，团队至少能演示：

1. 从一个 `INT-xxx` 点击追到 request、Trace、Operation、RunEvent、Artifact 和 UsageRecord。
2. 从一个 `request_id` 找到安全日志、稳定错误和对应 AuditLog。
3. Dashboard 能区分 API、队列、Run、SSE、文件和 provider 故障。
4. 十条正式用户流程有服务端成功事实和关键退出点，但不采集内容正文。
5. 高风险动作 Audit 覆盖无缺口，Analytics 不被用作审计依据。
6. Token/成本估算能按 Run 聚合并与 provider 回执核对。
7. 日志、Trace、Analytics、Audit 和 Usage 权限及保留策略彼此独立。

## 22. 仍需团队确认的问题

| 优先级 | 问题 | 当前建议 |
|---|---|---|
| P0 | Observability 后端、Trace、Metric 和日志平台选型 | 保持 vendor-neutral，先确认统一 Collector/SDK |
| P0 | AuditLog 写入失败时哪些动作必须 fail closed | Publish、Restore、权限变化、管理员敏感访问优先安全评审 |
| P0 | UsageRecord 是否参与实际计费 | 首版作为额度和成本账本；计费前需财务核对规则 |
| P0 | provider/model 名称对普通用户是否可见 | 内部记录完整，前端按产品策略裁剪 |
| P1 | 自建还是第三方 Product Analytics | 确认后再把 Collector 固化成 API-ID 或 SDK 配置 |
| P1 | Analytics 同意和退出机制 | 按目标市场和隐私评审决定 |
| P1 | 日志、Trace、Analytics、Usage、Audit 的具体保留期 | 分数据面配置，不使用一个全局周期 |
| P1 | 普通用户可见 Monitor 日志级别 | 仅安全产品日志，默认不暴露内部 Warning/Stack |
| P1 | 首版 SLO 数值和告警阈值 | 由后端基线测试后确认 |
| P2 | 内容质量评估是否需要受控样本 | 默认不采集，确有需要时建立独立审批数据集 |

## 23. 下一步

下一步建议制作 `12-openapi-and-event-schema-plan.md`：把 128 个产品 API、统一错误、SSE/EventEnvelope、幂等头、权限要求和本文件的追踪字段转换成 OpenAPI 3.1 与事件 JSON Schema 的落地计划。
