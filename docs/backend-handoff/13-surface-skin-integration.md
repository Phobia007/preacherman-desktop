# 13. Surface Skin 前端接入规范

## 1. 文档目的

本文件把外部 UI 设计接入 Preacherman 的方式固定为可执行的工程合同。它用于约束前端实现、后端接口接线和代码评审，避免把视觉稿直接改写进现有业务页面后造成架构分叉。

规范关键词：

- `必须`：不满足即不能合并。
- `不得`：明确禁止的接入方式。
- `建议`：允许按仓库现状调整，但需要保留同等边界。

## 2. 已确认技术路线

| 项目 | 结论 |
|---|---|
| UI 技术栈 | React + TypeScript |
| 构建方式 | Vite library package |
| 主接入接口 | `SurfaceSkinAdapter` |
| 页面驱动 | `SurfaceManifest` |
| 运行时访问 | 只通过 `tauriClient.ts` 的 Tauri command facade |
| 样式接入 | 独立 UI package + token bridge，不重写现有页面 CSS |
| 主框架禁用 | Vue、Svelte、iframe 不得作为主接入方式 |

## 3. 不允许的实现

以下做法直接视为架构不合格：

1. 把整套 UI JSX 直接塞入 `AgentPage`、`HomePage`、`SkillsPage` 等业务页面。
2. 为了复刻设计稿，大面积覆盖或重写 Preacherman 现有页面 CSS。
3. 让 renderer、页面组件或外部 UI package 直接调用 Tauri runtime、Rust command 或底层 IPC。
4. 绕过 `SurfaceManifest -> projection -> registry -> renderer` 链路自行选择页面。
5. 用 iframe 包住整套 UI 作为正式产品接入方案。
6. 在 library package 内打包第二份 React 或 React DOM。
7. 让外部 package 自己保存 access token、文件系统路径或 runtime handle。

## 4. 两条核心链路

### 4.1 注册和渲染链路

```text
外部 React/TS UI package
  -> token bridge
  -> renderer wrappers
  -> SurfaceSkinAdapter
  -> Preacherman Surface Registry

运行时：
SurfaceManifest
  -> projection
  -> Surface Registry
  -> renderer wrapper
  -> SurfaceSkinAdapter
  -> React surface view
```

`SurfaceManifest` 是页面渲染事实源。业务页面只提供承载 Surface 的位置，不直接包含整套外部 UI 的业务实现。

### 4.2 用户动作和运行时链路

```text
React surface view
  -> adapter action callback
  -> host SurfaceCommand bridge
  -> tauriClient.ts
  -> Tauri command facade
  -> runtime
```

响应沿原链路返回，并由 projection 转成 renderer 所需的 ViewModel。外部 UI package 不知道 Rust command 名称，也不持有 runtime 引用。

## 5. 包边界

建议包名使用仓库现有命名规则；本文用 `@preacherman/surface-skin` 作为示例。

```text
packages/surface-skin/
  src/
    adapter/
      createSurfaceSkinAdapter.ts
      types.ts
    renderers/
      SurfaceRenderer.tsx
      wrappers/
    surfaces/
      home/
      workspace/
      lab/
      test/
      market/
      ledger/
    tokens/
      bridge.ts
      contract.ts
    actions/
      contract.ts
    styles/
      index.css
    index.ts
  vite.config.ts
  tsconfig.json
  package.json
```

包的正式输出至少包括：

- ESM JavaScript。
- TypeScript declaration files。
- 独立样式入口或由宿主明确加载的 CSS。
- `SurfaceSkinAdapter` factory。
- renderer 和 token/action 的公共类型。

`react`、`react-dom` 必须是 `peerDependencies`，并在 Vite library build 中 externalize。

## 6. SurfaceSkinAdapter 合同

以下是接口形状示例。实际字段名可以适配现有仓库类型，但职责不得改变。

```ts
import type { ComponentType } from "react";

export interface SurfaceSkinAdapter {
  readonly id: string;
  readonly version: string;
  supports(manifest: SurfaceManifest): boolean;
  createRenderer(context: SurfaceRendererContext): ComponentType<SurfaceRendererProps>;
}

export interface SurfaceRendererContext {
  tokens: SurfaceSkinTokens;
  host: SurfaceHostBridge;
}

export interface SurfaceRendererProps {
  manifest: SurfaceManifest;
  projection: SurfaceProjection;
}

export interface SurfaceHostBridge {
  execute(command: SurfaceCommand): Promise<SurfaceCommandResult>;
  subscribe?(subscription: SurfaceSubscription): () => void;
}
```

责任分配：

| 层 | 负责 | 不负责 |
|---|---|---|
| `SurfaceManifest` | 声明 surface 类型、版本、能力和数据引用 | JSX、CSS、runtime 调用 |
| projection | 把领域数据转换为稳定 ViewModel | 视觉组件实现 |
| Surface Registry | 按 manifest 和 adapter 能力选择 renderer | 业务命令执行 |
| renderer wrapper | 连接 manifest/projection、token、action 和 React view | 直接调用 runtime |
| `SurfaceSkinAdapter` | 注册支持范围并创建 renderer | 绕过 registry 改页面路由 |
| external UI package | 视觉、布局、组件状态和无副作用交互 | Tauri/Rust/runtime 访问 |
| `tauriClient.ts` | 实现 host command facade | 页面视觉和 renderer 选择 |

## 7. Manifest 与 Projection 规则

1. renderer 只读取 manifest 和 projection，不临时拼装领域查询。
2. manifest 必须带 schema/version，adapter 只声明自己真正支持的版本。
3. 新字段优先以可选字段演进；不兼容变化提升 manifest schema version。
4. 未知 surface type 或不支持的版本必须进入宿主 fallback renderer，不得白屏。
5. projection 输出必须可序列化、可做 fixture、可在无 Tauri runtime 的测试中渲染。
6. 页面标题、导航状态和权限动作应由 manifest/projection 提供稳定标识，不通过视觉文字反向猜测业务状态。

## 8. Token Bridge

外部 UI 保留自己的组件结构，但颜色、字体、间距、边框、阴影和动效参数必须通过 token bridge 接入宿主。

```ts
export interface SurfaceSkinTokens {
  color: {
    canvas: string;
    surface: string;
    text: string;
    muted: string;
    border: string;
    accent: string;
    success: string;
    warning: string;
    danger: string;
  };
  typography: {
    sans: string;
    serif: string;
  };
  motion: {
    durationFast: number;
    durationNormal: number;
    durationAmbient: number;
    reduceMotion: boolean;
  };
}
```

实现要求：

- token bridge 负责从 Preacherman token 转换为 skin token。
- CSS 变量使用包级前缀，例如 `--pm-skin-*`。
- 不覆盖 `html`、`body` 或现有业务页面的全局 class。
- 动效必须读取 `reduceMotion`；缓慢环形动效在减少动态效果时应停止或降级。
- token 缺失时使用 package 内的安全 fallback，并记录开发期警告。

## 9. Renderer Wrapper

每个 wrapper 只做四件事：

1. 接收 Registry 选中的 manifest 和 projection。
2. 把宿主 token 映射为 skin token。
3. 把 UI action 映射为稳定 `SurfaceCommand`。
4. 把 loading、success、error 和实时事件结果重新投影给 React view。

wrapper 不应包含具体 Tauri command 字符串，不应读取数据库，也不应复制页面级权限逻辑。

## 10. tauriClient.ts 边界

宿主提供 `SurfaceHostBridge` 的实现，内部统一调用 `tauriClient.ts`。例如：

```ts
export function createSurfaceHostBridge(tauriClient: TauriClient): SurfaceHostBridge {
  return {
    execute(command) {
      return tauriClient.executeSurfaceCommand(command);
    },
    subscribe(subscription) {
      return tauriClient.subscribeToSurface(subscription);
    },
  };
}
```

强制规则：

- 页面、renderer wrapper 和 external UI package 都不得直接 import runtime 模块。
- `tauriClient.ts` 负责 command facade、序列化、错误标准化、超时和取消。
- UI 只处理稳定业务错误码，不解析 Rust 错误文本。
- 实时订阅仍遵守现有事件 envelope、断线恢复和去重规则。

## 11. 已确认业务行为在 Surface 中的落点

| 行为 | Surface UI | Command/结果要求 |
|---|---|---|
| Restore State | Ledger Surface 二次确认 | 只返回新 `StateDraft`；Current State 不变；随后导航 Lab |
| Activate State | Lab Surface 明确激活 | 原子替换用户唯一 Current State |
| Use this Result | Result Surface 打开保存位置选择器 | 用户提交 `workspace_id`、`parent_item_id`；不得使用固定路径 |
| Install State | Market/Passport Surface | 只创建 inactive Installation；由用户到 Lab 激活 |
| 新 State 测试完成 | Test Surface | 不自动发布 |

## 12. Vite Library 构建要求

```ts
// vite.config.ts，示意
export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
    },
  },
});
```

构建产物必须：

- 可被 Preacherman workspace 以 package dependency 引入。
- 不依赖 iframe URL 或外部 dev server。
- 不包含第二份 React runtime。
- 不在 import 时执行 Tauri、DOM 查询或网络副作用。
- 提供 `.d.ts`，使 Registry 与 adapter 的不兼容在 TypeScript 编译期失败。

## 13. 接入步骤

1. 在实际前端仓库确认 `SurfaceManifest`、projection、Registry、renderer 和 `tauriClient.ts` 的真实路径与类型。
2. 建立独立 React/TS Vite library package，不修改业务页面视觉 CSS。
3. 为宿主 token 建立单向 token bridge。
4. 用现有 manifest fixture 实现第一个 renderer wrapper。
5. 实现 `SurfaceSkinAdapter` 并注册到 Surface Registry。
6. 用 host bridge 把 UI action 转到 `tauriClient.ts`。
7. 增加 unsupported manifest fallback、错误态、loading 和 reduced-motion 测试。
8. 再按 Surface 类型逐批迁移，不做一次性页面替换。

## 14. 测试与合并门槛

至少覆盖：

| 测试 | 验收 |
|---|---|
| package build | Vite library build 和 declaration build 通过 |
| React 单例 | bundle 不包含 React/React DOM |
| manifest compatibility | 支持版本正常渲染；未知版本进入 fallback |
| token bridge | 完整 token、缺失 token、dark/light 或现有主题策略均稳定 |
| runtime boundary | package、page、renderer 无 runtime 直接 import |
| action routing | 所有副作用动作经过 host bridge 和 `tauriClient.ts` |
| permissions | projection 未授权的动作不渲染；服务端拒绝仍正确处理 |
| error/loading/empty | 不白屏、不丢输入、可恢复 |
| motion | 普通模式动效正常；reduced-motion 下停止/降级 |
| visual regression | 关键 Surface 与 Figma 参考图做桌面尺寸截图比对 |

建议增加静态规则：禁止 `packages/surface-skin` 和 renderer wrapper import runtime/Tauri 底层模块。

## 15. 需要实际前端仓库补齐的信息

当前工作区已经生成独立 `packages/preacherman-surface-skin` 基础包，包括 adapter、token bridge、renderer wrapper、fallback、scoped CSS、Vite library build 和架构测试。由于工作区没有 Preacherman 正式前端/Tauri 源码，仍不能完成真实 Registry 与 `tauriClient.ts` 接线。进入正式仓库集成前需要后端/前端仓库提供：

1. `SurfaceManifest` 类型与示例。
2. projection 接口和至少一个正式 fixture。
3. Surface Registry 注册 API。
4. renderer props 和 fallback 约定。
5. `SurfaceSkinAdapter` 当前接口定义；若尚未落地，需要由双方确认本文件的接口草案。
6. `tauriClient.ts` 的公开 command facade，不需要暴露 runtime 实现。
7. token 源和主题切换方式。
8. monorepo package manager、构建和测试命令。

以上信息齐全后，基础 package 即可从“独立可构建”进入“真实 Registry 可合并”阶段。
