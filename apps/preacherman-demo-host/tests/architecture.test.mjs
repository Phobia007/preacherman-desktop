import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const hostRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(hostRoot, "src");
const tauriRoot = join(hostRoot, "src-tauri");

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
    } else if (/\.(?:ts|tsx|css)$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

test("demo host is an independent package with a public Surface Skin dependency", async () => {
  const manifest = JSON.parse(await readFile(join(hostRoot, "package.json"), "utf8"));
  assert.equal(manifest.private, true);
  assert.equal(manifest.workspaces, undefined);
  assert.equal(manifest.dependencies?.["@preacherman/surface-skin"], "file:../../packages/preacherman-surface-skin");
  assert.match(manifest.scripts?.tauri ?? "", /^tauri$/);
});

test("host imports Surface Skin only through its public package entry", async () => {
  assert.equal(await exists(sourceRoot), true, "host source directory must exist");
  const imports = [];
  for (const file of await sourceFiles(sourceRoot)) {
    const source = await readFile(file, "utf8");
    imports.push(...source.matchAll(/from\s+["'](@preacherman\/surface-skin[^"']*)["']/g));
  }
  assert.equal(imports.length > 0, true);
  for (const match of imports) {
    assert.equal(match[1], "@preacherman/surface-skin");
  }
});

test("DemoHostBridge records browser window actions without reporting fake success", async () => {
  const bridgePath = join(sourceRoot, "demoHostBridge.ts");
  assert.equal(await exists(bridgePath), true, "DemoHostBridge must exist");
  const source = await readFile(bridgePath, "utf8");
  assert.match(source, /errorCode:\s*["']TAURI_UNAVAILABLE["']/);
  assert.match(source, /ok:\s*false/);
  assert.match(source, /actionLog\.record/);
  assert.match(source, /getCurrentWindow\(\)\.(?:close|minimize|toggleMaximize)\(\)/);
});

test("Tauri APIs are confined to DemoHostBridge", async () => {
  assert.equal(await exists(sourceRoot), true, "host source directory must exist");
  for (const file of await sourceFiles(sourceRoot)) {
    const source = await readFile(file, "utf8");
    if (source.includes("@tauri-apps")) {
      assert.equal(file, join(sourceRoot, "demoHostBridge.ts"));
    }
  }
});

test("demo host has no backend or network client", async () => {
  assert.equal(await exists(sourceRoot), true, "host source directory must exist");
  for (const file of await sourceFiles(sourceRoot)) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /\b(?:fetch|axios|EventSource|WebSocket)\b/i, file);
    assert.doesNotMatch(source, /tauriClient|database|sqlite|upload|credential/i, file);
  }
});

test("host supplies one explicit workspace manifest and no extra routes", async () => {
  const appPath = join(sourceRoot, "App.tsx");
  assert.equal(await exists(appPath), true, "App must exist");
  const source = await readFile(appPath, "utf8");
  assert.match(source, /surfaceType:\s*["']workspace["']/);
  assert.match(source, /schemaVersion:\s*1/);
  assert.match(source, /surfaceId:\s*["']figma-281-538["']/);
  assert.doesNotMatch(source, /react-router|createBrowserRouter|(?:page|frame|route)[-_ ]?(?:53|55)\b/i);
});

test("Tauri window configuration matches the 1440 by 900 borderless baseline", async () => {
  const configPath = join(tauriRoot, "tauri.conf.json");
  assert.equal(await exists(configPath), true, "tauri.conf.json must exist");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  assert.equal(config.productName, "Preacherman Desktop Demo");
  assert.equal(config.identifier, "ai.preacherman.demo");
  const window = config.app.windows[0];
  assert.equal(window.width, 1440);
  assert.equal(window.height, 900);
  assert.equal(window.decorations, false);
  assert.equal(window.center, true);
  assert.equal(window.resizable, true);
  assert.equal(window.backgroundColor, "#F7F5F1");
});

test("Tauri capability grants only the required core window actions", async () => {
  const capabilityPath = join(tauriRoot, "capabilities", "main.json");
  assert.equal(await exists(capabilityPath), true, "main capability must exist");
  const capability = JSON.parse(await readFile(capabilityPath, "utf8"));
  assert.deepEqual(capability.windows, ["main"]);
  assert.deepEqual(capability.permissions, [
    "core:window:default",
    "core:window:allow-close",
    "core:window:allow-minimize",
    "core:window:allow-toggle-maximize"
  ]);
});

test("Tauri Windows resources use a valid localized icon", async () => {
  const iconPath = join(tauriRoot, "icons", "icon.ico");
  assert.equal(await exists(iconPath), true, "Windows icon must exist");
  const bytes = await readFile(iconPath);
  assert.equal(bytes.readUInt16LE(0), 0, "ICO reserved header");
  assert.equal(bytes.readUInt16LE(2), 1, "ICO image type");
  assert.equal(bytes.readUInt16LE(4) > 0, true, "ICO must contain an image");
});

test("Rust host remains a minimal Tauri shell without backend commands", async () => {
  const rustPath = join(tauriRoot, "src", "main.rs");
  assert.equal(await exists(rustPath), true, "Rust main must exist");
  const source = await readFile(rustPath, "utf8");
  assert.match(source, /tauri::Builder::default\(\)/);
  assert.doesNotMatch(source, /#\[tauri::command\]|invoke_handler|plugin\(/);
});
