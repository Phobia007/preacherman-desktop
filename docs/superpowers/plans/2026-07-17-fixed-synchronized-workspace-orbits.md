# Fixed Synchronized Workspace Orbits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze both Workspace ellipse tracks in their approved pose and move each opposite node pair around its track with the same 40-second revolution period.

**Architecture:** Keep the existing React renderer and per-orbit elapsed counters. Make track tilt immutable in the geometry layer, share one duration constant across both definitions, and reset both initial elapsed values to zero so both node pairs begin at their opposite major-axis endpoints. Existing directions, pause behavior, depth layers, assets, and bridge commands remain unchanged.

**Tech Stack:** React 18, TypeScript 5.8, SVG, Node.js test runner, Vite 6, Tauri 2

## Global Constraints

- Use Node.js `v22.12.0` from `C:\Users\Administrator\AppData\Roaming\fnm\node-versions\v22.12.0\installation`.
- Do not modify node artwork, theme behavior, bridge commands, hover/focus pause behavior, or other Workspace elements.
- Both orbit definitions must use a `40_000ms` revolution duration.
- Keep `slow` direction `1` and `secondary` direction `-1`.
- Do not push.
- Preserve all pre-existing working-tree changes and stage no implementation files.

---

### Task 1: Specify fixed-track and equal-period geometry

**Files:**
- Modify: `packages/preacherman-surface-skin/tests/workspace-orbits.test.mjs`
- Test: `packages/preacherman-surface-skin/tests/workspace-orbits.test.mjs`

**Interfaces:**
- Consumes: `workspaceOrbitDefinitions`, `orbitFrameAtElapsed(orbit, elapsedMs)`, and `orbitTrackPaths(orbit, tiltRadians)` from `orbitGeometry.ts`.
- Produces: Regression assertions for equal periods, invariant tilt/path data, and opposite major-axis starting positions.

- [ ] **Step 1: Write the failing tests**

Extend the module destructuring to include `orbitTrackPaths`, then add these assertions:

```js
test("workspace orbit tracks stay fixed while both node pairs share one revolution period", async () => {
  const { orbitFrameAtElapsed, orbitTrackPaths, workspaceOrbitDefinitions } = await orbitGeometry();
  const [firstOrbit, secondOrbit] = workspaceOrbitDefinitions;

  assert.equal(firstOrbit.durationMs, 40_000);
  assert.equal(secondOrbit.durationMs, firstOrbit.durationMs);

  for (const orbit of workspaceOrbitDefinitions) {
    const initial = orbitFrameAtElapsed(orbit, 0);
    const quarter = orbitFrameAtElapsed(orbit, orbit.durationMs * 0.25);
    const later = orbitFrameAtElapsed(orbit, orbit.durationMs * 0.73);

    nearlyEqual(initial.tiltRadians, orbit.initialTiltRadians);
    nearlyEqual(quarter.tiltRadians, orbit.initialTiltRadians);
    nearlyEqual(later.tiltRadians, orbit.initialTiltRadians);
    assert.deepEqual(
      orbitTrackPaths(orbit, initial.tiltRadians),
      orbitTrackPaths(orbit, later.tiltRadians),
    );
  }
});

test("each node pair starts at the opposite major-axis endpoints", async () => {
  const { orbitFrameAtElapsed, workspaceOrbitDefinitions } = await orbitGeometry();

  for (const orbit of workspaceOrbitDefinitions) {
    const frame = orbitFrameAtElapsed(orbit, 0);
    const cosTilt = Math.cos(orbit.initialTiltRadians);
    const sinTilt = Math.sin(orbit.initialTiltRadians);

    nearlyEqual(frame.nodes[0].x, orbit.cx + orbit.rx * cosTilt);
    nearlyEqual(frame.nodes[0].y, orbit.cy + orbit.rx * sinTilt);
    nearlyEqual(frame.nodes[1].x, orbit.cx - orbit.rx * cosTilt);
    nearlyEqual(frame.nodes[1].y, orbit.cy - orbit.rx * sinTilt);
  }
});
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run:

```powershell
$Node22Dir = "C:\Users\Administrator\AppData\Roaming\fnm\node-versions\v22.12.0\installation"
$env:Path = "$Node22Dir;$env:Path"
Set-Location "E:\figma\packages\preacherman-surface-skin"
& "$Node22Dir\node.exe" --test tests/workspace-orbits.test.mjs
```

Expected: FAIL because the current durations are `44_000` and `36_000`, and `tiltRadians` changes with elapsed phase.

### Task 2: Freeze tracks and synchronize revolution duration

**Files:**
- Modify: `packages/preacherman-surface-skin/src/surfaces/workspace/orbitGeometry.ts`
- Modify: `packages/preacherman-surface-skin/src/surfaces/workspace/OrbitLayer.tsx`
- Test: `packages/preacherman-surface-skin/tests/workspace-orbits.test.mjs`

**Interfaces:**
- Consumes: Existing `WorkspaceOrbitDefinition.initialTiltRadians`, `direction`, phase offsets, and per-orbit elapsed counters.
- Produces: `orbitFrameAtElapsed()` frames whose `tiltRadians` is invariant and whose node phase completes one revolution every `40_000ms`.

- [ ] **Step 1: Make the minimal geometry change**

In `orbitGeometry.ts`, define one duration constant and use it for both definitions:

```ts
const WORKSPACE_ORBIT_DURATION_MS = 40_000;
```

Replace each `durationMs` value with `WORKSPACE_ORBIT_DURATION_MS`. In `orbitFrameAtElapsed`, keep phase rotation but stop adding it to the track tilt:

```ts
const orbitPhase = orbit.direction * progress * FULL_TURN;
const tiltRadians = orbit.initialTiltRadians;
```

- [ ] **Step 2: Reset both initial node pairs to the ellipse endpoints**

In `OrbitLayer.tsx`, replace the secondary quarter-cycle offset:

```ts
const initialElapsedByOrbit: Record<string, number> = {
  slow: 0,
  secondary: 0,
};
```

- [ ] **Step 3: Run the targeted test and verify GREEN**

Run:

```powershell
Set-Location "E:\figma\packages\preacherman-surface-skin"
& "$Node22Dir\node.exe" --test tests/workspace-orbits.test.mjs
```

Expected: all `workspace-orbits.test.mjs` tests pass.

- [ ] **Step 4: Run Surface Skin verification**

Run:

```powershell
& "$Node22Dir\npm.cmd" run typecheck
& "$Node22Dir\npm.cmd" run check
```

Expected: typecheck, Vite build, declaration build, and all Surface Skin tests pass.

### Task 3: Rebuild and refresh the local shortcut preview

**Files:**
- Build output only: `apps/preacherman-demo-host/dist`
- Build output only: `apps/preacherman-demo-host/src-tauri/target/shortcut-release/preacherman-demo-host.exe`
- External shortcut only: `C:\Users\Administrator\Desktop\Preacherman Tauri Demo.lnk`

**Interfaces:**
- Consumes: Built Surface Skin package and the existing Demo Host/Tauri project.
- Produces: Updated stable local executable and desktop shortcut without changing application source.

- [ ] **Step 1: Build the Demo Host frontend**

Run:

```powershell
Set-Location "E:\figma\apps\preacherman-demo-host"
& "$Node22Dir\npm.cmd" run build
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 2: Build the stable Tauri shortcut executable**

Run in an amd64 Visual Studio developer shell:

```powershell
& "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\Launch-VsDevShell.ps1" -Arch amd64 -HostArch amd64 -SkipAutomaticLocation
$env:Path = "$Node22Dir;C:\Users\Administrator\.cargo\bin;$env:Path"
Set-Location "E:\figma\apps\preacherman-demo-host\src-tauri"
& cargo build --release --target-dir target/shortcut-release
```

Expected: `target/shortcut-release/preacherman-demo-host.exe` builds successfully.

- [ ] **Step 3: Recreate the desktop shortcut against the stable executable**

Use `WScript.Shell.CreateShortcut` to set:

```text
TargetPath       = E:\figma\apps\preacherman-demo-host\src-tauri\target\shortcut-release\preacherman-demo-host.exe
WorkingDirectory = E:\figma\apps\preacherman-demo-host
IconLocation     = E:\figma\apps\preacherman-demo-host\src-tauri\target\shortcut-release\preacherman-demo-host.exe,0
```

Expected: the shortcut resolves to the rebuilt executable and uses its icon.

- [ ] **Step 4: Final verification**

Run `git diff --check`, targeted tests, verify the executable and shortcut properties, and inspect `git status --short --untracked-files=all` to confirm only intended source/test/plan changes were added on top of the preserved pre-existing worktree.
