# 应用界面错误、Loading 与 Empty 状态规范

- Figma 文件：[应用界面 Copy](https://www.figma.com/design/lWtoH8PCoOoPP3ttwMUBP6/应用界面--Copy-)
- 编写日期：2026-07-14
- 当前版本：`Draft v0.1`
- 依据：[02-screen-index.csv](./02-screen-index.csv)、[04-interaction-matrix.csv](./04-interaction-matrix.csv)、[06-api-requirements.md](./06-api-requirements.md)、[07-realtime-and-async-events.md](./07-realtime-and-async-events.md)
- 用途：统一产品、设计、前端、后端和测试人员对非成功状态的处理方式

## 1. 这份文件解决什么问题

设计稿主要展示正常页面，但真实应用还会遇到：

- 数据第一次加载。
- 用户还没有创建任何内容。
- 搜索没有结果。
- 某个卡片加载失败，但其他区域正常。
- 表单字段不合法。
- Draft 被另一页面修改。
- 文件上传、解析或安全检查失败。
- TaskRun/TestRun 等异步任务失败。
- SSE 连接断开，但后端任务仍在运行。
- Session 过期、没有权限或资源已经不存在。

这份文件定义每种情况出现在哪里、显示什么、保留什么，以及用户如何恢复。它不替代 Figma 正常态，也不修改后端错误码。

## 2. 覆盖范围

页面总清单共有 55 个页面：

- 本文件覆盖 49 个交付范围页面，包括正式稿、交互状态和探索/待确认页面。
- 以下 6 个归档页面不交付，因此不再单独设计状态：`SCR-045`、`SCR-046`、`SCR-047`、`SCR-048`、`SCR-049`、`SCR-055`。

Hover、发送中和探索页面可以继承正式页面的错误规范，但必须在逐页矩阵中明确继承来源。

## 3. 核心原则

| 编号 | 原则 | 要求 |
|---|---|---|
| UX-01 | Empty 不等于 Error | 用户尚未创建数据时，不显示红色错误或 Retry |
| UX-02 | 局部失败尽量局部展示 | 一张卡片失败不能遮住整个可用页面 |
| UX-03 | 提交失败保留可恢复输入 | 除密码和秘密外，不清空用户已经填写的内容 |
| UX-04 | Retry 必须重复原动作 | Retry 不得悄悄创建不同资源或跳到无关页面 |
| UX-05 | 异步失败与断线分离 | SSE 断线显示 Reconnecting，不把仍在运行的任务标记为 Failed |
| UX-06 | 稳定错误码驱动 UI | 前端不解析后端 `message` 判断业务逻辑 |
| UX-07 | 阻断原因必须可行动 | 告诉用户下一步能做什么，而不只说 Something went wrong |
| UX-08 | 不伪造成功 | 未收到后端成功响应，不显示 Saved、Autosaved、Installed 或 Completed |
| UX-09 | 危险操作失败保持原状态 | Restore、Activate、Publish 失败时，原版本和 Current State 不变 |
| UX-10 | 错误信息不得泄露秘密 | 不显示堆栈、内部 prompt、Token、API key 或私有文件地址 |

## 4. 页面状态分类

### 4.1 状态总表

| 状态 | 含义 | 是否需要用户操作 | 常见展示 |
|---|---|---:|---|
| `initial_loading` | 首次加载必要数据 | 否 | 页面骨架屏 |
| `section_loading` | 局部区域刷新 | 否 | 卡片骨架或行内 Loading |
| `submitting` | 用户提交写入 | 否 | 按钮 Loading，相关控件暂时禁用 |
| `processing` | 后端异步运行 | 视情况 | 阶段时间线、进度、日志 |
| `empty_first_use` | 用户从未创建该对象 | 是 | 解释 + 主要创建入口 |
| `empty_no_results` | 搜索/筛选没有匹配 | 是 | 保留条件 + Clear filters |
| `empty_optional` | 可选区域没有内容 | 否 | 简短静默状态或隐藏区域 |
| `inline_error` | 单个字段或控件失败 | 是 | 字段下错误、Retry/Replace |
| `section_error` | 单个模块失败 | 是 | 区域内错误 + Retry |
| `page_error` | 页面核心数据不可用 | 是 | 整页错误 + Retry/Back |
| `blocking_error` | 权限、冲突或危险操作被阻止 | 是 | 对话框或阻断页 |
| `terminal_run_error` | 异步任务进入失败终态 | 是 | 失败阶段、原因、Retry/Create new |
| `offline_reconnecting` | 网络或事件流断开 | 否/可选 | 非阻塞 Banner + 最后更新时间 |

### 4.2 Empty、Error 和 Forbidden 的判断

```text
请求成功 + data 为空
  -> Empty

请求失败 + 可以重试
  -> Error + Retry

请求成功 + 当前筛选无匹配
  -> No results + Clear filters

请求返回 403
  -> Forbidden，不伪装成 Empty

请求返回 404
  -> Not found/Removed，不伪装成 Empty
```

后端不得为了隐藏权限问题而让已授权前端误判为“没有数据”。出于安全原因使用 404 隐藏资源存在性时，前端统一显示不可用页面，不显示创建入口。

## 5. 错误展示层级

### 5.1 字段级

适用于：格式错误、必填缺失、长度超限、字段冲突。

要求：

- 错误紧邻字段显示。
- 保留用户输入。
- 聚焦第一个错误字段。
- 后端 `field_errors[].field` 必须使用数据字典字段名。
- 同时存在多个字段错误时全部显示，不要求用户逐次提交发现。

### 5.2 控件或行级

适用于：单个 Source 上传失败、单个 Artifact 下载失败、单张卡片操作失败。

要求：

- 错误留在对应行或卡片。
- 其他行仍可操作。
- 提供 `Retry`、`Replace`、`Remove` 或 `View details` 中实际可用的动作。

### 5.3 区域级

适用于：Monitor 某一指标失败、推荐列表失败、历史记录失败。

要求：

- 只替换失败区域。
- 页面导航、其他区域和未提交表单保持可用。
- Retry 只刷新该区域。

### 5.4 页面级

适用于：页面主资源无法加载、资源不存在、Session 不能恢复。

要求：

- 保留应用导航或安全返回入口。
- 不展示旧数据冒充当前数据。
- 提供 `Try again`、`Go back` 或 `Sign in`。
- 显示支持排障的 `request_id`，但不显示内部堆栈。

### 5.5 阻断对话框

适用于：revision 冲突、Restore、Publish、Activate、Install 冲突。

要求：

- 解释当前状态是否已经改变。
- 默认按钮不得继续执行危险动作。
- 冲突解决后必须重新获取最新资源。
- 不允许只用短暂 Toast 表示可能造成数据覆盖的问题。

### 5.6 Toast 的使用边界

Toast 只适用于：

- 非关键后台操作成功。
- 当前页面仍保留完整上下文的轻量失败。
- 用户无需在错误信息上继续操作。

以下情况不得只显示 Toast：表单错误、权限不足、上传失败、Run 失败、revision 冲突、发布/安装/恢复失败。

## 6. Loading 规范

### 6.1 首次页面 Loading

- 使用与最终布局相同尺寸的骨架屏，避免页面跳动。
- 顶部导航和可返回入口优先显示。
- 不显示伪造的评分、Token、健康度或版本号。
- 超过正常等待阈值后显示状态文案，但不要过早显示错误。
- 页面骨架不得阻塞已经可用的侧边导航。

### 6.2 局部 Loading

| 场景 | 展示 | 禁用范围 |
|---|---|---|
| 刷新 Status 卡片 | 卡片骨架/Spinner | 只禁用该卡片刷新 |
| 搜索历史 | 结果区域 Loading | 搜索框仍可修改 |
| 上传 Source | 行内进度 | 当前文件行；其他文件可继续 |
| 保存 Draft | 按钮 Loading + Saving | 同一 Draft 的冲突写入按钮 |
| 生成导出 | ExportJob 进度 | 当前格式的重复提交 |
| 安装/激活 | 按钮 Loading | 当前 State 的相关动作 |

### 6.3 按钮提交状态

```text
Idle -> Submitting -> Success 或 Error -> Idle
```

- 按钮尺寸不得因 Loading 文案变化。
- 创建、运行、发布、安装等按钮在请求进行中防止重复点击。
- 前端禁用不能替代后端 `Idempotency-Key`。
- 请求失败后恢复按钮可点击状态。
- 未收到成功响应不得自动跳转。

### 6.4 异步 Processing

TaskRun、TestRun 和 ValidationRun 使用阶段进度，不使用无限 Spinner 作为唯一反馈。ImportJob 和 ExportJob 至少显示当前 `domain_status`。详细事件遵循 `07-realtime-and-async-events.md`。

## 7. Empty 状态规范

### 7.1 First use

结构：

```text
简短标题
一句解释当前为什么为空
一个主要动作
可选的次要动作
```

示例：

| 场景 | 建议英文文案 | 主要动作 |
|---|---|---|
| 没有 Current State | `No State is active yet.` | `Create a State` |
| 没有 Conversation | `Start a conversation with this State.` | 聚焦输入框 |
| 没有 Task Source | `Add sources when your task needs more context.` | `Add source` |
| 没有 Skill | `Create your first reusable Skill.` | `Create Skill` |
| 没有 State Draft | `Start a State or continue from a template.` | `Create State` |
| 没有测试记录 | `No tests have been run yet.` | `Run a test` |
| 没有 Ledger 事件 | `No version activity yet.` | 视权限显示创建/返回入口 |

### 7.2 No results

- 保留搜索词、分类和筛选条件。
- 显示 `No results match your filters.`。
- 提供 `Clear filters` 或修改搜索词。
- 不显示创建新对象按钮，除非创建确实是用户目标。
- 搜索请求失败必须显示 Error，不能显示 No results。

### 7.3 Optional empty

以下为空时通常不需要大面积 Empty 插画：

- Context Tags。
- Key Takeaways。
- Review Items 为 0。
- State Learnings 尚未产生。
- Monitor 选定时间段无日志。

使用简短文字或直接隐藏空区域，保持页面主要任务突出。

## 8. 输入保留与清除规则

| 数据 | 请求失败后 | 页面刷新后 | 安全要求 |
|---|---|---|---|
| 登录邮箱 | 保留 | 可选保留 | 不视为秘密，但避免共享设备长期保存 |
| 密码 | 清空 | 清空 | 不进入日志、本地存储或错误详情 |
| 注册普通字段 | 保留 | 可保存未完成引导 | agreement 状态按后端确认 |
| 未发送对话文字 | 保留 | 本地短期恢复 | 不跨账号恢复 |
| 已发送 Message | 以后端 Message 为准 | 从服务端恢复 | `client_message_id` 防重复 |
| Task/State/Skill Draft 输入 | 保留 | 从后端 Draft + 本地未提交差异恢复 | revision 冲突时不自动覆盖 |
| 本地头像/文件预览 | 保留到用户移除或离开流程 | 默认不长期恢复 | Blob URL 不上传日志 |
| Source 上传成功部分 | 保留 | 从后端恢复 | 单个失败不回滚其他文件 |
| 高级设置/筛选 | 保留 | 可按用户偏好恢复 | 不保存秘密字段 |

## 9. 连接、离线与 Autosave

### 9.1 连接状态

| 状态 | 页面文案 | 页面行为 |
|---|---|---|
| `live` | `Live` | 正常接收事件 |
| `reconnecting` | `Reconnecting...` | 保留当前内容，暂停依赖新数据的动作 |
| `offline` | `You're offline.` | 允许本地编辑，禁止需要后端确认的提交 |
| `stale` | `Last updated {time}` | 显示最后更新时间，不把旧数据标记为 Live |
| `restored` | `Back online` | 补拉事件和最新状态后短暂提示 |

### 9.2 Autosave

- 只有收到后端成功响应或 `runtime.autosave_succeeded` 才显示 `Autosaved`。
- 保存中显示 `Saving...`。
- 失败显示 `Couldn't save changes.` 和 `Try again`。
- Autosave 失败不得丢弃本地输入。
- revision 冲突显示阻断对话框，不循环自动重试。

### 9.3 异步任务断线

SSE 断线不改变 TaskRun/TestRun 等后端状态：

```text
Running + disconnected
  -> Reconnecting
  -> GET 当前状态
  -> 补拉 sequence
  -> 继续 Running 或显示真实终态
```

前端不得因为连接超时自行显示 `Task failed`。

## 10. API 错误码与 UI 映射

| error.code | HTTP | 展示层级 | 默认英文文案 | 主要恢复动作 | 输入保留 |
|---|---:|---|---|---|---:|
| `AUTH_INVALID_CREDENTIALS` | 401 | 表单级 | `Email or password is incorrect.` | 重新输入密码 | 邮箱保留，密码清空 |
| `AUTH_SESSION_EXPIRED` | 401 | 页面/对话框 | `Your session has expired.` | `Sign in` | 非秘密草稿本地保留 |
| `RESOURCE_FORBIDDEN` | 403 | 页面或控件级 | `You don't have access to this.` | `Go back`/请求权限 | 是 |
| `RESOURCE_NOT_FOUND` | 404 | 页面级 | `This item is no longer available.` | `Go back` | 是 |
| `REVISION_CONFLICT` | 412 | 阻断对话框 | `This draft changed in another session.` | `Review latest`、`Reload` | 本地差异保留 |
| `IDEMPOTENCY_CONFLICT` | 409 | 阻断/支持 | `This action could not be safely repeated.` | 刷新状态、联系支持 | 是 |
| `VALIDATION_FAILED` | 422 | 字段/区域级 | `Check the highlighted fields.` | 修正字段 | 是 |
| `INSUFFICIENT_QUOTA` | 422/429 | 区域级 | `Not enough capacity to run this.` | 调整模式/管理额度 | 是 |
| `SOURCE_PARSE_FAILED` | 422 | Source 行级 | `We couldn't read this source.` | `Retry`、`Replace`、`Remove` | 其他 Source 保留 |
| `SOURCE_UNSAFE` | 422 | Source 行级阻断 | `This source didn't pass the safety check.` | `View details`、`Remove` | 其他 Source 保留 |
| `UPLOAD_TOO_LARGE` | 413 | 文件行级 | `This file is larger than the allowed limit.` | `Replace`、`Remove` | 其他文件和输入保留 |
| `UPLOAD_UNSUPPORTED_TYPE` | 415 | 文件行级 | `This file type isn't supported here.` | `Replace`、`Remove` | 其他文件和输入保留 |
| `UPLOAD_EXPIRED` | 410 | 文件行级 | `The upload session expired.` | `Upload again` | 本地文件仍可用时保留 |
| `UPLOAD_INCOMPLETE` | 409 | 文件行级 | `The upload didn't finish.` | `Resume`、`Upload again` | 其他文件保留 |
| `UPLOAD_CHECKSUM_MISMATCH` | 422 | 文件行级 | `The uploaded file couldn't be verified.` | `Upload again` | 其他文件保留 |
| `MALWARE_DETECTED` | 422 | 文件行级阻断 | `This file was blocked for safety.` | `Remove`、`View details` | 其他文件保留 |
| `URL_FETCH_BLOCKED` | 422 | Source 行级阻断 | `This link can't be accessed safely.` | `Replace link`、`Remove` | 其他 Source 保留 |
| `PREVIEW_UNAVAILABLE` | 422 | Preview 区域 | `A preview isn't available for this file.` | 按权限 `Download` | 页面结果保留 |
| `DOWNLOAD_URL_EXPIRED` | 410 | 下载区域 | `This download link has expired.` | `Generate new link` | Artifact 保留 |
| `SHARE_LINK_EXPIRED` | 410 | 分享访问页 | `This shared link has expired.` | `Go back` | 不显示资源内容 |
| `SHARE_LINK_REVOKED` | 410/404 | 分享访问页 | `This shared link is no longer available.` | `Go back` | 不显示资源内容 |
| `RUN_FAILED` | 422/500 | 异步终态 | `The run stopped before it finished.` | `Retry`、`View details` | 输入快照保留 |
| `RUN_NOT_RETRYABLE` | 409 | 异步终态 | `This run can't be resumed.` | `Create a new run` | 输入快照可复用 |
| `VERSION_CONFLICT` | 409 | 阻断对话框 | `The selected version has changed.` | 刷新版本 | 是 |
| `ALREADY_INSTALLED` | 409 | 成功式信息 | `This State is already installed.` | `Open in Lab` | 不适用 |
| `STATE_NOT_ACTIVATABLE` | 422 | 区域级阻断 | `This State can't be activated yet.` | `View requirements` | 不适用 |
| `EXPORT_FORMAT_UNAVAILABLE` | 422 | 导出区域 | `That format is no longer available.` | 刷新格式并重选 | 其他选择保留 |
| `EXPORT_FAILED` | 422/500 | 导出区域 | `We couldn't create this export.` | `Try again` | 是 |
| `RATE_LIMITED` | 429 | 区域/Banner | `Too many requests. Try again shortly.` | 按 `Retry-After` 恢复 | 是 |
| `EVENT_CURSOR_EXPIRED` | 409 | 非阻断恢复 | `Refreshing the latest status...` | 自动 GET 完整状态 | 不适用 |
| `DEPENDENCY_UNAVAILABLE` | 503 | 区域或页面级 | `A required service is temporarily unavailable.` | `Try again` | 是 |

后端新增错误码时，必须先补充本表或提供通用 fallback。未知错误码使用 `Something went wrong.`，同时显示 `request_id` 和安全的 Retry。

## 11. 异步任务失败规范

### 11.1 Running 页面

| 状态 | 页面展示 | 可用动作 |
|---|---|---|
| `queued` | 队列状态和可选预计开始时间 | Back；有产品入口时 Cancel |
| `running` | 当前阶段、进度和安全日志 | Back；有入口时 Cancel |
| `reconnecting` | 保留最后进度 + Reconnecting | 无需 Retry Run |
| `failed` | 失败阶段、错误摘要、已生成 Artifact | Retry 或 Create new |
| `cancelled` | 已取消、保留的结果说明 | Create new |
| `timed_out` | 超时原因和是否可重试 | Retry 或调整模式 |
| `succeeded` | 读取最终结果 | View result |

### 11.2 Retry 规则

- Retry 调用后端 Retry API 并创建新的 Run ID。
- 原 Run 日志、错误和 Artifact 保留。
- 前端切换到新 Run 的事件流。
- 网络重连不显示 Retry，也不创建新 Run。
- `retryable=false` 时隐藏 Retry，提供 Create new 或 Back。

### 11.3 部分结果

Run 失败但已有 Artifact 时：

- 明确标记 `Partial result`。
- 允许 Preview/Download 仅在后端权限允许时出现。
- 不把部分结果计为完整成功。
- 不触发 State Publish、Activate 或 Workspace 自动保存。

## 12. Source、上传与导出失败

### 12.1 Source 行状态

```text
local -> uploading -> parsing -> ready
                  -> upload_failed
                             parsing -> parse_failed
                             parsing -> unsafe
```

| 状态 | 展示 | 动作 |
|---|---|---|
| `uploading` | 文件名、进度、Cancel | Cancel |
| `parsing` | `Reading source...` | 可移除，不允许运行依赖它的任务 |
| `ready` | 类型、大小、摘要 | Remove |
| `upload_failed` | `Upload failed` | Retry、Replace、Remove |
| `parse_failed` | `Couldn't read this source` | Retry parse、Replace、Remove |
| `unsafe` | 安全原因摘要 | View details、Remove |

一个 Source 失败不得删除已经成功的 Source，也不得清空 Task/State/Test 的目标文字。

### 12.2 导出

- 格式列表为空且 API 请求成功：显示 `No export formats are currently available.`。
- 格式列表请求失败：显示区域级 Error + Retry。
- ExportJob 失败：保留格式和选项，提供 Try again。
- 下载 URL 过期：显示 `This download link has expired.`，提供 Generate new link。
- 分享链接创建失败：不复制空 URL，不显示分享成功。

## 13. 账号与引导逐页规范

| 页面 | Initial Loading | Empty/正常无数据 | 主要失败 | 恢复动作 | 保留内容 |
|---|---|---|---|---|---|
| `SCR-050` Welcome | 检查 Session 时显示品牌级轻量 Loading | 不适用 | 网络不可用或 Session 校验失败 | Try again；无有效 Session 可进入 Login | 无 |
| `SCR-051` Login | 提交按钮 Loading | 不适用 | 凭证错误、Rate limit、服务不可用 | 重输密码、等待、Try again | 邮箱保留，密码清空 |
| `SCR-052` Sign up | 提交按钮 Loading | 不适用 | 邮箱已存在、字段校验、创建失败 | Sign in 或修正字段 | 普通字段保留，密码按安全策略清空 |
| `SCR-053` Profile | Profile 骨架；头像行内进度 | 未选择头像是允许状态 | 头像上传失败、Profile revision 冲突 | Retry/Replace、Review latest | 本地预览和普通字段保留 |
| `SCR-054` App entry | HomeSummary 骨架 | 无 State 时展示 Create State/State Market | 初始化首页失败 | Try again | Profile 已保存内容不回滚 |

## 14. Home 与对话逐页规范

| 页面 | Empty/Loading | 主要失败 | 恢复动作 | 继承/备注 |
|---|---|---|---|---|
| `SCR-001` Home | 页面骨架；无 Current State 显示创建/市场入口；无通知显示 `No notifications` | Home 聚合失败；单个 Monitor 卡片失败；连接 stale | 整页 Try again 或卡片 Retry | 主 Home；局部失败不遮住导航 |
| `SCR-002` Status entry | Status 卡片骨架；无快照显示 `No status data yet` | health summary 获取失败 | 卡片 Retry | 继承 `SCR-001` 外壳 |
| `SCR-003` Monitor detail | 指标卡片骨架；选定时段无日志是正常 Empty | 聚合查询失败、单卡失败、SSE 断线 | 区域 Retry、Reconnecting、Back | 不把断线显示为 State offline，除非状态 API确认 |
| `SCR-004` Current State entry | 卡片骨架；无 Current State 显示创建/激活入口 | Current State 查询失败 | 卡片 Retry | 继承 `SCR-001` 外壳 |
| `SCR-005` Current State detail | 页面骨架；无 Learnings 显示简短可选 Empty | State 不存在、Passport/Skill/Learning 区域失败 | Back、区域 Retry | Edit/Test/Ledger 各自失败不影响详情读取 |
| `SCR-006` Mannequin chat entry | 最近会话 Loading；无会话时允许 Start conversation | 最近会话摘要失败 | Retry 或直接创建新会话 | 交互入口状态 |
| `SCR-007` Conversation | 历史骨架；无消息时聚焦输入框 | 发送失败、语音转写失败、Session 过期 | Retry send/Transcribe、Sign in | 未发送文字和录音保留 |
| `SCR-008` Reply streaming | 保留已有 Message + 流式光标 | reply.failed、断线、游标过期 | Reconnect 或 Retry response | 部分回复保留，不重复拼接 delta |
| `SCR-009` History | 列表骨架；无历史或无搜索结果 | 搜索/分页失败 | Retry，保留 query/filter | No results 与 API error 分开 |
| `SCR-010` Export hover | 格式列表 Loading；无可用格式显示说明 | ShareLink/ExportJob 失败、链接过期 | Retry、刷新格式、Generate new link | Hover 消失不能取消后台 ExportJob |

## 15. Workspace 与 Task 逐页规范

| 页面 | Empty/Loading | 主要失败 | 恢复动作 | 保留内容 |
|---|---|---|---|---|
| `SCR-011` Task editor | Draft 骨架；Sources/Context 为空是允许状态 | 字段校验、Source 失败、revision 冲突、额度不足、Run 创建失败 | 修正字段、Retry Source、Review latest、Try again | Goal、Sources 成功项、Context、设置 |
| `SCR-012` Task running | 阶段时间线；queued 显示排队；无日志是允许状态 | Run failed/timed out、SSE 断线 | Retry/Create new 或 Reconnecting | 输入快照、日志、部分 Artifact |
| `SCR-013` Task result base | Result 骨架；可选区域无内容时隐藏 | 结果聚合失败、单个 Artifact 不可用 | Retry result/Artifact | 继承同一 TaskRun 结果 |
| `SCR-014` Task result full | 同 `SCR-013`；按钮按权限/结果可用性显示 | Refine/Adjust/Download 单项失败 | 对应按钮 Retry，不清空结果 | 正式完整按钮态；不创建另一套 Result |

## 16. State Lab 逐页规范

| 页面 | Empty/Loading | 主要失败 | 恢复动作 | 继承/保留 |
|---|---|---|---|---|
| `SCR-015` Adjust State | Draft/推荐骨架；无推荐显示 `No additional Skills recommended` | Skill 不兼容、无权限、revision 冲突、Save & Re-test 失败 | View reason、Review latest、Try again | 保存失败不跳转，全部本地修改保留 |
| `SCR-016` Lab home | 分区骨架；分别处理无 Draft、无 Recent State、无 Template | Lab 聚合失败或单区失败 | 整页/区域 Retry | 正式 Lab 主入口 |
| `SCR-017` Lab formal page 2 | 使用正式页面布局骨架 | 主资源、推荐或配置失败 | 依据失败区域 Retry | 继承 `SCR-016` 的首页状态和 `SCR-019` 的编辑状态 |
| `SCR-018` Lab page 2 hover | 不新增 Loading/Empty | Hover 动作调用失败时回到原按钮态 | 行内错误或 Toast + Retry | 继承 `SCR-017` |
| `SCR-019` Create State recommendations | 目标分析阶段进度；无匹配 Skill 时允许继续/调整目标 | Analyze 失败、推荐加载失败、挂载冲突、TestRun 创建失败 | Retry analysis、修改目标、View conflict | State 目标和已选 Skill 保留 |
| `SCR-020` External Skill import | 初始未选 Source 是正常状态；显示 ImportJob 检查进度 | 仓库不可访问、Source 不安全、依赖检查失败 | Reauthorize、Replace、View details | State 目标保留；needs_review 不是技术错误 |

## 17. State Test 逐页规范

| 页面 | Empty/Loading | 主要失败 | 恢复动作 | 继承/保留 |
|---|---|---|---|---|
| `SCR-021` Test setup | 设置骨架；无 Recent Tests、无可选 Source 是正常 | 字段校验、Source 失败、额度不足、Run 创建失败 | 修正、Retry Source、调整模式、Try again | Task、Context、Mode、Settings 保留 |
| `SCR-022` Test setup hover | 不新增数据状态 | Hover 控件动作失败后恢复原态 | 行内提示 | 继承 `SCR-021` |
| `SCR-023` Test running | 固定阶段时间线；queued/reconnecting 明确区分 | failed、timed_out、cancelled、事件断线 | Retry/Create new 或 Reconnecting | 原 TestRun 进度、日志和快照保留 |
| `SCR-024` Test result | Result 骨架；无 Key Takeaways 时隐藏该区 | Result/Artifact/Export 失败、Adjust State 创建失败 | 区域 Retry、Run again、Back | 测试成功不自动 Publish/Activate |

## 18. Skills 生命周期逐页规范

| 页面 | Empty/Loading | 主要失败 | 恢复动作 | 继承/保留 |
|---|---|---|---|---|
| `SCR-025` Skills list | 列表骨架；无 Skill 显示 Create Skill；筛选无结果显示 Clear filters | 列表/模板加载失败 | 区域 Retry | 搜索和筛选保留 |
| `SCR-026` Blank Skill 1 | Draft Loading；字段尚未填写是编辑状态 | Identity 字段校验、保存失败、revision 冲突 | 修正、Try again、Review latest | 已填写 Identity 保留 |
| `SCR-027` Blank Skill 2 | Capabilities 空时显示 Add capability | 必需 Capability 缺失、保存失败 | 添加/修正、Retry | 已添加能力保留 |
| `SCR-028` Blank Skill 3 | Logic/Behavior 未完成是编辑状态 | Schema/Logic 校验失败 | 定位字段、Retry save | 代码/逻辑保留 |
| `SCR-029` Blank Skill 4 | 可选 Guardrails 为空时显示默认说明 | Permission、Output Contract 校验失败 | 修正配置 | 配置保留 |
| `SCR-030` Blank Skill 5 | Summary Loading；可选 Notes 为空允许 | 前置步骤不完整、最终保存失败 | 跳到缺失步骤、Try again | 全部 Draft 保留 |
| `SCR-031` Developer mode | 文件树/预览骨架；新 Draft 可显示模板文件 | 文件加载/保存/预览失败、ValidationRun 创建失败 | Retry file/preview/validation | 编辑缓冲区保留，checksum 冲突需比较 |
| `SCR-032` Import/Refactor 1 | 未填写仓库是初始状态；检查进度逐项显示 | 仓库授权、结构、权限、依赖或安全检查失败 | Reauthorize、Replace、Review details | URL、branch 和已完成 checks 保留 |
| `SCR-033` Configure/Refactor 2 | Draft 和 Summary 骨架 | Base 不可用、字段校验、revision 冲突 | Reload base、修正、Review latest | 用户配置保留 |
| `SCR-034` Validate/Refactor 3 | 无 TestSet 显示 Add Test Set；0 Review 是成功状态 | ValidationRun 失败；存在 Fail 阻止 Publish | Rerun、View details、修复 Draft | 测试结果和 Review Item 保留 |
| `SCR-035` Publish/Refactor 5 | 无可挂载 StateDraft 显示 Open Lab/Create State | publish check、目标版本冲突、Publish 原子操作失败 | View requirements、刷新目标、Try again | Publish settings 保留 |
| `SCR-036` Skill export | 格式列表 Loading；无格式显示说明 | 版本生成、ExportJob、ShareLink、下载失败 | Retry、刷新格式、Generate new link | Version notes 和选择保留 |
| `SCR-037` Import validation | 检查项骨架；无问题表示 Passed | 单项检查失败或详情加载失败 | Review details、Retry check | 继承 `SCR-032` 的 ImportJob 状态 |
| `SCR-038` Import validation 2 | 使用检查结果状态 | 探索页动作失败 | 与正式 Import 流程一致 | 继承 `SCR-032`/`SCR-037`；定稿前不得新增独有错误码 |
| `SCR-039` Skills test | Test/Metric 骨架；无 Review Item 表示通过 | ValidationRun/TestSet/Result 失败 | Rerun、View details | 继承 `SCR-034` |

## 19. State Market、Passport、Ledger 与 Monitor 逐页规范

| 页面 | Empty/Loading | 主要失败 | 恢复动作 | 继承/保留 |
|---|---|---|---|---|
| `SCR-040` State Gallery | 推荐卡片骨架；无推荐/匹配结果显示调整需求或筛选 | Market/Match 失败 | Retry、修改需求、Clear filters | 输入的 need 和 filters 保留 |
| `SCR-041` State Passport | Passport 和 proof 骨架 | 版本下架、无权限、安装失败、already installed | Back、View available version、Open in Lab、Retry | `ALREADY_INSTALLED` 不是红色错误 |
| `SCR-042` State Ledger | 时间线骨架；无版本事件显示静默 Empty | Compare/Branch/Restore 失败、version conflict | Retry compare、刷新 Ledger、重新确认 Restore | 原 Current State 和历史版本保持不变 |
| `SCR-043` State Status | 指标分区骨架；时间段无日志是正常 | 区域查询失败、SSE 断线、日志权限不足 | 区域 Retry、Reconnect、返回摘要 | 与 `SCR-003` 使用同一 Monitor 规则 |
| `SCR-044` State Status 2 | 使用 `SCR-043` 的状态布局 | 探索页数据失败 | 与正式 Monitor 一致 | 继承 `SCR-043`；定稿前不得新增独有 API 状态 |

## 20. 高风险动作失败

| 动作 | 提交前 | 失败后必须保持 | 成功后 |
|---|---|---|---|
| Publish Skill | 显示版本、目标 State 和系统校验 | SkillDraft 仍可编辑；不得出现半发布半挂载 | 返回不可变 SkillVersion 和 mount |
| Install State | 显示版本、权限和 License | Current State 不变 | Installation 为 `installed_inactive` |
| Activate State | 显示将替换的 Current State | 原 Current State 仍 active | 原子切换 Current State |
| Restore State | 二次确认来源版本 | 不删除/覆盖任何历史版本，Current State 不变 | 创建新 StateDraft 和 LedgerEvent；进入 Lab 后由用户决定是否启用 |
| Save & Re-test | 显示 Draft 保存和测试将同时发生 | 本地修改保留；不进入虚假 TestRun | 返回 revision 和 test_run_id |

这些动作若响应超时，前端先按幂等键查询最终状态，不应立刻使用新幂等键重复提交。

## 21. 默认英文文案词典

| key | 默认文案 | 使用场景 |
|---|---|---|
| `error.generic` | `Something went wrong.` | 未知错误 fallback |
| `error.try_again` | `Try again` | 可重试错误 |
| `error.go_back` | `Go back` | 当前资源不可用 |
| `error.view_details` | `View details` | 有安全详情可查看 |
| `loading.saving` | `Saving...` | Draft/Profile 保存中 |
| `loading.processing` | `Working on it...` | 无明确阶段的短时任务 |
| `connection.reconnecting` | `Reconnecting...` | 实时连接中断 |
| `connection.offline` | `You're offline.` | 浏览器离线 |
| `empty.no_results` | `No results match your filters.` | 搜索/筛选为空 |
| `empty.no_activity` | `No activity yet.` | 可选活动区为空 |
| `success.autosaved` | `Autosaved` | 服务端确认自动保存成功 |

文案可以在最终内容设计阶段调整，但含义和恢复动作不得改变。按钮使用动词，不使用 `OK` 代替明确动作。

## 22. 可访问性要求

- 错误不能只靠红色表示，必须有文字和/或图标。
- 字段错误通过 `aria-describedby` 与输入关联。
- 提交失败后将焦点移动到错误摘要或第一个错误字段。
- 动态错误、保存状态和异步终态使用合适的 `aria-live`，避免每个进度事件都重复朗读。
- Loading 骨架应标记 busy，但装饰性骨架不进入可访问性树。
- Retry、Replace、Remove 等按钮必须有清晰可访问名称。
- 对话框打开后正确管理焦点，关闭后返回触发按钮。

## 23. 埋点与排障信息

前端可记录以下非敏感字段：

| 字段 | 说明 |
|---|---|
| `screen_id` | 例如 `SCR-015` |
| `interaction_id` | 例如 `INT-061` |
| `error_code` | 稳定 API 错误码 |
| `request_id` | 服务端请求追踪 ID |
| `operation_type` | TaskRun/TestRun 等 |
| `operation_id` | 经权限保护的内部 ID |
| `failed_stage` | 异步失败阶段 |
| `retry_count` | 当前用户动作的重试次数 |
| `connection_state` | live/reconnecting/offline |

不得记录密码、access token、完整对话、Source 内容、私有下载 URL、API key 或内部 prompt。

## 24. 验收测试清单

### 24.1 通用状态

| 测试 | 预期结果 |
|---|---|
| 首次加载慢 | 有稳定骨架，导航不跳动 |
| 单张卡片失败 | 其他区域仍可用 |
| 搜索成功但无结果 | 显示 No results，不显示错误 |
| 搜索 API 失败 | 显示 Retry，不显示 No results |
| 表单 422 | 对应字段显示错误，输入保留 |
| revision 过期 | 阻止覆盖，提供 Review latest |
| Session 过期 | 秘密清除，非秘密草稿可恢复 |
| 未知错误码 | 使用通用 fallback 和 request_id |

### 24.2 文件与异步任务

| 测试 | 预期结果 |
|---|---|
| 3 个 Source 中 1 个失败 | 另外 2 个保留且可继续管理 |
| ExportJob 失败 | 格式和选项保留，可重试 |
| SSE 断线 | 显示 Reconnecting，不把 Run 标为 Failed |
| Run failed 且有 Artifact | 标记 Partial result，不标记完成 |
| Retry Run | 创建新 ID，原日志和错误保留 |
| TestRun succeeded | 不自动 Publish/Activate |

### 24.3 高风险动作

| 测试 | 预期结果 |
|---|---|
| Publish 中途失败 | 无半完成 SkillVersion/mount |
| Install 重复提交 | 显示已安装并可 Open in Lab |
| Activate 冲突 | 原 Current State 不变 |
| Restore 冲突 | 历史版本不变，刷新 Ledger 后重试 |
| Save & Re-test 超时重试 | 返回同一个 TestRun，不重复创建 |

## 25. 后端验收要求

后端需要保证：

1. 错误响应符合 `06-api-requirements.md` 的统一 envelope。
2. 业务错误返回稳定 `error.code`，不要求前端解析 message。
3. 字段错误返回结构化 `field_errors`。
4. 可重试错误明确返回 `retryable` 和可选 `Retry-After`。
5. 写入失败不会留下前端无法解释的半完成状态。
6. revision 冲突返回当前 revision，不静默覆盖。
7. Run 失败返回 `failed_stage`、原 Operation ID 和是否可重试。
8. 权限和不存在状态不可通过页面 Empty 混淆。
9. request ID 在响应、日志和 AuditLog 中可关联。
10. 错误详情经过权限检查和脱敏。

## 26. 仍需产品确认的问题

这些问题不阻塞当前规范，但在前端开发定稿前需要确认：

1. Session 过期后，未发送对话文字和 Draft 本地缓存保留多长时间。
2. 用户是否能申请 State/Skill 访问权限，还是只能返回上一级。
3. Insufficient quota 页面的商业入口和具体文案。
4. TaskRun/TestRun 是否在首版提供 Cancel 按钮。
5. Partial Artifact 是否允许下载和保存到 Workspace。
6. `SCR-038`、`SCR-044` 探索页是否转为正式交付页面。
7. 普通用户可见的 Monitor 日志级别。
8. Restore 和 Activate 二次确认是否需要重新输入 State 名称。
9. Empty 状态是否使用统一插图；不影响本文的数据和动作定义。

## 27. 下一份交付物

下一步建议制作 `09-permissions-and-roles.md`：把 User、State Owner/Editor/Viewer、Skill Creator/Publisher 在每个 API、页面和按钮上的读取、编辑、发布、安装、激活、恢复权限写成统一矩阵。
