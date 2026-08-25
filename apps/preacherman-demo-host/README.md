# Preacherman Demo Host

Preacherman Demo Host 是一个本地优先的桌面数字伙伴原型，包含响应式 Web UI、Cortana 3D Avatar、DeepSeek 对话与 PitchKit 任务、阿里云百炼实时语音以及 Tauri Windows 打包能力。

PREACHERMAN 兼容层的运行入口、能力矩阵、插件开发契约、完整演示脚本、外部依赖和交付检查见 [PREACHERMAN × Preacherman ecosystem demo](./PREACHERMAN-ECOSYSTEM-DEMO.md)。

桌面端的构建、增量更新、原生验收和失败回滚必须遵循[桌面轻量更新契约](../../docs/desktop-lightweight-update-contract.md)。该契约明确禁止重新引入运行时外置 UI 资源服务。

## 当前能力

- 自动激活并显示 3D Avatar，支持浅色、深色和不同窗口尺寸。
- 使用 DeepSeek 进行多轮文本对话和 PitchKit 生成。
- 使用阿里云百炼 Qwen ASR/TTS 进行语音识别和流式语音合成。
- 支持按住说话和自由对话两种输入模式。
- 支持 PitchKit 提案确认、执行、取消、重试和本地产物写入。
- 支持 PREACHERMAN 兼容插件、Kits/Bindings、MCP、Widget、Gamelet、Provider、Memory、外部连接、Computer/Vision 和可观测性面板。
- 插件工具可由 Agent 提案并在用户批准后执行，结构化结果会进入 TaskRun、产物和 Ledger。
- Key 只保存在本机服务端，不通过浏览器接口回显。
- 保存最近文本会话，不保存音频或 Provider Key。
- 可构建包含本地服务 sidecar 的 Windows NSIS 安装程序。

下一阶段智能对话和 A/B 协作方案见[智能协作实施计划](../../docs/superpowers/plans/2026-08-06-intelligent-agent-collaboration.md)。该计划尚未实施，当前能力以本 README 和代码为准。

## 环境要求

- Node.js 22 或更高版本
- npm
- 现代 Chromium 浏览器
- 麦克风权限（使用语音输入时）
- Rust stable 与 Windows 构建工具（仅桌面开发或 Windows 打包需要）

## 本地启动

从仓库根目录执行：

```bash
cd apps/preacherman-demo-host
npm install
npm run dev
```

启动后访问：

- 前端：`http://127.0.0.1:1420`
- 本地 Agent/语音服务：`http://127.0.0.1:8787`

如需修改服务端口，前后端必须使用同一端口：

```bash
PREACHERMAN_SERVICE_PORT=8790 npm run dev
```

然后在应用 **Settings / 设置** 中输入 `8790` 并点击“保存并测试连接”。端口的 `/api/health` 检查成功后才会保存。

> Vite 会热更新前端，但当前 Node 服务不会自动重载。修改 `server/` 下的文件后，需要在终端按 `Ctrl+C`，再重新运行 `npm run dev`。

## 配置 AI 与语音服务

推荐直接在应用的 **Settings / 设置** 页面配置：

1. 保持本地服务端口为 `8787`，或填写启动时使用的自定义端口。
2. 填入 DeepSeek API Key。
3. 填入阿里云百炼 API Key。
4. 填入华北 2（北京）的 Workspace ID。
5. 点击“保存并测试连接”。

设置页会分别显示：

- `DeepSeek`：模型访问是否成功。
- `Qwen ASR`：北京 workspace 实时识别连接是否成功。
- `Qwen TTS`：实时语音合成连接是否成功。

Key 保存到 `~/.preacherman-demo/provider-settings.json`，文件权限为当前用户可读写的 `0600`。保存后界面只显示“已配置”，不会再次返回明文。

### 获取 DeepSeek API Key

1. 登录 [DeepSeek 开放平台](https://platform.deepseek.com/)。
2. 进入 API Keys 页面并创建新的 API Key。
3. 立即复制并妥善保存 Key。
4. 确认账户有可用赠送额度或余额；API 调用可能产生费用。
5. 将 Key 填入设置页的 `DeepSeek API Key`，或配置为 `DEEPSEEK_API_KEY`。

当前默认模型是 `deepseek-v4-flash`。模型与计费以 [DeepSeek 官方文档](https://api-docs.deepseek.com/quick_start/pricing)和控制台显示为准。

### 获取阿里云百炼 API Key 和 Workspace ID

百炼控制台的新入口是：

[https://bailian.console.aliyun.com/](https://bailian.console.aliyun.com/)

配置步骤：

1. 登录百炼控制台并完成服务开通或实名认证。
2. 在右上角选择 **华北 2（北京）**。
3. 进入 API Key 页面，创建归属于目标业务空间的百炼模型 API Key。
4. 创建成功时立即复制 Key；根据控制台提示领取免费额度、充值或设置消费限额。
5. 打开右上角业务空间菜单，复制当前业务空间的 `Workspace ID`，格式通常类似 `ws-...` 或 `ws_...`。
6. 确认 API Key 与 Workspace ID 属于同一地域和同一业务空间。
7. 将二者分别填入 `DashScope API Key` 和 `DashScope 工作空间 ID（北京）`。

这里需要的是**百炼模型 API Key**，不是阿里云账号的 AccessKey ID / AccessKey Secret。不要把 AccessKey 填入应用。

官方说明：

- [获取百炼 API Key](https://help.aliyun.com/zh/model-studio/get-api-key)
- [获取 Workspace ID](https://help.aliyun.com/zh/model-studio/obtain-the-app-id-and-workspace-id)
- [地域与接入域名](https://help.aliyun.com/zh/model-studio/regions/)

### 控制台域名与运行时 API 域名

`https://bailian.console.aliyun.com/` 只用于登录、创建 Key 和管理业务空间，不能作为 ASR/TTS WebSocket 地址。

当前运行时使用：

- ASR：`wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/...`
- TTS：`wss://dashscope.aliyuncs.com/...`

阿里云目前推荐生产服务逐步使用 workspace 专属域名；`dashscope.aliyuncs.com` 仍用于现有兼容链路。不同地域的 API Key、Workspace ID 和运行时域名不能混用。

## 使用 `.env.local` 配置

也可以复制示例文件：

```bash
cp .env.local.example .env.local
```

填写：

```env
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-flash
DASHSCOPE_API_KEY=
DASHSCOPE_WORKSPACE_ID=
```

可选项：

```env
# PREACHERMAN_DATA_DIR=/absolute/path/to/private/app-data
# PREACHERMAN_SERVICE_PORT=8787
```

`.env.local` 已被设计为本机私密配置，不要提交到 Git。不要在截图、Issue、日志或聊天中发送完整 Key。

## Key 安全与费用

- 为开发环境单独创建 Key，不与生产环境共用。
- 优先配置可访问模型和 IP 白名单等最小权限。
- 在 DeepSeek 与百炼控制台设置消费限额和费用提醒。
- 怀疑泄露时立即删除或重置 Key。
- 不要运行 `npm audit fix --force` 作为常规处理；先阅读审计结果并确认升级影响。

## 常用命令

```bash
# 同时启动 UI 和本地服务
npm run dev

# 只启动 UI
npm run dev:ui

# 只启动本地服务
npm run dev:service

# 类型检查、生产构建和测试
npm run check

# Tauri 桌面开发
npm run tauri:dev
```

## Windows 安装程序

Windows 交付物是 x64 NSIS `Setup.exe`。安装包包含本地 Agent/语音服务 sidecar，终端用户不需要额外安装 Node.js。

推荐在 GitHub Actions 中手动运行 **Build Windows installer** workflow，然后下载 `Preacherman-Windows-x64-setup` artifact。推送 `v*` 标签也会触发构建。

本地 Windows 构建要求 Node.js 22、Rust stable 和 MSVC 工具链：

```powershell
npm ci
npm run build:windows
```

安装程序生成于：

```text
src-tauri/target/release/bundle/nsis/
```

当前安装程序和 sidecar 尚未代码签名，Windows SmartScreen 可能显示未知发布者警告。公开分发前应使用 Windows 代码签名证书签署两者。

## 当前限制

- PitchKit 执行器目前仍依赖固定 Demo Brief。
- 任务完成总结仍有固定模板成分。
- TTS 在 600ms 内没有收到首段音频时会回退浏览器本地语音，网络较慢时可能过早降级。
- Discord、Telegram、YouTube、Minecraft 和 Factorio 已有独立协议适配器与 fixture，但本地 Demo 默认没有注册生产 transport；缺少 transport 时会显示 `external-runtime-required`。
- 桌面截图、摄像头和外部 Vision 需要对应 Adapter；没有 Adapter 时不会伪装为可用。
- 外部插件是受信任的本地 Node.js 代码，不在沙箱中运行。安装前必须审阅来源，危险工具每次调用都需要批准。
- 默认仅允许从私有数据目录的 `plugins` 文件夹安装；额外可信根目录必须通过 `PREACHERMAN_PLUGIN_ROOTS` 显式配置，规范路径检查会拒绝目录穿越以及符号链接或 junction 越界。
- 带参数的插件工具不会把完整参数持久化到 TaskRun；失败后需从 Work 或 Plugin Manager 重新提交原参数，避免 Ledger 保存敏感输入。
- Node 本地服务没有热重载。
- Windows sidecar 已在隔离目录完成构建和健康检查；完整 NSIS 安装程序仍未代码签名，公开分发前还需要签名和安装机回归。

## 常见问题

### 页面显示“语音不可用”

确认：

- `npm run dev` 的本地服务仍在运行。
- 浏览器已经允许 `127.0.0.1:1420` 使用麦克风。
- 设置页中的 Qwen ASR 和 Qwen TTS 都显示 Connected。
- 百炼 API Key 与 Workspace ID 同属华北 2（北京）。

### 设置页 Connected，但对话显示本地兜底

Connected 只证明 Key 或连接边界可访问，不保证每一次模型推理都成功。查看对话下方的 DeepSeek 诊断标识，并确认：

- DeepSeek 账户仍有余额或额度。
- 当前模型可用。
- 修改服务端代码后已经完整重启 `npm run dev`。

### 为什么听到的是系统本地声音

当前 TTS 首音频等待时间为 600ms。阿里云连接、会话初始化和合成超过该时间时，前端会调用浏览器 `speechSynthesis` 兜底。这是已知限制，不代表百炼 Key 一定失效。

### 修改代码后为什么没有生效

前端支持热更新，Node 服务不支持。请在运行开发服务的终端执行：

```text
Ctrl+C
```

然后重新运行：

```bash
npm run dev
```

### Windows 提示未知发布者

当前测试安装包未签名。开发测试可以确认文件来自自己的 GitHub Actions artifact；对外发布前必须完成代码签名。
