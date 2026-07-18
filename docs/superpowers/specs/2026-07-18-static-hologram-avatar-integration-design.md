# Static Hologram Avatar Integration Design

## Goal

Integrate the validated Viewer V0 static hologram avatar into the current cleared Home/Workspace center without moving or changing the surrounding UI. Legacy HomeVessel screens retain their existing two-dimensional figure as first paint and fallback.

## Boundaries

- The renderer is an independent `@preacherman/avatar-renderer` package.
- The renderer imports React, ReactDOM, Three, React Three Fiber, and Drei only through peer dependencies.
- It never imports Tauri, Surface Skin, Demo Host, backend, network-client, or contract code.
- Demo Host owns the concrete renderer dependencies and the runtime asset URL.
- Surface Skin owns only an optional runtime `AvatarSlot` injection point. The slot is not part of `SurfaceManifest`, `SurfaceProjection`, or any serializable contract.
- Viewer V0 and Runtime V0 are read-only sources.
- No avatar animation, camera controls, diagnostics, grid, skeleton helper, FPS panel, AI, voice, or backend work is included.

## Dependency Selection

The desktop application remains on React and ReactDOM 18.3.1.

- `@react-three/fiber`: 8.18.0, whose peer range is React/ReactDOM `>=18 <19` and Three `>=0.133`.
- `@react-three/drei`: 9.115.0, whose peer range supports React/ReactDOM `>=18`, Fiber `>=8`, and Three `>=0.137`.
- `three`: 0.185.1, matching the validated Viewer V0 Three version.
- `stats-gl`: overridden to 2.2.7 because later releases add either a narrow Three type dependency or an unused nested `three@0.170.x`; 2.2.7 remains within Drei 9.115.0's declared range and keeps both runtime and type trees valid.

The renderer package declares all five runtime libraries as peers and uses the same versions as development dependencies. Demo Host installs the concrete versions. Demo Host Vite deduplicates `react`, `react-dom`, `three`, and `@react-three/fiber`.

## Renderer Architecture

`AvatarViewport` owns an avatar-local error boundary, a transparent pointer-inert Canvas, loading state, context-loss handling, and readiness callbacks. The Canvas uses a fixed front camera, alpha transparency, no background object, no controls, no shadows, DPR capped at 2, and `frameloop="demand"` so the static scene does not create a new continuous animation loop.

`AvatarModel` loads one GLB and six shader input textures beneath `assetBaseUrl`. It clones Viewer V0 hologram materials without mutating source materials, attaches them to the scene meshes, and reports readiness only after the first rendered frame. On unmount it restores source materials, disposes cloned materials, textures, geometries, and source materials once, clears Drei caches, and does not call `forceContextLoss`.

The public API exports:

- `AvatarViewport`
- `AvatarViewportProps`
- `AvatarLoadState`
- `AvatarError`
- quality and performance snapshot types used by Demo Host acceptance instrumentation

The `quality` prop selects capped DPR only; it does not alter model topology or material fidelity. `reducedMotion` is accepted and recorded but causes no visual branch because this phase has no avatar motion.

## Asset Synchronization

`apps/preacherman-demo-host/scripts/sync-local-avatar.mjs` is a Node 22 cross-platform script. It accepts `--runtime-dir` or `PREACHERMAN_RUNTIME_V0_DIR`, locates Viewer V0 through `--viewer-dir`, `PREACHERMAN_VIEWER_V0_DIR`, or the runtime directory's sibling, and reads Viewer V0 `asset-lock.json`.

The script validates the locked GLB and exactly six shader inputs by byte length and SHA-256. It copies them into a sibling timestamped staging directory, verifies the staged copies, writes a local lock, then swaps the previous target through same-volume directory renames with rollback. A failed validation or swap leaves the previous valid target intact and removes only its own staging/backup artifacts.

The default target is `apps/preacherman-demo-host/public/local-avatar/`, which is ignored by Git. No tracked file contains a machine-specific source path. Demo Host constructs URLs from `import.meta.env.BASE_URL`.

## Surface Integration and Layering

Surface Skin adapter options gain an optional `avatarSlot`. `bindRenderer` supplies it only as a runtime view prop. The current `WorkspaceConversationSurface` mounts it in a fixed 620×780 stage centered at `(900, 500)` on the 1800×1000 baseline. Because that surface was intentionally cleared before this work, an unavailable Avatar leaves the center empty. `HomeFlowSurface` also passes the slot to legacy `HomeVessel` screens, where the existing 2D fallback remains available.

`HomeVessel` keeps the current two-dimensional human image and separates its fixed visual layers:

1. rear orbit,
2. human stage containing the 2D image and optional 3D slot,
3. front orbit,
4. existing Halo visuals and the existing Home interaction overlay.

The stage reuses each layout's current human rectangle. The Canvas never covers the whole page and remains `pointer-events: none`. The chat hit target, Halo behavior, bottom navigation, window chrome, and all non-avatar page elements remain unchanged.

## Loading, Readiness, and Fallback

The current Workspace 3D layer starts at opacity zero and fades in only after readiness; on failure its deliberately empty center remains unchanged. On legacy HomeVessel screens, the 2D image is visible initially and transitions from 1 to 0 while the 3D layer transitions from 0 to 1. Demo Host's slot reports `onReady` only after the GLB and six textures load, hologram materials are created, WebGL is available, and the first frame renders.

Any loader error, parse error, material error, unavailable WebGL context, `webglcontextlost`, render error, or unmount-before-ready returns the local vessel to the 2D image. The error boundary encloses only the avatar slot. Missing local assets therefore do not break Vite builds, CI, or the Home surface.

Only one Home route is mounted at a time. Leaving Home unmounts and cleans the Canvas; returning creates one fresh Canvas rather than retaining or duplicating one.

## Tauri Security

The GLB and shader inputs are bundled public assets, so no filesystem permission is added. Tauri production CSP is non-null and permits only self/custom asset delivery, existing IPC, local fonts, and data/blob images. `devCsp` additionally permits only the configured `127.0.0.1:1420` Vite HTTP/WebSocket development service. No remote network domain is added.

## Verification

- Renderer: public exports, material cloning, one-time resource disposal, failure-state normalization, typecheck, build.
- Asset sync: valid copy, bad hash, missing source, replacement of an existing valid target, and real Runtime V0 hash verification.
- Surface Skin: absent slot preserves 2D markup, present slot has correct order, slot error preserves the surface, full package check.
- Demo Host: typecheck, build, existing tests, dependency tree uniqueness, and missing-asset build behavior.
- Browser: centered full-body 3D on the current Home/Workspace, one Canvas after navigation round trip, unchanged navigation, no console error, measured draw calls and triangles; legacy HomeVessel keeps its orbit/Halo/fallback behavior.
- Tauri: launch, 3D Home, page switching, window controls, process exit after close, and CSP behavior.
