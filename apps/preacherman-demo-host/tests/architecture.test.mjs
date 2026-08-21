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

test("browser shell serves a local favicon without external asset requests", async () => {
  const html = await readFile(join(hostRoot, "index.html"), "utf8");
  const faviconPath = join(hostRoot, "public", "favicon.ico");
  assert.match(html, /<link[^>]+rel=["']icon["'][^>]+href=["']\/favicon\.ico["']/);
  assert.equal(await exists(faviconPath), true, "local browser favicon must exist");
  assert.doesNotMatch(html, /https?:\/\//i);
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

test("host build deduplicates React across the linked Surface Skin package", async () => {
  const configPath = join(hostRoot, "vite.config.ts");
  assert.equal(await exists(configPath), true, "host Vite config must exist");
  const source = await readFile(configPath, "utf8");
  const compactSource = source.replace(/\s/g, "");
  const dedupeEntries = compactSource.match(/dedupe:\[([^\]]+)\]/)?.[1] ?? "";
  assert.match(dedupeEntries, /"react"/);
  assert.match(dedupeEntries, /"react-dom"/);
});

test("DemoHostBridge records browser window actions without reporting fake success", async () => {
  const bridgePath = join(sourceRoot, "demoHostBridge.ts");
  const clientPath = join(sourceRoot, "tauriClient.ts");
  assert.equal(await exists(bridgePath), true, "DemoHostBridge must exist");
  assert.equal(await exists(clientPath), true, "Tauri client boundary must exist");
  const bridgeSource = await readFile(bridgePath, "utf8");
  const clientSource = await readFile(clientPath, "utf8");
  assert.match(clientSource, /errorCode:\s*["']TAURI_UNAVAILABLE["']/);
  assert.match(clientSource, /ok:\s*false/);
  assert.match(bridgeSource, /actionLog\.record/);
  assert.match(clientSource, /const window = getCurrentWindow\(\)/);
  assert.match(clientSource, /window\.close\(\)/);
  assert.match(clientSource, /window\.minimize\(\)/);
  assert.match(clientSource, /window\.toggleMaximize\(\)/);
});

test("Tauri APIs are confined to the Tauri client boundary", async () => {
  assert.equal(await exists(sourceRoot), true, "host source directory must exist");
  for (const file of await sourceFiles(sourceRoot)) {
    const source = await readFile(file, "utf8");
    if (source.includes("@tauri-apps")) {
      assert.equal(file, join(sourceRoot, "tauriClient.ts"));
    }
  }
});

test("network access stays on approved local Agent, voice, and avatar-stream boundaries and never contains credentials", async () => {
  assert.equal(await exists(sourceRoot), true, "host source directory must exist");
  for (const file of await sourceFiles(sourceRoot)) {
    const source = await readFile(file, "utf8");
    if (/\b(?:fetch|axios|EventSource|WebSocket)\b/i.test(source)) {
      assert.ok([
        join(sourceRoot, "ab", "ABTaskConsole.tsx"),
        join(sourceRoot, "preacherman", "capabilityClient.ts"),
        join(sourceRoot, "conversationLedger.ts"),
        join(sourceRoot, "motion", "SpeechMotionRuntime.ts"),
        join(sourceRoot, "settings", "SettingsScreen.tsx"),
        join(sourceRoot, "realtime", "VoiceSessionControl.tsx"),
        join(sourceRoot, "telemetry", "cortanaVoiceTiming.ts"),
      ].includes(file), file);
    }
    assert.doesNotMatch(source, /OPENAI_API_KEY|CODEX_API_KEY/, file);
  }
});

test("host keeps the accepted workspace manifest and adds only the demo screen index route", async () => {
  const appPath = join(sourceRoot, "App.tsx");
  const routePath = join(sourceRoot, "demo", "screenRoute.ts");
  assert.equal(await exists(appPath), true, "App must exist");
  assert.equal(await exists(routePath), true, "screen route helper must exist");
  const source = await readFile(appPath, "utf8");
  const routeSource = await readFile(routePath, "utf8");
  assert.match(source, /surfaceType:\s*["']workspace["']/);
  assert.match(source, /schemaVersion:\s*1/);
  assert.match(source, /surfaceId:\s*["']figma-281-538["']/);
  assert.match(source, /identity:\s*\{[\s\S]*identityNumber:\s*["']01["'][\s\S]*\}/);
  assert.doesNotMatch(source, /react-router|createBrowserRouter|(?:page|frame|route)[-_ ]?(?:53|55)\b/i);
  assert.match(routeSource, /__screens/);
  assert.match(routeSource, /__surfaces/);
});

test("Figma Screen Registry reconciles all 53 current Figma pages with explicit status", async () => {
  const registryPath = join(sourceRoot, "demo", "figmaScreenRegistry.ts");
  assert.equal(await exists(registryPath), true, "Figma Screen Registry must exist");
  const source = await readFile(registryPath, "utf8");
  const pageIds = [...source.matchAll(/pageId:\s*["']([^"']+)["']/g)].map((match) => match[1]);
  const screenIds = [...source.matchAll(/screenId:\s*["']([^"']+)["']/g)].map((match) => match[1]);
  const implemented = [...source.matchAll(/implementationStatus:\s*["']implemented["']/g)];
  const pending = [...source.matchAll(/implementationStatus:\s*["']pending["']/g)];

  assert.equal(pageIds.length, 53);
  assert.equal(new Set(pageIds).size, 53, "page IDs must be unique");
  assert.equal(screenIds.length, 53);
  assert.equal(new Set(screenIds).size, 53, "screen IDs must be unique");
  assert.equal(implemented.length, 7, "accepted frame plus first six-frame batch");
  assert.equal(pending.length, 46, "all non-implemented pages stay explicitly pending");
  assert.match(source, /pdfReconciliation\s*=\s*["']PDF 55页待补充核对["']/);
});

test("Demo Screen Index lists every registry entry and links only implemented screens", async () => {
  const indexPath = join(sourceRoot, "demo", "ScreenIndex.tsx");
  const routePath = join(sourceRoot, "demo", "screenRoute.ts");
  assert.equal(await exists(indexPath), true, "Demo Screen Index must exist");
  assert.equal(await exists(routePath), true, "screen route helper must exist");
  const indexSource = await readFile(indexPath, "utf8");
  const routeSource = await readFile(routePath, "utf8");
  assert.match(indexSource, /figmaScreenRegistry\.map/);
  assert.match(indexSource, /implementationStatus\s*===\s*["']implemented["']/);
  assert.match(indexSource, /disabled/);
  assert.match(indexSource, /Implemented/);
  assert.match(indexSource, /Pending/);
  assert.match(routeSource, /\/__screens/);
  assert.match(routeSource, /history\.pushState/);
  assert.doesNotMatch(indexSource + routeSource, /react-router|createBrowserRouter/);
});

test("startup welcome holds the main surface for a three-second centered logo sequence", async () => {
  const appPath = join(sourceRoot, "App.tsx");
  const introPath = join(sourceRoot, "introSequence.ts");
  const logoPath = join(sourceRoot, "assets", "preacherman-mark.png");
  const stylesPath = join(sourceRoot, "styles.css");
  const splashPath = join(sourceRoot, "intro", "IntroSplash.tsx");
  const animatedLogoStylesPath = join(sourceRoot, "intro", "animated-preacherman-logo.css");
  const app = await readFile(appPath, "utf8");
  const intro = await readFile(introPath, "utf8");
  const styles = await readFile(stylesPath, "utf8");
  const splash = await readFile(splashPath, "utf8");
  const animatedLogoStyles = await readFile(animatedLogoStylesPath, "utf8");

  assert.equal(await exists(logoPath), true, "the shared localized brand asset must remain available");
  assert.match(app, /claimStartupIntro\(\)/);
  assert.match(app, /<IntroSplash[\s\S]*onComplete=\{handleIntroComplete\}/);
  assert.match(intro, /signalLockMs:\s*2000/);
  assert.match(intro, /totalDurationMs:\s*3000/);
  assert.match(intro, /mainFadeInMs:\s*700/);
  assert.match(splash, /preacherman-mark-light\.png/);
  assert.match(splash, /preacherman-mark-dark\.png/);
  assert.match(splash, /setTimeout\(onComplete, STARTUP_INTRO_TIMING\.totalDurationMs\)/);
  assert.doesNotMatch(splash, />\s*(?:Login|Register|Visitor)\s*</);
  assert.doesNotMatch(splash, /<button\b|<nav\b|preacherman:auth-requested/);
  assert.match(animatedLogoStyles, /\.demo-intro-splash__logo\s*\{[^}]*width:\s*860px[^}]*height:\s*450px/s);
  assert.match(animatedLogoStyles, /\.demo-intro-splash__logo\s*\{[^}]*top:\s*50%/s);
  assert.match(animatedLogoStyles, /@keyframes demo-signal-lock/);
  assert.doesNotMatch(
    app + intro + styles + splash + animatedLogoStyles,
    /https?:\/\/|codex\/attachments|AppData\/Local\/Temp/i,
  );
});

test("Tauri window configuration matches the 1800 by 1000 borderless baseline", async () => {
  const configPath = join(tauriRoot, "tauri.conf.json");
  assert.equal(await exists(configPath), true, "tauri.conf.json must exist");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  assert.equal(config.productName, "Preacherman Desktop Demo");
  assert.equal(config.identifier, "ai.preacherman.demo");
  const window = config.app.windows[0];
  assert.equal(window.width, 1800);
  assert.equal(window.height, 1000);
  assert.equal(window.decorations, false);
  assert.equal(window.center, true);
  assert.equal(window.resizable, true);
  assert.equal(window.visible, true);
  assert.equal(window.backgroundColor, "#F7F5F1");
});

test("the native window stays visible while the intro waits for its visual to be ready", async () => {
  const splash = await readFile(join(sourceRoot, "intro", "IntroSplash.tsx"), "utf8");
  const tauriClient = await readFile(join(sourceRoot, "tauriClient.ts"), "utf8");

  assert.match(splash, /data-ready=\{visualReady\}/);
  assert.doesNotMatch(splash, /onReady|useLayoutEffect/);
  assert.doesNotMatch(tauriClient, /revealCurrentWindow|getCurrentWindow\(\)\.show\(\)/);
});

test("the lightweight startup renders before the main application bundle is imported", async () => {
  const main = await readFile(join(sourceRoot, "main.tsx"), "utf8");
  const bootstrap = await readFile(join(sourceRoot, "StartupBootstrap.tsx"), "utf8");

  assert.match(main, /<StartupBootstrap\s*\/>/);
  assert.doesNotMatch(main, /import \{ App \} from "\.\/App"/);
  assert.match(bootstrap, /requestAnimationFrame\([\s\S]*import\("\.\/App"\)/);
  assert.match(bootstrap, /introComplete && DeferredApp/);
  assert.match(bootstrap, /<DeferredApp enteringOnMount=\{bootstrapOwnsStartupIntro\}/);
});

test("Tauri capability grants window actions and the packaged Windows service sidecar", async () => {
  const capabilityPath = join(tauriRoot, "capabilities", "main.json");
  assert.equal(await exists(capabilityPath), true, "main capability must exist");
  const capability = JSON.parse(await readFile(capabilityPath, "utf8"));
  assert.deepEqual(capability.windows, ["main"]);
  assert.deepEqual(capability.permissions, [
    "core:window:default",
    "core:window:allow-close",
    "core:window:allow-minimize",
    "core:window:allow-toggle-maximize",
    "core:window:allow-start-dragging",
    "core:window:allow-start-resize-dragging",
    "shell:allow-spawn"
  ]);
});

test("Tauri Windows resources use a valid localized icon", async () => {
  const configPath = join(tauriRoot, "tauri.conf.json");
  const sourcePath = join(tauriRoot, "icons", "app-icon.png");
  const iconPath = join(tauriRoot, "icons", "icon.ico");
  const config = JSON.parse(await readFile(configPath, "utf8"));

  assert.equal(await exists(sourcePath), true, "1024px localized master icon must exist");
  const sourceBytes = await readFile(sourcePath);
  assert.equal(sourceBytes.toString("ascii", 1, 4), "PNG");
  assert.equal(sourceBytes.readUInt32BE(16), 1024, "master icon width");
  assert.equal(sourceBytes.readUInt32BE(20), 1024, "master icon height");

  for (const file of ["32x32.png", "128x128.png", "128x128@2x.png", "icon.ico"]) {
    assert.equal(await exists(join(tauriRoot, "icons", file)), true, `${file} must exist`);
  }
  assert.deepEqual(config.bundle.icon, [
    "icons/32x32.png",
    "icons/128x128.png",
    "icons/128x128@2x.png",
    "icons/icon.icns",
    "icons/icon.ico"
  ]);
  assert.equal(await exists(iconPath), true, "Windows icon must exist");
  const bytes = await readFile(iconPath);
  assert.equal(bytes.readUInt16LE(0), 0, "ICO reserved header");
  assert.equal(bytes.readUInt16LE(2), 1, "ICO image type");
  assert.equal(bytes.readUInt16LE(4) > 0, true, "ICO must contain an image");
});

test("Rust host remains a minimal Tauri shell with no application commands", async () => {
  const rustPath = join(tauriRoot, "src", "main.rs");
  assert.equal(await exists(rustPath), true, "Rust main must exist");
  const source = await readFile(rustPath, "utf8");
  assert.match(source, /tauri::Builder::default\(\)/);
  assert.doesNotMatch(source, /#\[tauri::command\]|invoke_handler/);
  assert.match(source, /sidecar\("preacherman-service"\)/);
});
