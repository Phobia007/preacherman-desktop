# 桌面源码与发布来源

自 2026-10-04 起，Windows 桌面版唯一日常开发和发布源码目录为 `D:\preacherman`。发布清单中的 `sourceWorkspace` 必须指向这里。旧 C 盘 integration worktree 只用于历史核对，不再从那里修改或发布。

## 固定入口

| 用途 | 位置 |
| --- | --- |
| 应用源码 | `apps/preacherman-demo-host` |
| 导航名称与原有路由对应 | `src/app-shell/navigationDestinations.ts` |
| 当前 Task | `src/surfaces/task/TaskExperienceSurface.tsx` |
| 当前 Gallery | `src/surfaces/gallery/ActiveTheoryGallerySurface.tsx` |
| Windows 发布构建 | 根目录 `tools/Build-DesktopRelease.ps1`；或应用目录 `npm run build:windows` |
| 现有增量 Cargo 缓存 | `E:\CodexStorage\build-cache\preacherman-integration-01a01e57\target` |
| 正式 EXE / sidecar | `apps/preacherman-demo-host/src-tauri/target/release` |
| 发布记录 | `apps/preacherman-demo-host/desktop-build-manifest.json` |
| 桌面入口 | `C:\Users\Administrator\Desktop\Preacherman Desktop Demo.lnk` |

缓存目录不是另一份开发源码。沿用既有缓存，避免重建全部依赖；不复制整棵 target，不清空 release cache。构建脚本拒绝非正式源码路径、未提交的受管源码修改和并行构建；后端未变化时复用已验证 sidecar。安装包仅在明确需要时使用 `npm run build:windows:installer`，普通迭代不生成安装包。

## 每次发布

1. 在 D 盘完成变更、相关回归和类型检查，记录源码提交。
2. 执行统一构建入口。它只生成构建产物，不把构建成功冒充桌面交付成功。
3. 备份当前 EXE、匹配 sidecar、清单并校验散列；仅保留三个完整回滚集合和清单指定的回滚对。
4. 将新 EXE 与匹配 sidecar 部署到固定 release 目录；核对快捷方式、时间和 SHA-256。
5. 通过快捷方式冷启动，检查 Home、Task、Gallery、Market（原路由 ledger）、Settings、Account、Asset、Extension，两种外观和交互、控制台、资源消耗。失败即恢复配对备份。
6. 更新并提交发布清单，运行 `tools/Prune-DesktopBackups.ps1 -Apply`，确认临时进程退出。

原有路由标识保留：Task→workspace、Gallery→market、Market→ledger。组件名称已理顺，深链、状态、动效和素材 URL 保持兼容。当前 Task 使用的 `public/gallery-v3` 暂不改名，避免连带改写其作者脚本与 URL。

## 清理边界和恢复

- 旧 D 盘未提交修改与旧原型资源，保存于 `codex/pre-cleanup-d-source-20261004`，最终保护提交 `5ec8cd611ea58067fcfa1e9e845242c3cd279496`。按文件恢复，不把旧入口整体覆盖回正式发布分支。
- 本轮清理清单、散列和测试证据在 `output/desktop-cleanup-20261004`；规划见 `desktop-cleanup-plan-2026-10-03.md`。
- Task 全流程、现有管理能力接回均延期。相关 service、bridge、类型、有效测试和可复用模块保留；未接入不能直接等同于无价值。
- 视频无损帧、Blender 备份、唯一素材、站点源码、有效编译缓存和 Git 历史保留。
- Dyan 运行时模型仍被 avatar catalog 引用，已校验并保留原 public 路径。对运行时资源的删除必须同时验证资源引用和实际包内文件，不仅看旧 worktree 是否存在。
- 历史审计文档和 Git 中仍可出现旧路径，它们属于历史证据；新的构建入口和发布清单不得以旧 worktree 为源。

发布约束仍以 `desktop-lightweight-update-contract.md` 和根目录 `AGENTS.md` 为准。
