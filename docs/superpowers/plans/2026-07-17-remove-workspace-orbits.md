# Remove Workspace Orbits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the two Workspace ellipse tracks, four orbit nodes, and all Workspace-only orbit interactions while preserving every Home/State orbit and the audited local assets.

**Architecture:** Keep `WorkspaceConversationSurface` as the mapped empty Workspace section. Delete its obsolete `StateVessel`, `OrbitLayer`, and geometry modules; remove the dedicated command helper and CSS rules; update regression tests to assert absence while proving Home/State orbit source remains.

**Tech Stack:** React 18, TypeScript 5.8, Node.js test runner, Vite 6, Tauri 2

## Global Constraints

- Apply only to Workspace frame `281:538`.
- Preserve Home and State page orbit designs and interactions.
- Preserve localized Figma assets and manifests.
- Preserve unrelated working-tree changes.
- Use Node.js `v22.12.0`.
- Build the shortcut executable with `tauri build --no-bundle`, never bare `cargo build`.
- Do not stage implementation files and do not push.

---

### Task 1: Define the empty Workspace contract

**Files:**
- Modify: `packages/preacherman-surface-skin/tests/architecture.test.mjs`
- Modify: `packages/preacherman-surface-skin/tests/workspace-orbits.test.mjs`
- Modify: `packages/preacherman-surface-skin/tests/dark-vessel-visual.test.mjs`

**Interfaces:**
- Consumes: `exists(path)`, source file reads, and the built Workspace renderer.
- Produces: Tests requiring an empty Workspace center and the absence of Workspace-only orbit modules, CSS, commands, and hit targets.

- [ ] **Step 1: Replace positive orbit assertions with removal assertions**

Use this architecture contract:

```js
test("workspace center has no orbit renderer or node interaction while Home orbit source remains", async () => {
  const workspaceRoot = join(packageRoot, "src", "surfaces", "workspace");
  const workspace = await readFile(join(workspaceRoot, "WorkspaceConversationSurface.tsx"), "utf8");
  const commands = await readFile(join(workspaceRoot, "commands.ts"), "utf8");
  const css = await readFile(join(workspaceRoot, "workspace.css"), "utf8");
  const homeVessel = await readFile(join(packageRoot, "src", "surfaces", "home", "HomeVessel.tsx"), "utf8");

  for (const file of ["StateVessel.tsx", "OrbitLayer.tsx", "orbitGeometry.ts"]) {
    assert.equal(await exists(join(workspaceRoot, file)), false, `${file} must be removed`);
  }
  assert.doesNotMatch(workspace, /StateVessel|OrbitLayer|data-orbit-/);
  assert.doesNotMatch(commands, /orbitNodeCommand|demo\.orbit-node\.select/);
  assert.doesNotMatch(css, /pm-workspace__orbit-|pm-workspace__state-vessel/);
  assert.match(homeVessel, /pm-home-vessel__orbit/);
});
```

Remove geometry-specific tests from `workspace-orbits.test.mjs`, retain its identity/corner assertions, and add source assertions that the Workspace section contains no orbit markup. Update `dark-vessel-visual.test.mjs` to assert the center is empty in both themes while the local audited assets still exist.

- [ ] **Step 2: Run the targeted tests and verify RED**

```powershell
$Node22Dir = "C:\Users\Administrator\AppData\Roaming\fnm\node-versions\v22.12.0\installation"
& "$Node22Dir\node.exe" --test tests/architecture.test.mjs tests/workspace-orbits.test.mjs tests/dark-vessel-visual.test.mjs
```

Expected: FAIL because the three modules, orbit command, renderer markup, and CSS still exist.

### Task 2: Remove Workspace orbit production code

**Files:**
- Delete: `packages/preacherman-surface-skin/src/surfaces/workspace/StateVessel.tsx`
- Delete: `packages/preacherman-surface-skin/src/surfaces/workspace/OrbitLayer.tsx`
- Delete: `packages/preacherman-surface-skin/src/surfaces/workspace/orbitGeometry.ts`
- Modify: `packages/preacherman-surface-skin/src/surfaces/workspace/WorkspaceConversationSurface.tsx`
- Modify: `packages/preacherman-surface-skin/src/surfaces/workspace/commands.ts`
- Modify: `packages/preacherman-surface-skin/src/surfaces/workspace/workspace.css`

**Interfaces:**
- Consumes: Existing Workspace manifest, `manifest.surfaceType`, and `tokenStyle`.
- Produces: The same Workspace semantic section with no center child or orbit interaction.

- [ ] **Step 1: Render an empty Workspace section**

Change the component signature and remove the child:

```tsx
export function WorkspaceConversationSurface({ manifest, tokenStyle }: SurfaceViewProps) {
  return (
    <section
      aria-label="Preacherman conversation workspace"
      className="pm-surface-skin pm-workspace"
      data-figma-frame="281:538"
      data-surface-type={manifest.surfaceType}
      style={tokenStyle}
    />
  );
}
```

- [ ] **Step 2: Delete obsolete modules and command**

Delete `StateVessel.tsx`, `OrbitLayer.tsx`, and `orbitGeometry.ts`. Remove only this helper from `commands.ts`:

```ts
export function orbitNodeCommand(nodeId: string, label: string): SurfaceCommand {
  return {
    type: "demo.orbit-node.select",
    payload: { nodeId, label },
  };
}
```

- [ ] **Step 3: Remove only Workspace orbit CSS**

Delete the contiguous rules from `.pm-workspace__state-vessel, .pm-workspace__orbit-track-layer, .pm-workspace__orbit-node-layer` through the orbit-node hover/focus rule. Leave `.pm-workspace__bottom-navigation-zone` and all subsequent rules unchanged.

- [ ] **Step 4: Verify GREEN and complete Surface Skin check**

```powershell
& "$Node22Dir\node.exe" --test tests/architecture.test.mjs tests/workspace-orbits.test.mjs tests/dark-vessel-visual.test.mjs
& "$Node22Dir\npm.cmd" run check
```

Expected: targeted tests and the complete Surface Skin suite pass.

### Task 3: Build and verify the stable desktop preview

**Files:**
- Build output: `apps/preacherman-demo-host/dist`
- Build output: `apps/preacherman-demo-host/src-tauri/target/release/preacherman-demo-host.exe`
- Stable output: `apps/preacherman-demo-host/src-tauri/target/shortcut-release/preacherman-demo-host.exe`
- External shortcut: `C:\Users\Administrator\Desktop\Preacherman Tauri Demo.lnk`

**Interfaces:**
- Consumes: The verified Surface Skin package and Demo Host.
- Produces: A self-contained Tauri production executable loading `http://tauri.localhost/`.

- [ ] **Step 1: Run formal Tauri production build**

```powershell
Set-Location "E:\figma\apps\preacherman-demo-host"
& "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\Launch-VsDevShell.ps1" -Arch amd64 -HostArch amd64 -SkipAutomaticLocation
$env:Path = "$Node22Dir;C:\Users\Administrator\.cargo\bin;$env:Path"
& "$Node22Dir\npm.cmd" run tauri -- build --no-bundle
```

Expected: frontend build and Tauri release build pass.

- [ ] **Step 2: Refresh the stable executable and shortcut**

Stop only the currently running stable Demo process, copy `target/release/preacherman-demo-host.exe` to `target/shortcut-release/preacherman-demo-host.exe`, and recreate the shortcut with the stable exe as target and icon.

- [ ] **Step 3: Verify production URL and leave the normal app open**

Launch once with a temporary WebView2 debug port and confirm the page target URL is `http://tauri.localhost/`. Stop that diagnostic instance, clear the temporary environment variable, launch normally, and confirm the process remains alive with title `Preacherman Desktop Demo`.

- [ ] **Step 4: Final repository check**

Run `git diff --check`, confirm `git diff --cached --name-status` is empty, inspect `git status --short --untracked-files=all`, and do not commit or push implementation changes.
