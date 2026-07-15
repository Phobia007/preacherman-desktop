import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const figmaAssetRoot = join(packageRoot, "src", "assets", "figma", "281-538");
const figmaManifestPath = join(figmaAssetRoot, "manifest.json");

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

async function workspaceMarkup() {
  const entry = join(packageRoot, "dist/index.js");
  const { createSurfaceSkinAdapter } = await import(pathToFileURL(entry));
  const adapter = createSurfaceSkinAdapter({
    host: { execute: async () => ({ ok: true }) },
    tokens: {},
  });
  const manifest = {
    surfaceType: "workspace",
    schemaVersion: 1,
    surfaceId: "figma-281-538",
  };
  const resolution = adapter.resolve(manifest);
  return renderToStaticMarkup(createElement(resolution.component, {
    manifest,
    projection: { status: "ready" },
  }));
}

test("package exposes the required React Vite library boundary", async () => {
  const packagePath = join(packageRoot, "package.json");
  assert.equal(await exists(packagePath), true, "surface package.json must exist");
  const manifest = JSON.parse(await readFile(packagePath, "utf8"));

  assert.equal(manifest.type, "module");
  assert.equal(manifest.peerDependencies?.react !== undefined, true);
  assert.equal(manifest.peerDependencies?.["react-dom"] !== undefined, true);
  assert.match(manifest.scripts?.build ?? "", /vite build/);
  assert.match(manifest.exports?.["."]?.import ?? "", /dist/);
  assert.match(manifest.exports?.["."]?.types ?? "", /\.d\.ts$/);
});

test("source package never imports Tauri or runtime modules directly", async () => {
  const sourceRoot = join(packageRoot, "src");
  assert.equal(await exists(sourceRoot), true, "surface source directory must exist");
  for (const file of await sourceFiles(sourceRoot)) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /from\s+["'][^"']*(?:@tauri-apps|tauriClient|\/runtime(?:\/|["']))/i, file);
    assert.doesNotMatch(source, /\b(?:invoke|listen)\s*\(/, file);
  }
});

test("skin styles are scoped and do not rewrite host page CSS", async () => {
  const cssPath = join(packageRoot, "src/styles/index.css");
  assert.equal(await exists(cssPath), true, "scoped package stylesheet must exist");
  const css = await readFile(cssPath, "utf8");
  assert.doesNotMatch(css, /(^|})\s*(?:html|body|:root)(?:\s|,|\{)/m);
  assert.match(css, /\.pm-surface-skin/);
  assert.match(css, /--pm-skin-/);
});

test("built adapter supports known manifests and falls back for unknown versions", async () => {
  const entry = join(packageRoot, "dist/index.js");
  assert.equal(await exists(entry), true, "run vite build before architecture tests");
  const { createSurfaceSkinAdapter } = await import(pathToFileURL(entry));
  const host = { execute: async () => ({ ok: true }) };
  const adapter = createSurfaceSkinAdapter({ host, tokens: {} });

  assert.equal(adapter.supports({ surfaceType: "workspace", schemaVersion: 1 }), true);
  assert.equal(adapter.supports({ surfaceType: "workspace", schemaVersion: 99 }), false);
  assert.equal(adapter.resolve({ surfaceType: "workspace", schemaVersion: 99 }).kind, "fallback");
});

test("built output keeps React external", async () => {
  const entry = join(packageRoot, "dist/index.js");
  assert.equal(await exists(entry), true, "built ESM entry must exist");
  const source = await readFile(entry, "utf8");
  assert.match(source, /from\s+["']react(?:\/jsx-runtime)?["']/);
  assert.doesNotMatch(source, /react\.production\.min|__SECRET_INTERNALS_DO_NOT_USE/);
});

test("workspace manifest maps explicitly to the Figma workspace renderer", async () => {
  const adapterPath = join(packageRoot, "src", "adapter", "createSurfaceSkinAdapter.tsx");
  const source = await readFile(adapterPath, "utf8");
  assert.match(source, /workspace:\s*WorkspaceConversationSurface/);
  assert.match(source, /options\.renderers\?\.\[surfaceType\]/);
  assert.match(source, /SurfaceRenderer/);
});

test("surface source has no Tauri, network, or temporary Figma URL dependency", async () => {
  for (const file of await sourceFiles(join(packageRoot, "src"))) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /@tauri-apps|\b(?:invoke|listen)\s*\(/i, file);
    assert.doesNotMatch(source, /\b(?:fetch|axios|EventSource|WebSocket)\b/i, file);
    assert.doesNotMatch(source, /https?:\/\/(?:www\.)?figma\.com\/api\/mcp\/asset/i, file);
  }
});

test("localized asset manifest preserves the exact Figma frame audit", async () => {
  assert.equal(await exists(figmaManifestPath), true, "Figma asset manifest must exist");
  const manifest = JSON.parse(await readFile(figmaManifestPath, "utf8"));
  assert.deepEqual(manifest.frame, {
    fileKey: "USA27mjAybt1oSFyhwwDaz",
    nodeId: "281:538",
    name: "Page 6 工作区 / conversation workspace",
    width: 1440,
    height: 900,
    topLevelCount: 47,
    descendantCount: 52,
  });
  assert.equal(manifest.hiddenTopLevelNodeIds.length, 17);
  assert.equal(manifest.assets.length >= 13, true);
});

test("every Figma manifest asset is local and matches its SHA-256", async () => {
  assert.equal(await exists(figmaManifestPath), true, "Figma asset manifest must exist");
  const manifest = JSON.parse(await readFile(figmaManifestPath, "utf8"));
  for (const asset of manifest.assets) {
    assert.doesNotMatch(asset.localPath, /^(?:https?:|\/\/)/i);
    const assetPath = join(figmaAssetRoot, asset.localPath);
    assert.equal(await exists(assetPath), true, `${asset.nodeId} asset must exist`);
    const digest = createHash("sha256").update(await readFile(assetPath)).digest("hex");
    assert.equal(digest, asset.sha256, `${asset.nodeId} SHA-256`);
  }
});

test("workspace renderer exposes exactly seven semantic navigation buttons", async () => {
  const markup = await workspaceMarkup();
  assert.equal((markup.match(/<button\b[^>]*data-navigation-item=/g) ?? []).length, 7);
  for (const label of ["Home", "Workspace", "Lab", "State Gallery", "Test Zone", "State Ledger", "Settings"]) {
    assert.match(markup, new RegExp(`>${label}<\\/button>`));
  }
});

test("workspace interaction affordances stay on the surface and expose hover descriptions", async () => {
  const markup = await workspaceMarkup();
  for (const description of [
    "Close window",
    "Minimize window",
    "Maximize or restore window",
    "Open notifications",
  ]) {
    assert.match(markup, new RegExp(`title="${description}"`));
  }
  assert.doesNotMatch(markup, /<(?:a|form)\b|\bhref=|\baction=/i);
});

test("workspace renderer matches all visible Figma copy", async () => {
  const markup = await workspaceMarkup();
  for (const text of ["Status：live", "PM", "Preacherman", "Founder"]) {
    assert.match(markup, new RegExp(text));
  }
});

test("workspace button reset does not override exact navigation typography", async () => {
  const cssPath = join(packageRoot, "src", "surfaces", "workspace", "workspace.css");
  const css = await readFile(cssPath, "utf8");
  const buttonReset = css.match(/\.pm-workspace button\s*\{[^}]*\}/s)?.[0] ?? "";
  assert.doesNotMatch(buttonReset, /\bfont\s*:/);
  assert.match(css, /\.pm-workspace__nav-item\s*\{[^}]*font-size:\s*13px/s);
  assert.match(css, /\.pm-workspace__nav-item--home\s*\{[^}]*font-weight:\s*600/s);
});

test("window chrome routes all window actions through the injected dispatch bridge", async () => {
  const componentPath = join(packageRoot, "src", "surfaces", "workspace", "WindowChrome.tsx");
  assert.equal(await exists(componentPath), true, "WindowChrome must exist");
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /dispatch\(windowCommand\("close"\)\)/);
  assert.match(source, /dispatch\(windowCommand\("minimize"\)\)/);
  assert.match(source, /dispatch\(windowCommand\("toggle-maximize"\)\)/);
  assert.doesNotMatch(source, /@tauri-apps|\b(?:invoke|listen)\s*\(/i);
});

test("workspace orbit layer remains static", async () => {
  const componentPath = join(packageRoot, "src", "surfaces", "workspace", "OrbitLayer.tsx");
  assert.equal(await exists(componentPath), true, "OrbitLayer must exist");
  const source = await readFile(componentPath, "utf8");
  assert.doesNotMatch(source, /animation|requestAnimationFrame|setInterval/i);
});
