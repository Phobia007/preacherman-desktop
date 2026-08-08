import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const hostRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(hostRoot, "src");
const workspaceRoot = join(hostRoot, "..", "..");

test("Gallery activation persists the selected model and Home plus Lab reuse the same stage", async () => {
  const app = await readFile(join(sourceRoot, "App.tsx"), "utf8");
  const preferences = await readFile(join(sourceRoot, "preferences.ts"), "utf8");
  const gallery = await readFile(
    join(sourceRoot, "gallery", "CortanaGallery.tsx"),
    "utf8",
  );
  const stage = await readFile(
    join(sourceRoot, "gallery", "CortanaModelStage.tsx"),
    "utf8",
  );

  assert.match(preferences, /activeModelId:\s*ModelId \| null/);
  assert.match(preferences, /activeModelId:\s*"cortana"/);
  assert.match(preferences, /value === "cortana"/);
  assert.match(app, /const isCortanaActive = preferences\.activeModelId === "cortana"/);
  assert.match(app, /data-model-active=\{isCortanaActive\}/);
  assert.match(app, /isCortanaActive \? \([\s\S]*<HomeSurface[\s\S]*<CortanaModelStage/);
  assert.match(app, /selectedManifest\.surfaceId === manifest\.surfaceId[\s\S]*return homeContent/);
  assert.match(app, /<CortanaGallery[\s\S]*activeModelId=\{preferences\.activeModelId\}/);
  assert.match(app, /setPreferences\(\(current\) => \(\{ \.\.\.current, activeModelId \}\)\)/);
  assert.match(gallery, /aria-pressed=\{isActivated\}/);
  assert.match(gallery, /isActivated \? "Activated" : "Activate"/);
  assert.match(gallery, /activeModelId === activeItem\.id \? null : activeItem\.id/);
  assert.match(gallery, /onActiveModelChange:\s*\(modelId: ModelId \| null\) => void/);
  const stageUsages = (`${app}\n${gallery}`).match(/<CortanaModelStage\b/g) ?? [];
  assert.equal(stageUsages.length, 3);
  assert.match(stage, /pose="standby"/);
  assert.match(stage, /quality="high"/);
});

test("Activate control long-presses in both directions and supports both themes", async () => {
  const styles = await readFile(join(sourceRoot, "styles.css"), "utf8");
  const galleryStyles = await readFile(
    join(sourceRoot, "gallery", "cortana-gallery.css"),
    "utf8",
  );
  const navigationStyles = await readFile(
    join(
      workspaceRoot,
      "packages",
      "preacherman-surface-skin",
      "src",
      "surfaces",
      "workspace",
      "workspace.css",
    ),
    "utf8",
  );

  assert.match(navigationStyles, /\.pm-workspace__bottom-navigation-zone\s*\{[\s\S]*height:\s*92px/s);
  assert.match(galleryStyles, /\.cortana-detail__activate\s*\{[\s\S]*bottom:\s*112px[\s\S]*z-index:\s*7/s);
  assert.match(galleryStyles, /backdrop-filter:\s*blur\(22px\) saturate\(160%\)/);
  assert.match(galleryStyles, /border-radius:\s*999px/);
  assert.match(galleryStyles, /\[data-state="idle"\]\[data-holding="true"\][\s\S]*clip-path:\s*inset\(0\)/);
  assert.match(galleryStyles, /\[data-state="activated"\]\[data-holding="true"\][\s\S]*clip-path:\s*inset\(0 50% 0 50% round 999px\)/);
  assert.match(galleryStyles, /transition-duration:\s*1500ms/);
  assert.match(galleryStyles, /transition-timing-function:\s*cubic-bezier\(0\.72, 0, 1, 1\)/);
  assert.doesNotMatch(galleryStyles, /activate-status/);
  assert.match(styles, /--demo-theme-activate-rest-bg:\s*#ffffff/);
  assert.match(styles, /--demo-theme-activate-rest-text:\s*#111111/);
  assert.match(styles, /--demo-theme-activate-fill:\s*#111111/);
  assert.match(styles, /--demo-theme-activate-fill-text:\s*#ffffff/);
  assert.match(
    styles,
    /\.demo-app-shell\[data-appearance="dark"\]\s*\{[\s\S]*--demo-theme-activate-rest-text:\s*#ffffff[\s\S]*--demo-theme-activate-fill:\s*#ffffff[\s\S]*--demo-theme-activate-fill-text:\s*#000000/,
  );
});

test("Activate control requires the full hold and flashes before toggling", async () => {
  const gallery = await readFile(
    join(sourceRoot, "gallery", "CortanaGallery.tsx"),
    "utf8",
  );

  assert.match(gallery, /const ACTIVATE_HOLD_MS = 1500/);
  assert.match(gallery, /const ACTIVATE_FLASH_MS = 240/);
  assert.match(gallery, /window\.setTimeout\(\(\) => \{[\s\S]*setPhase\("flashing"\)[\s\S]*onToggle\(\)/);
  assert.match(gallery, /onPointerDown=\{startHold\}/);
  assert.match(gallery, /onPointerUp=\{cancelHold\}/);
  assert.match(gallery, /onPointerLeave=\{cancelHold\}/);
  assert.match(gallery, /onPointerCancel=\{cancelHold\}/);
  assert.match(gallery, /aria-label=\{`Hold to \$\{isActivated \? "deactivate" : "activate"\} Cortana`\}/);
  assert.match(gallery, /data-flashing=\{phase === "flashing"/);
  assert.match(gallery, /data-holding=\{phase === "holding" \|\| phase === "flashing"/);
  assert.doesNotMatch(gallery, /activate-status/);
});
