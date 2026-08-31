import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const hostRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(hostRoot, "src");

test("the saved model remains persistent except while Gallery owns the scene", async () => {
  const app = await readFile(join(sourceRoot, "App.tsx"), "utf8");
  const preferences = await readFile(join(sourceRoot, "preferences.ts"), "utf8");
  const stage = await readFile(
    join(sourceRoot, "gallery", "CortanaModelStage.tsx"),
    "utf8",
  );

  assert.match(preferences, /activeModelId:\s*ModelId \| null/);
  assert.match(preferences, /activeModelId:\s*"cortana"/);
  assert.match(preferences, /value === "cortana"/);
  assert.match(preferences, /value === "zima"/);
  assert.match(app, /const activeModelId = preferences\.activeModelId/);
  assert.match(app, /const isCompanionActive = activeModelId !== null/);
  assert.match(app, /data-model-active=\{isCompanionActive\}/);
  assert.match(app, /scene=\{sceneModelId && activeSurfaceType !== "market" \? \([\s\S]*<CortanaModelStage[\s\S]*modelId=\{sceneModelId\}[\s\S]*variant="persistent"/);
  assert.match(app, /selectedManifest\.surfaceId === manifest\.surfaceId[\s\S]*return homeContent/);
  assert.match(app, /<SettingsScreen/);
  assert.match(app, /<GallerySurface \/>/);
  assert.match(app, /data-surface="workspace"[\s\S]*<GallerySurface \/>/);
  assert.match(app, /preachermanPanelSurface === "home" \|\| preachermanPanelSurface === "market"/);
  assert.match(app, /activeSurfaceType === "settings"[\s\S]*<SettingsScreen/);
  assert.match(app, /data-surface="market"[\s\S]*<ActiveTheoryGallerySurface \/>/);
  assert.equal((app.match(/<CortanaModelStage\b/g) ?? []).length, 1);
  assert.match(stage, /pose="standby"/);
  assert.match(stage, /quality="high"/);
  assert.match(stage, /modelId=\{modelId\}/);
  assert.match(stage, /renderActive=\{renderActive\}/);
  assert.match(stage, /modelId === "zima" \? "idle\.zima" : "idle\.catwalk"/);
  assert.match(stage, /actionId=\{actionsModelId === modelId \? playingActionId : undefined\}/);
  assert.match(stage, /key=\{modelId\}/);
  assert.ok((await stat(join(hostRoot, "public", "assets", "avatars", "zima", "zima-runtime.glb"))).size > 1_000_000);
});

test("Gallery and Home use the same semantic black canvas in both appearances", async () => {
  const styles = await readFile(join(sourceRoot, "styles.css"), "utf8");

  assert.equal((styles.match(/--demo-theme-home-canvas:\s*#010409/g) ?? []).length, 2);
  assert.match(styles, /\.demo-app-shell__scene\s*\{[\s\S]*background:\s*var\(--demo-theme-home-canvas\)/);
  assert.match(styles, /\.demo-app-shell__screen-content\s*\{[\s\S]*background:\s*transparent/);
});
