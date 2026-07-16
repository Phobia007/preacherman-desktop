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
const homeBatchAssetRoot = join(packageRoot, "src", "assets", "figma", "home-batch-1");
const homeBatchManifestPath = join(homeBatchAssetRoot, "manifest.json");

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

async function surfaceMarkup(surfaceType, surfaceId) {
  const entry = join(packageRoot, "dist/index.js");
  const { createSurfaceSkinAdapter } = await import(pathToFileURL(entry));
  const adapter = createSurfaceSkinAdapter({
    host: { execute: async () => ({ ok: true }) },
    tokens: {},
  });
  const manifest = { surfaceType, schemaVersion: 1, surfaceId };
  const resolution = adapter.resolve(manifest);
  return {
    kind: resolution.kind,
    markup: renderToStaticMarkup(createElement(resolution.component, {
      manifest,
      projection: { status: "ready" },
    })),
  };
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
  assert.match(source, /home:\s*HomeFlowSurface/);
  assert.match(source, /options\.renderers\?\.\[surfaceType\]/);
  assert.match(source, /SurfaceRenderer/);
});

test("first Home batch resolves six explicit Figma screen states without changing fallback behavior", async () => {
  const frames = [
    ["figma-287-637", "STATE TRACE"],
    ["figma-287-714", "current state: v 1.0.0"],
    ["figma-219-3", "Strategy Operator v1.8"],
    ["figma-281-374", "click to chat with her."],
    ["figma-32-2", "Talk to me freely"],
    ["figma-412-728", "three high-leverage opportunities"],
  ];

  for (const [surfaceId, expectedText] of frames) {
    const { kind, markup } = await surfaceMarkup("home", surfaceId);
    assert.equal(kind, "renderer", surfaceId);
    assert.match(markup, new RegExp(`data-figma-frame="${surfaceId.replace("figma-", "").replaceAll("-", ":")}"`));
    assert.match(markup, new RegExp(expectedText, "i"), surfaceId);
  }

  const unknownVersion = await surfaceMarkup("home", "figma-287-637-unknown");
  assert.equal(unknownVersion.kind, "renderer");
  const entry = join(packageRoot, "dist/index.js");
  const { createSurfaceSkinAdapter } = await import(pathToFileURL(entry));
  const adapter = createSurfaceSkinAdapter({ host: { execute: async () => ({ ok: true }) } });
  assert.equal(adapter.resolve({ surfaceType: "home", schemaVersion: 99 }).kind, "fallback");
});

test("Home batch reuses shared shell components and exposes the designed interaction affordances", async () => {
  const componentPath = join(packageRoot, "src", "surfaces", "home", "HomeFlowSurface.tsx");
  assert.equal(await exists(componentPath), true, "HomeFlowSurface must exist");
  const source = await readFile(componentPath, "utf8");
  for (const sharedComponent of ["WindowChrome", "TopLiveStatus", "UserIdentity", "BottomNavigation"]) {
    assert.match(source, new RegExp(`<${sharedComponent}\\b`));
  }
  assert.match(source, /onMouseEnter|onPointerEnter/);
  assert.match(source, /onMouseLeave|onPointerLeave/);
  assert.match(source, /onFocus/);
  assert.match(source, /onClick/);
  assert.doesNotMatch(source, /@tauri-apps|\b(?:fetch|axios|EventSource|WebSocket)\b/i);
  assert.doesNotMatch(source, /https?:\/\/(?:www\.)?figma\.com\/api\/mcp\/asset/i);
});

test("Home product flow binds Figma states to their literal interaction triggers", async () => {
  const home = await readFile(join(packageRoot, "src", "surfaces", "home", "HomeFlowSurface.tsx"), "utf8");
  const conversation = await readFile(join(packageRoot, "src", "surfaces", "home", "ConversationScene.tsx"), "utf8");
  const workspace = await readFile(join(packageRoot, "src", "surfaces", "workspace", "WorkspaceConversationSurface.tsx"), "utf8");

  assert.match(home, /current-state[\s\S]*screenCommand\("figma-219-3"\)/, "Current State click opens its detail");
  assert.match(home, /chat-target[\s\S]*screenCommand\("figma-32-2"\)/, "State figure click opens chat");
  assert.match(workspace, /state-chat-target[\s\S]*screenCommand\("figma-32-2"\)/, "accepted Home figure opens chat");
  assert.match(conversation, /screenCommand\("figma-412-728"\)/, "prompt submission targets the reply state");
  assert.match(conversation, /event\.key === "Enter"[\s\S]*sendPrompt\(\)/, "Enter submits the typed prompt");
  assert.match(conversation, /onKeyDown=\{handleComposerKeyDown\}/, "composer binds the Enter handler");
  assert.doesNotMatch(home, /screenCommand\("figma-(?:287-714|281-374)"\)/, "annotation frames stay QA-only states");
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

test("first Home batch asset audit is local, deduplicated, and covers six source frames", async () => {
  assert.equal(await exists(homeBatchManifestPath), true, "Home batch asset manifest must exist");
  const manifest = JSON.parse(await readFile(homeBatchManifestPath, "utf8"));
  assert.deepEqual(manifest.frames.map((frame) => frame.nodeId), [
    "287:637",
    "287:714",
    "219:3",
    "281:374",
    "32:2",
    "412:728",
  ]);
  assert.equal(manifest.assets.length, 49);
  assert.equal(new Set(manifest.assets.map((asset) => asset.sha256)).size, 49);
  for (const asset of manifest.assets) {
    assert.doesNotMatch(asset.localPath, /^(?:https?:|\/\/)/i);
    const assetPath = join(homeBatchAssetRoot, asset.localPath);
    assert.equal(await exists(assetPath), true, `${asset.localPath} must exist`);
    const digest = createHash("sha256").update(await readFile(assetPath)).digest("hex");
    assert.equal(digest, asset.sha256, `${asset.localPath} SHA-256`);
  }
});

test("Home conversation can submit from the keyboard without duplicating the visible task control", async () => {
  const componentPath = join(packageRoot, "src", "surfaces", "home", "ConversationScene.tsx");
  const cssPath = join(packageRoot, "src", "surfaces", "home", "home.css");
  const source = await readFile(componentPath, "utf8");
  const css = await readFile(cssPath, "utf8");

  assert.match(source, /event\.key === "Enter"/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /<SessionFlow currentStep=\{0\}/);
  assert.match(source, /tabIndex=\{-1\}/, "hidden submit control must not create an invisible tab stop");
  assert.match(css, /\.pm-conversation__send\s*\{[^}]*clip:/s);
  assert.match(css, /\.pm-conversation--reply \.pm-conversation__turn-task\s*\{[^}]*display:\s*none/s);
});

test("State Flow uses the Figma Current Focus node and copy", async () => {
  const componentPath = join(packageRoot, "src", "surfaces", "home", "SessionFlow.tsx");
  const source = await readFile(componentPath, "utf8");

  assert.match(source, /flow-node-outer-current-focus\.svg/);
  assert.match(source, /flow-node-inner-current-focus\.svg/);
  assert.match(source, /219-3--state-focus-flow-node-session-start\.svg/);
  assert.match(source, /219-3--state-focus-flow-node-exploring\.svg/);
  assert.match(source, /Current Focus/);
  assert.match(source, /state-focus-flow-chat-icon\.svg/);
});

test("workspace renderer exposes exactly seven semantic navigation buttons", async () => {
  const markup = await workspaceMarkup();
  assert.equal((markup.match(/<button\b[^>]*data-navigation-item=/g) ?? []).length, 7);
  for (const label of ["Home", "Workspace", "Lab", "State Gallery", "Test Zone", "State Ledger", "Settings"]) {
    assert.match(markup, new RegExp(`>${label}<\\/button>`));
  }
});

test("all implemented surfaces share one floating bottom navigation panel", async () => {
  const workspace = await workspaceMarkup();
  const home = await surfaceMarkup("home", "figma-287-637");

  for (const markup of [workspace, home.markup]) {
    assert.equal((markup.match(/pm-workspace__bottom-navigation-zone/g) ?? []).length, 1);
    assert.equal((markup.match(/<nav\b[^>]*pm-workspace__bottom-navigation/g) ?? []).length, 1);
    assert.equal((markup.match(/<button\b[^>]*data-navigation-item=/g) ?? []).length, 7);
  }
});

test("bottom navigation is an 820px floating panel revealed by the bottom zone", async () => {
  const componentPath = join(packageRoot, "src", "surfaces", "workspace", "BottomNavigation.tsx");
  const cssPath = join(packageRoot, "src", "surfaces", "workspace", "workspace.css");
  const source = await readFile(componentPath, "utf8");
  const css = await readFile(cssPath, "utf8");
  const zone = css.match(/\.pm-workspace__bottom-navigation-zone\s*\{[^}]*\}/s)?.[0] ?? "";
  const panel = css.match(/\.pm-workspace__bottom-navigation\s*\{[^}]*\}/s)?.[0] ?? "";

  assert.match(zone, /bottom:\s*0/);
  assert.match(zone, /height:\s*92px/);
  assert.match(panel, /width:\s*820px/);
  assert.match(panel, /bottom:\s*16px/);
  assert.match(panel, /border-radius:\s*14px/);
  assert.match(panel, /box-shadow:/);
  assert.match(panel, /opacity:\s*0/);
  assert.match(panel, /visibility:\s*hidden/);
  assert.match(panel, /pointer-events:\s*none/);
  assert.match(source, /NAVIGATION_HIDE_DELAY_MS\s*=\s*360/);
  assert.match(source, /setTimeout\([\s\S]*NAVIGATION_HIDE_DELAY_MS/);
  assert.match(source, /onMouseEnter=\{showNavigation\}/);
  assert.match(source, /onMouseLeave=\{scheduleNavigationHide\}/);
  assert.equal((source.match(/<span className="pm-workspace__navigation-dot"/g) ?? []).length, 3);
  assert.match(css, /@keyframes pm-navigation-dot-breathe/);
  assert.match(css, /animation-delay:\s*-0\.36s/);
  assert.match(css, /\.pm-workspace__bottom-navigation-zone\.is-visible[^{]*\.pm-workspace__bottom-navigation/);
});

test("green status button toggles an empty glass popover and closes on outside click or Escape", async () => {
  const componentPath = join(packageRoot, "src", "surfaces", "workspace", "TopLiveStatus.tsx");
  const cssPath = join(packageRoot, "src", "surfaces", "workspace", "workspace.css");
  const source = await readFile(componentPath, "utf8");
  const css = await readFile(cssPath, "utf8");

  assert.match(source, /aria-expanded=\{isOpen\}/);
  assert.match(source, /setIsOpen\(\(open\)\s*=>\s*!open\)/);
  assert.match(source, /event\.key\s*===\s*["']Escape["']/);
  assert.match(source, /contains\(event\.target/);
  assert.match(source, /pm-workspace__status-popover/);
  assert.match(source, />Alive<\/span>/);
  assert.doesNotMatch(source, /Status[^A-Za-z]*(?:live|Live)|screenCommand/);
  assert.match(css, /\.pm-workspace__status-indicator\s*\{[^}]*width:\s*80px[^}]*height:\s*26px[^}]*font-size:\s*10px/s);
  assert.match(css, /\.pm-workspace__status-popover\s*\{[^}]*width:\s*300px[^}]*height:\s*190px[^}]*backdrop-filter:\s*blur/s);
});

test("workspace interaction affordances stay on the surface and expose hover descriptions", async () => {
  const markup = await workspaceMarkup();
  for (const description of ["Open notifications"]) {
    assert.match(markup, new RegExp(`title="${description}"`));
  }
  assert.doesNotMatch(markup, /<(?:a|form)\b/i);
});

test("workspace renderer matches all visible Figma copy", async () => {
  const markup = await workspaceMarkup();
  for (const text of ["PM", "Preacherman", "Founder"]) {
    assert.match(markup, new RegExp(text));
  }
  assert.doesNotMatch(markup, /Status[^<]*(?:live|Live)/);
});

test("workspace button reset does not override exact navigation typography", async () => {
  const cssPath = join(packageRoot, "src", "surfaces", "workspace", "workspace.css");
  const css = await readFile(cssPath, "utf8");
  const buttonReset = css.match(/\.pm-workspace button\s*\{[^}]*\}/s)?.[0] ?? "";
  assert.doesNotMatch(buttonReset, /\bfont\s*:/);
  assert.match(css, /\.pm-workspace__nav-item\s*\{[^}]*font-size:\s*13px/s);
  assert.match(css, /\.pm-workspace__nav-item--home\s*\{[^}]*font-weight:\s*600/s);
});

test("window chrome shows the local Preacherman mark inside a frameless drag region", async () => {
  const componentPath = join(packageRoot, "src", "surfaces", "workspace", "WindowChrome.tsx");
  const logoPath = join(packageRoot, "src", "assets", "brand", "preacherman-mark.png");
  assert.equal(await exists(componentPath), true, "WindowChrome must exist");
  const source = await readFile(componentPath, "utf8");
  assert.equal(await exists(logoPath), true, "top-left logo must be a local Surface Skin asset");
  assert.match(source, /data-tauri-drag-region/);
  assert.match(source, /preacherman-mark\.png/);
  assert.doesNotMatch(source, /window-(?:close|minimize|maximize)\.svg|windowCommand/);
  assert.doesNotMatch(source, /@tauri-apps|\b(?:invoke|listen)\s*\(/i);
});

test("workspace orbit layer binds four named semantic nodes to shared layered geometry and the local bridge", async () => {
  const componentPath = join(packageRoot, "src", "surfaces", "workspace", "OrbitLayer.tsx");
  const geometryPath = join(packageRoot, "src", "surfaces", "workspace", "orbitGeometry.ts");
  const commandsPath = join(packageRoot, "src", "surfaces", "workspace", "commands.ts");
  const cssPath = join(packageRoot, "src", "surfaces", "workspace", "workspace.css");
  assert.equal(await exists(componentPath), true, "OrbitLayer must exist");
  const source = await readFile(componentPath, "utf8");
  const geometry = await readFile(geometryPath, "utf8");
  const commands = await readFile(commandsPath, "utf8");
  const css = await readFile(cssPath, "utf8");

  for (const label of ["Memory Core", "Code Copilot", "Research Scout", "Insight Miner"]) {
    assert.match(geometry, new RegExp(label));
  }
  assert.equal((source.match(/<button\b/g) ?? []).length, 1, "one mapped semantic button template");
  assert.match(source, /dispatch\(orbitNodeCommand\(node\.id,\s*node\.label\)\)/);
  assert.match(source, /orbitFrameAtElapsed/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /data-orbit-layer=\{node\.layer\}/);
  assert.match(source, /onMouseEnter=\{\(\)\s*=>\s*activateNode\(node\.id,\s*orbit\.id\)\}/);
  assert.match(commands, /type:\s*["']demo\.orbit-node\.select["']/);
  assert.match(css, /\.pm-workspace__orbit-track-layer--back\s*\{[^}]*z-index:\s*1/s);
  assert.match(css, /\.pm-workspace__orbit-track-layer--front\s*\{[^}]*z-index:\s*4/s);
  assert.match(css, /\.pm-workspace__human-stack\s*\{[^}]*z-index:\s*2/s);
  assert.match(css, /\.pm-workspace__orbit-node\.is-highlighted img/);
});
