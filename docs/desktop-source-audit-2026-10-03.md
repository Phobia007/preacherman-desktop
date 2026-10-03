**Preacherman 桌面端源码审阅报告 · 2026-10-03**

结论：项目确实存在遗留文件和维护债务，但目前最影响产品完成度的是“后端能力与当前界面脱节”。已经写出的任务、插件、MCP、记忆、连接管理没有完整进入新的主界面；磁盘占用则主要来自历史输出、运行环境、资源和构建产物。应先接通核心工作流程，再有证据地淘汰旧实现，不建议整体重写。

**1．审阅对象与可信范围**

我解析了桌面快捷方式，核对了发布清单，并重新计算了当前 EXE 和 sidecar 的 SHA-256，两者均与清单一致。正式快捷方式指向：

`D:/preacherman/apps/preacherman-demo-host/src-tauri/target/release/preacherman-demo-host.exe`

但当前发布清单的源码位置是：

`C:/Users/Administrator/.codex/visualizations/2026/08/20/01a01e57-8912-7d31-8853-13e23af6f1d1/preacherman-integration`

发布版本为 `market-brain-search-20261002`，源码提交 `097bf8b63a96ab5de6e626c86bd4cfe77c53ac59`；该源码目录当前 HEAD 是随后记录部署验证的 `8a31586`，工作区干净。不能只阅读 D 盘旧副本，便把旧页面当作今天桌面端的实现。在 `src`、`server`、`src-tauri/src`、`scripts` 范围内，两份源码有 **128 个文件存在内容或存在性差异**：17 个内容不同、100 个仅存在于发布源码目录、11 个仅存在于 D 盘副本。这不是整个仓库的差异总数。

本次完成的是源码追踪、目录盘点、导入依赖分析和文件哈希核验。没有调用付费模型、操作账户、安装插件、执行真实任务、重建桌面程序或删除文件。以下“已接入”表示存在真实调用链，不等同于本次完成了原生端到端验收。发布清单中的既往测试记录也不作为本次重新测试的结果。

证据：[当前部署清单](D:/preacherman/apps/preacherman-demo-host/desktop-build-manifest.json:1)、[源码差异清单](D:/preacherman/output/desktop-audit-20261003/source-comparison.json)。

**2．用户现在能用到什么，哪些能力还藏在后端**

| 功能 | 源码中的实际状态 | 接下来应该完成什么 |
|---|---|---|
| Home、角色展示与切换 | 有真实模型、偏好与渲染代码，不能按“装饰文件”删除 | 维持冷启动、性能和两种主题的回归检查 |
| Task 聊天 | 当前发送调用 API 聊天或 Codex 对话；有上下文限制、超时和本地记录 | 将聊天与可执行任务明确连接，增加任务状态、审批、停止、产物入口 |
| Task 的本地 Codex | 当前路径明确禁止工具、文件检查和任务创建，使用临时只读对话 | 另建带工作区和审批的执行路径，不能直接取消现有对话安全边界 |
| Settings | 16 个目录中，只有 Execution Mode 挂载了配置内容；其余 15 项只有目录/聚焦交互，没有对应配置面板 | 优先恢复 Appearance、Language、MCP、连接、插件、记忆相关设置 |
| Gallery | 角色浏览、详情和本地搜索；执行消息桥接被显式关闭 | 保持角色功能准确，不把搜索框计为 AI 对话或执行能力 |
| Market | Discover、Search、模型详情有实现；搜索读取本地页面卡片目录 | 先建立商品/资源目录数据，再做库存、权益、发布等业务 |
| Market 的 Browse / Brain / Sell / Inventory | 共用一个空内容 section，导航与过渡存在 | 按实际产品定位逐项开发内容；目前不能按已完成页面计算 |
| Asset / Extension | 返回空 main，是明确预留页 | Asset 接任务产物与用户资源；Extension 接插件/MCP 的管理与权限 |
| 账户 | GitHub 已走 Supabase OAuth 调用链；Google、Apple、Codex、Email 都只显示“尚未接入”提示 | 根据实际需求完成选定登录方式；另行定义账户与本地数据/云同步的关系 |
| 附件、Task 语音按钮 | 附件入口不读取或上传文件；语音按钮显示识别尚未配置 | 完成文件入库、读取授权、文本/图像处理，以及明确的录音与识别链路 |

对应源码：

- [Settings：菜单和唯一挂载的配置页](C:/Users/Administrator/.codex/visualizations/2026/08/20/01a01e57-8912-7d31-8853-13e23af6f1d1/preacherman-integration/apps/preacherman-demo-host/src/settings/SettingsScreen.tsx:18)；[唯一配置页的条件分支](C:/Users/Administrator/.codex/visualizations/2026/08/20/01a01e57-8912-7d31-8853-13e23af6f1d1/preacherman-integration/apps/preacherman-demo-host/src/settings/SettingsScreen.tsx:117)。
- [Task 发送聊天消息](C:/Users/Administrator/.codex/visualizations/2026/08/20/01a01e57-8912-7d31-8853-13e23af6f1d1/preacherman-integration/apps/preacherman-demo-host/public/gallery-v3/portfolio/task-conversation.js:117)；[Task 宿主消息处理](C:/Users/Administrator/.codex/visualizations/2026/08/20/01a01e57-8912-7d31-8853-13e23af6f1d1/preacherman-integration/apps/preacherman-demo-host/src/execution/useExecutionFrameBridge.ts:57)；[Codex 对话限制](C:/Users/Administrator/.codex/visualizations/2026/08/20/01a01e57-8912-7d31-8853-13e23af6f1d1/preacherman-integration/apps/preacherman-demo-host/server/codexConversation.mjs:8)。
- [Gallery 关闭执行桥接](C:/Users/Administrator/.codex/visualizations/2026/08/20/01a01e57-8912-7d31-8853-13e23af6f1d1/preacherman-integration/apps/preacherman-demo-host/src/surfaces/gallery/ActiveTheoryGallerySurface.tsx:24)；[Gallery 本地角色搜索](C:/Users/Administrator/.codex/visualizations/2026/08/20/01a01e57-8912-7d31-8853-13e23af6f1d1/preacherman-integration/apps/preacherman-demo-host/public/active-theory-gallery/gallery/conversation-bridge.js:37)。
- [Market 空分类页面](C:/Users/Administrator/.codex/visualizations/2026/08/20/01a01e57-8912-7d31-8853-13e23af6f1d1/preacherman-integration/apps/preacherman-demo-host/src/surfaces/market/MarketSurface.tsx:265)；[Market 搜索数据来源](C:/Users/Administrator/.codex/visualizations/2026/08/20/01a01e57-8912-7d31-8853-13e23af6f1d1/preacherman-integration/apps/preacherman-demo-host/src/surfaces/market/marketSearchData.ts:6)；[Asset / Extension 预留页](C:/Users/Administrator/.codex/visualizations/2026/08/20/01a01e57-8912-7d31-8853-13e23af6f1d1/preacherman-integration/apps/preacherman-demo-host/src/surfaces/FrostedSurface.tsx:1)。
- [账户入口实际行为](C:/Users/Administrator/.codex/visualizations/2026/08/20/01a01e57-8912-7d31-8853-13e23af6f1d1/preacherman-integration/apps/preacherman-demo-host/src/surfaces/account/AccountSurface.tsx:129)；[附件限制](C:/Users/Administrator/.codex/visualizations/2026/08/20/01a01e57-8912-7d31-8853-13e23af6f1d1/preacherman-integration/apps/preacherman-demo-host/public/gallery-v3/portfolio/task-conversation.js:272)；[语音提示](C:/Users/Administrator/.codex/visualizations/2026/08/20/01a01e57-8912-7d31-8853-13e23af6f1d1/preacherman-integration/apps/preacherman-demo-host/public/gallery-v3/portfolio/task-conversation.js:249)。

**3．后端已有、值得优先接回来的能力**

从服务入口向下追踪，本次统计的 **48 个后端 .mjs 模块全部可达**；没有发现“完全游离在服务入口之外”的后端模块。正则盘点至少识别到 **93 个显式 HTTP 方法/路径处理分支**，这只是处理分支下限，不是 93 项独立、成熟的功能。

| 能力 | 已存在的接口或代码 | 当前缺口与建议入口 |
|---|---|---|
| 任务生命周期 | /api/tasks、任务 commands、local-agent/start、agent runs 的取消/重试、任务 summary | 新 Task 页面没有串起任务创建到交付；恢复统一任务详情和状态 |
| 审批与产物 | taskService、执行事件映射、审批适配器、artifacts 接口 | 聊天结果、审批单和产物缺少统一可见入口；审批归 Task，交付归 Task + Asset |
| MCP 工具 | /api/mcp/config、/tools、/tools/call；旧 McpSettings | 接回设置页；展示连接状态、权限、工具列表和失败原因 |
| 插件 | 安装、卸载、启停、重载、调用接口；旧 PluginSettings | Extension 应成为用户入口，设置页处理配置 |
| 模型/媒体服务和连接 | provider catalog、models、test/invoke、connections；旧 ProviderConnectionsPanel | Execution Mode 与旧 provider 配置并存，需建立统一连接来源和能力状态 |
| 记忆与角色设定 | personas、memory remember/recall/access/audit；旧 MemoryPersonaPanel | Settings 配置访问范围，Task 展示记忆使用和来源；并确认实际存储/提供者状态 |
| 屏幕观察、DOM 与视觉 | computer-vision、observe、inspect-dom、审批接口；旧 ComputerVisionPanel | 尚需工作流入口与明确授权；依赖的外部能力要显示未配置状态 |
| 历史与可观测性 | conversations/recent、任务历史、capability events、observability；旧 ConversationLedgerScreen | 恢复统一活动记录，支持定位失败、查看产物和追踪执行者 |
| 小部件、gamelet | widgets 与 gamelets 生命周期代码及旧面板 | 优先级低于任务闭环，先保留，待有明确产品需求再接入 |

这些旧面板大多没有被当前生产 React 入口引用，属于“可复用功能资产”，不能因为用户暂时看不到就当垃圾删除。迁移时应复用接口和业务逻辑，适配当前页面、状态与主题，不必把旧界面原样搬回来。

同时，后端也并非已经拥有完全通用的智能体执行能力：

- 简单提案的默认执行路由仍可落到 `local-pitch / pitchkit`；复杂任务会转外部执行体系，涉及独立服务/环境。默认路径不能直接视为任意任务的通用执行器。
- PitchKit 在没有相应模型密钥时会生成固定演示结构。它可用于演示和测试，但应明确标记来源，不能拿模板产出证明真实模型或通用执行链路已打通。
- 模型连接测试中的工具支持探测，不等于聊天发送路径实现了工具调用循环。
- 旧会话账本只保留最近 10 条；当前 Task 聊天主要落在浏览器 localStorage，和服务器会话账本没有统一。这是数据模型问题，单独加一个“历史”按钮不能解决。

证据：[后端入口与任务接口](C:/Users/Administrator/.codex/visualizations/2026/08/20/01a01e57-8912-7d31-8853-13e23af6f1d1/preacherman-integration/apps/preacherman-demo-host/server/preachermanServer.mjs:2081)、[MCP 接口](C:/Users/Administrator/.codex/visualizations/2026/08/20/01a01e57-8912-7d31-8853-13e23af6f1d1/preacherman-integration/apps/preacherman-demo-host/server/preachermanServer.mjs:1660)、[插件接口](C:/Users/Administrator/.codex/visualizations/2026/08/20/01a01e57-8912-7d31-8853-13e23af6f1d1/preacherman-integration/apps/preacherman-demo-host/server/preachermanServer.mjs:1689)、[记忆接口](C:/Users/Administrator/.codex/visualizations/2026/08/20/01a01e57-8912-7d31-8853-13e23af6f1d1/preacherman-integration/apps/preacherman-demo-host/server/preachermanServer.mjs:1843)、[视觉与观察接口](C:/Users/Administrator/.codex/visualizations/2026/08/20/01a01e57-8912-7d31-8853-13e23af6f1d1/preacherman-integration/apps/preacherman-demo-host/server/preachermanServer.mjs:1898)、[旧活动账本](C:/Users/Administrator/.codex/visualizations/2026/08/20/01a01e57-8912-7d31-8853-13e23af6f1d1/preacherman-integration/apps/preacherman-demo-host/src/conversation/ConversationLedgerScreen.tsx:39)、[默认任务路由](C:/Users/Administrator/.codex/visualizations/2026/08/20/01a01e57-8912-7d31-8853-13e23af6f1d1/preacherman-integration/apps/preacherman-demo-host/server/execution/executionRouter.mjs:6)、[演示产出回退](C:/Users/Administrator/.codex/visualizations/2026/08/20/01a01e57-8912-7d31-8853-13e23af6f1d1/preacherman-integration/apps/preacherman-demo-host/server/agentRuntime.mjs:59)、[旧会话账本保留限制](C:/Users/Administrator/.codex/visualizations/2026/08/20/01a01e57-8912-7d31-8853-13e23af6f1d1/preacherman-integration/apps/preacherman-demo-host/server/preachermanServer.mjs:462)。

**4．冗余到底有多少**

下面三种数字不能混为一谈：开发目录占用、实际打包资源、未进入当前主界面的源码。

| 统计对象 | 实测 | 如何理解 |
|---|---:|---|
| D:/preacherman 整个目录 | 67.38 GiB；163,755 个文件 | 包含网站、模型、输出、依赖、缓存和 Git，绝不是桌面程序安装体积 |
| 其中 output | 41.45 GiB | 最大的清理审查区，但包含可能仍有用途的模型、素材、恢复记录 |
| 其中 .runtime-tmp | 7.73 GiB | 名称虽带 tmp，但包含 audio2face、speech2motion 环境，不能整目录清空 |
| 其中 website | 4.44 GiB | 独立的网站项目，与桌面无关不代表无用 |
| 其中 .codex-worktrees | 2.80 GiB | 旧工作树需先核对 Git 状态、未合并成果和引用 |
| 当前发布所用源码目录 | 4.18 GiB | 位于 C 盘，是另一份工作区；不能忽略或直接删除 |
| 当前桌面 EXE / sidecar | 644.81 / 88.87 MiB | 已核对当前部署文件哈希；不含外置运行数据 |
| 当前 public 资源 | 881.57 MiB | 大部分为实际模型、纹理、媒体和页面运行资源 |
| 未从当前主入口到达的前端模块 | 53 / 152 个 | 合计约 0.52 MiB、12,507 行；包含旧功能、预览、工具，不等于 53 个可删文件 |

**A．最明确的旧页面打包候选：合计约 110.24 MiB。**

- `public/settings-v3-local`：82.90 MiB，546 个文件。当前 Settings 已由 React 页面实现，未找到当前 src 或活跃页面对该资源目录的引用。
- `public/task-lookback-v3`：27.34 MiB，207 个文件。旧 TaskSurface 和相关预览/说明引用它；当前 Task 使用 `gallery-v3/portfolio`。

已检查当前 React 源码、活跃的 Gallery/Task/Market 公共资源以及应用构建配置中的引用。两目录仍存在于 public，并进入 dist，属于优先排查的打包残留。迁走前仍需核对预览用途、隐含入口和部署后的行为，再做冷启动、页面和动效回归。110.24 MiB 是源资源逻辑体积，不能承诺 EXE 会等量减少。

**B．字节完全相同的重复资源：约 33.56 MiB 额外副本。**

对 public 中同大小、至少 1 KiB 的文件进行 SHA-256 分组，共发现 166 组相同内容。例如两份相同视频，以及旧 settings 目录与其 site 子目录中的重复 bundle/纹理。这是可合并空间上限，必须先改所有引用。它与上述 110.24 MiB 有重叠，不能相加当作回收承诺；相同纹理在多个模型中的独立路径也可能承担资源组织作用。

**C．历史产物中值得优先审查的目录。**

| D 盘目录 | 体积 | 处置建议 |
|---|---:|---|
| output/blender | 4.68 GiB | 核对脚本/工具依赖，按需留一套工具环境，不直接算垃圾 |
| output/recovery | 4.44 GiB | 与当前已验证回滚方案核对，旧恢复材料再归档 |
| output/avatar-quality-20260911 | 3.53 GiB | 保留最终资产、源文件和必要证据；审查中间版本 |
| output/github-preacherman-ai-20260921 | 3.26 GiB | 额外仓库副本；检查未提交/未合并成果后再归档 |
| output/avatar-intake-20260911 / avatar-prepare-20260911 | 3.11 / 3.02 GiB | 检查原始素材与最终资源的对应关系，避免删除唯一源文件 |
| output/playwright | 1.93 GiB | 旧截图、追踪和验证资料可按期限保留；先排除当前任务使用 |
| release/preacherman-ui | 0.53 GiB | 已被项目合同禁止的旧外置 UI 架构残留候选；先确认部署和工具无引用 |
| release/bundle | 0.46 GiB | 旧安装包若无分发用途可归档，不影响保留正式 EXE 的目标 |

这里的 release 指 `apps/preacherman-demo-host/src-tauri/target/release`。这些行列的是“待处置对象”，不是已经证明可安全回收的总量。

特别要保留或单独核查：

- 当前发布源码 public 中约 **484.61 MiB 的角色资源**，属于产品内容。
- `output/voice-runtime` 约 **3.62 GiB**，包括语音模型权重，不因目录名 output 就失去用途。
- `.runtime-tmp/audio2face` 约 **3.60 GiB**、`.runtime-tmp/speech2motion` 约 **1.46 GiB**，应先核对是否仍为运行环境。
- Cargo 的 release/deps、release/build 等增量缓存应按项目要求保留，避免通过清缓存制造后续全量重建。
- 当前 deployment-backups 约 **2.15 GiB**，已经有三个备份目录。不得为了数字好看删掉受保护的完整回滚对；继续按项目既定脚本与哈希验证规则管理。

不能严谨地回答“67.38 GiB 里有多少全是垃圾”：目录大小不能证明生命周期已结束。当前已量化的是旧打包候选、相同字节副本和未接入模块；开发中间产物需要结合进程、引用和成果归属逐项确认。

**5．真正增加维护成本的代码问题**

1. **发布源码与常用工作目录分离。** 这会造成“改了代码，但桌面没变”，或把不同版本混在一起判断。构建配置已经为共享 node_modules 的陈旧 renderer 做了源码 alias，说明这类漂移已有实际处理成本。第一步应确定正式源码仓库/分支与唯一构建来源，再迁移已有成果。
2. **页面名称与路由身份错位。** AppShell 中 Task → workspace、Gallery → market、Market → ledger；实际 Task 组件还叫 GallerySurface。新增功能、日志和测试都容易接错页面。用明确的路由注册表统一名称，保留旧链接迁移兼容。
3. **主服务器入口过大。** preachermanServer.mjs 共 2,545 行，混合配置、服务装配、路由、审批、任务、对话和多类能力。已有独立 runtime 模块值得保留；把路由按任务、连接、MCP/插件、记忆、媒体拆出，逐段迁移即可。
4. **多代页面实现并存。** 当前 React 壳内嵌导入的页面运行时，并通过消息、DOM 选择器、旧运行时组件结构做桥接。现有动效有保留价值，但接口脆弱。应固定消息协议、就绪/错误事件和清理流程，减少对编译后组件内部结构的探查。
5. **“配置成功”“能力可用”“执行成功”混在一起。** 当前连接测试、功能目录、演示执行和真实交付处在不同层。状态应至少区分：未配置、依赖缺失、连接成功、可执行、执行中、失败、已交付，并保留提供者和产物来源。
6. **用户数据分散。** 角色偏好、聊天、搜索记录、服务器任务与记忆各有存储；账户登录也不自动意味着这些数据已按用户同步。先定义 conversationId/taskId/artifactId、归属和迁移规则，再做云同步。
7. **测试数量不能替代产品验收。** 测试目录有 176 个文件，既有真实运行时/服务测试，也有源码正则和 UI fixture 检查。这些测试有用，但无法独自证明原生桌面上的任务闭环、真实提供者、两种主题与冷启动都可用。本次未重跑整套测试。

证据：[路由与界面名称映射](C:/Users/Administrator/.codex/visualizations/2026/08/20/01a01e57-8912-7d31-8853-13e23af6f1d1/preacherman-integration/apps/preacherman-demo-host/src/app-shell/AppShell.tsx:26)、[当前页面挂载](C:/Users/Administrator/.codex/visualizations/2026/08/20/01a01e57-8912-7d31-8853-13e23af6f1d1/preacherman-integration/apps/preacherman-demo-host/src/App.tsx:430)、[源码目录 renderer alias](C:/Users/Administrator/.codex/visualizations/2026/08/20/01a01e57-8912-7d31-8853-13e23af6f1d1/preacherman-integration/apps/preacherman-demo-host/vite.config.ts:1)、[服务装配入口](C:/Users/Administrator/.codex/visualizations/2026/08/20/01a01e57-8912-7d31-8853-13e23af6f1d1/preacherman-integration/apps/preacherman-demo-host/server/preachermanServer.mjs:91)、[模型工具支持探测与聊天](C:/Users/Administrator/.codex/visualizations/2026/08/20/01a01e57-8912-7d31-8853-13e23af6f1d1/preacherman-integration/apps/preacherman-demo-host/server/executionConnections.mjs:143)。

**6．建议投入顺序与完成标准**

| 顺序 | 具体工作 | 可验收的完成标准 |
|---|---|---|
| P0 | 明确正式源码位置；列出页面—接口—存储—负责人/状态清单 | 任一已发布界面都能追溯到源码提交，避免继续双份漂移 |
| P1 | 打通 Task 创建、审批、执行、取消/重试、产物和活动历史 | 用户从桌面提交一个真实任务，审批后产生可打开产物；失败可定位；重启能找回记录 |
| P1 | 接回必要设置：Appearance/Language、模型与连接、MCP/插件、记忆 | 每个展示的目录都有有效内容；配置持久化、可撤销；缺依赖时明确说明 |
| P2 | Asset 接资源/产物；Extension 接扩展管理 | Asset 的文件有来源与打开路径；扩展安装、授权、禁用、卸载状态可追踪 |
| P2 | 统一聊天与账本；完成附件和 Task 语音 | 附件内容真正参与任务；语音有录音、识别、取消与失败反馈；历史不被割裂 |
| P2 | 明确 Market 商业目标后实现目录、库存、发布、账户权益 | 各分类对应真实数据与用户操作；本地资源目录与商品权益有明确区分 |
| P3 | 路由命名、服务器模块拆分、旧页面和依赖清退 | 每批改动小、可回退；通过调用链和回归验证后再删除旧文件 |
| 持续 | 历史产物归档与大小预算 | 生成物有用途、保留期限和清理入口；维持最新三个完整验证备份 |

建议先完成一个完整的 Task 使用场景，再扩更多目录。恢复 MCP/插件/记忆等旧功能时，不要同时把所有底层控制台堆进主界面。用户常用流程放 Task、Asset、Extension；提供者、权限和诊断放 Settings。

所有实际 UI 改动仍需遵守项目既有发布要求：亮/暗主题、原有动效和交互回归、完整自包含打包、正式快捷方式冷启动、核心导航验证、EXE/sidecar 成对回滚和备份保留。不能通过外置本地 HTTP 资源来冒充减包，也不能用仅浏览器预览的结果替代正式桌面交付。

**7．统计方法与原始证据**

磁盘统计按文件逻辑长度求和，不是 NTFS 实际分配大小；跳过符号链接/目录联接，避免重复计数。D 盘一个临时子目录无读取权限，因此 67.38 GiB 是本次可访问范围的合计；运行中的文件变化也可能造成小幅差异。GiB = 1024³ 字节，MiB = 1024² 字节。

导入分析从前端 main.tsx、后端 windowsSidecar.mjs/index.mjs 出发，包含静态相对导入和可识别的字面量导入，保守计入类型导入；不把公开资源运行时、外部 package 内部代码和独立预览入口混成一个图。因此“不可达”仅指当前主入口未到达，仍需对构建工具、预览、测试和动态引用人工分类。

- [D 盘目录大小与扫描限制](D:/preacherman/output/desktop-audit-20261003/workspace-inventory.json)
- [实际发布源码目录大小](D:/preacherman/output/desktop-audit-20261003/deployed_source-inventory.json)
- [前端导入图及 53 个待分类模块](D:/preacherman/output/desktop-audit-20261003/frontend-imports.json)
- [后端导入图](D:/preacherman/output/desktop-audit-20261003/backend-imports.json)
- [公共资源 SHA-256 重复清单](D:/preacherman/output/desktop-audit-20261003/public-duplicates.json)
- [显式 HTTP 分支盘点](D:/preacherman/output/desktop-audit-20261003/route-branches.json)
- [两份源码差异清单](D:/preacherman/output/desktop-audit-20261003/source-comparison.json)

本次仅新增审阅报告和审计脚本/结果。没有修改可运行产品代码，没有删除资源，没有改变当前桌面部署。
