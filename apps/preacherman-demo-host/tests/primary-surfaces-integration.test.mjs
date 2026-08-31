import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const hostRoot = join(import.meta.dirname, "..");

test("the unified desktop mounts Task, Gallery, and Settings in the shared shell", async () => {
  const app = await readFile(join(hostRoot, "src", "App.tsx"), "utf8");

  assert.doesNotMatch(app, /import \{ TaskSurface \}/);
  assert.match(app, /import \{ GallerySurface \} from "\.\/surfaces\/gallery\/GallerySurface"/);
  assert.match(app, /import \{ SettingsScreen \} from "\.\/settings\/SettingsScreen"/);
  assert.match(app, /data-surface="workspace"[\s\S]*<GallerySurface \/>/);
  assert.match(app, /data-surface="market"[\s\S]*<GallerySurface hideProjectCards \/>/);
  assert.match(app, /activeSurfaceType === "settings"[\s\S]*<SettingsScreen/);
  assert.match(app, /appearance=\{preferences\.appearance\}/);
  assert.match(app, /locale=\{preferences\.locale\}/);
});

test("the companion scene remains outside the keyed page content", async () => {
  const app = await readFile(join(hostRoot, "src", "App.tsx"), "utf8");
  const sceneIndex = app.indexOf("scene={sceneModelId ? (");
  const pageIndex = app.indexOf('<div className="demo-app-shell__screen-page" key={contentKey}>');

  assert.ok(sceneIndex >= 0);
  assert.ok(pageIndex > sceneIndex);
  assert.match(app, /variant="persistent"/);
});
