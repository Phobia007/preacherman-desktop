import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const hostRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = join(hostRoot, "..", "..");

test("project instructions require light and dark support for every UI surface", async () => {
  const instructions = await readFile(join(workspaceRoot, "AGENTS.md"), "utf8");

  assert.match(instructions, /Mandatory Light\/Dark Theme Contract/);
  assert.match(instructions, /Every user-facing page, dialog, overlay, desktop control/);
  assert.match(instructions, /--demo-theme-\*/);
  assert.match(instructions, /minimize, maximize, and close/);
  assert.match(instructions, /3D models[\s\S]*do not need recoloring/);
  assert.match(instructions, /both light and dark modes/);
});

test("the persistent shell exposes semantic theme tokens and themed window controls", async () => {
  const styles = await readFile(join(hostRoot, "src", "styles.css"), "utf8");

  for (const token of [
    "canvas",
    "home-canvas",
    "surface",
    "surface-elevated",
    "text",
    "muted",
    "border",
    "border-strong",
    "control",
    "control-hover",
    "control-hover-bg",
    "focus",
    "loading",
    "error",
    "icon-filter",
    "window-control-icon-filter",
    "avatar-ground-contact",
    "avatar-ground-plane",
  ]) {
    assert.match(styles, new RegExp(`--demo-theme-${token}:`));
  }

  assert.match(styles, /\.demo-app-shell\[data-appearance="dark"\]\s*\{/);
  assert.match(styles, /--demo-theme-icon-filter:\s*brightness\(0\) invert\(1\)/);
  assert.match(
    styles,
    /\.demo-app-shell\[data-appearance="dark"\]\s*\{[\s\S]*--demo-theme-avatar-ground-contact:/,
  );
  assert.match(
    styles,
    /\.demo-app-shell\[data-appearance="dark"\]\s*\{[\s\S]*--demo-theme-loading:[\s\S]*--demo-theme-error:/,
  );
  assert.match(
    styles,
    /\.demo-window-controls__button img\s*\{[\s\S]*filter:\s*var\(--demo-theme-window-control-icon-filter\)/,
  );
  assert.match(styles, /\.demo-intro-splash\s*\{[\s\S]*--demo-theme-window-control-icon-filter:\s*brightness\(0\)/);
  assert.match(styles, /\.demo-intro-splash\[data-appearance="dark"\]\s*\{[\s\S]*--demo-theme-window-control-icon-filter:\s*brightness\(0\) invert\(1\)/);
  assert.match(styles, /\.demo-app-shell\s*\{[\s\S]*--demo-theme-window-control-icon-filter:\s*brightness\(0\) invert\(1\)/);
  assert.match(styles, /\.demo-app-shell\[data-appearance="dark"\]\s*\{[\s\S]*--demo-theme-window-control-icon-filter:\s*brightness\(0\) invert\(1\)/);
  assert.match(
    styles,
    /\.demo-app-shell__screen-content\s*\{[\s\S]*background:\s*transparent/,
  );
  assert.match(styles, /\.demo-window-controls__button\s*\{[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent/);
  assert.match(styles, /\.demo-app-shell\[data-active-surface="workspace"\] \.demo-window-controls__button\s*\{[\s\S]*?background:\s*transparent/);
  assert.match(styles, /\.demo-app-shell\[data-active-surface="settings"\] \.demo-window-controls__button\s*\{[\s\S]*?background:\s*transparent/);
  assert.equal((styles.match(/--demo-theme-home-canvas:\s*#010409/g) ?? []).length, 2);
  assert.match(
    styles,
    /\.demo-app-shell__scene\s*\{[\s\S]*background:\s*var\(--demo-theme-home-canvas\)/,
  );
});

test("Gallery shares the Home canvas while embedded content and model rendering remain theme-neutral", async () => {
  const galleryStyles = await readFile(
    join(hostRoot, "src", "gallery", "cortana-gallery.css"),
    "utf8",
  );
  const gallery = await readFile(
    join(hostRoot, "src", "gallery", "CortanaGallery.tsx"),
    "utf8",
  );
  const modelStage = await readFile(
    join(hostRoot, "src", "gallery", "CortanaModelStage.tsx"),
    "utf8",
  );
  const viewport = await readFile(
    join(
      workspaceRoot,
      "packages",
      "preacherman-avatar-renderer",
      "src",
      "InteractiveAvatarViewport.tsx",
    ),
    "utf8",
  );
  const rendererStyles = await readFile(
    join(
      workspaceRoot,
      "packages",
      "preacherman-avatar-renderer",
      "src",
      "avatar-renderer.css",
    ),
    "utf8",
  );
  const scene = await readFile(
    join(
      workspaceRoot,
      "packages",
      "preacherman-avatar-renderer",
      "src",
      "InteractiveAvatarScene.tsx",
    ),
    "utf8",
  );

  assert.match(
    galleryStyles,
    /\.cortana-gallery\s*\{[\s\S]*background:\s*transparent/,
  );
  assert.match(gallery, /aria-label="Gallery"[\s\S]*className="cortana-gallery"/);
  assert.match(gallery, /<JesperPortfolioExperience[\s\S]*active=\{active\}[\s\S]*activeModelId=\{activeModelId\}[\s\S]*appearance=\{appearance\}/);
  assert.doesNotMatch(gallery, /cortana-gallery__transition-toggle/);
  assert.doesNotMatch(gallery, /<h1|HomeVisualScene/);
  assert.match(gallery, /detailModelPrepared \? \([\s\S]*<CortanaModelStage/);
  assert.match(galleryStyles, /\.cortana-gallery__detail-model\s*\{[\s\S]*var\(--demo-theme-gallery-detail-surface\)/);
  assert.match(modelStage, /className="cortana-model-stage__ground"/);
  assert.match(galleryStyles, /\.cortana-model-stage\s*\{[\s\S]*z-index:\s*2/s);
  assert.match(
    galleryStyles,
    /\.cortana-model-stage__ground\s*\{[\s\S]*display:\s*block[\s\S]*var\(--demo-theme-avatar-ground-contact\)[\s\S]*var\(--demo-theme-avatar-ground-plane\)/,
  );
  assert.doesNotMatch(galleryStyles, /\.cortana-model-stage__ground\s*\{[^}]*display:\s*none/);
  assert.match(modelStage, /<InteractiveAvatarViewport\b/);
  assert.doesNotMatch(modelStage, /appearance=|theme=|material=/);
  assert.match(viewport, /alpha:\s*true/);
  assert.match(scene, /setClearAlpha\(environment === "cinematic" && !isolateCompanion \? 1 : 0\)/);
  assert.match(viewport, /setClearColor\(0x010409,\s*environment === "cinematic" && !isolateCompanion \? 1 : 0\)/);
  assert.match(scene, /environment === "cinematic" \? <CinematicEnvironment isolateCompanion=\{isolateCompanion\} \/>/);
  assert.match(galleryStyles, /var\(--demo-theme-loading\)/);
  assert.match(galleryStyles, /var\(--demo-theme-error\)/);
  assert.match(
    rendererStyles,
    /\.preacherman-avatar-debug\s*\{[\s\S]*var\(--demo-theme-border-strong\)[\s\S]*var\(--demo-theme-text\)[\s\S]*var\(--demo-theme-surface-elevated\)/,
  );
});

test("live speech and task controls inherit semantic colors in light and dark appearances", async () => {
  const [styles, voiceStyles, taskStyles] = await Promise.all([
    readFile(join(hostRoot, "src", "styles.css"), "utf8"),
    readFile(join(hostRoot, "src", "realtime", "voice-session.css"), "utf8"),
    readFile(join(hostRoot, "src", "ab", "ab-task-console.css"), "utf8"),
  ]);

  assert.match(styles, /\.demo-app-shell\s*\{[\s\S]*--demo-theme-focus:[\s\S]*--demo-theme-error:/);
  assert.match(styles, /\.demo-app-shell\[data-appearance="dark"\]\s*\{[\s\S]*--demo-theme-focus:[\s\S]*--demo-theme-error:/);
  assert.match(voiceStyles, /\.preacherman-live__cancel:disabled\s*\{[\s\S]*var\(--demo-theme-muted\)/);
  assert.match(voiceStyles, /\.preacherman-live__cancel:focus-visible[^\{]*\{[\s\S]*var\(--demo-theme-focus\)/);
  assert.match(taskStyles, /\.ab-task-console__button:focus-visible\s*\{[\s\S]*var\(--demo-theme-focus\)/);
  assert.match(taskStyles, /\.ab-task-console__button--quiet\s*\{[\s\S]*var\(--demo-theme-activate-rest-text\)[\s\S]*var\(--demo-theme-activate-rest-bg\)/);
  assert.doesNotMatch(styles, /cortana-model-stage__wake-button/);
});
