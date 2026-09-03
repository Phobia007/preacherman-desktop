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
  const stylesPath = join(sourceRoot, "styles.css");
  assert.equal(await exists(shellPath), true, "AppShell must exist in Demo Host");
  const shell = await readFile(shellPath, "utf8");
  const app = await readFile(appPath, "utf8");
  const styles = await readFile(stylesPath, "utf8");

  assert.match(shell, /preacherman-mark-light\.png/);
  assert.match(shell, /preacherman-mark-dark\.png/);
  assert.match(shell, /<WindowControls\b/);
  assert.doesNotMatch(shell, /<BottomNavigation\b/);
  assert.match(shell, /demo-app-shell__screen-content/);
  assert.match(shell, /demo\.window\.start-dragging/);
  assert.match(shell, /<WindowResizeHandles\b/);
  assert.match(app, /const appShell\s*=\s*\(\s*<AppShell\b/);
  assert.match(app, /\{appShell\}[\s\S]*\{showStartupIntro\s*\?\s*\(\s*<IntroSplash/);
  assert.match(app, /key=\{contentKey\}/);
  assert.match(app, /data-surface="workspace"[\s\S]*<GallerySurface\s*\/>/);
  assert.match(app, /data-surface="market"[\s\S]*<ActiveTheoryGallerySurface\s*\/>/);
  assert.match(styles, /\.demo-app-shell__prewarmed-surface\[data-active="false"\] \*\s*\{\s*pointer-events:\s*none !important;/);
  assert.doesNotMatch(app, /TaskSurface/);
  assert.equal((app.match(/<GallerySurface(?:\s+hideProjectCards)?\s*\/>/g) ?? []).length, 1);
  assert.doesNotMatch(shell, /key=\{contentKey\}/, "the shell itself must not remount on navigation");
});

test("Task keeps its entry motion while Gallery mounts the original runtime", async () => {
  const app = await readFile(join(sourceRoot, "App.tsx"), "utf8");
  const styles = await readFile(join(sourceRoot, "styles.css"), "utf8");

  assert.match(app, /data-surface="workspace"[\s\S]*demo-app-shell__surface-reveal-line[\s\S]*demo-app-shell__surface-reveal-mask/);
  assert.match(app, /data-surface="market"[\s\S]*<ActiveTheoryGallerySurface\s*\/>/);
  assert.equal((app.match(/demo-app-shell__surface-reveal-line/g) ?? []).length, 1);
  assert.equal((app.match(/demo-app-shell__surface-reveal-mask/g) ?? []).length, 1);
  assert.match(styles, /data-active="true"[^}]*surface-reveal-mask[^}]*\{\s*animation:\s*demo-surface-unfold 1180ms cubic-bezier\(\.7, 0, \.2, 1\) forwards/);
  assert.match(styles, /data-active="true"[^}]*surface-reveal-line[^}]*\{\s*animation:\s*demo-surface-line-sweep 1180ms cubic-bezier\(\.2, 1, \.3, 1\) forwards/);
  assert.match(styles, /@keyframes demo-surface-line-sweep\s*\{[\s\S]*34% \{ opacity: 1; transform: scaleX\(1\); \}[\s\S]*100% \{ opacity: 0; transform: scaleX\(1\); \}/);
  assert.match(styles, /@keyframes demo-surface-unfold\s*\{[\s\S]*0%, 33% \{ clip-path: inset\(50% 0 50% 0\); opacity: 0; \}[\s\S]*82%, 100% \{ clip-path: inset\(0\); opacity: 1; \}/);
  assert.match(styles, /data-surface="workspace"[^}]*--demo-surface-reveal-line:\s*var\(--demo-theme-task-text\)/);
  assert.match(styles, /data-surface="market"[^}]*--demo-surface-reveal-line:\s*var\(--demo-theme-gallery-scan, var\(--demo-theme-text\)\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*surface-reveal-mask[\s\S]*animation:\s*none[\s\S]*surface-reveal-line[\s\S]*display:\s*none/);
});

test("Preacherman mark opens a six-item Clash Display navigation menu", async () => {
  const shell = await readFile(join(sourceRoot, "app-shell", "AppShell.tsx"), "utf8");
  const app = await readFile(join(sourceRoot, "App.tsx"), "utf8");
  const styles = await readFile(join(sourceRoot, "styles.css"), "utf8");
  const fontPath = join(sourceRoot, "assets", "fonts", "ClashDisplay-Light.ttf");

  assert.equal(await exists(fontPath), true, "the supplied Clash Display font must be bundled locally");
  assert.match(shell, /aria-expanded=\{brandNavigationOpen\}/);
  assert.match(shell, /aria-controls="preacherman-brand-navigation"/);
  assert.match(shell, /navigationCommand\(surfaceType\)/);
  assert.match(shell, /document\.addEventListener\("pointerdown", closeOnOutsidePress\)/);
  assert.match(shell, /event\.key !== "Escape"/);
  assert.match(shell, /onMouseEnter=\{openBrandNavigation\}/);
  assert.match(shell, /onMouseLeave=\{scheduleBrandNavigationClose\}/);
  assert.match(shell, /window\.setTimeout\([\s\S]*220\)/);
  assert.match(shell, /aria-pressed=\{brandNavigationPinned\}/);
  assert.match(shell, /onClick=\{toggleBrandNavigationPinned\}/);
  assert.match(shell, /setBrandNavigationPinned\(false\);[\s\S]*setBrandNavigationOpen\(false\);[\s\S]*onNavigate\(surfaceType\);[\s\S]*dispatch\(navigationCommand\(surfaceType\)\)/);
  assert.match(app, /handleSurfaceNavigate[\s\S]*setRoute\(surfaceType === "home"[\s\S]*kind: "surface", surfaceType/);
  assert.match(app, /<AppShell[\s\S]*onNavigate=\{handleSurfaceNavigate\}/);
  for (const [label, surfaceType] of [
    ["Home", "home"],
    ["Task", "workspace"],
    ["Gallery", "market"],
    ["Market", "ledger"],
    ["Settings", "settings"],
    ["Account", "account"],
  ]) {
    assert.match(shell, new RegExp(`label: "${label}", surfaceType: "${surfaceType}"`));
  }
  assert.match(styles, /@font-face[\s\S]*ClashDisplay-Light\.ttf/);
  assert.match(styles, /font-family:\s*"Clash Display", sans-serif/);
  assert.match(styles, /\.demo-app-shell__brand-trigger\s*\{[\s\S]*width:\s*108px;[\s\S]*height:\s*108px/);
  assert.match(styles, /\.demo-app-shell__brand-menu\s*\{[\s\S]*gap:\s*68px/);
  assert.match(styles, /\.demo-app-shell__brand-menu-item\s*\{[\s\S]*font-size:\s*32px/);
  assert.match(styles, /\.demo-app-shell__brand-navigation\[data-open="true"\] \.demo-app-shell__brand-menu-item\[aria-current="page"\]/);
  assert.match(shell, /className="demo-app-shell__brand-menu-charge-ring"/);
  assert.match(shell, /pathLength=\{100\}/);
  assert.match(styles, /\.demo-app-shell__brand-navigation\[data-open="true"\] \.demo-app-shell__brand-menu-item:hover[\s\S]*transform:\s*translate3d\(10px, 0, 0\) scale\(1\)/);
  assert.match(styles, /\.demo-app-shell__brand-menu-charge-outline\s*\{[\s\S]*stroke-dasharray:\s*243/);
  assert.match(styles, /@keyframes brand-menu-charge-outline[\s\S]*stroke-dashoffset:\s*243[\s\S]*stroke-dashoffset:\s*0/);
  assert.match(styles, /@keyframes brand-menu-charge-tracer/);
  assert.match(styles, /@keyframes brand-menu-word-charge/);
  assert.doesNotMatch(styles, /@keyframes brand-navigation-wave-in/);
  assert.match(styles, /nth-child\(5\)[\s\S]*transition-delay:\s*280ms/);
  assert.match(styles, /nth-child\(6\)[\s\S]*transition-delay:\s*350ms/);
  assert.match(styles, /\.demo-app-shell__brand-menu\s*\{[\s\S]*background:\s*transparent/);
  assert.match(styles, /\.demo-app-shell__brand-trigger\s*\{[\s\S]*border:\s*0;[\s\S]*background:\s*transparent/);
  assert.match(styles, /--demo-theme-brand-menu-text:\s*rgb\(255 255 255 \/ 68%\)/);
  assert.match(styles, /\.demo-app-shell\[data-appearance="dark"\][\s\S]*--demo-theme-brand-menu-text:\s*rgb\(255 255 255 \/ 68%\)/);
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

  const styles = await readFile(join(sourceRoot, "styles.css"), "utf8");
  assert.match(styles, /\.demo-window-controls__button\s*\{[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;/);
  assert.match(styles, /\.demo-window-controls__button img\s*\{[\s\S]*?width:\s*30px;[\s\S]*?height:\s*30px;[\s\S]*?transform-origin:\s*center;/);
  assert.match(styles, /\.demo-window-controls__button:hover img,[\s\S]*?transform:\s*rotate\(180deg\);/);
  assert.match(styles, /transform 400ms cubic-bezier\(0\.4, 0, 0\.2, 1\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.demo-window-controls__button:hover img,[\s\S]*?transform:\s*none;/);
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

test("all eight stable navigation keys have local routes without adding a router", async () => {
  const route = await readFile(join(sourceRoot, "demo", "screenRoute.ts"), "utf8");
  const bridge = await readFile(join(sourceRoot, "demoHostBridge.ts"), "utf8");
  const app = await readFile(join(sourceRoot, "App.tsx"), "utf8");

  assert.match(route, /localSurfacePath\s*=\s*["']\/__surfaces["']/);
  assert.match(route, /openLocalSurface/);
  assert.match(bridge, /demo\.navigation\.select/);
  for (const key of ["home", "workspace", "lab", "market", "test", "ledger", "settings", "account"]) {
    assert.match(app + route, new RegExp(`(?:["']${key}["']|\\b${key}:)`));
  }
  assert.doesNotMatch(app + route, /react-router|createBrowserRouter/);
});

test("Home, Task, Settings, and Gallery share the persistent scene", async () => {
  const shell = await readFile(join(sourceRoot, "app-shell", "AppShell.tsx"), "utf8");
  const app = await readFile(join(sourceRoot, "App.tsx"), "utf8");
  const styles = await readFile(join(sourceRoot, "styles.css"), "utf8");
  const hostRule = styles.match(/\.demo-host\s*\{[^}]*\}/s)?.[0] ?? "";
  const emptyRule = styles.match(/(?:^|\n)\.demo-host--empty\s*\{[^}]*\}/s)?.[0] ?? "";
  const sceneRule = styles.match(/\.demo-app-shell__scene\s*\{[^}]*\}/s)?.[0] ?? "";

  assert.match(app, /activeSurfaceType\s*===\s*["']home["']/);
  assert.match(app, /activeSurfaceType\s*===\s*["']settings["']/);
  assert.doesNotMatch(app, /ConversationLedgerScreen/);
  assert.match(app, /activeSurfaceType === "ledger"\s*\? null/);
  assert.match(app, /activeSurfaceType !== "ledger" \? \(/);
  assert.match(app, /data-surface="workspace"[\s\S]*<GallerySurface \/>/);
  assert.match(app, /data-surface="market"[\s\S]*<ActiveTheoryGallerySurface\s*\/>/);
  assert.match(app, /activeSurfaceType === "settings"[\s\S]*<SettingsScreen/);
  assert.match(hostRule, /background:\s*transparent/);
  assert.equal(emptyRule, "");
  assert.match(sceneRule, /background:\s*var\(--demo-theme-home-canvas\)/);
  assert.match(app, /const sceneModelId = activeModelId;/);
  assert.match(app, /scene=\{sceneModelId \? \(/);
  assert.match(app, /cameraFraming=\{activeSurfaceType === "market" \? "portrait" : "full-body"\}/);
  assert.equal((app.match(/<CortanaModelStage\b/g) ?? []).length, 1);
  assert.doesNotMatch(app, /sceneHidden=/);
  assert.doesNotMatch(shell, /Math\.max\(window\.innerWidth\s*\/\s*1800/);
  assert.match(shell, /Math\.min\(window\.innerWidth\s*\/\s*1800,\s*window\.innerHeight\s*\/\s*1000\)/);
  assert.doesNotMatch(app, /workspace:\s*\{\s*surfaceType:\s*["']workspace["']/);
});

test("Tauri bundles the localized Preacherman Windows icon", async () => {
  const config = JSON.parse(await readFile(join(hostRoot, "src-tauri", "tauri.conf.json"), "utf8"));
  assert.equal(config.bundle.icon.includes("icons/icon.ico"), true);
  assert.equal(await exists(join(hostRoot, "src-tauri", "icons", "icon.ico")), true);
});
