# 应用界面角色与权限规范

- Figma 文件：[应用界面 Copy](https://www.figma.com/design/lWtoH8PCoOoPP3ttwMUBP6/应用界面--Copy-)
- 编写日期：2026-07-14
- 当前版本：`Draft v0.1`
- 依据：[02-screen-index.csv](./02-screen-index.csv)、[04-interaction-matrix.csv](./04-interaction-matrix.csv)、[05-data-dictionary.md](./05-data-dictionary.md)、[06-api-requirements.md](./06-api-requirements.md)、[08-error-and-empty-states.md](./08-error-and-empty-states.md)
- 用途：统一页面、按钮、API、数据对象和审计操作的授权规则

## 1. 这份文件解决什么问题

“用户已经登录”并不代表可以读取或修改所有数据。后端还必须回答：

1. 用户与目标 State、Skill、Conversation、Task 或 Artifact 是什么关系。
2. 用户只能查看，还是可以测试、编辑、发布、安装、激活或恢复。
3. 子资源是否确实属于用户有权访问的父资源。
4. 公开 Passport、安装后的 State 和用户自己创建的 State 有什么区别。
5. 前端应该隐藏按钮、禁用按钮，还是显示权限错误。
6. 哪些高风险动作必须写入 AuditLog。

本文件采用“全局身份 + 资源角色 + 对象关系 + 动作条件”的组合授权方式。仅使用一个 `role=admin` 字段无法安全覆盖本产品。

## 2. 首版权限边界

### 2.1 已确认范围

- 用户可以创建自己的 State、Skill、Conversation、Task 和 Test。
- 用户可以浏览公开 State Market 和公开 Passport。
- 用户可以安装公开 State，但安装后状态为 `installed_inactive`。
- 用户只能在 Lab 主动激活自己拥有的 Installation。
- State/Skill 的编辑、验证、发布和版本治理需要资源级权限。
- ShareLink 只授予链接声明的有限 `view` 或 `download` 权限。
- Published Version 不可原地编辑。

### 2.2 首版不扩张的内容

当前设计没有完整的团队、组织、成员邀请或权限管理页面，因此首版不要求：

- Organization/Team 数据模型。
- 邀请成员流程。
- 页面内修改 Viewer/Editor 的管理 UI。
- 自定义角色编辑器。
- 跨组织资源转让。

本文仍定义 Viewer、Tester、Editor 权限包，方便后端策略清晰并为未来共享预留，但首版真实授权主要来自资源所有权、Installation 所有权、公开可见性和 ShareLink。

## 3. 授权模型

### 3.1 四层判断

```text
全局身份
  + 资源角色
  + 对象关系
  + 当前动作条件
= 最终是否允许
```

示例：用户点击 `Publish & Add to State` 时，后端必须同时确认：

1. 用户已登录。
2. 用户可以发布该 SkillDraft。
3. 用户可以编辑目标 StateDraft。
4. 目标 StateDraft 允许挂载该 SkillVersion。
5. ValidationRun、revision、兼容性等业务条件通过。

业务条件不通过通常返回 `422` 或 `409`，权限不通过返回 `403`/安全型 `404`。

### 3.2 默认拒绝

未明确授予的动作一律拒绝。后端不得根据以下信息推断权限：

- 用户知道资源 ID。
- 前端展示了按钮。
- 用户能访问父页面导航。
- 资源名称或版本号是公开的。
- 用户曾经访问过旧版本。
- 用户拥有 ShareLink 但请求了链接权限之外的接口。

## 4. 全局身份

| 身份代码 | 含义 | 可以做什么 | 不可以做什么 |
|---|---|---|---|
| `visitor` | 未登录访问者 | Welcome、Login、Sign up、明确公开的 Passport 字段 | 用户私有数据、安装、Sandbox、对话、运行任务 |
| `authenticated_user` | 有效 Session 用户 | Profile、通知、State Market、创建个人资源 | 读取或修改其他用户私有资源 |
| `platform_admin` | 内部平台管理员 | 经审批的运维、风控和支持动作 | 默认查看用户秘密；不得绕过审计 |

`platform_admin` 是内部安全角色，不对应 Figma 中的普通用户菜单，也不等于交互矩阵里的“State Owner/管理员”。后者统一解释为 State 资源所有者或治理者。

### 4.1 交互矩阵角色归并

交互矩阵中的角色是页面场景名称，不应直接存成后端账号角色。统一映射如下：

| 交互矩阵角色 | 后端解释 |
|---|---|
| `访客/新用户/已有用户` | 登录前为 `visitor`；Session 有效后为 `authenticated_user` |
| `已登录用户` | `authenticated_user`，再计算目标资源权限 |
| `Current State 用户` | `authenticated_user` + 自己的 active Installation/State + 自己的 Conversation |
| `任务创建者` | 当前 TaskDraft/TaskRun 的 owner |
| `State Creator` | 新建 StateDraft 的 owner，创建后获得 `state_owner` 权限包 |
| `State Owner/编辑者` | 对目标资源计算 `state_editor` 或 `state_owner` |
| `State Owner/Tester` | 对目标资源计算 `state_tester`、`state_editor` 或 `state_owner` |
| `State Consumer` | `state_consumer`；安装记录另计算 `installation_owner` |
| `State Owner/管理员` | `state_owner`，不是平台级 `platform_admin` |
| `Skill Creator/Developer` | 新建时为 `skill_owner`；已有资源按 Skill 角色计算 |

## 5. State 相关角色

### 5.1 角色定义

| 角色代码 | 来源 | 核心能力 |
|---|---|---|
| `state_consumer` | 用户可访问公开 State，或拥有其 Installation | 查看公开 Passport、试用、使用已激活 State |
| `state_viewer` | 资源权限包；首版通常由 owner 隐含获得 | 查看私有 State 摘要、版本、允许的结果 |
| `state_tester` | 资源权限包 | Viewer + 创建 TestDraft/TestRun、读取测试结果 |
| `state_editor` | 资源权限包 | Tester + 修改 StateDraft、挂载 Skill、运行 Lab Test |
| `state_owner` | State 的 `owner_user_id` | Editor + 发布、分支、恢复、管理高风险治理动作 |
| `installation_owner` | StateInstallation 的 `user_id` | 激活、停用、卸载自己的 Installation |

### 5.2 继承关系

```text
state_owner
  -> state_editor
      -> state_tester
          -> state_viewer
```

`state_consumer` 和 `installation_owner` 是独立关系，不自动等于原 State 的 Editor/Owner。安装市场 State 不会把发布者的源配置、私有 Memory、Source 或治理权限转交给安装者。

### 5.3 State 权限矩阵

| permission | Consumer | Viewer | Tester | Editor | Owner | Installation Owner |
|---|---:|---:|---:|---:|---:|---:|
| `state.passport.public.read` | 是 | 是 | 是 | 是 | 是 | 是 |
| `state.use` | 已激活时 | 视产品授权 | 是 | 是 | 是 | 已激活时 |
| `state.private.read` | 否 | 是 | 是 | 是 | 是 | 仅自己的运行数据 |
| `state.monitor.summary.read` | 自己的 active State | 是 | 是 | 是 | 是 | 自己的 active State |
| `state.monitor.detail.read` | 否 | 视授权 | 是 | 是 | 是 | 视安装策略 |
| `state.monitor.logs.read` | 否 | 否 | 视授权 | 视授权 | 是 | 默认否 |
| `state.learnings.read` | 否 | 视授权 | 是 | 是 | 是 | 仅自己的安装学习项 |
| `state.test.run` | Sandbox/允许时 | 否 | 是 | 是 | 是 | 自己安装项允许时 |
| `state.draft.create` | 否 | 否 | 否 | 是 | 是 | 仅创建个人派生 Draft 时，待确认 |
| `state.draft.write` | 否 | 否 | 否 | 是 | 是 | 否 |
| `state.skill_mount.manage` | 否 | 否 | 否 | 是 | 是 | 否 |
| `state.publish` | 否 | 否 | 否 | 否 | 是 | 否 |
| `state.ledger.read` | 否 | 是 | 是 | 是 | 是 | 否 |
| `state.version.branch` | 否 | 否 | 否 | 是 | 是 | 否 |
| `state.version.restore` | 否 | 否 | 否 | 否 | 是 | 否 |
| `state.install` | 是 | 是 | 是 | 是 | 是 | 不适用 |
| `state.installation.activate` | 否 | 否 | 否 | 否 | 否 | 是 |
| `state.installation.deactivate` | 否 | 否 | 否 | 否 | 否 | 是 |
| `state.installation.delete` | 否 | 否 | 否 | 否 | 否 | 是 |

“视授权”和“待确认”不是后端默认允许。首版没有明确产品规则时必须默认拒绝，并保留未来显式授权能力。

## 6. Skill 相关角色

### 6.1 角色定义

| 角色代码 | 来源 | 核心能力 |
|---|---|---|
| `skill_viewer` | 公开可见性或资源权限 | 查看 Skill 摘要和允许的版本信息 |
| `skill_editor` | Skill 资源权限 | 修改 SkillDraft、文件、Sources、Capabilities 和 Behavior |
| `skill_publisher` | Skill 资源权限 | Editor + Validation、发布和导出正式版本 |
| `skill_owner` | Skill 的 `owner_user_id` | Publisher + 所有权和未来授权管理 |

交互矩阵中的 `Skill Creator/Developer`：创建 Skill 时成为 `skill_owner`；进入他人资源时按实际资源角色计算，不因页面名称中包含 Developer 自动获得编辑权。

### 6.2 继承关系

```text
skill_owner
  -> skill_publisher
      -> skill_editor
          -> skill_viewer
```

### 6.3 Skill 权限矩阵

| permission | Viewer | Editor | Publisher | Owner |
|---|---:|---:|---:|---:|
| `skill.read` | 是 | 是 | 是 | 是 |
| `skill.draft.create` | 否 | 是 | 是 | 是 |
| `skill.draft.read` | 否/视授权 | 是 | 是 | 是 |
| `skill.draft.write` | 否 | 是 | 是 | 是 |
| `skill.file.read` | 否/视授权 | 是 | 是 | 是 |
| `skill.file.write` | 否 | 是 | 是 | 是 |
| `skill.source.manage` | 否 | 是 | 是 | 是 |
| `skill.import` | 否 | 是 | 是 | 是 |
| `skill.validate` | 否 | 是 | 是 | 是 |
| `skill.publish` | 否 | 否 | 是 | 是 |
| `skill.export` | 公开版本视许可 | 否/视授权 | 是 | 是 |
| `skill.diff.read` | 视可见版本 | 是 | 是 | 是 |
| `skill.mount` | 视目标 State 权限 | 视目标 State 权限 | 视目标 State 权限 | 视目标 State 权限 |

发布 Skill 当前不需要人工审批，但仍必须拥有 `skill.publish` 并满足系统校验。

## 7. 其他资源权限代码

State 和 Skill 之外的权限也必须使用稳定代码，不能只写“已登录即可”。

| 分组 | permission | 授予条件 |
|---|---|---|
| Profile | `profile.self.read` | 当前 Session 用户读取自己的 Profile |
| Profile | `profile.self.write` | 当前 Session 用户修改自己的 Profile |
| Notification | `notification.self.read` | Notification 的 `user_id` 为当前用户 |
| Conversation | `conversation.create` | authenticated user + 可使用目标 State |
| Conversation | `conversation.read` | Conversation owner 或有效 ShareLink view |
| Conversation | `conversation.write` | Conversation owner + `state.use` |
| Conversation | `conversation.share` | Conversation owner |
| Conversation | `conversation.export` | Conversation owner 或有效 download grant |
| Task | `task.draft.create` | Conversation owner或 authenticated user + `state.use` |
| Task | `task.draft.read` | TaskDraft owner |
| Task | `task.draft.write` | TaskDraft owner |
| Task | `task.run.create` | TaskDraft owner + `state.use` |
| Task | `task.run.read` | TaskRun owner/继承 TaskDraft read |
| Task | `task.run.retry` | TaskRun owner + `retryable=true` |
| Task | `task.result.read` | TaskRun read |
| Test | `test.draft.create` | `state.test.run` |
| Test | `test.draft.write` | TestDraft owner + `state.test.run` |
| Test | `test.run.read` | TestDraft owner或允许的 State tester/editor/owner |
| Test | `test.run.retry` | TestRun read + `state.test.run` + retryable |
| Test | `test.result.read` | TestRun read |
| Source | `source.create` | 父 Draft/Conversation 的 write 权限 |
| Source | `source.read` | 继承父资源 read |
| Source | `source.delete` | 继承父资源 write |
| Source | `source.connection.use` | 当前用户拥有连接授权且父资源可写 |
| Artifact | `artifact.read` | 继承父 Run/TestResult read |
| Artifact | `artifact.preview` | Artifact read + preview 可用 |
| Artifact | `artifact.download` | Artifact read + License/敏感策略允许 |
| Artifact | `artifact.workspace_save` | Artifact read + 当前用户 Workspace write |
| Share | `share.create` | 原资源 share 权限 |
| Share | `share.revoke` | ShareLink 创建者或原资源 owner |
| Export | `export.create` | 原资源 export 权限 |
| Export | `export.read` | ExportJob 创建者且仍有原资源 read |
| Sandbox | `sandbox.create` | authenticated user + StateVersion 可试用 + quota |
| Sandbox | `sandbox.read` | SandboxSession 的 `user_id` 为当前用户 |

## 8. 用户拥有型资源

当前没有团队共享流程时，以下资源默认只允许创建者读取和操作：

| 资源 | 所有权字段/关系 | 读取者 | 写入者 |
|---|---|---|---|
| `Conversation` | `user_id` | 会话所有者；受限 ShareLink 查看者 | 会话所有者 |
| `Message` | 继承 Conversation | 继承 Conversation | 系统或会话所有者按动作写入 |
| `TaskDraft` | `created_by`/来源 Conversation | 创建者 | 创建者 |
| `TaskRun` | 继承 TaskDraft + `created_by` | 创建者 | 后端 worker；用户只能发控制命令 |
| `TestDraft` | `user_id` | 创建者 + 有权测试目标 State 的用户 | 创建者 |
| `TestRun` | 继承 TestDraft/State 权限 | 创建者 + 允许的 State Tester/Owner | 后端 worker |
| `ValidationRun` | 继承 SkillDraft | Skill Editor/Publisher/Owner | 后端 worker |
| `ImportJob` | `created_by` + target Draft | 创建者和目标 Draft Editor | 后端 worker；创建者可保存/转换 |
| `ExportJob` | `created_by` + 原资源 | 创建者且仍有原资源权限 | 后端 worker |
| `SandboxSession` | `user_id` | 创建者 | 创建者发起控制，后端执行 |
| `Notification` | `user_id` | 接收者 | 后端系统；接收者可标记已读 |

用户失去父资源权限后，不得仅凭旧 Run/Job ID 继续读取结果。

## 9. 子资源权限继承

### 9.1 继承规则

| 子资源 | 权限来源 | 额外校验 |
|---|---|---|
| `Source` | 所属 Draft/Conversation/Test | Source 必须实际绑定到父资源，不能只校验 Source ID |
| `ContextTag` | 所属 Draft | 写入同时需要父 Draft revision |
| `RunEvent` | 对应 TaskRun/TestRun/ValidationRun/ResponseRun | SSE 建立和重连时重新校验 |
| `MonitorEvent` | 对应 State | 区分 summary、detail、logs 权限 |
| `Artifact` | 对应 Run/TestResult | Preview、Download、Workspace save 分别校验动作权限 |
| `ReviewItem` | 对应 ValidationRun | 继承 SkillDraft 的读取权限 |
| `StateLearning` | State 或用户 Installation | 不得泄露其他安装者的私有学习内容 |
| `LedgerEvent` | State | 高敏事件详情可能仅 Owner 可见 |

### 9.2 防止 IDOR

以下写法不安全：

```text
找到 artifact_id
  -> 用户已登录
  -> 返回下载地址
```

正确方式：

```text
找到 artifact_id
  -> 找到父 Run
  -> 找到父 Draft/State/Conversation
  -> 计算当前用户的读取和下载权限
  -> 生成短期签名地址
```

所有嵌套接口都必须验证 URL 中父 ID 与子资源真实关系，防止把合法子 ID 拼接到另一个父资源路径下访问。

## 10. ShareLink 权限

### 10.1 ShareLink 不等于登录角色

ShareLink 只授予以下有限能力：

| permission | 能力 |
|---|---|
| `view` | 查看特定 Conversation、Artifact 或 SkillVersion 的分享视图 |
| `download` | 查看并下载特定资源；仍受过期、撤销和次数限制 |

ShareLink 不授予：

- 编辑 Draft。
- 查看原资源的其他版本。
- 查看父资源中的其他 Source/Message/Artifact。
- 创建 Run。
- Publish、Install、Activate、Branch、Restore。
- 创建新的 ShareLink。

### 10.2 校验顺序

1. 对 token 做哈希比较，不保存或查询明文 token。
2. 校验 `revoked_at`、`expires_at` 和可选访问限制。
3. 校验请求动作在 `permission` 范围内。
4. 只返回分享视图允许的字段。
5. 下载和撤销操作写 AuditLog。

禁止把 ShareLink token 放入普通分析事件、Referer、错误日志或 SSE payload。

## 11. 页面访问矩阵

### 11.1 账号、Home 与对话

| 页面 | 最低身份/权限 | 无权限时 |
|---|---|---|
| `SCR-050` Welcome | `visitor` | 始终可访问 |
| `SCR-051` Login | `visitor` | 已登录可重定向 Home |
| `SCR-052` Sign up | `visitor` | 已登录可重定向 Home |
| `SCR-053` Profile setup | 当前 Session 用户的 `profile.self.write` | 401 -> Login |
| `SCR-054` App entry | `authenticated_user` | 401 -> Login |
| `SCR-001` Home | `authenticated_user` | 401 -> Login；无 Current State 显示创建/安装入口 |
| `SCR-002` Status entry | `state.monitor.summary.read` | 隐藏入口或显示无权限原因 |
| `SCR-003` Monitor detail | `state.monitor.detail.read` | 403/安全型 404 |
| `SCR-004` Current State entry | 当前用户有 active Installation/State | 无 Current State 显示正常 Empty |
| `SCR-005` Current State detail | `state.passport.public.read`；私有区另行校验 | 公开字段可见，私有区隐藏 |
| `SCR-006` Conversation entry | `state.use` | 禁用对话入口并说明 State 未激活/不可用 |
| `SCR-007` Conversation | Conversation owner + `state.use` | 403/404 |
| `SCR-008` Reply streaming | 继承 `SCR-007` | 断开 SSE，不泄露后续 delta |
| `SCR-009` Conversation history | Conversation owner | 403/404 |
| `SCR-010` Share/export hover | `conversation.share` 或 `conversation.export` | 隐藏对应动作 |

### 11.2 Workspace、Lab 与 State Test

| 页面 | 最低身份/权限 | 无权限时 |
|---|---|---|
| `SCR-011` Task editor | TaskDraft owner + `state.use` | 403/404；保留未提交本地文字 |
| `SCR-012` Task running | `task.run.read` | 403/404；终止事件订阅 |
| `SCR-013` Task result base | `task.result.read` | 403/404 |
| `SCR-014` Task result full | `task.result.read`；按钮各自再校验 | 只隐藏无权限动作，不隐藏可读结果 |
| `SCR-015` Adjust State | `state.draft.write` | 只读用户返回 Lab/详情 |
| `SCR-016` Lab home | `authenticated_user`；卡片按资源权限过滤 | 不返回其他用户私有 Draft |
| `SCR-017` Lab formal page 2 | `state.draft.read`；编辑需 `state.draft.write` | 只读或 403 |
| `SCR-018` Lab hover | 继承 `SCR-017` | 无权限动作不显示 |
| `SCR-019` Create State | `state.draft.create`/`state.draft.write` | 403；已填写目标本地保留 |
| `SCR-020` External Skill import | `state.draft.write` + `skill.import` | 隐藏 Import 或 403 |
| `SCR-021` Test setup | `state.test.run` | 403；不创建 TestDraft |
| `SCR-022` Test setup hover | 继承 `SCR-021` | 无权限动作不显示 |
| `SCR-023` Test running | `test.run.read` | 403/404；终止事件订阅 |
| `SCR-024` Test result | `test.result.read`；Adjust 需 `state.draft.write` | 结果可读但编辑按钮隐藏 |

### 11.3 Skills 生命周期

| 页面 | 最低身份/权限 | 无权限时 |
|---|---|---|
| `SCR-025` Skills list | `authenticated_user`；列表按可见性过滤 | 只显示可见 Skill |
| `SCR-026` Blank Skill 1 | `skill.draft.create`/`skill.draft.write` | 403 |
| `SCR-027` Blank Skill 2 | `skill.draft.write` | 403/只读 |
| `SCR-028` Blank Skill 3 | `skill.draft.write` | 403/只读 |
| `SCR-029` Blank Skill 4 | `skill.draft.write` | 403/只读；秘密值不回传 |
| `SCR-030` Blank Skill 5 | `skill.draft.write` | 403/只读 |
| `SCR-031` Developer mode | `skill.file.read`；编辑需 `skill.file.write` | 只读或 403 |
| `SCR-032` Import/Refactor 1 | `skill.import` | 403；不得读取他人仓库凭证 |
| `SCR-033` Configure/Refactor 2 | `skill.draft.read`；编辑需 `skill.draft.write` | 只读或 403 |
| `SCR-034` Validate/Refactor 3 | `skill.validate`；结果读取需 SkillDraft read | 隐藏 Run/Rerun |
| `SCR-035` Publish/Refactor 5 | `skill.publish`；挂载另需 State 权限 | 只读 Summary 或 403 |
| `SCR-036` Skill export | `skill.export` | 隐藏 Generate/Share/Download |
| `SCR-037` Import validation | `skill.import` + ImportJob read | 403/404 |
| `SCR-038` Import validation 2 | 继承 `SCR-032`/`SCR-037` | 不新增独有权限 |
| `SCR-039` Skills test | `skill.validate` | 结果只读或 403 |

### 11.4 Market、Passport、Ledger 与 Status

| 页面 | 最低身份/权限 | 无权限时 |
|---|---|---|
| `SCR-040` State Gallery | `authenticated_user`；公开列表可按产品决定访客可见 | 私有推荐不返回 |
| `SCR-041` State Passport | 公开字段可由 `visitor` 查看；Sandbox/Install 需登录 | 隐藏私有字段和受限动作 |
| `SCR-042` State Ledger | `state.ledger.read`；Branch/Restore 分别校验 | 只读或 403 |
| `SCR-043` State Status | `state.monitor.detail.read`；Logs 另需 `state.monitor.logs.read` | 可显示摘要，隐藏敏感日志 |
| `SCR-044` State Status 2 | 继承 `SCR-043` | 不新增独有权限 |

归档页面 `SCR-045`、`SCR-046`、`SCR-047`、`SCR-048`、`SCR-049`、`SCR-055` 不进入权限交付范围。

## 12. 主要按钮与动作权限

| 用户动作 | 必需权限 | 额外条件 | 拒绝时 UI | AuditLog |
|---|---|---|---|---:|
| Send Message | Conversation owner + `state.use` | State active、额度可用 | 禁用输入/说明原因 | 否 |
| Share Conversation | `conversation.share` | Conversation owner | 隐藏/403 | 是 |
| Export Conversation | `conversation.export` | 原资源仍可读 | 隐藏/403 | 下载时是 |
| Create/Save TaskDraft | `task.draft.write` | Draft owner、revision 正确 | 403/412 | 否 |
| Run State/Start Task | `task.run.create` + `state.use` | quota、Draft 校验通过 | 禁用并显示原因 | 建议 |
| Retry TaskRun | `task.run.retry` | 原 Run 可读且 retryable | 隐藏或 Create new | 建议 |
| Download Artifact | `artifact.download` + 父资源 read | Artifact 可用 | 隐藏/403 | 是 |
| Adjust State | `state.draft.write` | 可创建/恢复 Draft | 隐藏/403 | 否 |
| Save & Re-test | `state.draft.write` + `state.test.run` | revision、quota、兼容性 | 禁用/403/412 | 建议 |
| Create State | `state.draft.create` | 账号状态允许 | 隐藏/403 | 否 |
| Mount Skill | `state.skill_mount.manage` | Skill 可用、兼容、许可通过 | 禁用并说明 | 是 |
| Run Lab Test | `state.test.run` | Draft 可测试 | 禁用并说明 | 建议 |
| Publish State | `state.publish` | 系统校验通过 | 隐藏/阻断 | 是 |
| Create/Edit Skill | `skill.draft.create/write` | 资源 owner/editor | 403/只读 | 否 |
| Manage Skill Sources | `skill.source.manage` | Source 访问合法 | 隐藏/403 | 敏感连接建议是 |
| Run Validation | `skill.validate` | Draft revision 可用 | 隐藏/禁用 | 建议 |
| Publish Skill | `skill.publish` | Validation 和 publish check 通过 | 隐藏/阻断 | 是 |
| Publish & Add to State | `skill.publish` + `state.skill_mount.manage` | 同时有目标 StateDraft write | 隐藏目标或阻断 | 是 |
| Export Skill | `skill.export` | Version 和 License 允许 | 隐藏/403 | 下载时是 |
| Try in Sandbox | `state.passport.public.read` + `sandbox.create` | 登录、quota、版本可用 | Sign in/禁用 | 建议 |
| Install State | `state.install` | 登录、License、未安装 | Sign in/说明已安装 | 是 |
| Activate State | `state.installation.activate` | Installation owner、兼容、revision | 隐藏/阻断 | 是 |
| Compare Versions | `state.ledger.read` | 两版本均可读 | 隐藏/403 | 否 |
| Branch Version | `state.version.branch` | 来源版本可读 | 隐藏/403 | 是 |
| Restore Version | `state.version.restore` | Owner、二次确认、revision | 隐藏/阻断 | 是 |
| View System Stream | `state.monitor.logs.read` | 日志级别允许 | 隐藏日志卡片 | 敏感访问建议是 |

## 13. API 权限映射

### 13.1 账号和 Home

| API-ID | 权限要求 |
|---|---|
| `API-001`、`API-003`、`API-005` 至 `API-009` | 当前 Session 用户的 self 权限；Notification 必须属于当前用户 |
| `API-002`、`API-004` | 公开入口 + 防暴力破解/账号策略 |
| `API-010` | `authenticated_user`，只聚合当前用户可见资源 |
| `API-011`、`API-128` | 当前用户可读目标 resource；订阅时重新校验 |
| `API-012`、`API-127` | 继承 Operation 对应父资源 read 权限 |
| `API-013` 至 `API-015` | `state.monitor.summary/detail/logs.read` 按 section 裁剪 |
| `API-016` | 当前用户自己的 Current State/Installation |
| `API-017` 至 `API-023` | 分别校验 State public/private、learnings、skills、draft、test、ledger 权限 |

### 13.2 Conversation、Task 与 Artifact

| API-ID | 权限要求 |
|---|---|
| `API-024` 至 `API-030` | Conversation owner + `state.use`；事件流继承 Conversation |
| `API-031` | 当前用户上传/录制的 audio asset |
| `API-032`、`API-033` | Conversation owner；生成 TaskDraft 后当前用户成为 owner |
| `API-034`、`API-035` | 原资源 share 权限；撤销需 ShareLink 创建者/资源 owner |
| `API-036` 至 `API-038` | 原资源 export 权限；ExportJob 每次读取重新校验原资源 |
| `API-039` 至 `API-047` | TaskDraft owner/write；Source/Context 必须真实属于 Draft |
| `API-048` 至 `API-051` | `task.run.create/read/retry` + `state.use` |
| `API-052` 至 `API-054` | TaskRun result read；创建 State adjustment 另需 `state.draft.write` |
| `API-055` | `artifact.download` + 父 Run/Result read |

### 13.3 State Lab 与 Skills

| API-ID | 权限要求 |
|---|---|
| `API-056`、`API-057` | `authenticated_user`；只返回可见 Draft、State 和 Template |
| `API-058` | `state.draft.create` |
| `API-059` 至 `API-062` | `state.draft.read/write`，recommendation 不泄露无权 Skill |
| `API-063` 至 `API-066` | `state.skill_mount.manage` + Skill 可见/许可权限 |
| `API-067` | `state.draft.write` + `state.test.run` |
| `API-068` | `state.test.run` |
| `API-069` | StateDraft owner/editor；不得隐式 Publish/Activate |
| `API-070`、`API-071` | `authenticated_user`，按 Skill visibility 过滤 |
| `API-072` 至 `API-079` | `skill.draft.create/read/write` 和 file/source 子权限 |
| `API-080` 至 `API-084` | `skill.import`；ImportJob 还继承目标 Draft 权限 |
| `API-085` 至 `API-089` | `skill.validate` 或相应结果 read 权限 |
| `API-090` 至 `API-093` | `skill.publish`；挂载目标另需 `state.skill_mount.manage` |
| `API-094`、`API-095` | `skill.export/diff.read` |
| `API-096` | `skill.mount` + `state.skill_mount.manage` |

### 13.4 Test、Market、Installation 与 Ledger

| API-ID | 权限要求 |
|---|---|
| `API-097` 至 `API-100` | `state.test.run`；TestDraft 必须属于当前用户 |
| `API-101` 至 `API-103` | TestRun/TestResult read，继承 TestDraft 和 State 权限 |
| `API-104` 至 `API-106` | Artifact parent read；Adjust/Workspace save 分别再校验 write 权限 |
| `API-107` 至 `API-110` | 公开 Market/Passport/proof 字段；私有字段按可见性裁剪 |
| `API-111` | `sandbox.create` + StateVersion 可试用 |
| `API-112` | `state.install` + License；创建当前用户的 Installation |
| `API-113` 至 `API-115` | Installation owner；Activate 还校验 Current State revision |
| `API-116`、`API-117`、`API-121`、`API-122` | `state.ledger.read`，高敏字段按角色裁剪 |
| `API-118` | 两个 StateVersion 均可读 |
| `API-119` | `state.version.branch` |
| `API-120` | `state.version.restore` + 二次确认 + AuditLog |
| `API-123` 至 `API-126` | upload/source purpose 对应父资源 create/write 权限 |

## 14. 字段级裁剪

### 14.1 Public Passport

可公开：

- State/Skill 名称、描述和公开版本号。
- 发布者显示信息。
- 公开 Capabilities 和用途。
- 汇总验证分数、公开 proof 和许可摘要。
- 权限类别摘要，例如 Read/Write/Execute，不含密钥。

不得公开：

- 私有 Source 内容和 URL。
- Memory/Learnings 的具体内容。
- Behavior Prompt、内部 Guardrails 细节。
- API key、OAuth token、仓库凭证。
- 私有运行日志、完整 AuditLog、用户 Conversation/Task。
- 原始内部模型输入输出和系统堆栈。

### 14.2 Editor 与 Owner

- Editor 可以读取并修改配置，但秘密字段只返回 `configured=true`、掩码或 secret reference。
- Owner 也不得读取已有 secret 明文，只能替换或撤销。
- AuditLog 的 IP、before/after summary 可按支持和安全策略进一步裁剪。
- Monitor logs 需要独立权限，不能因为能编辑 State 就自动返回所有内部日志。

### 14.3 API 响应中的权限摘要

资源响应可包含前端所需的动作摘要：

```json
{
  "permissions": {
    "actions": [
      "state.read",
      "state.test.run",
      "state.draft.write"
    ],
    "denied_actions": [
      {
        "action": "state.version.restore",
        "reason_code": "OWNER_REQUIRED"
      }
    ],
    "policy_revision": 7
  }
}
```

该摘要只用于前端展示。真正提交动作时后端必须重新计算权限，不能信任客户端回传的 `actions`。

## 15. 前端按钮规则

### 15.1 Hide、Disable 和 Error

| 情况 | 前端处理 |
|---|---|
| 用户在当前角色下永远不能执行 | 隐藏按钮 |
| 用户有权限，但当前业务条件暂不满足 | 禁用按钮并显示原因 |
| 权限仍在加载 | 使用稳定占位，不先显示可点击按钮 |
| 权限在提交前被撤销 | 后端 403，保留页面内容并显示明确错误 |
| 资源被删除/设为私有 | 404/不可用页，不显示伪造 Empty |

示例：

- Viewer 的 Restore 按钮隐藏。
- Owner 的 Publish 在 Validation 未通过时禁用并显示系统校验原因。
- 已安装 State 的 Install 按钮改为 `Open in Lab`，不是红色错误。
- Installation owner 的 Activate 按钮在依赖缺失时禁用并显示 `View requirements`。

### 15.2 前端路由保护

路由保护用于改善体验，但不构成安全边界。用户直接输入 URL 时，页面仍必须请求后端并按 401/403/404 处理。

## 16. 安装、激活和 Current State

### 16.1 安装

`state.install` 允许用户创建自己的 StateInstallation，但不会获得原 State 所有权。

```text
public StateVersion
  -> authenticated user installs
  -> StateInstallation.installed_inactive
```

### 16.2 激活

激活必须同时满足：

1. 当前用户是 Installation owner。
2. Installation 未被删除或停用。
3. License、依赖、兼容性和额度允许。
4. Current State revision 没有冲突。
5. 激活和 `is_current` 切换原子完成。
6. 同一用户最多只有一个 `is_current=true` 的 StateInstallation；激活新 State 时原子替换旧 Current State。

激活不会让用户成为原 State 的 `state_owner`。

### 16.3 用户自己的运行数据

市场 State 的发布者不能读取安装者的 Conversation、Task、Test、Source、Artifact 或私有 Learnings，除非产品未来增加明确、可撤销、知情的共享机制。

## 17. Publish & Add to State 的双资源授权

该动作同时修改 Skill 和 State，因此必须做双资源校验：

```text
can(skill.publish, skill_draft)
AND
can(state.skill_mount.manage, state_draft)
AND
compatible(skill_version, state_draft)
AND
current revisions match
```

任何一项失败，整个事务回滚。不得出现：

- SkillVersion 已发布，但 StateDraft 未挂载且前端收到模糊失败。
- StateDraft 挂载了用户无权读取的 SkillVersion。
- 用户通过拥有 Skill 权限绕过目标 State 权限。

## 18. SSE 与异步任务权限

### 18.1 建立连接

每次建立或重连 SSE 都必须：

1. 验证 Session。
2. 找到 stream 对应的 Run/Conversation/State。
3. 重新计算父资源读取权限。
4. 按字段权限裁剪事件 payload。
5. 权限被撤销时立即关闭连接。

### 18.2 Operation 恢复

`GET /operations/{operation_id}` 不能只检查 operation ID 和登录状态。必须沿 `operation_type` 找到具体对象和父资源，再做授权。

### 18.3 后台继续执行

用户退出页面或 SSE 断线不会改变 Run 权限和状态。Session 过期时 Run 可以继续执行，但重新读取结果需要新的有效 Session 和资源权限。

## 19. AuditLog 要求

### 19.1 必须审计

| action code | 触发动作 | 最低记录 |
|---|---|---|
| `auth.session_revoked` | Logout/安全撤销 | actor、session、request、time |
| `share_link.created` | 创建分享链接 | resource、permission、expiry |
| `share_link.revoked` | 撤销分享链接 | resource、link ID |
| `artifact.downloaded` | 下载敏感 Artifact | artifact、parent、actor |
| `export.sensitive_created` | 生成高风险导出 | resource、format、policy |
| `upload.malware_blocked` | 恶意文件被阻止 | purpose、MIME、scanner result |
| `skill.published` | 发布 SkillVersion | draft、version、validation |
| `skill.mounted` | 挂载 Skill 到 StateDraft | skill version、state draft |
| `state.installed` | 安装市场 State | state version、installation |
| `state.activated` | 激活 Installation | before/after Current State |
| `state.deactivated` | 停用 Installation | installation、reason |
| `state.uninstalled` | 卸载 Installation | installation、version |
| `state.branched` | 创建 State 分支 | source version、draft |
| `state.restored` | 基于历史版本创建恢复 Draft | source version、result StateDraft、unchanged Current State |
| `permission.changed` | 未来授权变化 | principal、resource、before/after |
| `admin.accessed_sensitive_data` | 平台管理员读取敏感数据 | reason、scope、approval reference |

### 19.2 审计限制

- AuditLog 只追加，不允许普通 API 修改或删除。
- 不保存密码、Token、API key、完整 Source 或完整 Conversation。
- 高风险动作失败也应记录失败审计事件和稳定错误码。
- request ID 必须能关联 API 日志与 AuditLog。
- 普通用户默认不能读取平台级 AuditLog。

## 20. 拒绝响应

| 情况 | HTTP | error.code | 前端处理 |
|---|---:|---|---|
| 未登录或 Session 过期 | 401 | `AUTH_SESSION_EXPIRED` | Sign in；安全恢复非秘密草稿 |
| 已登录但无动作权限 | 403 | `RESOURCE_FORBIDDEN` | 隐藏/返回；不清空可恢复输入 |
| 需要隐藏资源存在性 | 404 | `RESOURCE_NOT_FOUND` | 不可用页，不暴露资源存在 |
| 角色允许但 revision 已变化 | 412 | `REVISION_CONFLICT` | Review latest |
| 角色允许但版本/安装冲突 | 409 | 稳定冲突码 | 刷新资源后重试 |
| 角色允许但业务前置条件不满足 | 422 | 稳定业务码 | 禁用并显示要求 |

后端 `message` 不得包含“该资源属于用户 X”等会泄露其他账号信息的内容。

## 21. 缓存与权限变化

- 权限摘要应带 `policy_revision` 或与资源 revision 关联。
- 前端可短期缓存用于展示，但提交动作必须以后端实时校验为准。
- 权限撤销后，服务端应使相关长连接失效。
- 签名下载 URL 短期有效；高敏资源权限撤销时应支持提前失效。
- ShareLink 撤销必须立即阻止新访问。
- 不得在 CDN 公共缓存中存储私有 Passport、Monitor、Conversation 或 Artifact 响应。

## 22. 安全测试清单

### 22.1 对象级越权

| 测试 | 预期结果 |
|---|---|
| 用户 A 用自己的 Session 请求用户 B 的 TaskRun ID | 403/404 |
| 用户 A 把自己的 Artifact ID 拼到用户 B 的 Run URL | 403/404 |
| Viewer 调用 StateDraft PATCH | 403，Draft 不变化 |
| Tester 调用 Restore | 403，版本不变化 |
| Installation owner 请求原发布者私有 Source | 403/404 |
| 只有 Skill 权限但没有 State 权限执行 Publish & Add | 整体拒绝，无半完成状态 |

### 22.2 ShareLink

| 测试 | 预期结果 |
|---|---|
| view link 请求下载 | 403 |
| 已撤销 link 再访问 | 404/410，资源不返回 |
| 过期 link 再访问 | 不返回资源 |
| link token 出现在普通日志 | 测试失败，必须脱敏 |
| Conversation link 枚举其他 Message/Conversation | 403/404 |

### 22.3 实时和文件

| 测试 | 预期结果 |
|---|---|
| 权限撤销后 SSE 重连 | 403/404，不补发事件 |
| SSE 已连接期间权限撤销 | 服务端关闭连接 |
| 旧签名 URL 过期 | 下载失败，可重新授权生成 |
| Source ID 属于其他 Draft | attach/read 请求拒绝 |
| event payload 包含 secret | 合同测试失败 |

### 22.4 高风险动作

| 测试 | 预期结果 |
|---|---|
| 非 Owner Restore | 403 + AuditLog 失败记录策略 |
| 重复 Install | 返回已有 Installation，不新建重复记录 |
| 非 Installation owner Activate | 403 |
| Publish revision 过期 | 412，不创建 SkillVersion |
| Activate 冲突 | 原 Current State 不变 |

## 23. 后端实现要求

1. 授权逻辑集中在可测试的 policy/service 层，不散落为 Controller 中的临时条件。
2. 所有资源查询默认包含当前用户可见范围，不先查出全部再由前端过滤。
3. 公开和私有响应使用明确的字段序列化策略。
4. 子资源接口验证父子关系和父资源权限。
5. 高风险写入在事务内重新检查权限、revision 和业务条件。
6. 权限错误使用稳定 error code，不返回内部策略表达式。
7. Policy 决策可记录非敏感原因码，便于测试和排障。
8. 每个 permission code 有自动化 allow/deny 测试。
9. 所有 SSE、下载和分享入口纳入同一授权体系。
10. 默认拒绝未知角色、未知 permission 和缺失关系。

## 24. 前端实现要求

1. 使用后端返回的 `permissions.actions` 决定按钮展示。
2. 不在前端根据 `owner_user_id === current_user_id` 自行复制完整授权逻辑。
3. 路由可做体验保护，但页面加载仍处理 401/403/404。
4. 权限尚未加载时不闪现危险按钮。
5. 提交收到 403 时刷新权限摘要，并按 `08-error-and-empty-states.md` 展示。
6. 不把被隐藏的按钮当作安全措施。
7. 不把 ShareLink token、access token 或签名 URL写入分析事件。
8. 权限变化时清理不再可见的缓存数据。

## 25. 仍需产品确认的问题

| 优先级 | 问题 | 当前默认处理 |
|---|---|---|
| P0 | 用户安装市场 State 后能否创建自己的派生 StateDraft | 默认不能直接编辑原 State；派生流程待定义 |
| P1 | 是否正式支持 State Viewer/Tester/Editor 共享 | 权限包预留，但首版无邀请/管理 UI |
| P1 | 是否正式支持 Skill Viewer/Editor/Publisher 共享 | 权限包预留，但首版 owner 为主 |
| P1 | State Editor 是否可以 Branch | 当前允许；Restore 仅 Owner |
| P1 | Monitor detail/logs 对 Tester/Editor 的开放范围 | 默认 summary 较宽，logs 仅 Owner |
| P1 | Public Passport 是否允许完全未登录访问 | 当前只允许明确公开字段 |
| P1 | ShareLink 是否支持密码、访问次数和下载水印 | 当前只定义 permission、expiry、revocation |
| P2 | 是否加入 Organization/Team | 当前不设计 |
| P2 | 是否提供普通用户可见的资源 AuditLog | 当前只定义后端审计，Ledger 不是完整安全审计 |

## 26. 下一份交付物

下一步建议制作 `10-file-upload-export-and-sharing.md`：统一文件上传、Source 解析、Artifact 预览/下载、导出格式、ShareLink 生命周期和存储安全规则。
