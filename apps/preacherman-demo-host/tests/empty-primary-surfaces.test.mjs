import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const packageRoot = join(import.meta.dirname, "..");

test("Task and Settings keep the Home scene while Gallery mounts its original scene", async () => {
  const [app, shell, preferences] = await Promise.all([
    readFile(join(packageRoot, "src", "App.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "app-shell", "AppShell.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "preferences.ts"), "utf8"),
  ]);

  assert.match(app, /data-surface="workspace"[\s\S]*<TaskExperienceSurface \/>/);
  assert.match(app, /data-surface="market"[\s\S]*<ActiveTheoryGallerySurface\s/);
  assert.equal((app.match(/<TaskExperienceSurface\b/g) ?? []).length, 1);
  assert.match(app, /activeSurfaceType === "settings"[\s\S]*<SettingsScreen/);
  assert.doesNotMatch(app, /<PreachermanGameletPanel/);
  assert.match(app, /const sceneModelId = activeSurfaceType === "market" \? galleryModelId : activeModelId;/);
  assert.match(app, /<CortanaModelStage[\s\S]*renderActive/);
  assert.match(app, /scene=\{<>[\s\S]*sceneModelId \|\| activeSurfaceType === "market" \? \(/);
  assert.doesNotMatch(app, /sceneHidden=/);
  assert.doesNotMatch(shell, /activeSurfaceType === "market"[\s\S]*Math\.max/);
  assert.match(shell, /Math\.min\(window\.innerWidth \/ 1800, window\.innerHeight \/ 1000\)/);
  assert.match(preferences, /applyPreferences[\s\S]*document\.documentElement\.dataset\.appearance/);
  assert.match(shell, /data-appearance=\{appearance\}/);
});
