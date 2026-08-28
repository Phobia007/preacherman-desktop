import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const hostRoot = join(import.meta.dirname, "..");

test("Settings v3 mounts the provided Gil Huybrecht local clone without rebuilding its artwork", async () => {
  const [component, localPage, galleryPage, profilePage, privacyPage] = await Promise.all([
    readFile(join(hostRoot, "src", "settings", "SettingsScreen.tsx"), "utf8"),
    readFile(join(hostRoot, "public", "settings-v3-local", "index.html"), "utf8"),
    readFile(join(hostRoot, "public", "settings-v3-local", "gallery", "index.html"), "utf8"),
    readFile(join(hostRoot, "public", "settings-v3-local", "profile", "index.html"), "utf8"),
    readFile(join(hostRoot, "public", "settings-v3-local", "privacy-policy", "index.html"), "utf8"),
  ]);

  assert.match(component, /attachShadow\(\{ mode: "open" \}\)/);
  assert.doesNotMatch(component, /<iframe/);
  assert.match(component, /\/settings-v3-local\/index\.html/);
  assert.match(component, /data-settings-milestone="v3-2"/);
  assert.match(localPage, /<title>Gil Huybrecht/);
  assert.match(localPage, /data-od-id="project-grid"/);
  assert.doesNotMatch(localPage, /<script\b/i);
  assert.match(localPage, /html,body\{background:transparent!important\}/);
  assert.match(component, /rebaseMediaUrls\(content\)/);
  assert.ok(galleryPage.length > 100_000);
  assert.ok(profilePage.length > 100_000);
  assert.ok(privacyPage.length > 100_000);
});

test("Settings v3 keeps the supplied card artwork and adds capability copy beneath it", async () => {
  const [component, localPage] = await Promise.all([
    readFile(join(hostRoot, "src", "settings", "SettingsScreen.tsx"), "utf8"),
    readFile(join(hostRoot, "public", "settings-v3-local", "index.html"), "utf8"),
  ]);

  assert.match(component, /AI & Models/);
  assert.match(component, /Voice & Audio/);
  assert.match(component, /Native Agent/);
  assert.match(component, /Agent Access/);
  assert.match(component, /AI Providers/);
  assert.match(component, /Default Language Model/);
  assert.match(component, /Speech Recognition/);
  assert.match(component, /Sandbox & Approvals/);
  assert.match(component, /Agent Gateway/);
  assert.match(component, /MCP Servers/);
  assert.match(component, /Plugin Manager/);
  assert.match(component, /Integration Manager/);
  assert.match(component, /General Preferences/);
  assert.doesNotMatch(component, /Provider overview|DeepSeek Chat|DashScope Vision|Voice overview|Native overview|Access overview|MCP overview|Plugin overview|Connection overview|Preferences overview/);
  assert.match(component, /card\.append\(copy\)/);
  assert.doesNotMatch(component, /__vue_app__|nuxtRoot/);
  assert.match(component, /mountLocalPortfolio/);
  assert.match(component, /settings-v3-card-copy/);
  assert.match(component, /--demo-theme-settings-text/);
  assert.match(component, /--demo-theme-settings-muted/);
  assert.match(component, /--demo-theme-settings-focus/);
  assert.match(localPage, /<img /);
  assert.match(localPage, /<video /);
});

test("Settings v3 opens every mapped card into the shared description-only detail", async () => {
  const [component, styles] = await Promise.all([
    readFile(join(hostRoot, "src", "settings", "SettingsScreen.tsx"), "utf8"),
    readFile(join(hostRoot, "src", "settings", "settings-v3.css"), "utf8"),
  ]);

  assert.match(component, /card\.addEventListener\("click", openDetail\)/);
  assert.match(component, /event\.key !== "Enter" && event\.key !== " "/);
  assert.match(component, /aria-haspopup", "dialog"/);
  assert.match(component, /role="dialog"/);
  assert.match(component, /aria-modal="true"/);
  assert.match(component, /data-settings-control-slot/);
  assert.match(component, /className="settings-v3__detail-blank"/);
  assert.doesNotMatch(component, /settings-v3__detail-summary/);
  assert.doesNotMatch(component, /className="settings-v3__back"/);
  assert.doesNotMatch(component, /selection\.imageSrc|selection\.imageAlt/);
  assert.match(component, /event\.key === "Escape"/);
  assert.match(styles, /\.settings-v3__detail\s*\{/);
  assert.match(styles, /grid-template-columns:\s*minmax\(320px, 36\.5%\) minmax\(0, 1fr\)/);
  assert.match(styles, /margin-top:\s*clamp\(360px, 62vh, 720px\)/);
  assert.doesNotMatch(styles, /\.settings-v3__back/);
  assert.doesNotMatch(styles, /\.settings-v3__detail-content > figure/);
  assert.match(styles, /var\(--demo-theme-settings-canvas\)/);
  assert.match(styles, /var\(--demo-theme-settings-text\)/);
  assert.match(styles, /var\(--demo-theme-settings-focus\)/);
});

test("Settings v3 restores group hover emphasis and group-relative sequence labels", async () => {
  const component = await readFile(join(hostRoot, "src", "settings", "SettingsScreen.tsx"), "utf8");

  assert.match(component, /data-settings-grid-active/);
  assert.match(component, /data-settings-group-active/);
  assert.match(component, /card\.addEventListener\("pointerenter", \(\) => setActiveGroup\(item\.group\.id\)\)/);
  assert.match(component, /item\.entryIndex === 0 \? item\.group\.label\[locale\] : ""/);
  assert.match(component, /className = "settings-v3-card-heading__number"/);
  assert.match(component, /\.settings-v3-card-heading__group\s*\{[\s\S]*font-size:\s*42px/);
  assert.match(component, /number\.textContent = String\(item\.number\)/);
  assert.match(component, /number: entryIndex \+ 1/);
  assert.match(component, /:not\(\[data-settings-group-active\]\)[^{]*\{\s*opacity: \.18/s);
});

test("Settings v3 keeps Gil layout positions while clearing only the header and percentage loader", async () => {
  const [component, localPage] = await Promise.all([
    readFile(join(hostRoot, "src", "settings", "SettingsScreen.tsx"), "utf8"),
    readFile(join(hostRoot, "public", "settings-v3-local", "index.html"), "utf8"),
  ]);

  assert.match(component, /header,/);
  assert.match(component, /\.fixed\.inset-0\.bg-black\.z-99\.flex\.items-center\.justify-center/);
  assert.match(component, /\.js-t-mask/);
  assert.doesNotMatch(component, /percentage|percent/i);
  assert.match(localPage, /id="preacherman-settings-v3-local-overrides"/);
  assert.match(localPage, /header\{visibility:hidden!important/);
  assert.match(localPage, /\.fixed\.inset-0\.bg-black\.z-99\.flex\.items-center\.justify-center/);
});

test("Settings v3 keeps the shared scene and exact requested entrance in the isolated preview", async () => {
  const [preview, styles] = await Promise.all([
    readFile(join(hostRoot, "src", "settings", "settings-preview.tsx"), "utf8"),
    readFile(join(hostRoot, "src", "settings", "settings-v3.css"), "utf8"),
  ]);

  assert.match(preview, /<AppShell/);
  assert.match(preview, /activeSurfaceType="settings"/);
  assert.match(preview, /import "@preacherman\/avatar-renderer\/styles\.css"/);
  assert.doesNotMatch(preview, /StrictMode/);
  assert.match(preview, /<CortanaModelStage/);
  assert.match(preview, /variant="persistent"/);
  assert.doesNotMatch(preview, /cortana-gallery\.css/);
  assert.match(styles, /background:\s*transparent/);
  assert.match(styles, /data-active-surface="settings"[^}]+background:\s*transparent/s);
  assert.match(styles, /--settings-v3-reference-opacity:\s*1/);
  assert.match(styles, /mix-blend-mode:\s*normal/);
  assert.match(styles, /settings-v3-line-sweep/);
  assert.match(styles, /settings-v3-unfold/);
  assert.match(styles, /clip-path:\s*inset\(50% 0 50% 0\)/);
  assert.match(styles, /82%, 100% \{ clip-path: inset\(0\)/);
  assert.match(styles, /data-appearance="light"/);
  assert.match(styles, /data-appearance="dark"/);
  assert.match(styles, /var\(--demo-theme-settings-text\)/);
  assert.match(styles, /var\(--demo-theme-settings-focus\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(styles, /perspective-grid|settings-v3__card|linear-gradient|radial-gradient/);
});
