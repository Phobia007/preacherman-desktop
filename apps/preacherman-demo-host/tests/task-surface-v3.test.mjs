import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const packageRoot = join(import.meta.dirname, "..");
const taskRoot = join(packageRoot, "src", "task");
const runtimeRoot = join(packageRoot, "public", "task-lookback-v3");

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function filesBelow(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(path));
    else files.push(path);
  }
  return files;
}

test("Task v3 remains an isolated same-origin Timeline surface", async () => {
  const [surface, app, shell] = await Promise.all([
    readFile(join(taskRoot, "TaskSurface.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "App.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "app-shell", "AppShell.tsx"), "utf8"),
  ]);

  assert.match(surface, /src=\{TASK_RUNTIME_URL\}/);
  assert.match(surface, /TASK_RUNTIME_URL = "\/task-lookback-v3\/index\.html"/);
  assert.match(surface, /event\.origin !== window\.location\.origin/);
  assert.match(surface, /event\.source !== iframeRef\.current\?\.contentWindow/);
  assert.match(surface, /task-lookback-v3-ready/);
  assert.match(surface, /task-lookback-v3-error/);
  assert.match(surface, /sandbox="allow-forms allow-pointer-lock allow-same-origin allow-scripts"/);
  assert.doesNotMatch(surface, /allow-top-navigation|allow-popups/);
  assert.match(surface, /aria-busy=/);
  assert.match(surface, /role="alert"/);
  assert.match(surface, /Retry loading The Lookback Timeline/);
  assert.doesNotMatch(surface, /Opening The Lookback Timeline/);
  assert.doesNotMatch(surface, /task-surface__loading-mark/);
  assert.match(app, /import \{ TaskSurface \} from "\.\/task\/TaskSurface"/);
  assert.match(app, /const workspaceContent = <TaskSurface \/>/);
  assert.doesNotMatch(shell, /TaskSurface|task-lookback-v3/);
});

test("Task v3 owns the requested white-line and pulsed vertical aperture motion", async () => {
  const css = await readFile(join(taskRoot, "task-surface.css"), "utf8");

  assert.match(css, /top:\s*68px/);
  assert.match(css, /task-surface__scan-line[\s\S]*transform:\s*scaleX\(0\)/);
  assert.match(css, /transform-origin:\s*left center/);
  assert.match(css, /@keyframes task-surface-scan-line/);
  assert.match(css, /@keyframes task-surface-aperture/);
  assert.match(css, /clip-path:\s*inset\(50% 0 50%\)/);
  assert.match(css, /clip-path:\s*inset\(42% 0 42%\)/);
  assert.match(css, /clip-path:\s*inset\(46% 0 46%\)/);
  assert.match(css, /clip-path:\s*inset\(0\)/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /var\(--demo-theme-task-text\)/);
  assert.match(css, /var\(--demo-theme-error\)/);
  assert.match(css, /var\(--demo-theme-focus\)/);
  assert.doesNotMatch(css, /task-surface__loading-mark|task-surface-loading/);
  assert.doesNotMatch(css, /\.demo-app-shell__chrome|\.demo-window-controls/);
});

test("isolated preview uses the real shared shell and Cortana without altering them", async () => {
  const [preview, main] = await Promise.all([
    readFile(join(taskRoot, "preview", "TaskPreviewApp.tsx"), "utf8"),
    readFile(join(taskRoot, "preview", "main.tsx"), "utf8"),
  ]);

  assert.match(preview, /<AppShell/);
  assert.match(preview, /<CortanaModelStage/);
  assert.match(preview, /environment="cinematic"/);
  assert.match(preview, /modelId="cortana"/);
  assert.match(preview, /variant="persistent"/);
  assert.match(preview, /<LiveCoordinatorProvider>/);
  assert.match(main, /appearanceParameter === "light" \|\| appearanceParameter === "dark"/);
  assert.match(main, /applyPreferences\(preferences\)/);
  assert.match(main, /@preacherman\/avatar-renderer\/styles\.css/);
  assert.match(main, /cortana-gallery\.css/);
});

test("copied Lookback runtime is namespaced, direct-to-Timeline, and silent", async () => {
  const [html, bootstrap, embedCss, navigationBundle] = await Promise.all([
    readFile(join(runtimeRoot, "index.html"), "utf8"),
    readFile(join(runtimeRoot, "task-v3-bootstrap.js"), "utf8"),
    readFile(join(runtimeRoot, "task-v3-embed.css"), "utf8"),
    readFile(join(runtimeRoot, "_nuxt", "BSuY0ud1.js"), "utf8"),
  ]);

  assert.match(html, /baseURL:"\/task-lookback-v3\/"/);
  assert.match(html, /"#entry":"\/task-lookback-v3\/_nuxt\//);
  assert.match(html, /task-v3-bootstrap\.js/);
  assert.match(html, /task-v3-embed\.css/);
  assert.doesNotMatch(html, /(?:src|href)="\/(?:_nuxt|assets)\//);
  assert.match(bootstrap, /textContent\?\.trim\(\) === "\.\.\.or without"/);
  assert.match(bootstrap, /textContent\?\.trim\(\) === "Loaded"/);
  assert.match(bootstrap, /const introReady =/);
  assert.match(bootstrap, /const timelineCardVisible =/);
  assert.match(bootstrap, /const initializeTimelineRoute = async/);
  assert.match(bootstrap, /findNavigationLink\("Surf"\)/);
  assert.match(bootstrap, /document\.querySelector\("\.surf-carousel"\)/);
  assert.match(bootstrap, /findNavigationLink\("Timeline"\)/);
  assert.match(bootstrap, /return waitFor\(timelineCardVisible\)/);
  assert.match(bootstrap, /Timeline did not initialize in time\./);
  assert.match(bootstrap, /postToHost\(readyMessage/);
  assert.doesNotMatch(bootstrap, /if \(!choseSilentEntry\) chooseSilentEntry\(\)/);
  assert.match(bootstrap, /window\.Audio = SilentAudio/);
  assert.match(bootstrap, /this instanceof HTMLAudioElement/);
  assert.match(bootstrap, /return nativeMediaPlay\.call\(this\)/);
  assert.match(bootstrap, /task-lookback-v3-ready/);
  assert.match(bootstrap, /history\.pushState = function taskLookbackReplacePush/);
  assert.match(embedCss, /html,[\s\S]*body,[\s\S]*#__nuxt[\s\S]*background:\s*transparent !important/);
  assert.match(embedCss, /button\[aria-label\^="Play "\]/);
  assert.match(embedCss, /\.js-logo[\s\S]*visibility:\s*hidden !important/);
  assert.match(embedCss, /nav\[aria-label="Main navigation"\]\.site-menu[\s\S]*justify-self:\s*center/);
  assert.match(embedCss, /nav\[aria-label="Main navigation"\]\.site-menu[\s\S]*column-gap:\s*24px/);
  assert.match(embedCss, /nav\[aria-label="Main navigation"\]\.site-menu a\[href\$="\/about"\][\s\S]*display:\s*none !important/);
  assert.doesNotMatch(navigationBundle, /" (?:Timeline|Surf|Index), "/);
  assert.match(navigationBundle, /" Timeline "/);
  assert.match(navigationBundle, /" Surf "/);
  assert.match(navigationBundle, /" Index "/);
  assert.match(embedCss, /html\[data-preacherman-appearance="light"\]/);
  assert.match(embedCss, /html\[data-preacherman-appearance="dark"\]/);
});

test("Task v3 bundles only copied visual media and no music files", async () => {
  const files = await filesBelow(runtimeRoot);
  const lowerNames = files.map((path) => path.toLowerCase());

  assert.equal(lowerNames.some((path) => path.endsWith(".mp3")), false);
  assert.equal(await exists(join(runtimeRoot, "render-big.mp4")), true);
  assert.equal(await exists(join(runtimeRoot, "noise.png")), true);
  assert.equal(await exists(join(runtimeRoot, "assets", "images")), true);
  assert.equal(await exists(join(runtimeRoot, "assets", "fonts")), true);
  assert.equal(await exists(join(runtimeRoot, "assets", "media", "stream.mux.com", "medium-682a67584c.mp4")), true);
  assert.equal(await exists(join(runtimeRoot, "assets", "media", "stream.mux.com", "medium-a8c152021c.mp4")), true);
});
