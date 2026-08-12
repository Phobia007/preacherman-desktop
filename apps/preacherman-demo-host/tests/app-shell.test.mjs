import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
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

async function sourceFiles(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await sourceFiles(path));
    } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

test("Demo Host owns one persistent shell outside the changing screen content", async () => {
  const shellPath = join(sourceRoot, "app-shell", "AppShell.tsx");
  const appPath = join(sourceRoot, "App.tsx");
  assert.equal(await exists(shellPath), true, "AppShell must exist in Demo Host");
  const shell = await readFile(shellPath, "utf8");
  const app = await readFile(appPath, "utf8");

  assert.match(shell, /preacherman-mark-light\.png/);
  assert.match(shell, /preacherman-mark-dark\.png/);
  assert.match(shell, /<WindowControls\b/);
  assert.match(shell, /<BottomNavigation\b/);
  assert.match(shell, /demo-app-shell__screen-content/);
  assert.match(shell, /demo\.window\.start-dragging/);
  assert.match(shell, /<WindowResizeHandles\b/);
  assert.match(app, /showStartupIntro\s*\?\s*\(\s*<IntroSplash[\s\S]*:\s*\(\s*<AppShell\b/);
  assert.match(app, /key=\{contentKey\}/);
  assert.doesNotMatch(shell, /key=\{contentKey\}/, "the shell itself must not remount on navigation");
});

test("window controls use the supplied local 80 by 80 SVG paths and bridge commands", async () => {
  const controlsPath = join(sourceRoot, "app-shell", "WindowControls.tsx");
  const assetRoot = join(sourceRoot, "assets", "window-controls");
  assert.equal(await exists(controlsPath), true, "WindowControls must exist in Demo Host");
  const controls = await readFile(controlsPath, "utf8");
  const expected = new Map([
    ["window-minimize.svg", "M62 40H18"],
    ["window-maximize.svg", "M14.84 24.491a10.85 10.85 0 0 1 9.651-9.651a146 146 0 0 1 31.018 0a10.85 10.85 0 0 1 9.651 9.651a146 146 0 0 1 0 31.018a10.85 10.85 0 0 1-9.651 9.651a146 146 0 0 1-31.018 0a10.85 10.85 0 0 1-9.651-9.651a146 146 0 0 1 0-31.018"],
    ["window-close.svg", "M55.556 55.67L24.444 24.556m0 31.112l31.112-31.112"],
  ]);

  for (const [file, path] of expected) {
    const source = await readFile(join(assetRoot, file), "utf8");
    assert.match(source, /viewBox="0 0 80 80"/);
    assert.match(source, /stroke-width="4"/);
    assert.match(source, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(controls, new RegExp(file.replace(".", "\\.")));
  }

  assert.match(controls, /uiCopy\[locale\]\.windowControls/);
  assert.match(controls, /aria-label=\{labels\[control\.labelKey\]\}/);
  for (const action of ["minimize", "toggle-maximize", "close"]) {
    assert.match(controls, new RegExp(`action:\\s*["']${action}["']`));
  }
  assert.match(controls, /dispatch\(windowCommand\(control\.action\)\)/);
  assert.doesNotMatch(controls, /@tauri-apps|[🔴🟡🟢]|>\s*[×−□]\s*</u);
});

test("tauriClient is the only native API boundary and browser preview does not fake success", async () => {
  const clientPath = join(sourceRoot, "tauriClient.ts");
  const bridgePath = join(sourceRoot, "demoHostBridge.ts");
  assert.equal(await exists(clientPath), true, "tauriClient must exist");
  const client = await readFile(clientPath, "utf8");
  const bridge = await readFile(bridgePath, "utf8");

  assert.match(client, /@tauri-apps\/api\/core/);
  assert.match(client, /@tauri-apps\/api\/window/);
  assert.match(client, /\.minimize\(\)/);
  assert.match(client, /\.toggleMaximize\(\)/);
  assert.match(client, /\.close\(\)/);
  assert.match(client, /TAURI_UNAVAILABLE/);
  assert.match(client, /ok:\s*false/);
  assert.match(bridge, /from\s+["']\.\/tauriClient["']/);
  assert.doesNotMatch(bridge, /@tauri-apps|getCurrentWindow|isTauri/);

  for (const file of await sourceFiles(sourceRoot)) {
    const source = await readFile(file, "utf8");
    if (source.includes("@tauri-apps")) {
      assert.equal(file, clientPath);
    }
  }
});

test("all seven stable navigation keys have local routes without adding a router", async () => {
  const route = await readFile(join(sourceRoot, "demo", "screenRoute.ts"), "utf8");
  const bridge = await readFile(join(sourceRoot, "demoHostBridge.ts"), "utf8");
  const app = await readFile(join(sourceRoot, "App.tsx"), "utf8");

  assert.match(route, /localSurfacePath\s*=\s*["']\/__surfaces["']/);
  assert.match(route, /openLocalSurface/);
  assert.match(bridge, /demo\.navigation\.select/);
  for (const key of ["home", "workspace", "lab", "market", "test", "ledger", "settings"]) {
    assert.match(app + route, new RegExp(`(?:["']${key}["']|\\b${key}:)`));
  }
  assert.doesNotMatch(app + route, /react-router|createBrowserRouter/);
});

test("non-Gallery destinations share the persistent scene while Settings keeps controls", async () => {
  const app = await readFile(join(sourceRoot, "App.tsx"), "utf8");
  const styles = await readFile(join(sourceRoot, "styles.css"), "utf8");
  const hostRule = styles.match(/\.demo-host\s*\{[^}]*\}/s)?.[0] ?? "";
  const emptyRule = styles.match(/(?:^|\n)\.demo-host--empty\s*\{[^}]*\}/s)?.[0] ?? "";
  const sceneRule = styles.match(/\.demo-app-shell__scene\s*\{[^}]*\}/s)?.[0] ?? "";

  assert.match(app, /activeSurfaceType\s*===\s*["']home["']/);
  assert.match(app, /activeSurfaceType\s*===\s*["']settings["']/);
  assert.match(app, /<SettingsScreen\b/);
  assert.match(app, /demo-host--empty/);
  assert.match(hostRule, /background:\s*transparent/);
  assert.equal(emptyRule, "");
  assert.match(sceneRule, /background:\s*#010409/);
  assert.match(app, /sceneHidden=\{activeSurfaceType === "market"\}/);
  assert.doesNotMatch(app, /workspace:\s*\{\s*surfaceType:\s*["']workspace["']/);
});

test("Tauri bundles the localized Preacherman Windows icon", async () => {
  const config = JSON.parse(await readFile(join(hostRoot, "src-tauri", "tauri.conf.json"), "utf8"));
  assert.equal(config.bundle.icon.includes("icons/icon.ico"), true);
  assert.equal(await exists(join(hostRoot, "src-tauri", "icons", "icon.ico")), true);
});
