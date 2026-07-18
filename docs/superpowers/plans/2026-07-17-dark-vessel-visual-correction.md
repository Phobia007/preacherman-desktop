# Dark Vessel Visual Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the source-derived central human, orbit tracks, and four nodes correctly in Light and Dark appearance while removing Alive and preserving all existing interactions.

**Architecture:** Localize the supplied SVG as the source of truth and generate two fixed 296×671 PNG variants with preserved alpha-derived linework. Keep one OrbitLayer and one StateVessel interaction tree; theme selectors switch visual assets and colors while the existing geometry, hit targets, bridge commands, and timing remain unchanged. Replace the visible warm-white occluder with a canvas-colored alpha mask.

**Tech Stack:** React 18, TypeScript 5.8, CSS, SVG/PNG local assets, Node 22 test runner, Vite 6, Tauri 2.

## Global Constraints

- Use Node `v22.12.0`.
- Preserve all current user changes in the dirty worktree.
- Do not modify orbit geometry, speed, direction, phase, node hit areas, or bridge commands.
- Do not introduce network assets, temporary attachment paths, or runtime attachment reads.
- Surface Skin must not import Tauri or network APIs.
- Do not modify Contracts, backend handoff, package-lock, or GitHub workflows.
- Do not commit implementation files while unrelated preserved worktree changes remain interleaved; the design document is the only standalone commit authorized and already completed.

---

### Task 1: Lock the visual contract with failing tests

**Files:**
- Create: `packages/preacherman-surface-skin/tests/dark-vessel-visual.test.mjs`
- Modify: `packages/preacherman-surface-skin/tests/architecture.test.mjs`

**Interfaces:**
- Consumes: `StateVessel`, `OrbitLayer`, `HomeFlowSurface`, `WorkspaceConversationSurface`, current asset directory.
- Produces: regression coverage for source/variant dimensions, theme selectors, unchanged orbit interaction source, and complete Alive removal.

- [ ] **Step 1: Write the failing asset and rendering test**

Add assertions that `human-source.svg`, `human-light.png`, and `human-dark.png` exist; the SVG declares `296 × 671`; both PNG IHDR records report `296 × 671`; `StateVessel.tsx` imports both variants; and no source file contains attachment or temporary paths.

- [ ] **Step 2: Write the failing theme and interaction test**

Assert that CSS contains Dark silver human, white track, gray node rules, and canvas-colored occlusion. Snapshot the current interaction expressions and assert they remain present:

```js
assert.match(orbit, /requestAnimationFrame/);
assert.match(orbit, /dispatch\(orbitNodeCommand\(node\.id,\s*node\.label\)\)/);
assert.match(orbit, /onMouseEnter=\{\(\)\s*=>\s*activateNode\(node\.id,\s*orbit\.id\)\}/);
assert.match(orbit, /onMouseLeave=\{clearActiveNode\}/);
```

- [ ] **Step 3: Replace obsolete Alive assertions**

Change architecture tests to require that neither Home nor Workspace imports or renders `TopLiveStatus`, built markup contains no `Alive`, and status CSS selectors are absent.

- [ ] **Step 4: Run tests and confirm the red state**

Run:

```powershell
Set-Location E:\figma\packages\preacherman-surface-skin
& "$Node22Dir\node.exe" --test tests/dark-vessel-visual.test.mjs tests/architecture.test.mjs
```

Expected: failure because theme assets and new rendering selectors do not yet exist and Alive still renders.

---

### Task 2: Localize and derive the human theme assets

**Files:**
- Create: `packages/preacherman-surface-skin/src/assets/figma/281-538/human-source.svg`
- Create: `packages/preacherman-surface-skin/src/assets/figma/281-538/human-light.png`
- Create: `packages/preacherman-surface-skin/src/assets/figma/281-538/human-dark.png`
- Modify: `packages/preacherman-surface-skin/src/surfaces/workspace/StateVessel.tsx`
- Modify: `packages/preacherman-surface-skin/src/surfaces/workspace/workspace.css`

**Interfaces:**
- Consumes: user-supplied SVG and its embedded 199×466 PNG.
- Produces: exact local source plus `humanLightAsset` and `humanDarkAsset`, each rendered at 296×671.

- [ ] **Step 1: Localize the supplied SVG unchanged**

Copy the attachment text byte-for-byte into `human-source.svg`, normalize only the final newline, and verify it has no external URL.

- [ ] **Step 2: Generate both fixed raster variants**

Decode the embedded PNG, resize with high-quality bicubic sampling to 296×671, and compute line alpha per pixel:

```text
luminance = 0.2126R + 0.7152G + 0.0722B
lineWeight = 0.12 + 0.88 × (1 - luminance / 255)
outputAlpha = round(sourceAlpha × lineWeight)
Light RGB = (23, 23, 23)
Dark RGB = (215, 217, 216)
```

Transparent pixels remain transparent. Save 32-bit ARGB PNGs without changing the 296×671 canvas.

- [ ] **Step 3: Render both variants without duplicating interaction state**

Import both assets in `StateVessel.tsx` and render them inside the same human stack with `pm-workspace__human--light` and `pm-workspace__human--dark`. CSS shows exactly one variant according to the ancestor `data-appearance` selector.

- [ ] **Step 4: Replace the visible occluder filter**

Use the source alpha as an SVG mask over a full-size rectangle whose fill is `var(--pm-vessel-canvas)`. Define `--pm-vessel-canvas: #f7f5f1` in Light and `#161615` in Dark. The mask remains at z-index 0, the visible human at z-index 1, and the human stack at z-index 2.

- [ ] **Step 5: Run the targeted test**

Run the Task 1 command. Expected: asset and human assertions pass; track/node/Alive assertions may still fail until Task 3.

---

### Task 3: Theme tracks and nodes, then remove Alive

**Files:**
- Create: `packages/preacherman-surface-skin/src/assets/figma/281-538/halo-memory-dark.svg`
- Create: `packages/preacherman-surface-skin/src/assets/figma/281-538/halo-skill-dark.svg`
- Modify: `packages/preacherman-surface-skin/src/surfaces/workspace/OrbitLayer.tsx`
- Modify: `packages/preacherman-surface-skin/src/surfaces/workspace/workspace.css`
- Modify: `packages/preacherman-surface-skin/src/surfaces/home/HomeFlowSurface.tsx`
- Modify: `packages/preacherman-surface-skin/src/surfaces/workspace/WorkspaceConversationSurface.tsx`
- Delete: `packages/preacherman-surface-skin/src/surfaces/workspace/TopLiveStatus.tsx`

**Interfaces:**
- Consumes: existing orbit frames, node IDs, and Light node SVGs.
- Produces: visual-only Light/Dark node asset pairs; no new state, command, or timing interface.

- [ ] **Step 1: Create Dark node assets**

Duplicate the two 72×72 SVG geometries and change the circle fill to `#8E9290`, stroke to `#B8BCBA`, and shadow alpha to `0.18`. Do not change viewBox, circle center/radius, or filter bounds.

- [ ] **Step 2: Render paired node visuals**

Extend each `nodeAssets` entry to `{ light, dark }`. Inside the existing visual span, render a Light and Dark image with theme modifier classes. Keep the single semantic button, its position, event handlers, data attributes, and dispatch expression unchanged.

- [ ] **Step 3: Theme orbit tracks**

Keep the current `strokeOpacity` props. Set track stroke to `#161512` in Light and `#FFFFFF` under the Dark host selector. Do not change `workspaceOrbitDefinitions` or `orbitGeometry.ts`.

- [ ] **Step 4: Remove Alive completely**

Remove both `TopLiveStatus` imports and JSX calls, delete the component, and delete `.pm-workspace__status-*` rules plus `pm-alive-breathe` keyframes and reduced-motion references. Leave the top-center area empty.

- [ ] **Step 5: Run focused and full Surface Skin checks**

Run:

```powershell
& "$Node22Dir\node.exe" --test tests/dark-vessel-visual.test.mjs tests/orbit-geometry.test.mjs tests/architecture.test.mjs
& "$Node22Dir\npm.cmd" run check
```

Expected: all targeted tests and all Surface Skin tests pass.

---

### Task 4: Build, inspect, and refresh the desktop shortcut

**Files:**
- Verify: `apps/preacherman-demo-host/src/styles.css`
- Build output: ignored `apps/preacherman-demo-host/src-tauri/target/shortcut-release/preacherman-demo-host.exe`
- External shortcut: `C:\Users\Administrator\Desktop\Preacherman Tauri Demo.lnk`

**Interfaces:**
- Consumes: Surface Skin build output and existing Demo Host appearance persistence.
- Produces: latest local Tauri executable at the stable ignored shortcut target.

- [ ] **Step 1: Run Demo Host checks**

```powershell
Set-Location E:\figma\apps\preacherman-demo-host
& "$Node22Dir\npm.cmd" run check
```

Expected: typecheck, Vite build, and all Demo Host tests pass.

- [ ] **Step 2: Build a Tauri release**

Load the VS developer shell, prepend Node 22 and Cargo to PATH, and run `npm.cmd run tauri -- build`. If the primary release is locked by an open user window, build in a temporary target, copy only the verified executable into the existing ignored `target/shortcut-release`, then remove the temporary target after its QA processes are closed.

- [ ] **Step 3: Update and launch the shortcut**

Set the shortcut target, working directory, and icon to the stable `target/shortcut-release/preacherman-demo-host.exe`. Launch once and verify the process remains responsive through the intro-to-workspace handoff.

- [ ] **Step 4: Perform visual and interaction QA**

Check Light and Dark central human, both tracks, all four nodes, front/back occlusion, absence of Alive, unchanged node hover pause, and unchanged click actions. Record any remaining visual difference rather than declaring zero difference.

- [ ] **Step 5: Final scope audit**

Run `git diff --check`, confirm no staged implementation files, confirm no changes under Contracts/backend/workflows/package-lock, and report the preserved dirty worktree separately from this task's files.
