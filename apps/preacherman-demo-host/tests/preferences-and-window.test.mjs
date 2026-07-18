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

test("Settings owns persisted appearance and language controls", async () => {
  const settingsPath = join(sourceRoot, "settings", "SettingsScreen.tsx");
  const preferencesPath = join(sourceRoot, "preferences.ts");
  assert.equal(await exists(settingsPath), true, "SettingsScreen must exist");
  assert.equal(await exists(preferencesPath), true, "preferences module must exist");

  const settings = await readFile(settingsPath, "utf8");
  const preferences = await readFile(preferencesPath, "utf8");
  const app = await readFile(join(sourceRoot, "App.tsx"), "utf8");

  assert.match(settings, /Appearance/);
  assert.match(settings, /Language/);
  assert.match(settings, /\u5916\u89c2/);
  assert.match(settings, /\u8bed\u8a00/);
  assert.match(settings, /onAppearanceChange/);
  assert.match(settings, /onLocaleChange/);
  assert.match(preferences, /preacherman\.preferences/);
  assert.match(preferences, /localStorage\.getItem/);
  assert.match(preferences, /localStorage\.setItem/);
  assert.match(app, /<SettingsScreen\b/);
  assert.match(app, /readPreferences/);
  assert.match(app, /savePreferences/);
});

test("the persistent shell localizes navigation and maps supplied marks to each theme", async () => {
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
  assert.match(shell, /navigationLabels/);
  assert.match(shell, /locale/);
  assert.match(controls, /locale/);
  assert.match(controls, /windowControls/);
  assert.match(preferences, /\u6700\u5c0f\u5316\u7a97\u53e3/);
  assert.match(navigation, /labels\?/);
  assert.match(navigation, /ariaLabel\?/);
});

test("startup splash follows the stored theme without changing the SVG masks", async () => {
  const splash = await readFile(join(sourceRoot, "intro", "IntroSplash.tsx"), "utf8");
  const animatedLogo = await readFile(join(sourceRoot, "intro", "AnimatedPreachermanLogo.tsx"), "utf8");

  assert.match(splash, /appearance/);
  assert.match(splash, /appearance\s*===\s*["']dark["']/);
  assert.match(splash, /ink=\{introInk\}/);
  assert.match(splash, /data-appearance=\{appearance\}/);
  assert.match(animatedLogo, /stroke="white"/);
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
