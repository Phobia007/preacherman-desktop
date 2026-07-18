# Static Hologram Avatar Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Place the validated static hologram avatar at full-body scale in the current cleared Home/Workspace center, while preserving the existing 2D first-paint/fallback behavior on legacy HomeVessel screens.

**Architecture:** An independent peer-dependency renderer package owns Three/R3F/Drei and resource lifetime. Demo Host owns concrete dependencies, local public assets, URL construction, and the injected component; Surface Skin owns only a non-serializable `AvatarSlot` seam, the centered Workspace stage, and the legacy Home visual stack.

**Tech Stack:** React 18.3.1, ReactDOM 18.3.1, Three 0.185.1, React Three Fiber 8.18.0, Drei 9.115.0, TypeScript 5.8.3, Vite 6.4.3, Node 22.12.0, Tauri 2.11.4.

## Global Constraints

- Work on `main` from `e57c536992e47086d8ea189ddc75af832343737f`; do not push.
- Treat the Viewer V0 and Runtime V0 source workspaces as read-only, and keep their machine-specific paths out of tracked files.
- Keep React at 18.3.1 and do not patch `node_modules`.
- Do not change Home/Workspace elements outside the new centered Avatar stage and the required legacy HomeVessel layer-order declarations.
- Do not add avatar motion, camera controls, diagnostics, backend, filesystem permission, remote domains, Contracts checks, full Cargo tests, GitHub Actions, or full-page pixel QA.
- Run each behavior through a red-green test cycle before production implementation.

---

### Task 1: Independent Avatar Renderer Package

**Files:**
- Create: `packages/preacherman-avatar-renderer/package.json`
- Create: `packages/preacherman-avatar-renderer/package-lock.json`
- Create: `packages/preacherman-avatar-renderer/tsconfig.json`
- Create: `packages/preacherman-avatar-renderer/tsconfig.build.json`
- Create: `packages/preacherman-avatar-renderer/vite.config.ts`
- Create: `packages/preacherman-avatar-renderer/src/index.ts`
- Create: `packages/preacherman-avatar-renderer/src/types.ts`
- Create: `packages/preacherman-avatar-renderer/src/AvatarErrorBoundary.tsx`
- Create: `packages/preacherman-avatar-renderer/src/AvatarViewport.tsx`
- Create: `packages/preacherman-avatar-renderer/src/AvatarScene.tsx`
- Create: `packages/preacherman-avatar-renderer/src/AvatarModel.tsx`
- Create: `packages/preacherman-avatar-renderer/src/hologramMaterial.ts`
- Create: `packages/preacherman-avatar-renderer/src/resourceLifecycle.ts`
- Create: `packages/preacherman-avatar-renderer/src/avatar-renderer.css`
- Create: `packages/preacherman-avatar-renderer/tests/public-api.test.mjs`
- Create: `packages/preacherman-avatar-renderer/tests/resource-lifecycle.test.mjs`
- Create: `packages/preacherman-avatar-renderer/tests/load-failure.test.mjs`

**Interfaces:**
- Produces: `AvatarViewport`, `AvatarViewportProps`, `AvatarLoadState`, `AvatarError`, `AvatarPerformanceSnapshot`.
- Consumes: asset root ending in `/`, with `cortana-runtime-v0.glb` and `shader/<locked-name>.png`.

- [ ] **Step 1: Write failing package contract tests**

Assert exact peer dependency ranges, forbidden-import absence, public export names, transparent/pointer-inert Canvas configuration, no controls/diagnostics/`forceContextLoss`, and capped DPR.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test packages/preacherman-avatar-renderer/tests/*.test.mjs`

Expected: failure because package files and exports do not exist.

- [ ] **Step 3: Add minimal package configuration and public types**

Use peers `react: 18.3.1`, `react-dom: 18.3.1`, `three: 0.185.1`, `@react-three/fiber: 8.18.0`, and `@react-three/drei: 9.115.0`. Externalize all five plus `react/jsx-runtime` in Vite.

- [ ] **Step 4: Port the validated material and model core**

Copy Viewer V0 profiles and shader reconstruction without changing numeric constants or shader paths. Remove viewer diagnostics, skeleton, wireframe, controls, and per-frame performance UI. Replace hard-coded `/runtime/` URLs with `assetBaseUrl`.

- [ ] **Step 5: Implement static Canvas and local error handling**

Use `frameloop="demand"`, `gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}`, a fixed front camera looking at model center, the Viewer hologram light setup, `pointer-events: none`, and a guarded first-frame ready callback.

- [ ] **Step 6: Implement and test cleanup/failure behavior**

Restore source materials, dispose unique clones/textures/materials/geometries once, clear Drei caches, dispose render lists/renderer once, and never invoke `forceContextLoss`. Convert loader/WebGL/context errors to `AvatarError` and `AvatarLoadState`.

- [ ] **Step 7: Install lockfile dependencies and verify GREEN**

Run package typecheck, build, and all package tests with Node 22.12.0.

### Task 2: Cross-Platform Local Asset Sync

**Files:**
- Create: `apps/preacherman-demo-host/scripts/sync-local-avatar.mjs`
- Create: `apps/preacherman-demo-host/tests/avatar-sync.test.mjs`
- Modify: `.gitignore`
- Modify: `apps/preacherman-demo-host/package.json`
- Modify: `apps/preacherman-demo-host/package-lock.json`

**Interfaces:**
- Produces: `syncLocalAvatar({ runtimeDir, viewerDir, targetDir })`.
- Produces runtime tree: `public/local-avatar/cortana-runtime-v0.glb`, six `shader/*.png`, and local `asset-lock.json`.

- [ ] **Step 1: Write failing sync tests**

Create temporary fixtures for successful copy, wrong hash, missing file, and replacement of an existing target. Assert failed sync leaves the previous target byte-for-byte intact and no staging directory remains.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test apps/preacherman-demo-host/tests/avatar-sync.test.mjs`

Expected: failure because the sync module does not exist.

- [ ] **Step 3: Implement lock parsing, hashing, staging, and rollback swap**

Resolve runtime from `--runtime-dir` or `PREACHERMAN_RUNTIME_V0_DIR`; resolve Viewer from explicit input or the runtime sibling. Require the locked GLB hash `07A4AAC5DD51DDC71309B8AC47CA812470AC098FECF172EC7E23AEC91928E878` and size `7252696`, plus exactly six verified shader inputs.

- [ ] **Step 4: Verify fixture tests GREEN**

Run the targeted Node test and confirm all four cases pass.

- [ ] **Step 5: Run real sync against read-only Runtime/Viewer V0**

Pass the runtime and viewer paths only on the command line. Verify all resulting hashes and confirm `git status` does not list `public/local-avatar/`.

### Task 3: Surface Skin AvatarSlot and Fallback Stack

**Files:**
- Modify: `packages/preacherman-surface-skin/src/adapter/types.ts`
- Modify: `packages/preacherman-surface-skin/src/adapter/createSurfaceSkinAdapter.tsx`
- Modify: `packages/preacherman-surface-skin/src/surfaces/home/HomeFlowSurface.tsx`
- Modify: `packages/preacherman-surface-skin/src/surfaces/home/HomeVessel.tsx`
- Modify: `packages/preacherman-surface-skin/src/surfaces/home/home.css`
- Modify: `packages/preacherman-surface-skin/src/surfaces/workspace/WorkspaceConversationSurface.tsx`
- Modify: `packages/preacherman-surface-skin/src/surfaces/workspace/workspace.css`
- Modify: `packages/preacherman-surface-skin/src/index.ts`
- Create: `packages/preacherman-surface-skin/tests/avatar-slot.test.mjs`

**Interfaces:**
- Consumes: optional `CreateSurfaceSkinAdapterOptions.avatarSlot`.
- Produces: `AvatarSlotProps` with `className`, `onReady`, and `onError`.

- [ ] **Step 1: Write failing rendered-markup tests**

Assert the current Workspace mounts the slot only in its centered stage; missing/error slot preserves its cleared center. Also assert legacy HomeVessel retains the current human image and exact positioning, renders a test slot between rear and front orbit layers, and returns to the 2D image on error.

- [ ] **Step 2: Run tests and verify RED**

Run the targeted Surface Skin test after a package build. Expected: missing adapter option/type/markup.

- [ ] **Step 3: Add the runtime-only slot seam**

Pass the optional component through bound renderer props only. Do not add it to manifest, projection, or commands.

- [ ] **Step 4: Add the fixed-size crossfade stage**

Add the Workspace stage at 620×780 centered on the fixed 1800×1000 baseline and fade it in only after readiness. Keep all existing legacy HomeVessel layout coordinates, give rear orbit, human stage, front orbit, and Halos explicit stacking only, and revert to its 2D image on slot error.

- [ ] **Step 5: Verify targeted tests and full Surface Skin check GREEN**

Run `npm run check` in `packages/preacherman-surface-skin`.

### Task 4: Demo Host Injection, Dependencies, and CSP

**Files:**
- Modify: `apps/preacherman-demo-host/package.json`
- Modify: `apps/preacherman-demo-host/package-lock.json`
- Modify: `apps/preacherman-demo-host/vite.config.ts`
- Modify: `apps/preacherman-demo-host/src/App.tsx`
- Create: `apps/preacherman-demo-host/src/avatar/DemoAvatarSlot.tsx`
- Create: `apps/preacherman-demo-host/src/avatar/avatarAssets.ts`
- Modify: `apps/preacherman-demo-host/src/styles.css`
- Modify: `apps/preacherman-demo-host/src-tauri/tauri.conf.json`
- Create: `apps/preacherman-demo-host/tests/avatar-integration.test.mjs`

**Interfaces:**
- `DemoAvatarSlot` supplies `AvatarViewport` with `${import.meta.env.BASE_URL}local-avatar/`.
- Demo diagnostics expose load state, draw calls, and triangles for acceptance only, without rendering a debug panel.

- [ ] **Step 1: Write failing integration/config tests**

Assert concrete compatible dependencies, four-item Vite dedupe, BASE_URL construction, non-null production CSP/devCsp, no remote domain, no filesystem permission, and adapter injection.

- [ ] **Step 2: Run tests and verify RED**

Run the targeted Demo Host test. Expected: missing dependency/config/injection.

- [ ] **Step 3: Add dependencies, slot component, and diagnostics**

Keep React 18.3.1. Use the renderer callback to record ready/error/context-lost and actual `gl.info.render.calls`/triangles without UI.

- [ ] **Step 4: Configure Vite dedupe and Tauri CSP**

Production permits self/custom asset IPC, fonts, and data/blob images. Development additionally permits only HTTP/WebSocket `127.0.0.1:1420`.

- [ ] **Step 5: Verify missing-asset build and Demo Host checks GREEN**

Temporarily point the component at the ignored path only at runtime; Vite build must not inspect or require the files. Run typecheck, build, and existing tests.

- [ ] **Step 6: Verify one React and Three instance**

Pin Drei's unused `stats-gl` diagnostic dependency to 2.2.7 so it does not introduce the later narrow Three type dependency or nested `three@0.170.x`. Run `npm ls react react-dom three @react-three/fiber @react-three/drei stats-gl` in Demo Host and renderer. Reject invalid or duplicate peer trees.

### Task 5: Browser and Tauri Acceptance

**Files:**
- No tracked screenshot or log output.

**Interfaces:**
- Consumes ignored local avatar assets.
- Produces runtime evidence only.

- [ ] **Step 1: Browser acceptance**

Run Vite, open the current Home/Workspace, wait for diagnostics ready, verify a centered uncropped full-body model, one Canvas, unchanged navigation, no console error, and record draw calls/triangles. Navigate away and back; verify one Canvas and a second clean load.

- [ ] **Step 2: Fallback acceptance**

Start without the local asset directory or use a missing asset base URL in a browser-only test fixture. Verify the current Workspace returns to its cleared center with the Surface/navigation intact; verify legacy HomeVessel still preserves its 2D image.

- [ ] **Step 3: Tauri acceptance**

Launch `tauri:dev`, verify 3D Home, page switching, minimize/maximize behavior, then close through the real window control and verify the process exits.

- [ ] **Step 4: Final targeted verification**

Re-run renderer check, Surface Skin check, Demo Host typecheck/build/tests, dependency tree, CSP assertions, asset hashes, and Git diff review. Do not run Contracts, GitHub Actions, full Cargo tests, or full-page pixel QA.

### Task 6: Local Commit and Final Audit

**Files:**
- Stage only reviewed source, config, tests, and documentation.
- Never stage `apps/preacherman-demo-host/public/local-avatar/`, GLB, shader textures, local locks, screenshots, logs, dist, target, or node_modules.

- [ ] **Step 1: Review explicit file list and staged diff**

Confirm no source workspace path, private data, generated output, or avatar binary is staged.

- [ ] **Step 2: Commit**

Run: `git commit -m "feat: integrate static hologram avatar"`

- [ ] **Step 3: Verify final state**

Confirm HEAD changed, `git status`, worktree diff, and cached diff are empty; confirm no push occurred.
