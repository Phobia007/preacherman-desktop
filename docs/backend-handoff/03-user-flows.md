# 应用界面用户流程初稿

- Figma 文件：[应用界面 Copy](https://www.figma.com/design/lWtoH8PCoOoPP3ttwMUBP6/应用界面--Copy-)
- 编写日期：2026-07-14
- 依据：[02-screen-index.md](./02-screen-index.md)
- 当前版本：`Draft v0.2`，已纳入 2026-07-14 产品确认，仍不作为最终接口文档

## 1. 文档用途

本文件说明用户如何在不同页面之间完成一项业务。它负责回答：

1. 用户从哪里进入流程。
2. 用户执行了什么操作。
3. 页面跳转到哪里。
4. 系统需要保存或读取什么业务信息。
5. 失败后用户如何继续。

本文件暂时不规定具体 API 地址、数据库结构或视觉样式。视觉以 Figma 为准；具体接口将在后续交互矩阵和 API 契约中确定。

## 2. 阅读约定

- `SCR-xxx`：对应页面总清单中的页面编号。
- `前端动作`：展开、Hover、Tab、动画、页面跳转等本地行为。
- `系统动作`：需要后端保存、查询、运行或实时推送的数据行为。
- `待确认`：设计稿无法证明的产品规则，需要产品负责人修改或确认。

## 3. 流程总览

| 流程编号 | 流程名称 | 开始页面 | 结束页面 | 核心后端能力 |
|---|---|---|---|---|
| FLOW-01 | 首次注册与登录 | SCR-050 欢迎页 | SCR-054 APP 首页 | 注册、登录、Session、用户资料 |
| FLOW-02 | 查看当前 State 与运行状态 | SCR-001 主 Monitor/Home | SCR-003/SCR-005 详情页 | State 摘要、版本、健康度、用量 |
| FLOW-03 | 与 State 对话及查看记录 | SCR-001 Home | SCR-009 对话记录 | 会话、消息、流式回复、导出 |
| FLOW-04 | 对话转任务并执行 | SCR-007 对话 | SCR-013 任务完成 | Task、TaskRun、进度、Artifacts |
| FLOW-05 | 调整 State 并重新测试 | SCR-013 任务完成 | SCR-024 测试完成 | State Draft、Skill 变更、TestRun |
| FLOW-06 | 创建新的 State | SCR-016 State Lab | 新 State Draft/测试页 | State 创建、Skill 推荐、外部导入 |
| FLOW-07 | 创建、验证并发布 Skill | SCR-025 Skills | SCR-035 Publish Skill | Skill、版本、验证、发布、挂载 |
| FLOW-08 | 运行 State Test | SCR-021 Test 设置 | SCR-024 Test 完成 | TestRun、实时阶段、评分、结果 |
| FLOW-09 | 浏览并安装 State | SCR-040 State Gallery | SCR-041 Passport/安装完成 | 搜索、匹配、Passport、安装 |
| FLOW-10 | 查看 Ledger 与 Monitor | SCR-001 Home | SCR-042/SCR-043 | 版本历史、恢复、分支、实时监控 |

---

## FLOW-01 首次注册与登录

**目标**：新用户创建账号并完成资料设置；已有用户直接登录。

**参与者**：访客、新用户、已有用户。

**前置条件**：用户尚未进入已登录 Session。

**主路径**：

| 步骤 | 用户动作 | 对应页面 | 系统动作 | 下一状态 |
|---:|---|---|---|---|
| 1 | 打开应用 | SCR-050 `Page 1 欢迎页` | 检查本地 Session 是否仍有效 | 已登录则进入 SCR-054；未登录继续步骤 2 |
| 2A | 选择登录 | SCR-051 `page 2 登录页` | 显示登录表单 | 等待输入账号信息 |
| 3A | 输入账号和密码并提交 | SCR-051 | 验证账号；创建 Session；返回用户信息 | 登录成功进入 SCR-054 |
| 2B | 选择创建账号 | SCR-052 `Page 3 账号创建页` | 显示注册表单 | 等待填写注册信息 |
| 3B | 填写信息并点击 `Create account/Continue` | SCR-052 | 检查账号冲突；创建 User；建立 Session | 进入 SCR-053 |
| 4 | 完善头像、姓名和偏好 | SCR-053 `Page 4 完善个人信息页` | 保存用户 Profile 和偏好 | 进入 SCR-054 |
| 5 | 完成引导 | SCR-054 `Page 5 APP首页` | 初始化首页摘要、默认配置或推荐内容 | 用户进入正式产品 |

**异常与恢复**：

- 登录失败：保留已输入账号，显示错误，不清空密码以外的字段。
- 账号已存在：引导用户返回登录。
- 注册请求重复提交：后端必须避免生成重复账号。
- Session 过期：清除本地 Session，返回 SCR-051。
- 资料保存失败：停留在 SCR-053，允许重试。

**待确认**：

- 是否支持邮箱验证码、手机号、Google/Apple 登录。
- 是否存在“忘记密码”流程；当前页面清单中没有对应设计。
- SCR-054 是否为一次性 Onboarding 结束页，还是正式 Home 的旧版本。

---

## FLOW-02 查看当前 State 与运行状态

**目标**：用户进入 APP 后，从主 Monitor/Home 快速查看当前 State、健康状态和详细运行指标。

**参与者**：已登录用户。

**前置条件**：用户至少拥有或安装了一个可用 State。

**主路径 A：查看 Status**

| 步骤 | 用户动作 | 对应页面 | 系统动作 | 下一状态 |
|---:|---|---|---|---|
| 1 | 进入 APP | SCR-001 `home` | 用户已有 State 时，获取当前 State 摘要、状态、未读通知和 Monitor 数据 | 显示主 Monitor/Home |
| 2 | 点击 Status | SCR-002 `home点击status` | 前端展开状态入口；查询最新健康度 | 显示状态概览 |
| 3 | 点击查看详情 | SCR-003 `state status 详情` | 获取 Token Balance、State Health、Active APIs、活动和日志 | 显示 Monitor 详情 |
| 4 | 返回 | SCR-003 | 前端返回 Home；停止不再需要的实时订阅 | 回到 SCR-001 |

**主路径 B：查看 Current State**

| 步骤 | 用户动作 | 对应页面 | 系统动作 | 下一状态 |
|---:|---|---|---|---|
| 1 | 点击 Current State | SCR-004 `home点击current state` | 获取当前 State 基本信息 | 显示 State 摘要 |
| 2 | 点击详情/Passport | SCR-005 `home点击current state详情` | 获取版本、Skills、权限、健康度和最近更新 | 显示 Current State 详情 |
| 3 | 点击相关操作 | SCR-005 | 根据操作进入 Adjust、Test、Ledger 或 Monitor | 进入对应流程 |

**异常与恢复**：

- 尚无 Current State：显示创建或安装 State 的入口，不能展示空白人模状态。
- 状态数据暂时不可用：显示“上次更新时间”和重试按钮。
- 实时连接断开：保留最近数据并显示 Offline/Reconnecting。

**已确认规则**：

- SCR-001 是用户拥有自己的 State 后，每次进入 APP 默认看到的主 Monitor/Home。
- SCR-003、SCR-043 等状态页面是从主 Monitor 进入的详细视图，不替代 SCR-001。

**已确认规则**：一个用户只能有一个 Current State。激活其他 Installation 时，后端必须原子替换原 Current State。

---

## FLOW-03 与 State 对话及查看记录

**目标**：用户与当前 State 自由对话，并查看或导出历史记录。

**参与者**：已登录且拥有 Current State 的用户。

**前置条件**：State 处于可对话状态。

**主路径**：

| 步骤 | 用户动作 | 对应页面 | 系统动作 | 下一状态 |
|---:|---|---|---|---|
| 1 | 点击 Home 中的人模或对话入口 | SCR-006 `home点击人模对话` | 前端打开对话区域；获取最近会话 | 显示对话入口状态 |
| 2 | 进入完整对话 | SCR-007 `home对话` | 创建新 Conversation 或恢复最近 Conversation | 显示消息历史和输入框 |
| 3 | 输入文字或语音并发送 | SCR-007 | 保存用户 Message；启动 State 回复 | 进入 SCR-008 |
| 4 | 等待 State 回复 | SCR-008 `home对话发送后` | 通过流式事件逐段推送回复；记录 Token 和时间 | 回复完成后回到可输入状态 |
| 5 | 点击查看完整记录 | SCR-009 `home对话 查看对话记录` | 分页获取会话和消息历史 | 显示历史记录 |
| 6 | 点击导出或分享 | SCR-010 `home对话hover导出对话记录` | 生成分享链接，或按用户选择生成受支持格式的文件 | 分享/下载成功或显示失败提示 |

**可选分支**：

- 点击 `Turn into Task`：进入 FLOW-04。
- 点击 `Summarize this`：生成当前会话摘要并追加为新消息。
- 点击 `Help me plan/Brainstorm ideas`：把对应快捷指令作为新消息发送。

**异常与恢复**：

- 消息发送失败：消息保留在界面并标记失败，允许 Retry。
- 流式回复中断：保留已生成部分，提供 Continue/Retry。
- 语音识别失败：保留录音状态并允许重新录制。
- 导出失败：不关闭历史页面，允许再次导出。

**导出规则**：

- 支持链接分享和多种常见文件格式。
- 前端不硬编码格式列表，由后端返回当前内容可用的导出格式和对应 MIME 类型。

**待确认**：

- 每次进入对话是否自动创建新 Conversation。
- 对话记录是永久保存、按 Session 保存，还是由用户主动保存。

---

## FLOW-04 对话转任务并执行

**目标**：将自由对话中的意图转成结构化任务并由 State 执行。

**参与者**：已登录用户、Current State。

**前置条件**：当前对话中已有可转化为任务的目标或上下文。

**主路径**：

| 步骤 | 用户动作 | 对应页面 | 系统动作 | 下一状态 |
|---:|---|---|---|---|
| 1 | 点击 `Turn into Task` | SCR-007/SCR-008 | 从当前 Conversation 提取 Goal、Context、Sources | 进入 SCR-011 |
| 2 | 检查并修改任务描述 | SCR-011 `工作区` | 加载 Task Draft；显示 Templates 和推荐操作 | Task Draft 可编辑 |
| 3 | 上传文件、粘贴文字、添加链接或 Context | SCR-011 | 上传并解析 Sources；保存 Context Tags | 更新 Task Draft |
| 4 | 点击 Quick Action | SCR-011 | 执行 Clarify/Expand/Check/Simulate，并更新草稿内容 | 用户继续检查草稿 |
| 5A | 点击 `Save Draft` | SCR-011 | 保存 Draft，不启动运行 | 留在当前页或返回任务列表 |
| 5B | 点击 `Run State/Start Task` | SCR-011 | 创建 TaskRun，锁定本次输入快照 | 进入 SCR-012 |
| 6 | 查看执行阶段 | SCR-012 `工作区 等待中` | 实时推送 queued/running/progress/log/artifact 事件 | 运行完成进入 SCR-013 |
| 7 | 查看结果 | SCR-013 `工作区 任务完成后` | 获取 Overview、Artifacts、评分和建议操作 | 显示完成结果基础态 |
| 8 | 选择完整操作 | SCR-014 `工作区 任务完成后 按钮全显示` | 根据选择调整 State、下载结果、再次运行或回到 Home | 进入相应流程 |

**异常与恢复**：

- Source 上传失败：其他已上传内容不得丢失，失败 Source 可单独重试。
- Task Draft 校验失败：标记缺失字段，不启动 TaskRun。
- 任务超时或失败：保留运行日志，提供 Retry/Resume。
- 页面刷新：通过 TaskRun ID 恢复当前进度，而不是重新创建任务。
- 重复点击 Start：后端需通过幂等机制避免重复 TaskRun。

**已确认规则**：

- SCR-013 是任务完成页的基础状态，SCR-014 是同一页面的完整按钮状态，后端动作应以 SCR-014 的按钮集合为准。
- SCR-055 是不采纳的草稿，不进入前后端交付范围。

**待确认**：

- `Save Draft` 后是留在当前页还是返回任务列表。
- TaskRun 是否允许暂停、取消和继续。

---

## FLOW-05 调整 State 并重新测试

**目标**：根据最近任务暴露的问题修改 State 的 Skills 或行为，并验证修改效果。

**参与者**：State Owner 或具有编辑权限的成员。

**前置条件**：存在可编辑的 State，并且用户有编辑权限。

**主路径**：

| 步骤 | 用户动作 | 对应页面 | 系统动作 | 下一状态 |
|---:|---|---|---|---|
| 1 | 在任务结果页点击 `Adjust State` | SCR-013/SCR-014 | 读取最近任务、差距分析和当前 Skills | 进入 SCR-015 |
| 2 | 查看 Current Skills 和推荐 Skills | SCR-015 `preacherman lab (adjust state)` | 获取 Mounted Skills 和任务推荐 | 等待用户选择 |
| 3 | 添加或移除 Skill | SCR-015 | 只更新本地 Draft；显示 Suggested Changes | Draft 变为未保存 |
| 4A | 点击 `Back to Lab` | SCR-015 | 如有未保存修改，提示保存或放弃 | 返回 SCR-016 |
| 4B | 点击 `Save & Re-test` | SCR-015 | 创建新的 State Draft/Version Candidate，保存 Skill 变更，并立即以最近任务快照创建 TestRun | 直接进入 SCR-023 |
| 5 | 查看测试运行进度 | SCR-023 | 持续推送测试阶段、日志和实时指标 | 完成后进入 SCR-024 |
| 6 | 查看测试完成结果 | SCR-024 | 获取评分、输出和改进建议；保持新版本为 Draft | 决定使用、再测或继续调整 |

**异常与恢复**：

- 保存失败：保留本地修改，不进入测试。
- 推荐 Skill 已下架或无权限：禁止添加并说明原因。
- 测试失败：State 当前正式版本不应被覆盖。
- 用户退出：提示存在未保存变更。

**已确认规则**：

- `Save & Re-test` 保存后直接启动测试，不先进入 SCR-021。
- 测试通过后不自动发布或激活。

**待确认**：调整结果是创建新 StateVersion，还是更新现有 Draft。

---

## FLOW-06 创建新的 State

**目标**：用户通过描述目标，选择平台推荐或外部导入的 Skills，创建 State Draft。

**参与者**：已登录用户、State Creator。

**前置条件**：用户有创建 State 的权限。

**正式页面范围**：SCR-016 `preacherman lab` 与 SCR-017 `preacherman lab 2` 均为正式页面，不作为探索稿或废稿处理。

**主路径**：

| 步骤 | 用户动作 | 对应页面 | 系统动作 | 下一状态 |
|---:|---|---|---|---|
| 1 | 从导航进入 State Lab | SCR-016 `preacherman lab` | 获取现有 Draft、Recent States 和创建入口 | 显示 Lab 首页 |
| 2 | 点击创建 State | SCR-016 | 创建临时 State Draft 或进入未保存草稿 | 显示创建页面 |
| 3 | 输入希望 State 帮助完成的目标 | SCR-019/SCR-020 | 分析意图，生成 Capability 建议 | 显示能力分析 |
| 4A | 选择平台推荐 Skills | SCR-019 | 查询并添加平台 Skills 到 Draft | 更新 State 构成 |
| 4B | 选择外部导入 Skills | SCR-020 | 上传文件或读取仓库；扫描权限和风险 | 验证通过后加入 Draft |
| 5 | 调整 Skills 组合 | SCR-019/SCR-020 | 保存 Draft 组合和顺序 | State Draft 可测试 |
| 6 | 点击 `Run Lab Test` | SCR-020 或创建页底部 | 创建针对 Draft 的 TestRun | 进入 FLOW-08 |
| 7 | 测试通过后保存 | 测试结果页 | 创建或更新私人 State Draft，保持 `unpublished/inactive` | 返回 Lab 或继续编辑 |

**异常与恢复**：

- 意图为空：不运行 Capability 分析。
- 外部导入失败：显示具体检查项，保留已输入目标。
- Skill 权限冲突：说明需要的权限并阻止发布。
- 用户离开：允许保存 State Draft 后继续。

**已确认规则**：

- SCR-017 `preacherman lab 2` 是正式页面。
- 新 State 测试通过后只保留为私人 Draft，不自动发布。

**待确认**：一个 State 最多可挂载多少 Skills。

---

## FLOW-07 创建、验证并发布 Skill

**目标**：从空白、模板或外部来源创建 Skill，完成配置、验证和发布。

**参与者**：Skill Creator、Developer。

**前置条件**：用户具有 Skill 创建权限。

**主路径**：

| 步骤 | 用户动作 | 对应页面 | 系统动作 | 下一状态 |
|---:|---|---|---|---|
| 1 | 进入 Skills 页面 | SCR-025 `preacherman lab skills页面` | 获取 Skill 列表、版本和状态 | 显示 Skills 页面 |
| 2 | 点击创建 Skill | SCR-025 | 打开 Blank/Template/Import 创建方式 | 用户选择来源 |
| 3A | 选择外部仓库或上传文件 | SCR-032 `重构1 / Import Skill` | 读取 Source；执行结构、权限和依赖检查 | 显示 Import Summary |
| 4A | 查看或修复导入验证项 | SCR-037/SCR-038 | 返回检查结果；失败项可重新验证 | 通过后继续配置 |
| 3B-1 | 选择 Blank Skill | SCR-026 `空白创建1` | 初始化 Skill Draft 和创建流程 | 进入正式步骤 1 |
| 3B-2 | 完成创建步骤 1 | SCR-027 `空白创建2` | 保存本步骤字段和 Draft 进度 | 进入正式步骤 2 |
| 3B-3 | 完成创建步骤 2 | SCR-028 `空白创建3` | 保存本步骤字段和 Draft 进度 | 进入正式步骤 3 |
| 3B-4 | 完成创建步骤 3 | SCR-029 `空白创建4` | 保存本步骤字段和 Draft 进度 | 进入正式步骤 4 |
| 3B-5 | 完成创建步骤 4 | SCR-030 `空白创建5` | 保存最终创建字段并完成空白创建流程 | Skill Draft 可继续配置或验证 |
| 5 | 配置名称、版本、Capabilities 和 Behavior | SCR-033 `重构2 / Configure Skill` | 保存 SkillVersion Draft | Draft 可测试 |
| 6 | 点击 `Test Changes/Validate` | SCR-033 | 创建验证任务 | 进入 SCR-034 |
| 7 | 查看测试集、性能对比和 Review Items | SCR-034 `重构3 / Validate Skill` | 返回 Pass/Review/Fail 和指标差异 | 修复或继续发布 |
| 8 | 点击 Publish | SCR-034 | 检查发布条件 | 进入 SCR-035 |
| 9 | 选择版本、目标 State 和激活方式 | SCR-035 `重构5 / Publish Skill` | 创建正式 SkillVersion；可挂载到 State Draft | 发布完成 |
| 10 | 导出 Skill 包 | SCR-036 `重构导出` | 生成可下载的 Skill Package | 下载或分享 |

**可选分支**：

- 进入 SCR-031 Developer Mode，直接编辑 Skill 文件、配置和调试信息。
- 验证出现 Review：返回 SCR-033 修改，再重新验证。
- 发布后选择 Activate Later：只发布版本，不立即挂载到 Active State。
- SCR-045 至 SCR-049 是废页，不进入流程、不开发接口、不纳入测试。

**异常与恢复**：

- 仓库不可访问：提示重新授权或更换 Source。
- 依赖缺失：允许保存 Draft，但禁止发布。
- 验证失败：保留测试报告，不覆盖上一正式版本。
- 发布版本号冲突：要求重新选择版本号。
- 挂载 State 失败：Skill 可保持 Published，但 Installation 标记失败并允许重试。

**已确认规则**：

- SCR-026 至 SCR-030 是 Blank Skill 空白创建的正式连续步骤 1 至 5。
- SCR-045 至 SCR-049 是废页，交付时忽略。
- 当前版本不设计独立的人工发布审核或 Pre Seal 流程；系统验证结果仍按页面展示。

---

## FLOW-08 运行 State Test

**目标**：输入任务和上下文，使用指定模式测试一个 State，并查看结果。

**参与者**：State Owner、Tester。

**前置条件**：存在可测试的 State 或 State Draft。

**主路径**：

| 步骤 | 用户动作 | 对应页面 | 系统动作 | 下一状态 |
|---:|---|---|---|---|
| 1 | 从 Passport、Lab 或 Adjust State 进入测试 | SCR-021 `state test hover前` | 获取 State、版本和最近测试 | 显示测试设置 |
| 2 | 输入测试任务 | SCR-021 | 本地校验长度和必填项 | 测试内容可运行 |
| 3 | 添加文件、文本、链接或数据源 | SCR-021 | 上传并解析 Context | 更新 Test Draft |
| 4 | 选择 Quick/Deep/Stress 模式 | SCR-021/SCR-022 | 前端更新选中状态和预计成本 | 等待启动 |
| 5 | 点击 `Run Test` | SCR-021 | 创建 TestRun 并返回 ID | 进入 SCR-023 |
| 6 | 查看 Understand/Plan/Research 等阶段 | SCR-023 `等待界面` | 实时推送阶段、日志、耗时和中间产物 | 完成进入 SCR-024 |
| 7 | 查看输出、评分和 Key Takeaways | SCR-024 `完成界面` | 获取 Artifact、Accuracy、Usefulness、Clarity | 显示测试结果 |
| 8A | 点击 Run test again | SCR-024 | 以相同配置创建新 TestRun | 返回运行中 |
| 8B | 点击 Adjust this State | SCR-024 | 携带测试缺口进入 FLOW-05 | 打开 SCR-015 |
| 8C | 点击 Use this Result | SCR-024 | 打开保存位置选择器；用户选择 Workspace 和目标容器后保存 Artifact | 返回用户选择的位置 |

**异常与恢复**：

- Context 解析失败：允许移除失败项后继续。
- Token/额度不足：运行前提示，不创建 TestRun。
- 运行失败：展示失败阶段和重试入口。
- 页面刷新：通过 TestRun ID 恢复进度。

**待确认**：

- Quick/Deep/Stress 三种模式的成本、超时和能力差异。
- SCR-022 是否只表示 Hover，还是模式选择后的正式状态。

**已确认规则**：`Use this Result` 不使用固定默认位置。前端必须先让用户选择保存位置，再提交稳定的 Workspace/容器 ID。

---

## FLOW-09 浏览并安装 State

**目标**：根据任务需求匹配 State，查看 Passport，并测试或安装。

**参与者**：已登录用户、State Consumer。

**前置条件**：用户拥有访问 State Gallery/Market 的权限。

**主路径**：

| 步骤 | 用户动作 | 对应页面 | 系统动作 | 下一状态 |
|---:|---|---|---|---|
| 1 | 进入 State Gallery | SCR-040 `state gallery` | 获取推荐 State、分类和用户已有 State | 显示 Gallery/State Match |
| 2 | 输入任务或选择 Quick Intent | SCR-040 | 根据需求计算匹配度 | 显示 State 匹配列表/环形卡片 |
| 3 | 选择一个 State | SCR-040 | 获取 Passport 摘要 | 打开 SCR-041 |
| 4 | 查看能力、权限、验证和匹配原因 | SCR-041 `state passport` | 获取版本、Builder、Skills、Memory、Permissions | 用户决定测试或安装 |
| 5A | 点击 `Try in Sandbox` | SCR-041 | 创建临时 Sandbox/Test Session | 进入 FLOW-08 |
| 5B | 点击 `Install State` | SCR-041 | 检查权限、License 和重复安装；创建未激活的 Installation | 安装成功，State 出现在 Lab |
| 6 | 进入 Lab 手动激活 | SCR-016/SCR-017 | 用户确认后将已安装 State 设为 Active/Current | SCR-001 显示新 State |

**异常与恢复**：

- 搜索无结果：保留输入并提供调整建议。
- State 已安装：按钮改为 Open/Installed，不重复创建 Installation。
- 权限不满足：说明缺少的权限范围。
- 版本下架：阻止安装并显示可用替代版本。

**已确认规则**：State 安装后不自动激活，必须由用户在 Lab 页面手动激活。

**待确认**：

- 是否存在付费购买、组织审批和 License 流程。
- `state gallery` 当前画面更接近 State Match；是否还需要独立的列表型 Market 页面。

---

## FLOW-10 查看 Ledger 与 Monitor

**目标**：查看 State 的版本演化、分支和实时运行状态，并执行治理操作。

**参与者**：State Owner、管理员、具有查看权限的成员。

**前置条件**：用户可访问目标 State。

**主路径 A：State Ledger**

| 步骤 | 用户动作 | 对应页面 | 系统动作 | 下一状态 |
|---:|---|---|---|---|
| 1 | 从导航或 Current State 进入 Ledger | SCR-042 `state ledger` | 获取版本、分支、来源任务和更新时间线 | 显示 Ledger Map |
| 2 | 选择一个版本节点 | SCR-042 | 获取该版本保留/未保留内容和质量信息 | 打开版本侧栏 |
| 3A | 点击 Compare | SCR-042 | 获取两个版本的结构化差异 | 显示对比结果 |
| 3B | 点击 Branch | SCR-042 | 基于所选版本创建新 Draft Branch | Ledger 增加分支节点 |
| 3C | 点击 Restore | SCR-042 | 二次确认后基于所选版本创建新的 StateDraft；不删除历史、不切换 Current State | 进入 Lab 查看新 Draft |

**主路径 B：State Monitor**

| 步骤 | 用户动作 | 对应页面 | 系统动作 | 下一状态 |
|---:|---|---|---|---|
| 1 | 用户拥有 State 后进入 APP | SCR-001 | 获取 State Health、Token、Active APIs 和 Activity 摘要 | 显示主 Monitor/Home |
| 2 | 点击 Status 或详情入口 | SCR-001 | 查询详细监控数据 | 进入 SCR-003/SCR-043 |
| 3 | 展开某个监控卡片 | SCR-003/SCR-043 | 获取更详细时间序列或日志 | 显示详情 |
| 4 | 查看 System Stream | SCR-043 | 订阅实时日志；支持断线重连 | 持续更新 |
| 5 | 返回 Home | SCR-003/SCR-043 | 取消不再使用的订阅 | 返回 SCR-001 |

**异常与恢复**：

- Restore 失败：Current State 不变，保留失败原因。
- 并发版本冲突：提示 Ledger 已更新，要求刷新后重试。
- Monitor 断线：显示最近数据时间并自动重连。
- 日志量过大：分页或按时间窗口加载，避免一次返回全部日志。

**待确认**：

- Branch 是否允许后续合并；当前设计中没有 Merge 流程。
- SCR-003、SCR-043、SCR-044 的最终保留关系。

**已确认规则**：Restore 只创建新的 StateDraft。是否启用由用户进入 Lab 后另行选择，Restore 本身不得激活或替换 Current State。

---

## 4. 跨流程通用规则

以下规则建议所有流程统一采用，后续应进入交互矩阵和 API 契约：

1. **身份与权限**：所有保存、运行、发布、安装、恢复操作都必须由后端校验权限。
2. **幂等性**：Start Task、Run Test、Publish、Install 等按钮重复点击不能生成重复记录。
3. **草稿保护**：页面离开或请求失败时，不应静默丢失用户输入。
4. **版本保护**：调整、恢复、发布失败时，不应覆盖当前正式版本。
5. **异步恢复**：TaskRun 和 TestRun 页面刷新后，应根据 Run ID 恢复状态。
6. **实时连接**：聊天、任务、测试、Monitor 应显示连接状态并支持自动重连。
7. **文件处理**：上传、解析、生成和下载应有独立状态，不把整页阻塞在单个文件失败上。
8. **审计记录**：发布、安装、恢复、分支和权限变化应记录操作者与时间。

## 5. 产品负责人已确认的规则

| 编号 | 已确认规则 | 对前后端实现的影响 |
|---:|---|---|
| 1 | SCR-013 是完成页基础态，SCR-014 是完整按钮态，SCR-055 废弃 | 完成页功能以 SCR-014 的按钮集合为准；不实现 SCR-055 |
| 2 | SCR-001 是用户拥有 State 后每次进入 APP 看见的主 Monitor/Home | 登录恢复 Session 后优先加载 Current State 和 Monitor 摘要 |
| 3 | `Save & Re-test` 保存后直接进入测试 | 同一动作需保存 Draft 并立即创建 TestRun，直接跳转 SCR-023 |
| 4 | 新 State 测试后不自动发布 | 测试成功只更新私人 Draft，发布必须由用户另行触发 |
| 5 | SCR-017 `preacherman lab 2` 是正式页面 | 保留并纳入前后端交付范围 |
| 6 | SCR-026 至 SCR-030 是 Blank Skill 创建的正式 1 至 5 步 | 五步共享同一个 SkillDraft ID，并逐步保存 |
| 7 | SCR-045 至 SCR-049 是废页 | 不开发、不对接接口、不纳入验收 |
| 8 | 当前不用处理 Skill 人工发布审核规则 | 暂不建设人工审批状态机；保留系统验证结果 |
| 9 | 对话支持链接分享和多种常见导出格式 | 后端提供分享链接，并返回当前可用格式列表；前端按列表展示 |
| 10 | State 安装后由用户在 Lab 手动激活 | Install 与 Activate 是两个独立动作，安装成功不得自动修改 Current State |
| 11 | Restore 只创建新的 StateDraft | Restore 不创建 Active Version、不切换 Current State；用户随后在 Lab 决定是否启用 |
| 12 | 一个用户只能有一个 Current State | Activate 必须原子停用/替换旧 Current State，并保证唯一性 |
| 13 | Use this Result 的保存位置由用户选择 | 先显示保存位置选择器，再提交 Workspace 与目标容器 ID |

## 6. 下一份交付物如何使用本文件

产品负责人确认本文件后，可据此制作 `04-interaction-matrix.csv`：

- 本文件中的每一个“用户动作”变成一条交互记录。
- 每一个“系统动作”标注为前端本地、普通 API 或实时事件。
- 每一个“异常与恢复”变成 Loading/Empty/Error/Retry 状态要求。
- 所有 `待确认` 项确认前，不进入最终 API 契约。
