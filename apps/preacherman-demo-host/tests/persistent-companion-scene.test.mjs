import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const hostRoot = join(import.meta.dirname, "..");
const workspaceRoot = join(hostRoot, "..", "..");

test("non-Gallery pages share one cinematic companion scene below page overlays", async () => {
  const [app, shell, styles, stage] = await Promise.all([
    readFile(join(hostRoot, "src", "App.tsx"), "utf8"),
    readFile(join(hostRoot, "src", "app-shell", "AppShell.tsx"), "utf8"),
    readFile(join(hostRoot, "src", "styles.css"), "utf8"),
    readFile(join(hostRoot, "src", "gallery", "CortanaModelStage.tsx"), "utf8"),
  ]);

  assert.match(app, /sceneHidden=\{activeSurfaceType === "market"\}/);
  assert.match(app, /environment="cinematic"/);
  assert.match(app, /variant="persistent"/);
  assert.equal((app.match(/<CortanaModelStage\b/g) ?? []).length, 1);
  assert.match(shell, /className="demo-app-shell__scene"/);
  assert.match(shell, /data-scene-hidden=\{sceneHidden \? "true" : "false"\}/);
  assert.match(styles, /\.demo-app-shell__scene\s*\{[\s\S]*z-index:\s*0/);
  assert.match(styles, /\.demo-app-shell__screen-content\s*\{[\s\S]*z-index:\s*2[\s\S]*background:\s*transparent/);
  assert.match(styles, /\.demo-app-shell\[data-scene-hidden="true"\] \.demo-app-shell__scene/);
  assert.match(stage, /data-scene-environment=\{environment\}/);
});

test("cinematic scene uses real 3D depth, directional lights, and a full-size Canvas", async () => {
  const rendererRoot = join(
    workspaceRoot,
    "packages",
    "preacherman-avatar-renderer",
    "src",
  );
  const [environment, lights, scene, rendererStyles] = await Promise.all([
    readFile(join(rendererRoot, "CinematicEnvironment.tsx"), "utf8"),
    readFile(join(rendererRoot, "HologramLights.tsx"), "utf8"),
    readFile(join(rendererRoot, "InteractiveAvatarScene.tsx"), "utf8"),
    readFile(join(rendererRoot, "avatar-renderer.css"), "utf8"),
  ]);

  assert.match(environment, /<fog\b/);
  assert.match(environment, /<planeGeometry\b/);
  assert.match(environment, /<boxGeometry\b/);
  assert.match(environment, /receiveShadow/);
  assert.match(lights, /CinematicHologramLights/);
  assert.match(lights, /color="#d7f1ff"[\s\S]*intensity=\{11\.5\}/);
  assert.match(lights, /color="#1676df"[\s\S]*intensity=\{7\.4\}/);
  assert.match(scene, /environment === "cinematic" \? <CinematicEnvironment \/>/);
  assert.match(scene, /environment === "cinematic"\) camera\.position\.set\(0, 0\.94, 4\.35\)/);
  assert.match(rendererStyles, /width:\s*100% !important/);
  assert.match(rendererStyles, /height:\s*100% !important/);
});

test("light and dark overlay chrome use semantic tokens above the same dark stage", async () => {
  const styles = await readFile(join(hostRoot, "src", "styles.css"), "utf8");

  assert.match(styles, /\.demo-app-shell\s*\{[\s\S]*--demo-theme-surface-elevated:\s*#ffffff/);
  assert.match(styles, /\.demo-app-shell\[data-appearance="dark"\]\s*\{[\s\S]*--demo-theme-surface-elevated:\s*#0d0e0e/);
  assert.match(styles, /\.demo-surface-toolbar__copy\s*\{[\s\S]*var\(--demo-theme-surface-elevated\)[\s\S]*var\(--demo-theme-border\)/);
  assert.match(styles, /\.demo-window-controls__button\s*\{[\s\S]*var\(--demo-theme-surface-elevated\)/);
  assert.match(styles, /\.demo-app-shell__scene\s*\{[\s\S]*background:\s*#010409/);
});
