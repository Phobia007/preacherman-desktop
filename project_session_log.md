# Preacherman Project Session Log

本文件按会话追加项目实施记录，供后续开发任务快速恢复上下文。

## Session 2026-08-06 - Agent、语音、桌面打包与对话链路

### Scope

- 接管现有 Preacherman 项目并确认本地启动、前端、3D 模型和桌面宿主结构。
- 实现可运行的 Agent、语音、设置、会话存储和 Windows 打包基础链路。
- 统一用户侧交互为 Preacherman，并修复多项语音和对话体验问题。
- 将本轮版本提交到用户 GitHub fork。

### Main changes

- 确认 Demo Host 由 Vite 前端和 `127.0.0.1:8787` 本地 Node 服务组成，补充统一开发启动脚本。
- 首页默认自动激活 Cortana 3D 模型，并按 1800×1000 设计基线进行等比响应式缩放。
- 设置页支持本地服务端口、DeepSeek API Key、百炼 API Key 和北京 Workspace ID 的保存与独立连接测试。
- Provider Key 仅保存在本机应用数据目录，文件权限为 `0600`，接口只返回配置状态、不回显明文。
- 新增真实 DeepSeek 对话调用、PitchKit 提案、用户确认、异步执行、验证、产物写入、取消和重试链路。
- 任务开始后 Preacherman 主动说明正在执行；任务完成后自动向对话追加总结并触发语音。
- 语音输入支持“按住说话”和“自由对话”两种模式，并记住用户选择。
- 自由对话采用持续监听和服务端 VAD；增加静音阈值、短转写过滤、等待回复状态和最长空闲时间。
- TTS 播放期间暂停自由监听，播放结束后自动恢复，降低自听自答和回声误触发。
- TTS 音频能量驱动 Avatar jaw cue，并同步 listening、speaking、idle 等模型状态。
- 用户界面移除 A/B 自称，主对话统一显示 Preacherman；后台执行者显示为 PitchKit 执行助手。
- 新增本地会话账本、最近会话页面和“新对话”功能；新会话生成独立 ID，旧会话保留。
- DeepSeek 对话现在携带最近历史；非 JSON 的有效模型回复不再被丢弃，并显示 DeepSeek/本地兜底诊断来源。
- 新增 Windows Tauri NSIS 配置、Node SEA sidecar、Windows service bootstrap、打包脚本和 GitHub Actions workflow。
- Windows 安装包目标为 x64 `Setup.exe`，安装后不要求用户额外安装 Node.js。
- GitHub 已登录账号 `smxm`，创建 fork `smxm/preacherman-`，当前版本位于分支 `codex/agent-voice-updates`。
- 本轮代码提交：`11e9f1f feat: add agent voice coordination runtime`。

### Verification

- 文档提交前重新执行 `npm run check`：typecheck、Vite production build 和 71 项测试全部通过，0 failed。
- `git diff --check` 在代码版本推送前通过。
- Provider 设置页曾实际显示 DeepSeek、Qwen ASR 和 Qwen TTS 均为 Connected。
- Windows 构建配置和架构测试通过，但未在当前 Mac 上实际生成 Windows `Setup.exe`。

### Outstanding follow-ups

- 真实服务尚未完全接入仓库中的 A/B v1 协议，当前仍保留简化的 proposal/run 状态实现。
- B 当前主要接收目标文本和固定 PitchKit Demo Brief，尚未消费完整会话上下文、成功标准和动态约束。
- 完成总结仍包含前端固定模板，A 尚未读取 B 的真实产物后再总结。
- 阿里云 TTS 等待首段音频仅 600ms，网络稍慢时会过早降级为浏览器本地语音。
- `scripts/dev.mjs` 不监听 Node 服务源码；修改服务端后必须停止并重新运行 `npm run dev`。
- Windows 安装包尚未在 Windows runner 或本地 Windows 环境实际产出并人工安装验证。
- 安装包和 sidecar 尚未代码签名，公开分发时可能出现 SmartScreen 警告。
- “智能对话与 A/B 协作升级计划”尚未实施，详见 `docs/superpowers/plans/2026-08-06-intelligent-agent-collaboration.md`。

### Files touched

- Agent 与服务：`apps/preacherman-demo-host/server/`、`src/ab/`、`src/conversationLedger.ts`。
- 语音与 Avatar：`src/realtime/`、`packages/preacherman-avatar-renderer/src/`。
- 设置与 UI：`src/settings/`、`src/gallery/`、`src/styles.css`、`src/app-shell/`。
- Windows：`src-tauri/`、`scripts/build-windows-sidecar.mjs`、`.github/workflows/windows-installer.yml`。
- 测试：`apps/preacherman-demo-host/tests/`。
