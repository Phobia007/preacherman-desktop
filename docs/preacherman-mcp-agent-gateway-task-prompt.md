# Preacherman MCP Agent Gateway 融合任务提示词

> 用途：将本文从“任务目标”开始整体复制到新的 Codex 任务模式中执行。
> 基线：`D:\preacherman`，以主工作区为唯一源码和融合基线。

## 任务目标

在不破坏现有 MCP 出站能力的前提下，为 Preacherman 增加一条真正可用的入站通道：**Preacherman MCP Agent Gateway**。

现有方向必须保留：

```text
Preacherman（MCP Client）→ 外部 MCP Server → 外部工具
```

本任务新增方向：

```text
用户自己的 Codex / Claude Code / Gemini CLI / 其他 MCP Agent
→ Preacherman MCP Gateway（MCP Server）
→ TaskRun / 审批 / 执行路由 / Artifact / Ledger
```

用户应能在 Settings 中复制一段经过验证的 MCP 配置，粘贴到自己的 Agent。用户继续使用该 Agent 自己已有的登录、订阅或企业授权，不要求把该 Agent 的模型 API Key 交给 Preacherman。随后，外部 Agent 可以通过 MCP 创建和跟踪 Preacherman 任务，并得到真实任务状态和产物。

MCP 在这里是“外部 Agent 进入 Preacherman 工作流的标准入口”。它不是模型 Provider，也不能伪装成 A2A、ACP 或远程执行 Agent API。

同时实现与 Open Design 截图同类的 **Local Subscription Agent Runner**：用户在 Preacherman 前端输入任务并选择本机已安装、已登录的 Codex CLI 等 Agent，由 Preacherman 在后台启动官方 CLI。Agent 继续使用用户自己的订阅身份，执行进度和结果进入 Preacherman TaskRun/Ledger。

两条入口必须并列而不混淆：

```text
入口 A（Preacherman 主控）
用户在 Preacherman 输入 → Local Agent Runner → 本机 Codex CLI → TaskRun/Ledger

入口 B（外部 Agent 主控）
用户在 Codex/Claude/Gemini 输入 → Preacherman MCP Gateway → TaskRun/Ledger
```

## 成功标准

完成后必须真实跑通以下链路：

```text
外部 MCP Client 启动本地 stdio Gateway
→ capabilities
→ task.create
→ TaskRun 持久化
→ Preacherman 前端显示任务及待审批状态
→ 用户在 Preacherman 内完成审批
→ 现有执行路由执行任务
→ task.status / task.events 返回真实进度
→ artifact.list / artifact.read 返回真实产物
→ Ledger 留下调用方、状态、审批和产物记录
```

并且真实跑通本地订阅 Agent 链路：

```text
Preacherman 发现 Codex CLI
→ 只读取 `codex login status` 的登录状态
→ 用户在 Work 中选择 Codex CLI 并提交任务
→ 后台执行 `codex exec --json`
→ JSONL 事件映射为 TaskRun 进度
→ 最终结果和工作区改动摘要进入 Artifact/Ledger
→ 用户可从 Preacherman 取消进程
```

验收时不允许用固定成功响应、内存假任务、源码正则测试或纯 UI Mock 代替真实链路。

## 范围与优先级

### P0：本轮必须完成

1. 本地 `stdio` MCP Gateway。
2. MCP 工具到现有 TaskService、TaskStore、ExecutionRouter、Artifact 和 Ledger 的真实绑定。
3. 调用方身份、权限、审批隔离和审计。
4. Settings 中的“连接你的 Agent”前端板块。
5. Codex、Claude Code、Gemini CLI 和通用 MCP Client 的配置模板。
6. 一条启动真实 MCP Client 的端到端测试。
7. 保证现有 MCP Client/外部工具能力不回归。
8. Local Subscription Agent Runner 核心与 Codex CLI Adapter。
9. Work 页的执行 Agent 选择器：`Preacherman Local / Codex CLI`，并预留其他 Agent。
10. Codex CLI 检测、登录状态、真实 `exec --json` 执行、取消、事件和结果映射。

### P1：本轮建立契约，时间允许再实现

1. Loopback-only Streamable HTTP MCP。
2. Session 撤销和短期访问令牌轮换。
3. SSE/Streamable HTTP 远程事件传输。
4. Claude Code 和 Gemini CLI 的 Local Runner Adapter；若本机未安装，必须显示 `not-installed`，不得伪造验证。
5. Codex 会话 resume/steering；只有官方 CLI 当前接口和安全模型允许时才启用。

### 明确不在本轮范围

1. 不实现 A2A 或 ACP。
2. 不为 Codex、Claude、Gemini 重写其内部 Agent 或模型 Adapter。
3. 不通过 UI 自动点击、屏幕抓取或逆向私有接口控制外部 Agent。
4. 不把 MCP 工具调用冒充成“Preacherman 主动控制外部执行 Agent”。
5. 不默认监听公网，不开放任意 CORS，不提供未经认证的远程 MCP。
6. 不让外部 Agent 直接操作 TaskStore 文件或读取任意本地文件。
7. 不读取、复制、导出或展示 Codex/Claude/Gemini 的登录 token、cookie 或认证文件。
8. 不使用 `dangerously-bypass-approvals-and-sandbox` 或任何等价的全权限参数。
9. 不把“CLI 已安装”等同于“CLI 已登录并可执行”。

## Local Subscription Agent Runner

### 产品语义

该 Runner 对应用户截图中的体验：用户仍在 Preacherman 输入，Preacherman 主动选择并启动后台执行 Agent。它不是 MCP Gateway 的替代品，而是另一条一等入口。

第一阶段真实支持 Codex CLI。实现必须以本机 CLI 自身的公开命令为准，不读取私有认证文件：

- `codex --version`：发现版本；
- `codex login status`：检查是否已登录；
- `codex exec --json`：非交互执行并输出 JSONL 事件；
- `--cd <workspace>`：绑定经用户选择且经宿主验证的工作目录；
- `--sandbox workspace-write`：默认受控写入；
- `--output-schema <file>`：需要稳定最终结果时使用宿主生成的 schema；
- 通过子进程 signal/termination 实现取消。

本机验收基线已经确认：Codex CLI `0.145.0` 提供上述 `login status` 与 `exec --json`，当前机器显示 `Logged in using ChatGPT`。不得把这一台机器的版本或登录状态硬编码进产品。

### 统一 Local Agent Adapter 契约

为后续 Claude Code、Gemini CLI、OpenCode 等建立最小统一契约：

- `id / label / kind`；
- `detect()`：返回 installed、version、executable；
- `authStatus()`：只返回 ready/login-required/unknown/error，不返回凭据；
- `capabilities()`：progress、cancel、resume、steer、approval、artifacts、workspaceWrite；
- `start({ taskId, objective, workspace, policy })`；
- `events(runId, cursor)`；
- `cancel(runId)`；
- 可选 `resume/steer`；
- `close()`。

所有具体 CLI 解析只存在于各自 Adapter 内；TaskService、UI 和 Ledger 只依赖统一契约。

### 进程与工作区安全

1. 可执行文件必须通过可信 PATH/显式设置发现，不允许请求体提供任意 executable 和 args。
2. 工作目录必须由用户在 Preacherman 中明确选择，并通过 realpath 校验；禁止使用请求体绕过允许根目录。
3. 默认使用 Agent 官方的安全/审批模式；Codex 默认 `workspace-write`。
4. 环境变量使用 allowlist。不得把 Preacherman Provider Key、Gateway token 或无关系统密钥传给子进程。
5. stdout JSONL 与 stderr 分离解析，均设置字节、行长和历史上限。
6. 子进程退出、超时、取消、崩溃和无法解析事件必须映射为诚实 TaskRun 状态。
7. 服务重启后不能伪称本地 CLI 仍在运行；应标记 interrupted/recovery-unavailable，除非对应 Agent 提供可靠的恢复接口。
8. 不自动执行 git commit、push、部署或对外发送；这些仍需要现有审批策略。

### Codex CLI 事件映射

使用 `codex exec --json` 的真实 JSONL 输出建立防御性解析器：

- 会话/线程标识 → externalRunId/session metadata；
- reasoning/message/tool 事件 → TaskRun events；
- 命令或文件操作 → 可审计 action events；
- 最终消息 → result summary；
- 文件改动只记录工作区内的安全摘要；
- CLI error/非零退出码 → failed；
- 用户取消 → cancelled。

未知事件必须保留为受限、安全的 generic event 或忽略并计数，不能导致整个服务崩溃。

### Local Runner 服务接口

建议增加：

- `GET /api/execution/local-agents`：Agent 检测、版本、登录和能力；
- `POST /api/execution/local-agents/:id/test`：真实版本与登录探针；
- `POST /api/tasks/:id/local-agent/start`：宿主选择 adapter 并启动；
- 现有 task get/events/cancel 路由继续作为权威运行接口；
- 若提供模型列表，只读取 CLI 可安全公开的配置/命令结果，不解析认证文件。

请求体只允许选择已注册的 adapter id、宿主认可的 workspace id 和安全执行策略；不得允许浏览器提交任意 command、args、env 或可执行路径。

## 架构约束

### 1. 双向 MCP 必须清晰分离

保留现有 `preachermanMcpRuntime` 作为出站 MCP Client。新增入站 Gateway 时使用独立模块、独立状态和独立命名，禁止把两种方向混在同一个配置对象中。

建议结构：

```text
server/mcp-gateway/
  preachermanMcpGatewayRuntime.mjs    # 工具定义、身份与调用编排
  preachermanMcpGatewayBridge.mjs     # Gateway → 本地服务的受控桥
  preachermanMcpGatewayAudit.mjs      # 会话与调用审计
scripts/preacherman-mcp-gateway.mjs   # 外部 Agent 启动的 stdio 入口
```

可按现有工程风格调整文件名，但职责边界必须保留。

### 2. stdio 入口不能直接并发写 TaskStore

外部 Agent 启动的 stdio 进程必须通过受控的本地服务接口调用现有 TaskService。不要让独立进程直接打开并写入 TaskStore JSON，否则会产生多进程写入冲突并绕过服务端权限。

推荐链路：

```text
MCP stdio process
→ loopback service bridge（带本地 Gateway 凭据）
→ TaskService / ExecutionRouter
```

### 3. 统一身份模型

每个 MCP 会话至少记录：

- `principalId`
- `clientName`
- `clientVersion`
- `transport`
- `sessionId`
- `connectedAt`
- `lastSeenAt`
- `grantedScopes`
- `revokedAt`

身份由 Gateway/宿主注入，禁止接受 MCP 工具参数里的 `principalId`、`role` 或 `scopes` 作为权威身份。

### 4. 最小权限 Scope

至少定义并强制执行：

- `capabilities:read`
- `tasks:create`
- `tasks:read-own`
- `tasks:cancel-own`
- `tasks:retry-own`
- `tasks:steer-own`
- `artifacts:read-own`
- `ledger:read-own`

默认只允许读取和操作当前 principal 创建的任务。管理员式全局读取不向外部 Agent 默认开放。

### 5. 人工审批不可被外部 Agent 伪造

外部 MCP Agent 可以：

- 查看任务正在等待审批；
- 读取审批标题、风险说明和非敏感摘要；
- 等待用户在 Preacherman 前端作出决定。

外部 MCP Agent默认不可以直接批准危险操作。不得因为工具参数出现 `approved: true` 就视为人工批准。

如果保留 `approval.respond` 能力，必须满足以下全部条件：

- 默认关闭；
- 只接受 Preacherman 宿主签发的一次性、短期、绑定 task/approval/principal 的批准证明；
- 使用后立即失效；
- 拒绝重放；
- 审计记录明确区分用户批准与 Agent 请求。

### 6. Gateway 工具集

P0 至少提供以下工具，名称可以采用 MCP 兼容的下划线形式，但对外文档使用下面的语义名称：

| 工具 | 权限 | 行为 |
|---|---|---|
| `preacherman.capabilities` | `capabilities:read` | 返回协议版本、工具、限制和真实可用执行后端 |
| `preacherman.task.create` | `tasks:create` | 创建真实 TaskRun，返回 taskId、状态和下一步 |
| `preacherman.task.get` | `tasks:read-own` | 获取当前 principal 所属任务 |
| `preacherman.task.list` | `tasks:read-own` | 分页列出当前 principal 的任务 |
| `preacherman.task.events` | `tasks:read-own` | 按游标读取增量事件，不伪造 streaming |
| `preacherman.task.cancel` | `tasks:cancel-own` | 调用现有取消语义 |
| `preacherman.task.retry` | `tasks:retry-own` | 只对可重试终态任务创建真实重试 |
| `preacherman.task.steer` | `tasks:steer-own` | 仅在当前执行后端声明支持时可用 |
| `preacherman.artifact.list` | `artifacts:read-own` | 返回安全产物元数据 |
| `preacherman.artifact.read` | `artifacts:read-own` | 读取有大小限制的所属产物内容 |
| `preacherman.ledger.get` | `ledger:read-own` | 返回该任务的执行摘要和审计，不泄露其他用户信息 |

每个工具都必须有严格 JSON Schema、输入大小限制、输出大小限制、超时、稳定错误码和密钥脱敏。

### 7. 能力协商

`preacherman.capabilities` 不得仅返回静态营销列表。它需要结合当前服务状态，明确区分：

- `ready`
- `configuration-required`
- `external-runtime-required`
- `unsupported`
- `error`

同时声明当前执行后端是否支持：

- progress/events
- approval
- cancellation
- retry
- resume
- steering
- artifacts

外部 Agent 据此决定是否调用对应工具。

### 8. 错误与审计

错误至少覆盖：

- 未认证；
- Scope 不足；
- 非任务所有者；
- 会话撤销；
- 输入非法；
- TaskRun 不存在；
- 状态冲突；
- 审批仍待处理；
- 执行后端未配置；
- 超时；
- 产物过大；
- 本地服务不可达。

审计记录只保存必要元数据，不保存 API Key、Bearer token、完整敏感提示词或产物正文。错误信息和日志必须递归脱敏。

## 本地服务接口

为 stdio Gateway 建立最小、受控的 loopback bridge。可以复用已有 `/api/tasks` 路由，但必须增加 Gateway 身份校验和 owner scope，不能让 stdio 进程使用无身份的公共本地接口。

Settings UI 建议使用：

- `GET /api/mcp/gateway`：状态、版本、transport、已连接会话数量和安全配置；
- `GET /api/mcp/gateway/templates`：经过宿主生成的客户端配置模板；
- `GET /api/mcp/gateway/sessions`：安全会话摘要；
- `POST /api/mcp/gateway/credentials/rotate`：轮换本地 Gateway 凭据；
- `POST /api/mcp/gateway/sessions/:id/revoke`：撤销会话；
- `POST /api/mcp/gateway/test`：启动真实 MCP Client 探针并调用 capabilities。

API 不得返回明文长期凭据。配置复制需要凭据时，使用一次性显示或生成短期 bootstrap 配置，并明确提示用户妥善保管。

## 前端任务

### 信息架构

不要增加新的一级底部导航。将它放在：

```text
Settings
└── MCP / Agent Access
    ├── Connect tools to Preacherman（现有出站 MCP）
    └── Connect your Agent to Preacherman（新增入站 Gateway）
```

运行会话、失败记录和调用耗时可以同步进入现有 Test / Runtime Trace，但 Test 页面只做观察，不重复放配置表单。

Local Runner 的主要操作入口不放在 Settings，而放在 Work 的任务输入区，形态参考用户截图但使用 Preacherman 设计语言：

```text
Work / Task composer
├── 执行方式
│   ├── Preacherman Local
│   └── Local Agent
├── Agent（选择 Local Agent 后出现）
│   ├── Codex CLI
│   ├── Claude Code（未安装/未接通时诚实禁用）
│   └── Gemini CLI（未安装/未接通时诚实禁用）
├── 模型（仅 Adapter 能安全发现时显示）
├── 工作目录
└── 发送 / 创建任务
```

Settings / Agent Access 负责安装检测、登录状态、默认 Agent、默认安全策略，以及 MCP 入站配置；不要把运行任务的主要按钮藏在 Settings。

### 新增板块必须包含

1. **一句话解释**：使用你已有的 Agent 登录或订阅，通过 MCP 接入 Preacherman；Preacherman 不读取该 Agent 的账号密码。
2. **Gateway 状态**：Ready、Blocked、Error、服务版本、transport、服务端口。
3. **客户端选择**：Codex、Claude Code、Gemini CLI、Generic MCP。
4. **配置预览**：根据当前系统路径和端口由服务端生成，禁止前端硬编码用户目录。
5. **复制配置**按钮：复制后显示明确成功/失败反馈。
6. **测试连接**按钮：必须启动真实 MCP Client 探针调用 `preacherman.capabilities`，不能只检查 HTTP health。
7. **已连接 Agent**：client、session、授权范围、最近活动、撤销按钮。
8. **安全说明**：外部 Agent 可以创建和跟踪任务，但危险操作仍需在 Preacherman 内批准。
9. **高级设置折叠区**：凭据轮换、权限说明；默认界面保持简洁。
10. **Local Agents**：Codex CLI 等本机 Agent 的 installed/login/status/version/capabilities。
11. **打开登录说明**：未登录时显示用户应在官方 CLI 完成登录；Preacherman 不代收账号密码。
12. **默认安全策略**：只允许选择宿主提供的安全预设，不提供 arbitrary args 文本框。

### 布局层级

- 页面主标题：`Agent Access / Agent 接入`；
- 主操作：`Copy configuration / 复制配置`；
- 次操作：`Test connection / 测试连接`；
- 危险操作：`Revoke / 撤销`，视觉上与主操作区分；
- 出站 MCP JSON 编辑器保留在“Connect tools”子板块，不要与入站配置混在同一表单；
- 不要把 capabilities、session、audit 同时平铺成大量同权重卡片；默认只展示状态和接入步骤，细节放入折叠区。

### 视觉与可访问性

- 完全沿用 Preacherman 现有设计语言；
- 必须支持 Light/Dark；
- 只使用 `--demo-theme-*` 语义变量；
- 不引入其他品牌主视觉，只在客户端选择器中使用文字名称；
- loading、empty、ready、blocked、error、revoked 状态必须明确；
- 键盘可达，复制和撤销结果使用 `role=status` / `role=alert`；
- 保留窗口最小化、最大化和关闭按钮在两种主题下的可读性。

## 客户端模板要求

为以下客户端提供经过实际验证的模板：

- Codex；
- Claude Code；
- Gemini CLI；
- Generic stdio MCP client。

模板必须由服务端根据实际可执行入口、工作目录、平台路径和本地服务端口生成。Windows 路径必须正确转义。不能把开发者机器上的固定绝对路径提交成所有用户共用的模板。

模板旁需要说明：

- Agent 使用自己的登录/订阅/企业认证；
- 该配置只负责让 Agent 发现 Preacherman 工具；
- Preacherman 不会因此获得 Agent 平台的账号密码；
- MCP 能让 Agent 主动使用 Preacherman，但不等价于 Preacherman 能主动启动和控制该 Agent；后者仍需 A2A、ACP 或 Agent API。

## 测试与验收

### 后端测试

1. 使用官方 MCP SDK Client 启动真实 stdio Gateway。
2. 调用 capabilities 并验证动态状态。
3. 创建任务后，从真实 TaskStore 读取同一个 taskId。
4. 外部 Agent无法读取或取消另一个 principal 的任务。
5. `approved: true`、伪造 principal/scopes、重放凭据均不能绕过审批。
6. 取消、重试和 steering 严格服从 TaskRun 状态与后端 capability。
7. Artifact 内容限制、owner 校验和脱敏有效。
8. Gateway 重启后任务仍可查询；撤销会话不可继续调用。
9. 现有出站 MCP 配置、工具发现和工具调用测试继续通过。

### HTTP/产品链路测试

至少新增一条真实闭环：

```text
MCP Client → task.create
→ HTTP 读取 TaskRun
→ 宿主批准
→ 执行完成
→ MCP task.events
→ MCP artifact.read
→ Ledger 验证 principal 和 artifact
```

### 前端测试

1. 四种客户端模板可切换；
2. 配置来自服务端响应；
3. 复制成功与失败状态真实；
4. Test 按钮只在 Gateway 可测试时启用；
5. 未启动、未认证、服务不可达、无会话、撤销失败都有诚实状态；
6. Light/Dark 实页验证；
7. 浏览器 console 0 error；
8. 现有 Settings、MCP 出站和窗口控制没有回归。
9. Work 中选择 Codex CLI 后发送任务，必须命中 Local Runner，而不是 DeepSeek/PitchKit 假执行。
10. Codex 未安装、未登录、运行中、等待、成功、失败、取消均有明确状态。
11. 用户不能通过前端请求注入 executable、args 或 env。

### Local Runner 后端测试

1. 使用 fixture executable 验证 JSONL parser、非零退出、超时、取消和超限，不依赖真实额度完成全部单元测试。
2. 在当前机器用真实 `codex --version` 和 `codex login status` 做探针验收。
3. 在用户明确触发的验收任务中执行一个只读/受控写入的真实 `codex exec --json` 流程；不得在自动测试中消耗订阅额度。
4. 验证 argv 使用参数数组而不是拼接 shell 字符串，任务文本不能注入额外命令。
5. 验证工作目录 realpath、允许根、环境变量 allowlist 和 `workspace-write` 策略。
6. 验证取消真实终止子进程并将 TaskRun 标记为 cancelled。
7. 验证 Local Runner 事件、summary 和 artifact 全部进入 Ledger。

## 推荐并行工作流

如使用子 Agent 并行开发，先冻结接口契约和文件所有权，再拆分：

1. **Gateway Runtime Agent**：MCP 工具、schema、principal/scope、审计核心和模块测试。
2. **Bridge/CLI Agent**：stdio 入口、本地 bridge、配置模板生成和真实 SDK Client fixture。
3. **Server Integration Agent**：宿主路由、TaskService/Ledger 绑定、启动关闭生命周期和 HTTP 集成测试。
4. **Frontend Agent**：Settings Agent Access 板块、状态、模板复制、会话撤销、Light/Dark。
5. **Security/Acceptance Agent**：只读审计 owner/approval/token 边界，并运行端到端验收。
6. **Local Agent Runner Agent**：统一 CLI 契约、Codex Adapter、受控 spawn、JSONL parser 和 fixture 测试；不要修改共享 server/UI 文件。

禁止多个 Agent 同时修改 `preachermanServer.mjs`、`SettingsScreen.tsx` 或全局 `styles.css`。这些共享文件由集成 Agent 最后串行接线。

## 完成定义

只有满足以下全部条件才可报告完成：

- 外部真实 MCP Client 能创建并跟踪真实 TaskRun；
- 任务执行、审批和产物进入现有闭环；
- 外部 Agent不能伪造用户审批或跨 principal 读取数据；
- Settings 能生成、复制和真实测试配置；
- Codex、Claude Code、Gemini CLI、Generic 模板至少各验证一次配置结构，其中当前机器可用的客户端至少完成一次真实连接；
- 出站 MCP 能力无回归；
- 定向测试、完整测试、typecheck、build 和 diff-check 通过；
- Light/Dark 实页验收通过，console 0 error；
- 文档明确说明 MCP 入站与 A2A/ACP/Agent API 的边界；
- 用户能在 Preacherman Work 中选择本机已登录的 Codex CLI 并后台执行真实任务；
- Preacherman不读取或保存 Codex 登录凭据，默认不绕过 Codex 的沙箱和审批；
- 不提交用户原有的无关变更、密钥、token、运行数据或构建产物。

## 最终交付报告格式

最终报告必须给出：

1. 已实现的工具、scope 和 transport；
2. 实际验证过的客户端；
3. 一条可复制的接入路径；
4. 端到端证据和测试命令；
5. 审批与身份安全边界；
6. 尚未实现的能力，尤其是远程 MCP、A2A 和 ACP；
7. 前端入口的准确页面和按钮位置；
8. 所有改动文件清单。
