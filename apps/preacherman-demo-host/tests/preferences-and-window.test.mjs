import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const hostRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(hostRoot, "src");

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test("the desktop shell keeps persisted appearance and language preferences", async () => {
  const preferencesPath = join(sourceRoot, "preferences.ts");
  assert.equal(await exists(preferencesPath), true, "preferences module must exist");

  const preferences = await readFile(preferencesPath, "utf8");
  const app = await readFile(join(sourceRoot, "App.tsx"), "utf8");
  const shell = await readFile(join(sourceRoot, "app-shell", "AppShell.tsx"), "utf8");

  assert.match(preferences, /preacherman\.preferences/);
  assert.match(preferences, /localStorage\.getItem/);
  assert.match(preferences, /localStorage\.setItem/);
  assert.match(preferences, /document\.documentElement\.dataset\.appearance = preferences\.appearance/);
  assert.match(shell, /data-appearance=\{appearance\}/);
  assert.match(shell, /data-locale=\{locale\}/);
  assert.match(app, /<SettingsScreen\b/);
  assert.match(app, /onAppearanceChange=\{\(appearance\) => setPreferences/);
  assert.match(app, /onLocaleChange=\{\(locale\) => setPreferences/);
  assert.match(app, /readPreferences/);
  assert.match(app, /applyPreferences\(preferences\)/);
  assert.match(app, /savePreferences/);
});

test("Settings exposes the real MCP configuration and execution console in both themes", async () => {
  const mcp = await readFile(join(sourceRoot, "settings", "McpSettings.tsx"), "utf8");
  const styles = await readFile(join(sourceRoot, "styles.css"), "utf8");

  assert.match(mcp, /\/api\/mcp\/config/);
  assert.match(mcp, /\/api\/mcp\/tools\/call/);
  assert.match(mcp, /data-preacherman-control="mcp\.servers runtime\.mcp-test"/);
  assert.match(styles, /\.demo-settings__service-button/);
  assert.match(styles, /var\(--demo-theme-focus\)/);
  assert.match(styles, /var\(--demo-theme-surface\)/);
  assert.match(styles, /var\(--demo-theme-error\)/);
});

test("Settings exposes the PREACHERMAN plugin lifecycle and tool console in both themes", async () => {
  const plugins = await readFile(join(sourceRoot, "settings", "PluginSettings.tsx"), "utf8");
  const runtime = await readFile(join(hostRoot, "server", "preachermanPluginRuntime.mjs"), "utf8");
  const styles = await readFile(join(sourceRoot, "styles.css"), "utf8");

  assert.match(plugins, /\/api\/plugins\/tools\/call/);
  assert.match(plugins, /approved: true/);
  assert.match(plugins, /Approve & execute once/);
  assert.match(plugins, /plugin\.permissions/);
  assert.match(plugins, /plugin\.usedKits/);
  assert.match(plugins, /plugin\.providedKits/);
  assert.match(plugins, /Owned Bindings/);
  assert.match(plugins, /data-preacherman-control="plugin\.manager agent\.plugin-tools runtime\.plugin-inspector plugin\.hot-reload"/);
  assert.match(runtime, /manifest\.plugin\.preacherman\.local/);
  assert.match(runtime, /"loading", "loaded", "authenticating", "authenticated", "announced"/);
  assert.match(styles, /\.demo-settings__plugin-list/);
  assert.match(styles, /\.demo-settings__plugin-approval/);
  assert.match(styles, /var\(--demo-theme-border\)/);
  assert.match(styles, /var\(--demo-theme-focus\)/);
});

test("Settings mounts its themed surface while preserving desktop chrome", async () => {
  const styles = await readFile(join(sourceRoot, "styles.css"), "utf8");
  const app = await readFile(join(sourceRoot, "App.tsx"), "utf8");
  const shell = await readFile(join(sourceRoot, "app-shell", "AppShell.tsx"), "utf8");

  assert.match(app, /activeSurfaceType === "settings"[\s\S]*?<SettingsScreen\b/);
  assert.equal((app.match(/visiblePanelSurface !== "settings"/g) ?? []).length, 2, "Settings must omit both host overlay panels");
  assert.match(styles, /--demo-theme-canvas:/);
  assert.match(styles, /--demo-theme-surface:/);
  assert.match(styles, /--demo-theme-text:/);
  assert.match(shell, /className="demo-app-shell__brand-mark"/);
  assert.match(shell, /<WindowControls\b/);
  assert.match(shell, /data-appearance=\{appearance\}/);
});

test("the persistent shell hides navigation while preserving its localized component", async () => {
  const shell = await readFile(join(sourceRoot, "app-shell", "AppShell.tsx"), "utf8");
  const controls = await readFile(join(sourceRoot, "app-shell", "WindowControls.tsx"), "utf8");
  const preferences = await readFile(join(sourceRoot, "preferences.ts"), "utf8");
  const navigation = await readFile(
    join(hostRoot, "..", "..", "packages", "preacherman-surface-skin", "src", "surfaces", "workspace", "BottomNavigation.tsx"),
    "utf8",
  );

  assert.match(shell, /preacherman-mark-light\.png/);
  assert.match(shell, /preacherman-mark-dark\.png/);
  assert.match(shell, /data-appearance=\{appearance\}/);
  assert.doesNotMatch(shell, /<BottomNavigation\b|navigationLabels/);
  assert.match(shell, /locale/);
  assert.match(controls, /locale/);
  assert.match(controls, /windowControls/);
  assert.match(preferences, /\u6700\u5c0f\u5316\u7a97\u53e3/);
  assert.match(preferences, /navigationLabels/);
  assert.match(navigation, /labels\?/);
  assert.match(navigation, /ariaLabel\?/);
});

test("startup welcome follows the stored theme and preserves window chrome", async () => {
  const splash = await readFile(join(sourceRoot, "intro", "IntroSplash.tsx"), "utf8");
  const styles = await readFile(join(sourceRoot, "styles.css"), "utf8");

  assert.match(splash, /appearance/);
  assert.match(splash, /appearance\s*===\s*["']dark["']\s*\?\s*preachermanMarkDark\s*:\s*preachermanMarkLight/);
  assert.match(splash, /data-appearance=\{appearance\}/);
  assert.match(styles, /\.demo-intro-splash\[data-appearance="dark"\]/);
  assert.match(splash, /<WindowControls\b/);
});

test("drag and all eight resize directions stay behind the Demo Host bridge", async () => {
  const shell = await readFile(join(sourceRoot, "app-shell", "AppShell.tsx"), "utf8");
  const handlesPath = join(sourceRoot, "app-shell", "WindowResizeHandles.tsx");
  const client = await readFile(join(sourceRoot, "tauriClient.ts"), "utf8");
  const capability = JSON.parse(
    await readFile(join(hostRoot, "src-tauri", "capabilities", "main.json"), "utf8"),
  );

  assert.equal(await exists(handlesPath), true, "WindowResizeHandles must exist");
  const handles = await readFile(handlesPath, "utf8");
  assert.match(shell, /demo\.window\.start-dragging/);
  assert.match(shell, /<WindowResizeHandles\b/);
  assert.doesNotMatch(shell, /from\s+["']@tauri-apps/);
  assert.doesNotMatch(handles, /from\s+["']@tauri-apps/);
  for (const direction of [
    "North", "NorthEast", "East", "SouthEast",
    "South", "SouthWest", "West", "NorthWest",
  ]) {
    assert.match(handles, new RegExp(direction));
  }
  assert.match(client, /\.startDragging\(\)/);
  assert.match(client, /\.startResizeDragging\(direction(?:\s+as\s+ResizeDirection)?\)/);
  assert.match(client, /TAURI_UNAVAILABLE/);
  assert.equal(capability.permissions.includes("core:window:allow-start-dragging"), true);
  assert.equal(capability.permissions.includes("core:window:allow-start-resize-dragging"), true);
});
