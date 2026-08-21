import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const packageRoot = join(import.meta.dirname, "..");

test("Task, Gallery, and Settings keep empty content layers over the unchanged Home scene", async () => {
  const [app, shell, preferences] = await Promise.all([
    readFile(join(packageRoot, "src", "App.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "app-shell", "AppShell.tsx"), "utf8"),
    readFile(join(packageRoot, "src", "preferences.ts"), "utf8"),
  ]);

  assert.match(app, /activeSurfaceType === "settings" \|\| activeSurfaceType === "market"[\s\S]*className="demo-host"/);
  assert.match(app, /const workspaceContent = \([\s\S]*className="demo-host demo-host--workspace"[\s\S]*<\/main>/);
  assert.doesNotMatch(app, /<SettingsScreen|<TaskLookbackExperience|<CortanaGallery|<PreachermanGameletPanel/);
  assert.match(app, /const sceneModelId = activeModelId;/);
  assert.match(app, /<CortanaModelStage[\s\S]*renderActive/);
  assert.doesNotMatch(app, /sceneHidden=/);
  assert.doesNotMatch(shell, /activeSurfaceType === "market"[\s\S]*Math\.max/);
  assert.match(shell, /Math\.min\(window\.innerWidth \/ 1800, window\.innerHeight \/ 1000\)/);
  assert.match(preferences, /applyPreferences[\s\S]*document\.documentElement\.dataset\.appearance/);
  assert.match(shell, /data-appearance=\{appearance\}/);
});
