# Floating Bottom Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the shared seven-item bottom navigation into one 820-pixel floating panel that stays fixed 16 pixels above the bottom edge and reveals only when the pointer enters the bottom region or keyboard focus enters the panel.

**Architecture:** Keep navigation commands and page integration unchanged. Add one presentation-only reveal-zone wrapper to the shared `BottomNavigation` component, and implement visibility entirely with CSS `:hover` and `:focus-within` so every implemented surface inherits the same deterministic behavior without React state.

**Tech Stack:** React 18, TypeScript, CSS, Node 22 test runner, Vite 6, Tauri 2, WebView2 CDP runtime verification.

## Global Constraints

- Preserve the fixed 1440 by 900 acceptance baseline; add no responsive rules.
- Keep all seven existing labels, ordering, commands, dispatch behavior, and semantic buttons unchanged.
- The seven entries must appear and hide together as one panel.
- Panel width is exactly 820 pixels and bottom clearance is exactly 16 pixels.
- All four panel corners are rounded and the detached panel has a small soft shadow.
- The behavior must be shared by Home, Workspace, and every future implemented surface that uses `BottomNavigation`.
- Do not add routes, pages, assets, network access, Tauri dependencies, backend behavior, or unrelated formatting.
- Preserve the existing uncommitted Demo Host React dedupe fix.

---

## File Structure

- Modify `packages/preacherman-surface-skin/src/surfaces/workspace/BottomNavigation.tsx`: add the shared reveal-zone wrapper and preserve the existing `nav` and buttons.
- Modify `packages/preacherman-surface-skin/src/surfaces/workspace/workspace.css`: replace the edge-attached navigation layout with the floating hidden/reveal contract.
- Modify `packages/preacherman-surface-skin/tests/architecture.test.mjs`: add structural and CSS regression coverage.
- Create no new runtime component or state module; the behavior is presentation-only.

---

### Task 1: Lock the shared floating-panel contract with failing tests

**Files:**
- Test: `packages/preacherman-surface-skin/tests/architecture.test.mjs:277`

**Interfaces:**
- Consumes: existing `workspaceMarkup()` and `surfaceMarkup(surfaceType, surfaceId)` helpers.
- Produces: regression requirements for `.pm-workspace__bottom-navigation-zone` and the floating panel CSS contract.

- [ ] **Step 1: Add the failing shared-structure test**

Add after the existing seven-button test:

```js
test("all implemented surfaces share one floating bottom navigation panel", async () => {
  const workspace = await workspaceMarkup();
  const home = await surfaceMarkup("home", "figma-287-637");

  for (const markup of [workspace, home.markup]) {
    assert.equal((markup.match(/pm-workspace__bottom-navigation-zone/g) ?? []).length, 1);
    assert.equal((markup.match(/<nav\b[^>]*pm-workspace__bottom-navigation/g) ?? []).length, 1);
    assert.equal((markup.match(/<button\b[^>]*data-navigation-item=/g) ?? []).length, 7);
  }
});
```

- [ ] **Step 2: Add the failing CSS-contract test**

Add after the shared-structure test:

```js
test("bottom navigation is an 820px floating panel revealed by the bottom zone", async () => {
  const cssPath = join(packageRoot, "src", "surfaces", "workspace", "workspace.css");
  const css = await readFile(cssPath, "utf8");
  const zone = css.match(/\.pm-workspace__bottom-navigation-zone\s*\{[^}]*\}/s)?.[0] ?? "";
  const panel = css.match(/\.pm-workspace__bottom-navigation\s*\{[^}]*\}/s)?.[0] ?? "";
  const reveal = css.match(/\.pm-workspace__bottom-navigation-zone:hover[^{]*\{[^}]*\}/s)?.[0] ?? "";

  assert.match(zone, /bottom:\s*0/);
  assert.match(zone, /height:\s*88px/);
  assert.match(panel, /width:\s*820px/);
  assert.match(panel, /bottom:\s*16px/);
  assert.match(panel, /border-radius:\s*14px/);
  assert.match(panel, /box-shadow:/);
  assert.match(panel, /opacity:\s*0/);
  assert.match(panel, /visibility:\s*hidden/);
  assert.match(panel, /pointer-events:\s*none/);
  assert.match(reveal, /opacity:\s*1/);
  assert.match(reveal, /visibility:\s*visible/);
  assert.match(css, /\.pm-workspace__bottom-navigation-zone:focus-within/);
});
```

- [ ] **Step 3: Run the Surface Skin tests and verify RED**

Run from `E:\figma\packages\preacherman-surface-skin`:

```powershell
$Node22Dir = "C:\Users\Administrator\AppData\Roaming\fnm\node-versions\v22.12.0\installation"
& "$Node22Dir\npm.cmd" test
```

Expected: the two new tests fail because the reveal-zone wrapper and floating CSS contract do not exist; all earlier tests remain green.

---

### Task 2: Implement the shared reveal zone and floating panel

**Files:**
- Modify: `packages/preacherman-surface-skin/src/surfaces/workspace/BottomNavigation.tsx:16-34`
- Modify: `packages/preacherman-surface-skin/src/surfaces/workspace/workspace.css:260-333`
- Test: `packages/preacherman-surface-skin/tests/architecture.test.mjs`

**Interfaces:**
- Consumes: `dispatch(navigationCommand(surfaceType))` and the existing seven `navigationItems`.
- Produces: a single `.pm-workspace__bottom-navigation-zone` containing the unchanged semantic `nav` and all seven buttons.

- [ ] **Step 1: Wrap the existing navigation without adding state**

Replace the component return value with:

```tsx
return (
  <div className="pm-workspace__bottom-navigation-zone">
    <nav aria-label="Primary" className="pm-workspace__bottom-navigation">
      {navigationItems.map((item) => (
        <button
          aria-current={item.surfaceType === "home" ? "page" : undefined}
          className={`pm-workspace__nav-item ${item.className}`}
          data-navigation-item={item.surfaceType}
          key={item.surfaceType}
          onClick={() => void dispatch(navigationCommand(item.surfaceType))}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </nav>
  </div>
);
```

Remove the obsolete `.pm-workspace__bottom-divider` span; the panel border now defines all four edges.

- [ ] **Step 2: Replace the attached navigation CSS with the floating contract**

Use these values in `workspace.css`:

```css
.pm-workspace__bottom-navigation-zone {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 5;
  height: 88px;
}

.pm-workspace__bottom-navigation {
  position: absolute;
  bottom: 16px;
  left: 50%;
  display: flex;
  box-sizing: border-box;
  align-items: center;
  justify-content: space-between;
  width: 820px;
  height: 50px;
  padding: 6px 20px;
  border: 1px solid rgb(217 212 204 / 92%);
  border-radius: 14px;
  background: #fbfaf7;
  box-shadow: 0 8px 18px -8px rgb(43 37 29 / 28%);
  opacity: 0;
  visibility: hidden;
  transform: translate(-50%, 12px);
  pointer-events: none;
  transition:
    opacity 180ms ease-out,
    transform 180ms ease-out,
    visibility 0s linear 180ms;
}

.pm-workspace__bottom-navigation-zone:hover .pm-workspace__bottom-navigation,
.pm-workspace__bottom-navigation-zone:focus-within .pm-workspace__bottom-navigation {
  opacity: 1;
  visibility: visible;
  transform: translate(-50%, 0);
  pointer-events: auto;
  transition-delay: 0s;
}
```

Rewrite `.pm-workspace__nav-item` as a centered flex item with `position: relative`, `top: auto`, `height: 38px`, and preserve the existing font properties. Keep each modifier width, remove every absolute `left` and `top` offset, and retain the current Home border, pill background, shadow, and `font-weight: 600`.

- [ ] **Step 3: Run Surface Skin tests and verify GREEN**

Run:

```powershell
& "$Node22Dir\npm.cmd" test
```

Expected: all Surface Skin tests pass, including both new floating-navigation tests.

- [ ] **Step 4: Review the focused diff**

Run from `E:\figma`:

```powershell
git diff --check
git diff -- packages/preacherman-surface-skin/src/surfaces/workspace/BottomNavigation.tsx packages/preacherman-surface-skin/src/surfaces/workspace/workspace.css packages/preacherman-surface-skin/tests/architecture.test.mjs
```

Expected: only wrapper, floating CSS, and tests change; labels and command dispatch remain byte-for-byte unchanged.

---

### Task 3: Verify builds and the real Tauri interaction

**Files:**
- Verify only: `packages/preacherman-surface-skin/**`
- Verify only: `apps/preacherman-demo-host/**`
- Generated ignored artifact: `apps/preacherman-demo-host/src-tauri/target/release/preacherman-demo-host.exe`

**Interfaces:**
- Consumes: the fixed desktop shortcut `C:\Users\Administrator\Desktop\Preacherman Tauri Demo.lnk` and release executable.
- Produces: runtime evidence for hidden, revealed, fixed-size, and error-free states.

- [ ] **Step 1: Run complete package checks sequentially**

Run Surface Skin and then Demo Host under Node `v22.12.0`:

```powershell
Set-Location "E:\figma\packages\preacherman-surface-skin"
& "$Node22Dir\npm.cmd" run check
Set-Location "E:\figma\apps\preacherman-demo-host"
& "$Node22Dir\npm.cmd" run check
```

Expected: Surface Skin and Demo Host typecheck, builds, and all tests pass.

- [ ] **Step 2: Rebuild the standalone Tauri executable**

Activate the Visual Studio developer shell and run:

```powershell
& "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\Launch-VsDevShell.ps1" -Arch amd64 -HostArch amd64 -SkipAutomaticLocation
$env:Path = "$Node22Dir;C:\Users\Administrator\.cargo\bin;$env:Path"
Set-Location "E:\figma\apps\preacherman-demo-host"
& ".\node_modules\.bin\tauri.cmd" build --no-bundle
```

Expected: release executable rebuild succeeds with embedded frontend assets.

- [ ] **Step 3: Verify hidden and revealed states through WebView2 CDP**

Launch the release exe with a temporary localhost-only debugging port. Use `Input.dispatchMouseEvent` at `(720, 400)` and then `(720, 860)`. Query `getComputedStyle()` and `getBoundingClientRect()` for `.pm-workspace__bottom-navigation`.

Expected hidden state at `(720, 400)`:

```json
{"opacity":"0","visibility":"hidden","pointerEvents":"none"}
```

Expected revealed state at `(720, 860)` after 250 milliseconds:

```json
{"opacity":"1","visibility":"visible","pointerEvents":"auto","width":820,"bottom":884}
```

The `bottom` value of 884 proves a 16-pixel gap within the 900-pixel client area.

- [ ] **Step 4: Capture a temporary Tauri screenshot and inspect it**

Capture only the revealed state to `%TEMP%`. Confirm visually that one rounded rectangular panel contains all seven entries, is horizontally centered, has a soft shadow, and does not touch the window edge. Do not add the screenshot to Git.

- [ ] **Step 5: Relaunch normally and audit Git state**

Close only the temporary debug-enabled release process, then launch the desktop shortcut normally and leave its window running. Run:

```powershell
git diff --check
git status --short --untracked-files=all
git diff --name-status
git diff --cached --name-status
```

Expected: the standalone window is responsive; only the intended source/test/plan changes plus the pre-existing Demo Host dedupe fix are present; no build output is tracked.
