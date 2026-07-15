# 12. OpenAPI 与事件 Schema 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把当前 128 个产品 API、31 个稳定错误码、7 类实时订阅和 56 个唯一事件类型转换为可校验、可生成代码、可运行 Mock、可做兼容性检查的机器契约。

**Architecture:** HTTP API 使用 OpenAPI 3.1.0，多文件按业务域维护，由 CI lint 后打包为单文件分发。SSE 传输仍在 OpenAPI 中描述，但每个 `data` JSON 使用独立 JSON Schema Draft 2020-12 校验，并通过 `x-event-schema` 与对应 API Operation 关联。

**Tech Stack:** OpenAPI 3.1.0、JSON Schema Draft 2020-12、YAML/JSON、Node.js 22.12+、Redocly CLI、Ajv 2020、Prism、Git/CI。所有 npm 依赖通过 lockfile 固定，CI 使用 `npm ci`，不使用运行时 `@latest`。

## Global Constraints

- Base URL 固定为 `/api/v1`。
- 字段统一 `snake_case`，时间统一 ISO 8601 UTC。
- 所有资源 ID 是不透明字符串，前端不得解析 ID 含义。
- 128 个 `API-001` 至 `API-128` 必须各有且只有一个 OpenAPI Operation。
- 153 个 `INT-001` 至 `INT-153` 不要求每个都直接调用 API，但每个 Operation 必须引用其对应交互。
- 31 个稳定错误码只能来自统一 Registry；前端不得依赖自由文本 `message`。
- 创建、Run、Publish、Install、Export 等写入继续使用 `Idempotency-Key`。
- Draft/Profile 并发继续使用 `If-Match` 或显式 revision。
- SSE 保持 at-least-once、`sequence` 去重、`Last-Event-ID`/`after_sequence` 续传语义。
- 测试成功不得隐式 Publish；安装成功不得隐式 Activate。
- 密码、Token、API key、signed URL、storage key、完整 Source/Conversation/Prompt 不进入示例、日志或事件 fixture。
- OpenAPI 是接口机器契约，Figma 和交互矩阵仍是体验与页面事实来源。

---

## 1. 交付物范围

### 1.1 本阶段最终产物

| 产物 | 作用 | 使用者 |
|---|---|---|
| 多文件 OpenAPI 源码 | 维护 128 个接口和公共 Schema | 后端、前端、QA |
| bundled OpenAPI | 单文件分发、代码生成和 Mock | CI、生成器、外部工具 |
| Event JSON Schema | 校验 SSE `data` 和消息存储 | 后端、前端、QA |
| API Registry | 检查 API-ID、交互、权限和审计覆盖 | 产品、后端、CI |
| Error Registry | 统一 31 个错误码及详情结构 | 后端、前端 |
| Event Registry | 统一 56 个 event type 和 payload schema | 后端、前端 |
| Examples/Fixtures | Mock 和合同测试 | 前端、QA |
| 生成的 TypeScript 类型 | 前端编译期约束 | 前端 |
| CI 校验脚本 | 阻止漏接口、断引用和破坏性变更 | 全团队 |

### 1.2 本阶段不做

- 不实现业务数据库、Worker 或 API handler。
- 不根据 OpenAPI 自动决定权限；后端仍执行 `09-permissions-and-roles.md`。
- 不把内部 Admin API、Analytics Collector 或未来团队协作 API混入当前 128 个产品 API。
- 不把 SSE 改成 WebSocket；传输变化不应改变 EventEnvelope。
- 不生成某种后端语言的 Server Stub，直到后端技术栈确定。
- 不把 OpenAPI 当作 Figma 视觉标注或页面状态说明的替代品。

## 2. 规范与工具选择

### 2.1 为什么使用 OpenAPI 3.1.0

- 当前交付目标明确为 OpenAPI 3.1。
- 3.1 Schema 与 JSON Schema Draft 2020-12 对齐，适合复用枚举、条件和组合 Schema。
- 先固定 `openapi: 3.1.0`，避免团队成员使用不同 3.1 patch/3.2 工具能力造成结果不一致。
- 升级规范版本属于独立变更，必须经过 lint、生成器和 Mock 兼容性测试。

### 2.2 工具责任

| 工具 | 责任 | 不承担 |
|---|---|---|
| Redocly CLI | OpenAPI lint、解析 `$ref`、bundle | 业务实现正确性 |
| Ajv 2020 | JSON Schema 和事件 fixture 校验 | HTTP 路由模拟 |
| Prism | 根据 bundled OpenAPI 启动 HTTP Mock | 持续 SSE 行为模拟 |
| 自定义 Node 脚本 | API-ID、Registry、交互、错误和事件覆盖检查 | 替代标准 lint |
| 前端生成器 | 从 bundled OpenAPI 生成 TypeScript 类型/Client | 手写业务状态管理 |

Redocly 官方建议先 lint 再 bundle；OpenAPI 3.1 Schema Object 与 JSON Schema 2020-12 对齐，事件 Schema 使用独立 Draft 2020-12 校验器。工具版本由 `contracts/package-lock.json` 固定。

## 3. 目录结构

实施后创建以下目录。`src` 是人维护的源文件，`dist` 和 `generated` 是命令生成物。

```text
contracts/
├── package.json
├── package-lock.json
├── redocly.yaml
├── README.md
├── openapi/
│   ├── openapi.yaml
│   ├── paths/
│   │   ├── auth-notifications.yaml
│   │   ├── home-monitor.yaml
│   │   ├── conversations-sharing-exports.yaml
│   │   ├── tasks-artifacts.yaml
│   │   ├── state-lab.yaml
│   │   ├── skills.yaml
│   │   ├── state-tests.yaml
│   │   ├── market-installations.yaml
│   │   ├── ledger.yaml
│   │   └── uploads-sources-runtime.yaml
│   └── components/
│       ├── headers.yaml
│       ├── parameters.yaml
│       ├── responses.yaml
│       ├── security.yaml
│       ├── common.yaml
│       ├── identity.yaml
│       ├── content.yaml
│       ├── conversations.yaml
│       ├── states.yaml
│       ├── skills.yaml
│       ├── tasks.yaml
│       ├── tests.yaml
│       └── governance.yaml
├── events/
│   ├── event-envelope.schema.json
│   ├── event.schema.json
│   ├── common/
│   │   ├── operation.schema.json
│   │   └── artifact-created.schema.json
│   ├── task/
│   ├── test/
│   ├── validation/
│   ├── import/
│   ├── export/
│   ├── reply/
│   ├── monitor/
│   └── runtime/
├── registry/
│   ├── api-operations.csv
│   ├── error-codes.yaml
│   └── event-types.csv
├── examples/
│   ├── http/
│   ├── errors/
│   └── events/
├── scripts/
│   ├── check-api-coverage.mjs
│   ├── check-error-coverage.mjs
│   ├── check-event-coverage.mjs
│   ├── validate-event-fixtures.mjs
│   ├── validate-openapi-examples.mjs
│   └── scan-contract-secrets.mjs
├── tests/
│   ├── api-registry.test.mjs
│   ├── event-schema.test.mjs
│   ├── examples.test.mjs
│   └── compatibility.test.mjs
├── dist/
│   ├── openapi.bundle.yaml
│   └── event-schemas.bundle.json
└── generated/
    └── typescript/
```

### 3.1 文件责任

- `openapi/openapi.yaml`：唯一 OpenAPI root，保存 info、servers、tags、security 和 Path `$ref`。
- `openapi/paths/*.yaml`：只保存 PathItem/Operation，不重复定义实体 Schema。
- `openapi/components/*.yaml`：保存可复用参数、响应和业务对象。
- `events/event-envelope.schema.json`：只保存共同 Envelope 字段。
- `events/event.schema.json`：通过 `oneOf` 聚合全部事件变体。
- `registry/*.csv/yaml`：用于覆盖检查，不替代 OpenAPI 本身。
- `examples/`：只放虚构脱敏值，所有文件必须通过对应 Schema。
- `dist/`：由 CI 生成；禁止手工编辑。
- `generated/`：由生成器产生；禁止手工修补类型。

## 4. API 分组与覆盖

| Path 文件 | API 范围 | 数量 | 来源章节 |
|---|---:|---:|---|
| `auth-notifications.yaml` | API-001 至 API-009 | 9 | 06 §4.1 |
| `home-monitor.yaml` | API-010 至 API-023 | 14 | 06 §4.2 |
| `conversations-sharing-exports.yaml` | API-024 至 API-038 | 15 | 06 §4.3 |
| `tasks-artifacts.yaml` | API-039 至 API-055 | 17 | 06 §4.4 |
| `state-lab.yaml` | API-056 至 API-069 | 14 | 06 §4.5 |
| `skills.yaml` | API-070 至 API-096 | 27 | 06 §4.6 |
| `state-tests.yaml` | API-097 至 API-106 | 10 | 06 §4.7 |
| `market-installations.yaml` | API-107 至 API-115 | 9 | 06 §4.8 |
| `ledger.yaml` | API-116 至 API-122 | 7 | 06 §4.9 |
| `uploads-sources-runtime.yaml` | API-123 至 API-128 | 6 | 06 §4.10 |
| **合计** | **API-001 至 API-128** | **128** | - |

覆盖脚本必须验证：

1. Registry 恰好有 128 行，ID 连续且不重复。
2. OpenAPI 恰好有 128 个带 `x-api-id` 的 Operation。
3. Registry 中 Method + Path 与 OpenAPI 完全相同。
4. 每个 `operationId` 全局唯一。
5. 每个 API 的 `x-interaction-ids` 都能在 `04-interaction-matrix.csv` 找到。
6. 每个 API 有 owner tag、权限、成功响应、错误响应和示例。

### 4.1 API Registry 列

`registry/api-operations.csv` 固定使用以下列：

```csv
api_id,method,path,operation_id,tag,interaction_ids,permissions,execution_mode,idempotency,audit_actions,error_codes,event_schema,priority,source_document
API-048,POST,/task-runs,createTaskRun,Tasks,INT-050,task.run.create|state.use,async,required,,AUTH_SESSION_EXPIRED|RESOURCE_FORBIDDEN|REVISION_CONFLICT|INSUFFICIENT_QUOTA|VALIDATION_FAILED|DEPENDENCY_UNAVAILABLE,events/event.schema.json,P0,06-api-requirements.md
```

- 多值列使用 `|` 分隔，单值内部不得包含 `|`。
- 空审计动作或事件 Schema 使用空字段，不使用 `N/A`、`none` 等新语义值。
- Method 使用大写，Path 不包含 `/api/v1`。
- CSV 只用于覆盖和评审；生成器仍以 bundled OpenAPI 为输入。

## 5. OpenAPI Root

### 5.1 Root 骨架

```yaml
openapi: 3.1.0
info:
  title: Preacherman Product API
  version: 1.0.0
  description: Machine-readable contract for the Preacherman application.
servers:
  - url: /api/v1
    description: Current API base path
security:
  - bearerAuth: []
tags:
  - name: Auth
  - name: Home
  - name: Monitor
  - name: Conversations
  - name: Tasks
  - name: StateLab
  - name: Skills
  - name: StateTests
  - name: Market
  - name: Ledger
  - name: Uploads
paths:
  /auth/session:
    $ref: ./paths/auth-notifications.yaml#/~1auth~1session
components:
  securitySchemes:
    bearerAuth:
      $ref: ./components/security.yaml#/bearerAuth
```

### 5.2 Server URL 规则

- Root `servers.url` 使用 `/api/v1`，不把开发、测试或生产域名写死。
- 环境域名由部署配置或文档门户注入。
- Path 文件内不得再次添加 `/api/v1`。
- 示例 URL 使用 `https://api.example.invalid/api/v1`，不使用真实域名和签名参数。

## 6. Operation 元数据

每个 Operation 除标准 OpenAPI 字段外，必须提供以下扩展：

| 扩展 | 类型 | 用途 |
|---|---|---|
| `x-api-id` | string | 对应 `API-xxx` |
| `x-interaction-ids` | string[] | 对应 `INT-xxx` |
| `x-permissions` | string[] | 服务端授权能力 |
| `x-execution-mode` | enum | `sync`、`async`、`sse` |
| `x-idempotency` | enum | `required`、`supported`、`none` |
| `x-audit-actions` | string[] | 成功/失败需要的 Audit action |
| `x-event-schema` | string/null | SSE 或异步 Operation 的事件入口 |
| `x-owner` | string | 负责服务/团队的稳定名称 |
| `x-error-codes` | string[] | 当前 Operation 允许返回的稳定错误码 |

示例：

```yaml
post:
  operationId: createTaskRun
  tags: [Tasks]
  summary: Create a task run from a locked task draft revision
  x-api-id: API-048
  x-interaction-ids: [INT-050]
  x-permissions: [task.run.create, state.use]
  x-execution-mode: async
  x-idempotency: required
  x-audit-actions: []
  x-event-schema: ../../events/event.schema.json
  x-owner: task-service
  parameters:
    - $ref: ../components/headers.yaml#/IdempotencyKey
    - $ref: ../components/headers.yaml#/RequestId
  requestBody:
    required: true
    content:
      application/json:
        schema:
          $ref: ../components/tasks.yaml#/CreateTaskRunRequest
  responses:
    "202":
      $ref: ../components/responses.yaml#/TaskRunAccepted
    "401":
      $ref: ../components/responses.yaml#/Unauthorized
    "403":
      $ref: ../components/responses.yaml#/Forbidden
    "412":
      $ref: ../components/responses.yaml#/RevisionConflict
    "422":
      $ref: ../components/responses.yaml#/ValidationError
```

### 6.1 operationId 命名

- 使用 lowerCamelCase：`getCurrentState`、`createTaskRun`、`retrySourceParse`。
- 动词开头，描述业务动作，不包含 API 编号。
- 不因 Path 参数名字变化而改变业务语义。
- 同一资源的 GET list/get/create/update/delete 使用一致词序。
- 不使用 `doAction`、`handleRequest`、`api048` 等无语义名称。

## 7. 公共参数与 Header

| 名称 | OpenAPI 位置 | 必填条件 | Schema |
|---|---|---:|---|
| `Authorization` | security scheme | 受保护 API | HTTP Bearer |
| `X-Request-ID` | header | 可选请求、所有响应 | string，长度和字符集受限 |
| `traceparent` | header | 可选 | W3C Trace Context 字符串 |
| `Idempotency-Key` | header | 指定写操作 | string，长度受限 |
| `If-Match` | header | 乐观锁更新 | revision/ETag string |
| `Last-Event-ID` | header | SSE 恢复可选 | stream + sequence string |
| `after_sequence` | query | SSE 恢复可选 | integer >= 0 |
| `cursor` | query | 列表可选 | opaque string |
| `limit` | query | 列表可选 | integer，默认 20 |
| `Retry-After` | response header | 429/503 | seconds 或 HTTP date |

规则：

- OpenAPI 同时描述 `X-Request-ID` 响应头和 body `meta.request_id`。
- `Idempotency-Key` 不进入 request body，也不作为认证凭证。
- `If-Match` 与 body revision 二选一时，Operation description 必须明确优先级。
- SSE 若同时收到 `Last-Event-ID` 和 `after_sequence`，后端采用更晚且合法的游标；冲突行为写入描述和合同测试。

## 8. 响应 Envelope

### 8.1 公共 Meta

```yaml
RequestMeta:
  type: object
  additionalProperties: false
  required: [request_id]
  properties:
    request_id:
      type: string

ListMeta:
  type: object
  additionalProperties: false
  required: [request_id, has_more]
  properties:
    request_id:
      type: string
    next_cursor:
      type: [string, "null"]
    has_more:
      type: boolean
```

### 8.2 不使用伪泛型

OpenAPI 没有稳定的语言无关泛型响应。不要只定义一个模糊 `ApiResponse`，也不要让生成器得到 `data: object`。

每个主要资源使用明确 wrapper：

```yaml
TaskRunResponse:
  type: object
  additionalProperties: false
  required: [data, meta]
  properties:
    data:
      $ref: ./tasks.yaml#/TaskRun
    meta:
      $ref: ./common.yaml#/RequestMeta
```

### 8.3 204

- 204 响应不声明 JSON body。
- 仍通过响应头返回 `X-Request-ID`。
- 前端不能尝试对 204 调用 `response.json()`。

## 9. 异步 Operation

### 9.1 202 Schema

```yaml
OperationAccepted:
  type: object
  additionalProperties: false
  required: [operation_type, operation_id, operation_status, status_url, events_url, latest_sequence]
  properties:
    operation_type:
      enum: [task_run, test_run, validation_run, import_job, export_job, response_run, generation_job]
    operation_id:
      type: string
    operation_status:
      enum: [queued, running, succeeded, failed, cancelled, timed_out]
    status_url:
      type: string
      format: uri-reference
    events_url:
      type: string
      format: uri-reference
    result_url:
      type: [string, "null"]
      format: uri-reference
    latest_sequence:
      type: integer
      minimum: 0
```

### 9.2 必须使用 202 的对象

- TaskRun、TestRun、ValidationRun、ImportJob、ExportJob、ResponseRun。
- 明确采用异步模式的 Generation Operation。
- Source parse 重试等跨请求操作。

### 9.3 状态查询

- `API-012 GET /operations/{operation_id}` 返回统一 Operation。
- 专属状态 API 返回领域对象，并包含或可映射 Operation 共同字段。
- 终态对象不能通过 Retry 原地回到 `running`。
- Retry/Run again 创建新 ID，并用 `previous_operation_id` 关联。

## 10. 业务 Schema 规则

### 10.1 读写分离

同一对象需要区分：

- `State`：完整读取模型。
- `CreateStateDraftRequest`：创建输入。
- `UpdateStateDraftRequest`：允许修改的 patch。
- `StateSummary`：列表/卡片摘要。

禁止直接把包含 `owner_user_id`、`storage_key`、`token_hash` 等服务端字段的完整读取 Schema 当作 request body。

### 10.2 类型转换

| 数据字典类型 | OpenAPI/JSON Schema |
|---|---|
| ID | `type: string`，可按对象增加 pattern 示例但前端不解析 |
| timestamp | `type: string`, `format: date-time` |
| integer | `type: integer`，计数最低为 0 |
| decimal | `type: number` |
| enum | `type: string` + `enum` |
| nullable | `type: [string, "null"]` 等联合类型 |
| object[] | `type: array`, `items: { ... }` |
| revision | `type: integer`, `minimum: 0` |
| money minor unit | `type: integer` + currency |

OpenAPI 3.1 不使用旧式 `nullable: true`。

### 10.3 additionalProperties

- 稳定 API request/response 对象默认 `additionalProperties: false`。
- `metadata`、`settings`、`options` 只有确实是扩展容器时允许额外字段。
- 动态 Export `options_schema` 是 Schema 文档对象，不应被错误限制为固定业务字段。
- EventEnvelope 顶层严格；各 payload 由自己的 Schema 决定扩展策略。

### 10.4 readOnly、writeOnly 和敏感扩展

- 服务端生成 ID、状态、时间使用 `readOnly: true`。
- password 等只允许请求出现的字段使用 `writeOnly: true`。
- `storage_key`、`token_hash` 不进入任何外部响应 Schema。
- signed URL、download URL 使用 `x-sensitive: true`，示例只使用 `.invalid` 域名。
- 敏感字段的 Schema 不是授权机制，后端仍做字段级裁剪。

## 11. 稳定错误 Registry

### 11.1 Registry 结构

`registry/error-codes.yaml` 恰好包含 31 个错误码：

```yaml
REVISION_CONFLICT:
  http_status: [412]
  retryable_default: false
  details_schema: RevisionConflictDetails
  frontend_action: reload_or_merge
  sensitive_details: false
```

每项必须包含：

- `http_status`：允许的 HTTP 状态数组。
- `retryable_default`：默认能否安全重试。
- `details_schema`：明确 details 结构或 `null`。
- `frontend_action`：与第 8 份错误状态文档一致的稳定动作。
- `sensitive_details`：details 是否需要额外裁剪。

### 11.2 ErrorResponse

```yaml
ErrorResponse:
  type: object
  additionalProperties: false
  required: [error, meta]
  properties:
    error:
      type: object
      additionalProperties: false
      required: [code, message, field_errors, retryable, details]
      properties:
        code:
          $ref: ./common.yaml#/StableErrorCode
        message:
          type: string
        field_errors:
          type: array
          items:
            $ref: ./common.yaml#/FieldError
        retryable:
          type: boolean
        details:
          type: [object, "null"]
    meta:
      $ref: ./common.yaml#/RequestMeta
```

### 11.3 Operation 错误范围

每个 Operation 使用 `x-error-codes` 声明允许错误码。例如：

```yaml
x-error-codes:
  - AUTH_SESSION_EXPIRED
  - RESOURCE_FORBIDDEN
  - REVISION_CONFLICT
  - INSUFFICIENT_QUOTA
  - VALIDATION_FAILED
  - DEPENDENCY_UNAVAILABLE
```

CI 检查所有值都存在 Registry；Registry 中未被任何 Operation/Event 使用的错误码产生 warning，删除错误码则视为破坏性变更。

## 12. 权限与审计元数据

### 12.1 BearerAuth

OpenAPI 只描述认证方式：

```yaml
bearerAuth:
  type: http
  scheme: bearer
  bearerFormat: opaque
```

JWT 与否不写入契约，除非后端已经确认。资源所有权、父子关系和角色继承通过 `x-permissions` 与文字说明表达，不伪装成 OAuth scope。

### 12.2 拒绝响应

所有受保护 Operation 至少声明：

- 401 `AUTH_SESSION_EXPIRED`。
- 403 `RESOURCE_FORBIDDEN`。
- 404 `RESOURCE_NOT_FOUND`，用于隐藏资源存在性。

具体 Operation 再添加 409、410、412、413、415、422、429、500、503。

### 12.3 Audit 扩展

高风险 Operation 使用：

```yaml
x-audit-actions:
  - state.restored
```

CI 对照 `09-permissions-and-roles.md` 与 Registry，检查 Publish、Install、Activate、Restore、Branch、Share、敏感 Download、高风险 Export 和 Malware Block 的动作代码存在。

## 13. 文件与分享 Schema

### 13.1 Upload

- `API-123 POST /uploads` 的 body 只含 filename、declared size、MIME、purpose 和 parent。
- 返回短期 `upload_url`、headers 和 expiry；标记 `x-sensitive: true`。
- `API-124 Complete` 必须含 checksum/parts。
- `UploadSession.storage_key` 不进入外部 Schema。
- 413/415/410/409/422 分别关联对应稳定错误码。

### 13.2 Source

- Source 外部响应包含 scan/parse/processing 状态和安全 metadata。
- 不返回内部索引、embedding、解析临时存储地址或完整抓取凭证。
- URL/Repository input 与 File Source input 使用 `oneOf`，每个变体用 `source_type: const` 区分。
- `URL_FETCH_BLOCKED` 的 details 不包含内网地址或防护实现。

### 13.3 Export

- `API-036` 返回动态 format 和 `options_schema`。
- 前端类型不能把 PDF/DOCX 等示例固定为唯一 enum。
- `API-037` 创建 ExportJob 时锁定 resource revision 和 format version。
- `download_url` 只在有权限且未过期时返回。

### 13.4 ShareLink

- API 不返回 `token_hash`。
- 创建响应可返回一次性分享 URL，但 Schema 标记敏感且示例为虚构 URL。
- 撤销成功是 204。
- 公开访问接口目前不在 128 个 API 中，不在本阶段自行新增。

## 14. SSE 在 OpenAPI 中的描述

### 14.1 HTTP 层

七类订阅入口：TaskRun、TestRun、ValidationRun、Conversation、Monitor、通用 Operation、Runtime。

```yaml
responses:
  "200":
    description: Server-Sent Event stream
    headers:
      X-Request-ID:
        $ref: ../components/headers.yaml#/RequestIdResponse
    content:
      text/event-stream:
        schema:
          type: string
        examples:
          progress:
            externalValue: ../../examples/events/operation-progress.sse
x-event-schema: ../../events/event.schema.json
```

OpenAPI 负责描述 endpoint、认证、参数、响应 MIME 和恢复错误；它不负责验证每个 SSE frame 中的 JSON，因此必须保留独立事件 Schema。

### 14.2 SSE 固定规则

- SSE `id` 可还原 `stream_id + sequence`。
- SSE `event` 必须等于 JSON `event_type`。
- SSE `data` 必须通过对应 event JSON Schema。
- 每个事件块以空行结束。
- heartbeat 是注释，不增加 `sequence`，不进入 Event Schema。
- 401/403/404 不自动重连；429/503 读取 `Retry-After`。
- `EVENT_CURSOR_EXPIRED` 触发完整状态 GET，不继续使用旧局部缓存。

## 15. Event JSON Schema

### 15.1 EventEnvelope

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://contracts.preacherman.invalid/events/event-envelope.schema.json",
  "title": "EventEnvelope",
  "type": "object",
  "required": [
    "event_id",
    "stream_id",
    "sequence",
    "event_type",
    "schema_version",
    "resource_type",
    "resource_id",
    "payload",
    "occurred_at"
  ],
  "properties": {
    "event_id": { "type": "string", "minLength": 1 },
    "stream_id": { "type": "string", "minLength": 1 },
    "sequence": { "type": "integer", "minimum": 1 },
    "event_type": { "type": "string", "pattern": "^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$" },
    "schema_version": { "type": "integer", "minimum": 1 },
    "resource_type": { "type": "string" },
    "resource_id": { "type": "string" },
    "operation_id": { "type": ["string", "null"] },
    "correlation_id": { "type": ["string", "null"] },
    "operation_status": {
      "type": ["string", "null"],
      "enum": ["queued", "running", "succeeded", "failed", "cancelled", "timed_out", null]
    },
    "domain_status": { "type": ["string", "null"] },
    "stage": { "type": ["string", "null"] },
    "progress": { "type": ["number", "null"], "minimum": 0, "maximum": 1 },
    "payload": { "type": "object" },
    "occurred_at": { "type": "string", "format": "date-time" }
  }
}
```

### 15.2 事件变体

每个事件文件通过 `allOf` 引用 Envelope，并固定 `event_type` 和 payload：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://contracts.preacherman.invalid/events/task/stage-started.schema.json",
  "allOf": [
    { "$ref": "../event-envelope.schema.json" },
    {
      "type": "object",
      "properties": {
        "event_type": { "const": "task.stage_started" },
        "schema_version": { "const": 1 },
        "payload": {
          "type": "object",
          "additionalProperties": false,
          "required": ["stage", "stage_label"],
          "properties": {
            "stage": { "type": "string" },
            "stage_label": { "type": "string" }
          }
        }
      }
    }
  ],
  "unevaluatedProperties": false
}
```

Ajv 测试必须确认 `allOf + unevaluatedProperties` 与实际 validator 配置兼容；不能只看静态文件。

### 15.3 事件 Registry

`registry/event-types.csv` 列：

```csv
event_type,schema_version,family,payload_schema,resource_types,terminal,sensitivity,source_document
task.stage_started,1,task,events/task/stage-started.schema.json,task_run,false,internal,07-realtime-and-async-events.md
```

覆盖要求：

- 07 文件共有 58 条事件定义，其中 `artifact.created` 在通用、Task 和 Test 重复引用。
- 去重后 Registry 必须恰好有 56 个 `event_type`。
- 每个 Registry 行必须有可解析 Schema 和至少一个有效 fixture。
- `approval.requested`、`approval.approved`、隐式 `state.published`/`state.activated` 不进入首版事件 Registry。

### 15.4 事件家族

| 家族 | 定义行数 | 说明 |
|---|---:|---|
| operation/common | 10 | 统一生命周期、日志和 Artifact |
| task | 6 | 其中复用 `artifact.created` |
| test | 6 | 其中复用 `artifact.created` |
| validation | 6 | 测试、指标、Review 和摘要 |
| import | 7 | 读取、检查、能力和 readiness |
| export | 5 | render、package、ready、failed |
| reply | 6 | started、delta、citation、tool、completed、failed |
| monitor | 7 | snapshot、health、usage、API、activity、log、connection |
| runtime | 5 | connection、autosave、revision |
| **总定义行** | **58** | **去重后 56 个唯一类型** |

### 15.5 版本兼容

- 同一 `schema_version` 可增加可选字段。
- 删除字段、增加必填字段、改变类型或语义必须提升版本。
- producer 先发布兼容 Schema，再发送新版本事件。
- consumer 遇到未知 optional 字段应忽略；遇到未知 event type 记录安全 telemetry 后忽略，不崩溃。
- 旧版本 Schema 的支持周期由发布策略明确，不允许静默覆盖历史 Schema。

## 16. Examples 与 Fixture

### 16.1 HTTP 示例最低要求

每个 Operation 至少有：

- 一个成功请求示例（GET 除外）。
- 一个成功响应示例。
- 一个认证/权限错误示例（受保护 API）。
- 一个最重要业务错误示例。
- 异步 API 有 202 + Operation 示例。

### 16.2 事件 Fixture

每个 event type 至少有：

- 一个合法 JSON fixture。
- 对终态事件额外提供失败/成功关键变体。
- `reply.delta` 提供两个连续 sequence fixture。
- `monitor.snapshot` 提供完整基准 fixture。
- `EVENT_CURSOR_EXPIRED` 使用 HTTP error fixture，不伪装成业务事件。

### 16.3 示例安全扫描

脚本必须拒绝：

- `Authorization: Bearer` 后出现非占位真实值。
- `access_token`、`refresh_token`、API key、password hash。
- 真实邮箱、域名、IP、仓库凭证和 signed URL。
- `storage_key`、Share token、完整 Prompt/Conversation/Source 内容。

允许值只使用 `.invalid` 域名、`user@example.invalid` 和明确假 ID。

## 17. Mock 策略

### 17.1 HTTP Mock

```bash
cd contracts
npm run contracts:bundle
npm run mock:http
```

`mock:http` 读取 `dist/openapi.bundle.yaml` 并监听本机开发端口。前端通过环境变量切换 Mock Base URL，不把 Mock URL写进业务代码。

### 17.2 SSE Fixture Server

Prism 适合普通 HTTP Mock，但不能承担本产品需要的持续 sequence、断线和重放行为。另建最小 fixture server：

- 按 event fixture 顺序发送 SSE。
- 支持 `Last-Event-ID` 和 `after_sequence`。
- 可模拟断线、重复事件、游标过期和终态。
- 每次发送前使用 Ajv 校验 fixture。
- 不实现真实模型、文件或业务逻辑。

### 17.3 Mock 不能成为事实源

- Mock 示例来自 OpenAPI/Event Schema。
- 后端真实响应必须通过 provider contract test。
- 前端不得根据 Mock 中偶然存在的未声明字段写逻辑。

## 18. 代码生成

### 18.1 第一阶段只生成 TypeScript

在后端语言未确认前，只生成前端 TypeScript 类型和 Client 边界：

```text
contracts/dist/openapi.bundle.yaml
  -> frontend generated API types/client

contracts/events/event.schema.json
  -> frontend generated Event union types
```

### 18.2 生成规则

- 输入只能是 CI 验证通过的 bundled 文件。
- 生成目录不手工编辑。
- 生成命令可重复，重复执行无无关 diff。
- 前端业务代码通过封装的 API client 调用，不到处直接 `fetch`。
- 运行时错误仍按 `ErrorResponse` 解析；TypeScript 类型不能代替运行时校验。

### 18.3 后端 Stub

后端技术栈确定后再选择 Server Stub/Validator：

- 先验证生成器完整支持 OpenAPI 3.1 和当前 nullable/oneOf 结构。
- 不允许生成器反向覆盖手写 OpenAPI。
- 如果后端采用 code-first，CI 仍必须比较其导出契约与本 bundle，防止漂移。

## 19. CI 门禁

### 19.1 package scripts

```json
{
  "scripts": {
    "contracts:lint": "redocly lint core@v1 --config redocly.yaml",
    "contracts:bundle": "redocly bundle core@v1 --config redocly.yaml --output dist/openapi.bundle.yaml",
    "contracts:registry": "node scripts/check-api-coverage.mjs --registry-only && node scripts/check-error-coverage.mjs --registry-only && node scripts/check-event-coverage.mjs --registry-only",
    "contracts:api-coverage": "node scripts/check-api-coverage.mjs && node scripts/check-error-coverage.mjs",
    "contracts:event-coverage": "node scripts/check-event-coverage.mjs",
    "contracts:http-examples": "node scripts/validate-openapi-examples.mjs",
    "contracts:event-examples": "node scripts/validate-event-fixtures.mjs",
    "contracts:secrets": "node scripts/scan-contract-secrets.mjs",
    "contracts:test": "node --test tests/*.test.mjs",
    "contracts:http-check": "npm run contracts:lint && npm run contracts:bundle && npm run contracts:registry && npm run contracts:api-coverage && npm run contracts:http-examples && npm run contracts:secrets && node --test tests/api-registry.test.mjs tests/examples.test.mjs",
    "contracts:event-check": "npm run contracts:registry && npm run contracts:event-coverage && npm run contracts:event-examples && npm run contracts:secrets && node --test tests/event-schema.test.mjs",
    "contracts:check": "npm run contracts:http-check && npm run contracts:event-check && npm run contracts:test",
    "mock:http": "prism mock dist/openapi.bundle.yaml -h 127.0.0.1 -p 4010"
  }
}
```

### 19.2 必须阻止合并的错误

- OpenAPI parse/lint/bundle 失败。
- `$ref` 无法解析或循环导致工具失败。
- API-ID 缺失、重复、越界或 Method/Path 不一致。
- operationId 重复。
- Registry 错误码或事件类型缺 Schema。
- 示例不能通过 Schema。
- 事件 `event_type` 与 SSE `event` 不一致。
- 敏感信息扫描命中。
- 生成的 TypeScript 无法编译。
- 破坏性变更没有 API major/version 或批准记录。

### 19.3 Warning

- Schema/Operation 缺 description。
- 错误码定义但未使用。
- 示例覆盖不足。
- 可选字段没有说明 null/缺失语义。
- 缺 owner、权限或审计扩展。

P0 API 的 warning 在首版发布前提升为 error。

## 20. 合同测试

### 20.1 Consumer Tests

前端至少验证：

- 200/201/202/204 响应正确分支。
- 31 个稳定错误码使用通用 fallback 且关键错误有专属恢复。
- 204 不解析 body。
- 202 保存 Operation ID 并订阅正确 endpoint。
- SSE 重复 sequence 不重复应用。
- 未知可选字段不导致崩溃。
- 未知 event type 被安全忽略并记录 telemetry。

### 20.2 Provider Tests

后端每个 Operation 至少验证：

- 请求和响应符合 bundled OpenAPI。
- 权限拒绝响应符合 401/403/404 契约。
- 写操作 Header、幂等和 revision 行为符合描述。
- 返回的稳定 error code 在该 Operation `x-error-codes` 中。
- 敏感字段未越界返回。

### 20.3 Event Producer Tests

- 所有发送事件通过对应 JSON Schema。
- stream sequence 唯一且递增。
- 一个 Operation 只有一个终态事件。
- 状态 API `latest_sequence` 与事件存储一致。
- `after_sequence=n` 首条重放事件是 `n+1`。
- TestRun 成功流不包含 Publish/Activate event。
- Install 成功流不包含 Activate event。

### 20.4 Compatibility Tests

比较当前 bundled contract 与主分支基线：

- 删除 Path/Operation、删除字段、增加必填字段、收窄 enum、改变类型视为 breaking。
- 新增可选字段、新增 Operation、扩展允许 error/event 可视为 non-breaking，但仍需评审。
- 公开字段改为敏感裁剪可能影响前端，也必须显式记录。
- breaking change 必须进入 `/api/v2` 或获批准的版本迁移。

## 21. 来源优先级与冲突处理

### 21.1 迁移期间

| 内容 | 首要来源 |
|---|---|
| 页面和交互意图 | 02、03、04 |
| 字段和状态含义 | 05 |
| Method/Path/执行模式 | 06 |
| Event/恢复语义 | 07 |
| UI 错误恢复 | 08 |
| 权限和 Audit | 09 |
| 文件安全 | 10 |
| 追踪、用量和隐私 | 11 |
| 机器表达和实施顺序 | 12 |

发现冲突时先改上游 Markdown，再改 Registry/OpenAPI/Schema；不能只让生成文件“看起来通过”。

### 21.2 迁移完成后

- OpenAPI 是 HTTP Method/Path/request/response/error 的机器事实源。
- Event Schema 是事件结构的机器事实源。
- Markdown 保留产品原因、体验规则和人类解释。
- 数据字段语义变化同时更新数据字典和 Schema。
- 每次契约 PR 必须标注相关 API-ID、INT-ID 和 FLOW-ID。

## 22. 实施任务

### Task 1: 建立独立 Contracts 工具包

**Files:**
- Create: `contracts/package.json`
- Create: `contracts/package-lock.json`
- Create: `contracts/redocly.yaml`
- Create: `contracts/README.md`
- Create: `contracts/openapi/openapi.yaml`
- Create: `contracts/tests/api-registry.test.mjs`

**Interfaces:**
- Consumes: `06-api-requirements.md` 的 Base URL 和 API 分组。
- Produces: `npm run contracts:check` 的统一入口；后续任务都在此目录工作。

- [x] **Step 1:** 创建目录、Node 22.12+ package 和固定依赖的 lockfile。
- [x] **Step 2:** 写一个只有 info/security/tag 的最小 OpenAPI root。
- [x] **Step 3:** 配置 `core@v1` alias 和 strict lint 规则。
- [x] **Step 4:** 写 root smoke test，断言 OpenAPI version、Base URL、security 和 tag 可被解析。
- [x] **Step 5:** 运行：

```bash
cd contracts
npm ci
npm run contracts:lint
node --test tests/api-registry.test.mjs
```

预期：OpenAPI 语法 lint 和 root smoke test 都通过；本任务不提前启用完整 API 覆盖门禁。

- [ ] **Step 6:** Commit：`chore(contracts): scaffold OpenAPI toolchain`。

### Task 2: 建立三份 Registry 和覆盖脚本

**Files:**
- Create: `contracts/registry/api-operations.csv`
- Create: `contracts/registry/error-codes.yaml`
- Create: `contracts/registry/event-types.csv`
- Create: `contracts/scripts/check-api-coverage.mjs`
- Create: `contracts/scripts/check-error-coverage.mjs`
- Create: `contracts/scripts/check-event-coverage.mjs`
- Modify: `contracts/tests/api-registry.test.mjs`

**Interfaces:**
- Consumes: 128 API、31 error code、56 unique event type。
- Produces: 后续 OpenAPI 和 Event Schema 的完整性清单。

- [x] **Step 1:** 先写失败测试：API 不是 128、error 不是 31、event 不是 56 时失败。
- [x] **Step 2:** 从 06、07、09 手工复核并录入 Registry，不用正则自动猜权限或 Schema 名。
- [x] **Step 3:** 脚本支持 `--registry-only` 和范围参数，检查连续 ID、唯一 Method/Path、有效 INT-ID、Registry 引用文件存在。
- [x] **Step 4:** 运行：

```bash
cd contracts
npm run contracts:registry
node scripts/check-api-coverage.mjs --report-missing
node --test tests/api-registry.test.mjs
```

预期：Registry 自身测试通过；`--report-missing` 列出尚未录入的 128 个 API，但以 0 退出，不充当最终覆盖门禁。

- [ ] **Step 5:** Commit：`feat(contracts): add API error and event registries`。

### Task 3: 公共 OpenAPI Components

**Files:**
- Create: `contracts/openapi/components/headers.yaml`
- Create: `contracts/openapi/components/parameters.yaml`
- Create: `contracts/openapi/components/responses.yaml`
- Create: `contracts/openapi/components/security.yaml`
- Create: `contracts/openapi/components/common.yaml`
- Create: `contracts/examples/errors/*.json`
- Create: `contracts/tests/examples.test.mjs`

**Interfaces:**
- Consumes: 06 的 Header/响应/错误；08 的错误恢复；11 的 request ID。
- Produces: 所有 128 Operation 共用的参数、Meta、ErrorResponse 和 202 Operation。

- [x] **Step 1:** 写失败测试覆盖 RequestMeta、ListMeta、FieldError、ErrorResponse 和 OperationAccepted。
- [x] **Step 2:** 实现 Header、cursor、revision、security 和 response components。
- [x] **Step 3:** 为 31 个错误码各提供最少一个合法错误 fixture 或共享 fixture + details 变体。
- [x] **Step 4:** 运行 `npm run contracts:lint && npm run contracts:http-examples`。
- [ ] **Step 5:** Commit：`feat(contracts): define shared HTTP components`。

### Task 4: 身份、Home、Monitor、Conversation、Share 与 Export API

**Files:**
- Create: `contracts/openapi/paths/auth-notifications.yaml`
- Create: `contracts/openapi/paths/home-monitor.yaml`
- Create: `contracts/openapi/paths/conversations-sharing-exports.yaml`
- Create: `contracts/openapi/components/identity.yaml`
- Create: `contracts/openapi/components/conversations.yaml`
- Create: `contracts/openapi/components/content.yaml`
- Create: `contracts/examples/http/api-001-038/*.json`
- Modify: `contracts/openapi/openapi.yaml`

**Interfaces:**
- Consumes: API-001 至 API-038。
- Produces: 38 个 Operation；Conversation/Share/Export 和 Conversation、Monitor 两类 SSE 入口的基础 Schema。

- [x] **Step 1:** 先写覆盖测试，预期缺 API-001 至 API-038 时失败。
- [x] **Step 2:** 定义 User、Profile、Session、Notification、Conversation、Message、ShareLink、ExportJob 的读写 Schema。
- [x] **Step 3:** 逐 API 写 Operation metadata、request、success、errors、examples。
- [x] **Step 4:** 检查创建/撤销 ShareLink 的 Audit 元数据，确认 token/hash 不出现在响应示例。
- [x] **Step 5:** 运行 `node scripts/check-api-coverage.mjs --from API-001 --through API-038`，预期本范围 38/38 通过。
- [ ] **Step 6:** Commit：`feat(contracts): specify auth home conversation and export APIs`。

### Task 5: Task 与 State Lab API

**Files:**
- Create: `contracts/openapi/paths/tasks-artifacts.yaml`
- Create: `contracts/openapi/paths/state-lab.yaml`
- Create: `contracts/openapi/components/tasks.yaml`
- Create: `contracts/openapi/components/states.yaml`
- Create: `contracts/examples/http/api-039-069/*.json`
- Modify: `contracts/openapi/openapi.yaml`

**Interfaces:**
- Consumes: API-039 至 API-069。
- Produces: 31 个 Operation；TaskDraft/TaskRun/Artifact/StateDraft/Mount Schema。

- [x] **Step 1:** 写 TaskRun 202、Retry 新 ID、Artifact download 和 Save & Re-test 的失败测试。
- [x] **Step 2:** 定义 Task/State 读写分离 Schema、revision 和输入快照。
- [x] **Step 3:** 录入 31 个 Operation，所有写操作声明幂等/乐观锁。
- [x] **Step 4:** 合同示例证明 Save & Re-test 返回 TestRun，但不 Publish/Activate。
- [x] **Step 5:** 运行 `node scripts/check-api-coverage.mjs --from API-001 --through API-069`，预期累计 69/69 Operation 通过。
- [ ] **Step 6:** Commit：`feat(contracts): specify task and state lab APIs`。

### Task 6: Skill 生命周期 API

**Files:**
- Create: `contracts/openapi/paths/skills.yaml`
- Create: `contracts/openapi/components/skills.yaml`
- Create: `contracts/examples/http/api-070-096/*.json`
- Modify: `contracts/openapi/openapi.yaml`

**Interfaces:**
- Consumes: API-070 至 API-096、Blank Skill 1-5、Import/Validate/Publish 规则。
- Produces: 27 个 Operation；SkillDraft/Version/File/Capability/ImportJob/ValidationRun Schema。

- [x] **Step 1:** 写 Draft、Import、Validation 和 Publish 前置条件的失败测试。
- [x] **Step 2:** 定义 Skill 组件并保证 `review_count` 不被建模为人工审批状态。
- [x] **Step 3:** 录入 27 个 Operation 和权限/Audit/Event 元数据。
- [x] **Step 4:** 发布示例必须同时校验 Skill 和目标 StateDraft 权限。
- [x] **Step 5:** 运行 `node scripts/check-api-coverage.mjs --from API-001 --through API-096`，预期累计 96/96 Operation 通过。
- [ ] **Step 6:** Commit：`feat(contracts): specify skill lifecycle APIs`。

### Task 7: Test、Market、Installation、Ledger、Upload 与 Runtime API

**Files:**
- Create: `contracts/openapi/paths/state-tests.yaml`
- Create: `contracts/openapi/paths/market-installations.yaml`
- Create: `contracts/openapi/paths/ledger.yaml`
- Create: `contracts/openapi/paths/uploads-sources-runtime.yaml`
- Create: `contracts/openapi/components/tests.yaml`
- Create: `contracts/openapi/components/governance.yaml`
- Create: `contracts/examples/http/api-097-128/*.json`
- Modify: `contracts/openapi/openapi.yaml`

**Interfaces:**
- Consumes: API-097 至 API-128。
- Produces: 剩余 32 个 Operation；完整 128 API OpenAPI 源。

- [x] **Step 1:** 写 Test 不自动发布、Install 不自动激活、Restore 新 Draft 和 Upload 安全错误的测试。
- [x] **Step 2:** 定义 TestResult、Sandbox、Installation、Ledger、UploadSession、Source、Usage/Audit 摘要 Schema。
- [x] **Step 3:** 录入剩余 32 个 Operation。
- [x] **Step 4:** 验证 API-113 Activate 与 API-112 Install 明确分离。
- [x] **Step 5:** 运行 `npm run contracts:http-check`。

预期：128/128 API、31/31 error Registry 覆盖，lint/bundle/examples 全部通过。

- [ ] **Step 6:** Commit：`feat(contracts): complete product API specification`。

### Task 8: EventEnvelope 与通用事件

**Files:**
- Create: `contracts/events/event-envelope.schema.json`
- Create: `contracts/events/event.schema.json`
- Create: `contracts/events/common/*.schema.json`
- Create: `contracts/examples/events/operation-*.json`
- Create: `contracts/scripts/validate-event-fixtures.mjs`
- Create: `contracts/tests/event-schema.test.mjs`

**Interfaces:**
- Consumes: 07 的 Envelope、Operation lifecycle 和 10 个通用事件。
- Produces: 事件公共基类、通用事件和 Ajv validator。

- [x] **Step 1:** 写失败测试：缺字段、progress 越界、错误 event_type、重复终态 fixture 必须失败。
- [x] **Step 2:** 实现 Envelope、Operation common 和 `artifact.created`。
- [x] **Step 3:** 将通用 fixture 接入 Event Registry。
- [x] **Step 4:** 运行 `node scripts/check-event-coverage.mjs --family operation && npm run contracts:event-examples && node --test tests/event-schema.test.mjs`。
- [ ] **Step 5:** Commit：`feat(contracts): define event envelope and common events`。

### Task 9: 全部领域事件

**Files:**
- Create: `contracts/events/task/*.schema.json`
- Create: `contracts/events/test/*.schema.json`
- Create: `contracts/events/validation/*.schema.json`
- Create: `contracts/events/import/*.schema.json`
- Create: `contracts/events/export/*.schema.json`
- Create: `contracts/events/reply/*.schema.json`
- Create: `contracts/events/monitor/*.schema.json`
- Create: `contracts/events/runtime/*.schema.json`
- Create: `contracts/examples/events/**/*.json`
- Modify: `contracts/events/event.schema.json`

**Interfaces:**
- Consumes: Registry 中 56 个唯一 event type。
- Produces: 完整事件 union 和每类 payload validator。

- [x] **Step 1:** 为每个家族先写至少一个非法 fixture，确认 validator 会失败。
- [x] **Step 2:** 实现每个 payload Schema 和合法 fixture。
- [x] **Step 3:** `event.schema.json` 使用 `oneOf` 引用全部 56 变体。
- [x] **Step 4:** 验证 58 条来源定义全部被覆盖，重复 `artifact.created` 只维护一个 Schema。
- [x] **Step 5:** 运行 `npm run contracts:event-check`。
- [ ] **Step 6:** Commit：`feat(contracts): define all domain event schemas`。

### Task 10: Mock、生成和开发者文档

**Files:**
- Create: `contracts/scripts/sse-fixture-server.mjs`
- Create: `contracts/generated/typescript/*`
- Modify: `contracts/package.json`
- Modify: `contracts/README.md`

**Interfaces:**
- Consumes: bundled OpenAPI 和 event union。
- Produces: HTTP Mock、SSE fixture server、前端类型和使用说明。

- [x] **Step 1:** 写 Mock smoke test，调用 Login、Home、Create TaskRun、TestResult、Upload 和错误响应。
- [x] **Step 2:** 实现 SSE server 的正常、重复、断线恢复和游标过期场景。
- [x] **Step 3:** 配置 TypeScript 生成并编译 generated output。
- [x] **Step 4:** README 写明启动、环境变量、请求示例和禁止手改生成文件。
- [x] **Step 5:** 运行：

```bash
cd contracts
npm run contracts:check
npm run generate:typescript
npm run generated:typecheck
npm run mock:smoke
```

预期：全部命令 exit 0，Mock 覆盖关键流程，生成目录无未提交漂移。

- [ ] **Step 6:** Commit：`feat(contracts): add mocks and generated TypeScript contract`。

### Task 11: Provider、Consumer 与 Compatibility CI

**Files:**
- Create: `.github/workflows/contracts.yml` 或后端现有 CI 的等价文件
- Create: `contracts/tests/compatibility.test.mjs`
- Create: `contracts/scripts/check-breaking-changes.mjs`
- Modify: 前端 API Client 测试入口
- Modify: 后端 provider contract 测试入口

**Interfaces:**
- Consumes: 完整机器契约和主分支基线。
- Produces: PR 门禁和前后端漂移检测。

- [x] **Step 1:** 先让兼容性测试在删除 Operation 时失败。
- [x] **Step 2:** 增加 lint、bundle、coverage、examples、secret scan、type generation、compatibility jobs。
- [ ] **Step 3:** 后端测试真实 response/event 是否通过 Schema。
- [ ] **Step 4:** 前端测试 generated client 和关键错误/恢复分支。
- [x] **Step 5:** 恢复完整 128 API 合同并运行本地完整门禁，全部通过。
- [ ] **Step 6:** Commit：`ci(contracts): enforce API and event compatibility`。

## 23. Definition of Done

只有同时满足以下条件，机器契约阶段才算完成：

- [x] 128 个 API-ID 连续、唯一并与 Method/Path 一致。
- [x] 128 个 Operation 都有 operationId、INT-ID、权限、执行模式和 owner。
- [x] 所有写操作明确幂等、revision 和 Audit 要求。
- [x] 31 个稳定错误码均在 Registry，且 Operation 只引用 Registry 值。
- [x] 7 个 SSE endpoint 全部关联 Event Schema。
- [x] 56 个唯一 event type 均有 Schema 和合法 fixture。
- [x] 事件恢复、去重、终态和游标过期有自动测试。
- [x] HTTP 示例和事件 fixture 均无秘密或真实用户内容。
- [x] lint、bundle、coverage、examples、secret scan、tests 全部通过。
- [x] bundled OpenAPI 可启动 HTTP Mock。
- [x] TypeScript 生成结果可编译且可重复生成。
- [ ] 后端 provider test 和前端 consumer test 使用同一 bundled contract。
- [x] breaking change 检查已进入 PR CI。
- [x] README 能让不了解项目的工程师在本机完成 lint、Mock 和生成。

## 24. 需要后端确认但不阻塞脚手架的问题

| 优先级 | 问题 | 当前计划处理 |
|---|---|---|
| P0 | 后端语言和框架 | 暂不生成 Server Stub；先交付语言无关契约 |
| P0 | SSE 浏览器鉴权最终采用 fetch stream、cookie 还是短 ticket | OpenAPI 先描述 Bearer 和恢复语义；确认后补安全方案 |
| P0 | `If-Match` 与 body revision 同时出现的优先级 | 首版每个 Operation 只选一种主方式，禁止模糊双写 |
| P0 | Audit 写入失败的 fail-closed 清单 | 扩展字段先记录 action；执行策略由安全评审确认 |
| P1 | OpenAPI 生成完整 Client 还是只生成类型 | 首版至少生成类型；Client 取决于前端技术栈 |
| P1 | 事件旧版本支持周期 | Schema 永久保留历史版本，运行支持期由发布策略确认 |
| P1 | Dynamic Export options Schema 的允许关键字 | 使用安全子集并由后端校验，禁止任意远程 `$ref` |
| P1 | Public ShareLink 访问 endpoint | 当前 128 API 未定义，不自行新增 |
| P2 | 是否增加 AsyncAPI 文档 | 首版 JSON Schema 已足够；消息总线扩大后再评估 |

## 25. 官方参考

- OpenAPI 3.1.0 Specification: `https://spec.openapis.org/oas/v3.1.0.html`
- JSON Schema Draft 2020-12: `https://json-schema.org/draft/2020-12`
- Redocly lint and bundle: `https://redocly.com/docs/cli/guides/lint-and-bundle`
- Ajv Draft 2020-12 support: `https://ajv.js.org/json-schema.html`
- Prism OpenAPI Mock: `https://stoplight.io/open-source/prism`

## 26. 下一步

本计划确认后，下一步不是继续写说明文档，而是执行 Task 1 至 Task 3：创建 `contracts/` 脚手架、三份 Registry 和公共 OpenAPI Components。完成后前端可以先连接 Mock，后端可以按同一 Schema 开始实现。
