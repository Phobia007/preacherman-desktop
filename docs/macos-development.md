# Mac 开发与本机部署

本仓库的 Mac 入口是 `apps/preacherman-demo-host`。Windows 打包配置保持独立；macOS 使用 `tauri.macos.conf.json`，产出包含前端、模型、媒体和本地 Node 服务的 `.app`。

Windows 和 Mac 共用自适应窗口策略：启动时最大化到当前屏幕可用区域（保留系统菜单栏、Dock 或任务栏）。主界面和开场动画按实际窗口比例填满画布，保留元素等比缩放，避免固定 1800×1000 画布产生留边；可用右上角按钮还原窗口后拖动调整尺寸。1280×800 仅作为还原窗口的默认尺寸，不是固定渲染分辨率。

## 首次安装

需要 Node.js 22.12+、npm、Rust stable 和 Xcode Command Line Tools。Apple Silicon 应使用原生 arm64 Node / Rust。

```bash
bash tools/setup-macos.sh
```

脚本先安装并构建三个本地组件包，再安装主应用，避免首次安装时本地依赖的 `prepare` 找不到 TypeScript。网络需要代理时，可在当前终端设置 `HTTP_PROXY`、`HTTPS_PROXY`、`npm_config_proxy` 和 `npm_config_https_proxy`；不要把某台机器的代理端口写入全局项目配置。

## 开发

```bash
cd apps/preacherman-demo-host
npm run tauri:dev
```

该终端管理 Tauri、Vite（127.0.0.1:1420）和本地服务（127.0.0.1:8787）。使用 Ctrl+C 停止。启动前退出正式版，避免本地服务端口冲突。前端支持热更新；修改 `server/` 后需重启。开发数据位于仓库 `.runtime-tmp/preacherman-data`。

仅浏览器开发可运行 `npm run dev`。无需另开第二套服务。

## 构建正式应用

```bash
cd apps/preacherman-demo-host
npm run build:macos
npm run verify:macos
```

输出为 `src-tauri/target/release/bundle/macos/Preacherman Desktop Demo.app`。构建使用当前 Node 架构生成 sidecar，正式应用可从 Finder 启动，无需运行 Vite 或另开 Node 服务。UI 资源仍由 Tauri 打包，不通过本地 HTTP 资源服务器加载。

本机开发使用 ad-hoc 签名和 Hardened Runtime。内置 Node/V8 服务需要 `Entitlements.macos.plist` 中的 `com.apple.security.cs.allow-jit`；否则 Tauri 重新签名后的服务会报 `Failed to reserve virtual memory for CodeRange`。`verify:macos` 检查最终签名后的 bundle 中的服务、健康接口和原生来源 CORS，并清理临时进程与数据。相关机制见 [Apple JIT 权限](https://developer.apple.com/documentation/BundleResources/Entitlements/com.apple.security.cs.allow-jit) 和 [Tauri macOS 打包](https://v2.tauri.app/distribute/macos-application-bundle/)。对外分发所需的 Developer ID 签名和 Apple 公证尚未配置。本次不创建 DMG，也不发布 GitHub release。

正式应用的本地配置默认在 `~/.preacherman-demo`。Windows 机器上的私密配置不会随 Git 仓库同步。当前 Settings 页面大部分选项仍是原型入口，实际接通的是 Execution Mode；Appearance 目前没有主题切换控件。开发服务可以用 `.env.local` 配置密钥，正式应用后续需要迁移私密 Provider 配置或完善设置入口。不要把密钥提交到 Git。

## 迁移边界

- Git 仓库中的模型、字体、页面和媒体随应用打包。
- DeepSeek Harness 是外部运行时，仓库仍有 `D:\deepseek-harness` 默认路径；复杂任务执行需要单独迁移该运行时和配置。
- Audio2Face / speech2motion 等外部服务不由本次 `.app` 构建自动安装。
- Supabase 登录依赖原项目的远端服务和网络，本次没有修改云端配置或迁移账户。
- 原 `desktop-build-manifest.json` 记录 Windows 部署；Mac 验证记录使用 `desktop-build-manifest.macos.json`，不冒充已更新 Windows 快捷方式。

## 本次验证

以 `aeab7a8` 为来源。Node 24.14.1、Rust 1.97.1、macOS arm64。

- TypeScript 检查通过，前端生产构建通过。
- Mac sidecar 构建、签名验证和独立 `/api/health` 检查通过；缺少 AI/语音密钥时如实返回未配置。
- 全量测试首次执行：691 项，657 通过、33 失败、1 跳过。其中一个 Windows-only 启动断言已随 Mac 支持更新，对应两项打包回归测试通过。其余失败涉及已有 UI/架构断言、外部 Harness 缺失、Windows 脚本和 macOS 路径规范化，未宣称全量测试通过。
- 原生界面与最终安装结果见 Mac 部署清单。
- Home、Task、Gallery、Market（内部路由 ledger）、Settings、Account 已在 Mac 原生窗口逐项打开；缩窄窗口后模型无拉伸、控件保留在窗口边缘。Windows 实机、多显示器切换、深色模式切换和 WebView 控制台仍未完成原生验证，不宣称跨平台全部通过。

增量更新时保留 `src-tauri/target`；不要同时运行多套 Rust/Tauri 构建。

## 渲染帧率

Gallery 两个打包入口已取消按 GPU 等级施加的约 30 / 60 / 100 FPS 上限，跟随 WebView 的 `requestAnimationFrame` 显示节奏。该修改是 Windows / Mac 共用代码。首页模型原本即使用连续逐帧渲染；动画素材采样率和界面特效的局部更新频率不是整个桌面的帧率上限。实际 FPS 仍由显示器刷新率、WebView 与场景渲染耗时决定，本次未测得原生窗口的具体 FPS。

本轮帧率更新沿用已安装应用的签名权限：构建时显式使用 `--config '{"bundle":{"macOS":{"entitlements":null}}}'`。JIT 权限配置仍是待批准草案，未部署；本地服务的签名问题仍未解决。
