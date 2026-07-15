# 14. 工程交付与后端接入清单

## 1. 交付状态

截至 2026-07-15，当前交付已经包含：

| 交付物 | 状态 | 数量/结果 |
|---|---|---|
| 人类可读产品与工程文档 | 完成 | `02` 至 `14` |
| HTTP OpenAPI | 完成 | 128/128 Operation |
| 稳定错误码 | 完成 | 31 个 |
| HTTP 成功示例 | 完成 | 128 个 |
| Event Registry | 完成 | 56 个 event type |
| Event JSON Schema | 完成 | 1 个 Envelope、1 个 Union、56 个 Variant |
| Event fixture | 完成 | 56 个合法、9 个非法 |
| TypeScript 合同 | 完成 | HTTP、Error、Event 类型可重复生成并编译 |
| HTTP Mock | 完成 | 从 bundled OpenAPI 读取正式示例 |
| SSE Fixture Server | 完成 | normal、duplicate、resume、disconnect、cursor-expired |
| Provider 校验 | 完成 | HTTP response 和 Event fixture 校验器 |
| Compatibility 校验 | 完成 | 删除 Operation、删除成功响应、新增必填字段会失败 |
| GitHub Actions | 完成 | 合同与 Surface Skin 两个 Job |
| React/Vite Surface Skin package | 完成基础包 | ESM、`.d.ts`、scoped CSS、adapter、token bridge、renderer wrapper |

## 2. 发送给后端的目录

把以下目录保持原结构交付：

```text
docs/backend-handoff/
contracts/
packages/preacherman-surface-skin/
.github/workflows/contracts.yml
```

不要包含：

```text
**/node_modules/
**/.DS_Store
packages/preacherman-surface-skin/dist/  # 后端可通过 npm run build 重建
```

`contracts/dist/openapi.bundle.yaml` 和 `contracts/generated/typescript/` 是正式机器交付物，应一同提交并由 CI 检查生成漂移。

## 3. 后端首先检查的文件

| 用途 | 文件 |
|---|---|
| 产品规则和流程 | `03-user-flows.md` |
| 所有点击与后端依赖 | `04-interaction-matrix.xlsx`、`04-interaction-matrix.csv` |
| 数据实体和字段 | `05-data-dictionary.md` |
| 128 个 API 人类说明 | `06-api-requirements.md` |
| SSE、重连、顺序、终态 | `07-realtime-and-async-events.md` |
| 错误、Loading、Empty | `08-error-and-empty-states.md` |
| 权限和角色 | `09-permissions-and-roles.md` |
| 上传、下载、导出、分享 | `10-file-upload-export-and-sharing.md` |
| Audit、日志、埋点 | `11-observability-audit-and-analytics.md` |
| 机器合同实施状态 | `12-openapi-and-event-schema-plan.md` |
| Surface Skin 架构边界 | `13-surface-skin-integration.md` |
| HTTP 机器事实源 | `contracts/dist/openapi.bundle.yaml` |
| Event 机器事实源 | `contracts/events/event.schema.json` |
| 前端生成类型入口 | `contracts/generated/typescript/index.ts` |
| 独立 UI package | `packages/preacherman-surface-skin/` |

## 4. 后端本机验收命令

### 4.1 HTTP、Event、Mock、类型和兼容性

```bash
cd contracts
npm ci
npm run contracts:check
```

预期：

- API Registry 为 128。
- Error Registry 为 31。
- Event Registry 为 56。
- HTTP examples 为 128。
- Event valid fixtures 为 56，invalid fixtures 为 9。
- TypeScript typecheck 通过。
- Provider samples 通过。
- Compatibility gate 通过。
- Secret scan 通过。
- 45 项自动测试通过。

### 4.2 独立 React/TS UI package

```bash
cd packages/preacherman-surface-skin
npm ci
npm run check
```

预期：

- TypeScript strict typecheck 通过。
- Vite library build 通过。
- 输出 ESM、declarations 和 scoped CSS。
- React/React DOM 不进入 bundle。
- 无 Tauri/runtime 直接 import。
- 无 `html`、`body`、`:root` 全局 CSS 覆盖。
- 未支持的 Manifest 版本进入 fallback。

## 5. 后端必须继续保持的边界

```text
SurfaceManifest
  -> projection
  -> Surface Registry
  -> renderer wrapper
  -> SurfaceSkinAdapter
  -> React Surface View

React action
  -> SurfaceHostBridge
  -> tauriClient.ts
  -> Tauri command facade
  -> runtime
```

不得：

1. 用 Vue、Svelte 或 iframe 作为主接入方式。
2. 把整套外部 UI 直接放进 `AgentPage`、`HomePage`、`SkillsPage`。
3. 把设计稿重写成 Preacherman 现有页面 CSS。
4. 让业务页面、renderer 或外部 UI package 直接调用 runtime/Tauri。
5. 绕过 `SurfaceManifest -> projection -> registry -> renderer`。

## 6. 已确认业务规则

| 动作 | 正确结果 | 禁止结果 |
|---|---|---|
| Restore State | 创建新的 StateDraft，进入 Lab 供用户选择 | 自动激活、替换 Current State、删除历史版本 |
| Activate State | 在 Lab 原子替换用户唯一 Current State | 同时出现两个 Current State |
| Install State | 创建 `installed_inactive` Installation | 安装后自动激活 |
| Use This Result | 先让用户选择 Workspace 和目标容器，再保存 | 静默写入固定默认路径 |
| Save & Re-test | 直接创建新的 TestRun | 自动 Publish/Activate |
| 新 State 测试成功 | 只生成 TestResult | 自动发布 |

“用户只能同时拥有一个 State”在当前合同中表达为：同一用户只有一个 Current State，可以存在尚未激活的 Installation。这与 Install 后进入 Lab 手动激活的流程一致。

## 7. Provider 合同接入

后端测试把真实 controller/service 输出转换为脱敏 fixture：

```json
{
  "kind": "http",
  "api_id": "API-010",
  "status": 200,
  "body": {}
}
```

或：

```json
{
  "kind": "event",
  "event": {}
}
```

然后执行：

```bash
node scripts/validate-provider-fixtures.mjs /path/to/backend/provider-fixtures
```

Fixture 必须脱敏，不得包含 access token、密码、API key、私有 Source 全文、用户对话或隐藏 prompt。

## 8. Frontend Consumer 接入

前端应从以下入口导入稳定常量与类型：

```ts
import type {
  ApiId,
  EventEnvelope,
  EventType,
  PreachermanEvent,
  StableErrorCode,
} from "./contracts/generated/typescript";
```

不得在页面中手写 API-ID、event type 或错误码副本。生成命令为：

```bash
cd contracts
npm run generate:typescript
npm run generated:typecheck
```

## 9. SurfaceSkinAdapter 接入步骤

1. 在 Preacherman 实际仓库中确认 `SurfaceManifest`、projection、Registry 和 renderer 的真实类型。
2. 用 host adapter 把这些真实类型转换为 package 的公共接口。
3. 用现有 token 源调用 `bridgeSurfaceTokens`，不覆盖业务页面 CSS。
4. 由 `Surface Registry` 注册 `createSurfaceSkinAdapter()` 的返回值。
5. `SurfaceHostBridge.execute()` 内部只调用 `tauriClient.ts` facade。
6. 逐个 Surface 注册正式 renderer，不直接改写业务页面。
7. 将实际 backend response 和 event fixture 加入 provider test。
8. 将实际 frontend client 加入 consumer test。

## 10. 仍需真实 Preacherman 仓库提供的输入

当前工作区没有 Preacherman 正式前端和 Tauri 源码，因此以下四项只能在真实仓库中完成：

1. 将 package 接入真实 Surface Registry。
2. 把真实 `SurfaceManifest`/projection 类型映射到公共 package 类型。
3. 用真实 token 源替换默认 fallback token。
4. 用真实 `tauriClient.ts` 实现 `SurfaceHostBridge`，并增加 backend provider/frontend consumer 测试入口。

这四项是“仓库接线”，不是设计或合同缺失。完成后即可进入真实应用联调。

## 11. 最终发送前勾选

- [ ] Figma 文件已设置正确查看权限。
- [ ] `docs/backend-handoff` 已完整发送。
- [ ] `contracts/package-lock.json` 已发送。
- [ ] `contracts/dist/openapi.bundle.yaml` 已发送。
- [ ] `contracts/events` 和 `contracts/examples/events` 已发送。
- [ ] `contracts/generated/typescript` 已发送。
- [ ] `packages/preacherman-surface-skin/package-lock.json` 已发送。
- [ ] `.github/workflows/contracts.yml` 已发送。
- [ ] 未发送 `node_modules`、`.DS_Store`、真实用户数据或密钥。
- [ ] 后端已成功运行两条 `npm ci` 和两条验收命令。
