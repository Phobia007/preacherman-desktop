# 桌面源码与发布清理：执行结果

第一批清理和桌面交付已完成。正式开发、构建和发布来源统一为 `D:\preacherman`；固定桌面快捷方式已更新并原生验证。Task 全流程和管理能力接回继续延期。

**同口径扫描的 D 盘工程体积由 67.38 GiB 降至 59.63 GiB，净减少 7.76 GiB。** 这是跳过联接/符号链接后的文件逻辑长度，不包含 E 盘编译缓存和 C 盘旧工作树；前后扫描均有同一个无权读取的旧模型临时子目录，未估算其体积。删除量与净减少量分开报告。

本轮执行范围为方案中的 S、A1～A6、B3/B4、C1～C5、R1/R2。旧工作树的物理退役仍受“没有独有数据”的前置条件限制，具体留存原因见下文。

## 1. 清理了什么

| 类别 | 实际处理 | 文件逻辑体积 |
| --- | --- | ---: |
| A1 历史恢复 EXE | 删除 10 个旧程序，保留恢复元数据及必要小型源码片段 | 4.436 GiB |
| A2 旧恢复验证目录 | 删除过期验证副本 | 1.082 GiB |
| A3 旧 sidecar 验证副本 | 删除 3 组已过期验证产物 | 0.267 GiB |
| A4 旧失败发布大文件 | 删除旧 EXE，保留诊断记录 | 0.444 GiB |
| A5 废弃外置 UI 发布目录 | 删除 `release/preacherman-ui`，正式应用保持内置 UI | 0.526 GiB |
| A6 旧安装包 | 删除旧 `release/bundle`；本次不生成安装包 | 0.463 GiB |
| B4 视频临时 build | 删除可重建的 build，保留工程、输入与成片 | 0.859 GiB |
| B3 过期验证证据 | 按 30 天及当前/近期/失败证据保护规则核对，没有符合保守删除条件的项目 | 0 |
| C 旧页面与组件 | 删除两代旧 Settings/Task 原型及失效入口 | 323.55 MiB |
| 发布备份留存 | 新发布验证后清理最旧一组，保留 3 组完整散列验证回滚对 | 0.717 GiB |

A 和 B4 合计 **8,671,362,580 字节（8.076 GiB），4,479 个文件**。C 合计 **339,264,261 字节，1,749 个文件**。备份修剪删除 **769,401,880 字节**。以上为各项实际移除的逻辑文件长度；新发布备份、源码保护提交、依赖同步与重建会占用空间，不能把删除合计直接当作净释放量。

旧页面包括 `public/settings-v3-local`、`task-lookback-v3`、`settings-portfolio`、`settings-template`、`task-lookback`、`sites`；旧 `src/task` 页面、旧 CortanaGallery、旧 Jesper 组件、未使用的 logo 动画和 Settings 预览入口也已移除。现行 Task 使用的 `public/gallery-v3` 保留。

## 2. 源码和发布来源如何统一

原 D 盘主工作树停在较早版本，实际桌面从 C 盘 integration worktree 发布。它们共用一个 Git 仓库；不能把旧 D 盘目录直接当成最新源码清理。

已将 D 盘工作树切换到最新桌面源码基线，再完成本轮清理。原有 D 盘未提交修改和独有旧原型内容先保存在恢复分支，没有用旧代码覆盖新版功能。

| 项目 | 结果 |
| --- | --- |
| 当前工作分支 | `codex/desktop-source-cleanup` |
| 本轮生产源码提交 | `263566bf9903210cfa1e8424fa3e6c7e6715b0e0` |
| 原 D 盘修改保护分支 | `codex/pre-cleanup-d-source-20261004` |
| 完整保护提交 | `5ec8cd611ea58067fcfa1e9e845242c3cd279496` |
| 固定构建命令 | 应用目录执行 `npm run build:windows` |
| 构建脚本 | `tools/Build-DesktopRelease.ps1` |
| 复用的缓存 | `E:\CodexStorage\build-cache\preacherman-integration-01a01e57\target` |
| 固定发布目标 | `apps/preacherman-demo-host/src-tauri/target/release/preacherman-demo-host.exe` |

构建入口要求从正式 D 盘源码运行，拒绝未提交的受管源码修改和重叠构建。普通更新不生成安装包，后端未变时复用已验证 sidecar。本轮没有清空 Cargo 缓存，没有创建新的整套 target。

C 盘 integration worktree **已停止作为发布来源，但目录尚未物理删除**。其中 `.runtime-tmp` 有 6 个与 D 盘不同或独有的状态文件，另外有运行数据目录和验证记录。未自动合并这些本地状态，也未把它们当缓存删除。其只读核对记录见 `output/desktop-cleanup-20261004/old-worktree-retention.json`。其他历史工作树也未整体删除。

## 3. 局部重构与保留边界

- 现行 Task 组件从名称误导的 `surfaces/gallery/GallerySurface.tsx` 移到 `surfaces/task/TaskExperienceSurface.tsx`，同步实际入口、预览及相关测试。
- 导航标签和原路由对应关系集中到 `app-shell/navigationDestinations.ts`。保持 Task→workspace、Gallery→market、Market→ledger，深链和已有状态保持兼容。
- 保留原素材 URL、主题桥接、进出场动效和业务行为。本轮没有借重构重做页面。
- 保留 30 个延期管理模块、相关服务和 bridge、7 个仍可复用的预览/修补工具及有效测试；“尚未接回 UI”不作为删除理由。
- 保留唯一素材、视频无损帧、Blender 上一版备份、网站工程、原恢复快照及 Git 历史。
- Dyan 模型仍有资源目录引用，已核对散列并保留原 public 路径，未因旧 worktree 缺失而误删。

部分回归测试仍引用已被历史版本替换的入口或断言。本轮将它们调整为当前部署源码的实际行为，并增加导航深链/资源入口保护检查。未通过修改产品行为来迎合旧测试。

## 4. 桌面交付与验证

| 项目 | 结果 |
| --- | --- |
| TypeScript 检查 | 通过 |
| 针对性回归 | 61 项通过、0 失败 |
| 生产构建 | 成功；前端约 8 秒，Rust release 约 97 秒 |
| 后端 | 未重编译，复用当前已验证程序 |
| 原生启动 | 通过固定快捷方式冷启动，Home 模型 ready |
| 页面覆盖 | Home、Task、Gallery、Market、Settings、Account、Asset、Extension，各检查亮/暗两种外观，共 16 次导航 |
| Task / Gallery | 首次进入出现作者内容，未依赖刷新或切换页面救活 |
| 交互 | Market 分类、搜索键盘操作、快速切换、下划线与进出场；Settings 外观入口 |
| 原生窗口按钮 | 最小化、最大化、还原、关闭均实测通过 |
| 控制台 | 无新增错误；历史远程素材 CSP 拦截仍有记录 |
| 最终启动 | 已恢复原偏好，无调试参数通过快捷方式正常重启 |
| 临时资源 | 无残留本轮构建/浏览器进程，1420/9237 无监听 |

正常重启后采样：窗口可响应；整棵桌面进程 CPU 约占全机 **4.0%**，工作集约 **1,903 MiB**，GPU 最高引擎利用率 **13%**，显存约 **3.07 GiB**。这是当前 3D 模型状态下的短时采样，不是长期性能基准。

Account 页面保留原有连接检查提示，与上一版截图一致；没有执行真实账号登录。Asset/Extension 仍为原有预留页面。此次验收证明清理后的导航、页面和桌面行为没有新增回归，不代表延期功能已经实现。

正式 EXE 从 **676,130,816 字节（644.81 MiB）** 降到 **596,244,480 字节（568.62 MiB）**，减少 **79,886,336 字节（76.19 MiB，11.82%）**。

- 新 EXE SHA-256：`9EF41785F4A12FB1CAF35CB3F90FECA35D03C470D57656EDBE38C52301EEF369`
- sidecar SHA-256：`2465A32CAF878D0D6109C0975E5254F98CC1FA27CC7202FE574F5A367F90902E`
- 当前回滚集合：`release/deployment-backups/desktop-source-cleanup-before-20261004`，包含旧 EXE、匹配 sidecar 和清单，散列已核验。

## 5. 证据与后续使用

- [正式发布记录](D:/preacherman/apps/preacherman-demo-host/desktop-build-manifest.json)
- [固定源码及发布操作说明](D:/preacherman/docs/desktop-source-and-release.md)
- [实际删除清单](D:/preacherman/output/desktop-cleanup-20261004/artifact-cleanup-result.json)
- [旧页面移除明细](D:/preacherman/output/desktop-cleanup-20261004/retired-pages.json)
- [原生验证记录](D:/preacherman/output/playwright/desktop-source-cleanup-20261004/native-report.json)
- [发布备份留存结果](D:/preacherman/output/playwright/desktop-source-cleanup-20261004/backup-retention.json)
- [完整原方案](D:/preacherman/docs/desktop-cleanup-plan-2026-10-03.md)

后续继续沿用同一源码、同一缓存和三个回滚集合的留存规则。更大体积的第二阶段需要分别处理视频中间帧、Blender 旧工程、其他工作树和历史仓库；它们的取舍与本轮可确认过期的程序副本不同，已在原方案中列明。

## 6. 为什么工程仍有约 60 GiB

| 当前一级目录 | 体积 | 本轮结论 |
| --- | ---: | --- |
| `output` | 35.72 GiB | 最大来源是模型/图像加工、语音运行依赖、视频工程和历史工作成果；文件夹名叫 output 不意味着都能重建或删除 |
| `apps` | 7.50 GiB | 包含有效程序、依赖、当前资源、现存构建缓存与 3 套回滚，不是 7.5 GiB 业务源码 |
| `.runtime-tmp` | 6.38 GiB | Audio2Face 约 3.60 GiB、speech2motion 约 1.46 GiB、原恢复快照约 1.30 GiB，继续保留 |
| `website` | 4.44 GiB | 独立网站工程，未纳入桌面旧页面清理 |
| `.codex-worktrees` | 2.80 GiB | 其他工作树，需要分别核对独有成果 |
| `.git` | 1.36 GiB | 版本与恢复记录，本轮不重写历史 |
| `asset-library` | 0.92 GiB | 原始资产与唯一素材，保留 |

`output` 内较大的独立子目录包括 Blender（4.68 GiB）、voice-runtime（3.62 GiB）、avatar-quality（3.53 GiB）、旧 GitHub 工程副本（3.26 GiB）、avatar-intake（3.11 GiB）、avatar-prepare（3.01 GiB）。这些是下一阶段逐类判定的对象，不把它们整个标为垃圾。具体目录、文件数量和大文件清单见 [清理后目录统计](D:/preacherman/output/desktop-cleanup-20261004/workspace-after.json)。
