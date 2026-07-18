# Unify Empty Surface Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every light-mode empty destination inherit Home's `#f7f5f1` background while leaving dark mode and populated pages unchanged.

**Architecture:** Remove the single `.demo-host--empty` light-mode override so the existing `.demo-host` rule is the source of truth. Preserve the explicit dark-mode selector and verify computed colors in the Tauri runtime.

**Tech Stack:** CSS, Node.js test runner, Vite 6, Tauri 2

## Global Constraints

- Change only the empty-page light background difference.
- Preserve Home, Settings, navigation, layout, animation, typography, and window chrome.
- Preserve dark mode `#161615`.
- Use Node.js `v22.12.0`.
- Build with `tauri build --no-bundle`.
- Do not stage implementation files and do not push.

---

### Task 1: Define and implement background inheritance

**Files:**
- Modify: `apps/preacherman-demo-host/tests/app-shell.test.mjs`
- Modify: `apps/preacherman-demo-host/src/styles.css`

**Interfaces:**
- Consumes: `.demo-host` and `.demo-host--empty` classes.
- Produces: Empty destinations that inherit `.demo-host` background in light mode.

- [ ] **Step 1: Write the failing regression assertions**

Replace the existing white-background assertion with:

```js
const hostRule = styles.match(/\.demo-host\s*\{[^}]*\}/s)?.[0] ?? "";
const emptyRule = styles.match(/(?:^|\n)\.demo-host--empty\s*\{[^}]*\}/s)?.[0] ?? "";
const darkHostRule = styles.match(/\.demo-app-shell\[data-appearance="dark"\][\s\S]*?\{[^}]*background:\s*#161615[^}]*\}/)?.[0] ?? "";
assert.match(hostRule, /background:\s*#f7f5f1/);
assert.equal(emptyRule, "");
assert.match(darkHostRule, /\.demo-host--empty/);
```

- [ ] **Step 2: Verify RED**

Run `node --test tests/app-shell.test.mjs`. Expected: FAIL because the standalone white `.demo-host--empty` rule still exists.

- [ ] **Step 3: Apply the one-rule CSS fix**

Delete only:

```css
.demo-host--empty {
  background: #ffffff;
}
```

- [ ] **Step 4: Verify GREEN and Demo Host checks**

Run `node --test tests/app-shell.test.mjs` and `npm run check`. Expected: all tests, typecheck, and build pass.

### Task 2: Rebuild and verify the desktop preview

**Files:**
- Build: `apps/preacherman-demo-host/src-tauri/target/release/preacherman-demo-host.exe`
- Refresh: `apps/preacherman-demo-host/src-tauri/target/shortcut-release/preacherman-demo-host.exe`
- External: `C:\Users\Administrator\Desktop\Preacherman Tauri Demo.lnk`

**Interfaces:**
- Consumes: Verified Demo Host CSS.
- Produces: Stable standalone Tauri preview.

- [ ] **Step 1: Build with Tauri CLI**

Run `npm run tauri -- build --no-bundle` in the Visual Studio developer shell.

- [ ] **Step 2: Refresh and verify shortcut runtime**

Replace the stable exe, preserve shortcut target/icon, and use WebView2 diagnostics to confirm Home plus Work/Lab/Gallery/Test/Ledger compute `rgb(247, 245, 241)` in light mode. Do not modify or include Settings in the empty-page assertion.

- [ ] **Step 3: Leave the normal application open and verify Git state**

Stop only the diagnostic instance, launch normally, confirm the process remains alive, run `git diff --check`, verify the staged area is empty, and do not commit or push implementation changes.
