import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const hostRoot = join(import.meta.dirname, "..");
const workspaceRoot = join(hostRoot, "..", "..");

test("Home, Task, Gallery, and Settings share one cinematic companion scene below blank overlays", async () => {
  const [app, shell, styles, stage] = await Promise.all([
    readFile(join(hostRoot, "src", "App.tsx"), "utf8"),
    readFile(join(hostRoot, "src", "app-shell", "AppShell.tsx"), "utf8"),
    readFile(join(hostRoot, "src", "styles.css"), "utf8"),
    readFile(join(hostRoot, "src", "gallery", "CortanaModelStage.tsx"), "utf8"),
  ]);

  assert.doesNotMatch(app, /sceneHidden=/);
  assert.match(app, /environment="cinematic"/);
  assert.match(app, /variant="persistent"/);
  assert.match(app, /wakeEnabled=\{activeSurfaceType === "home"\}/);
  assert.equal((app.match(/<CortanaModelStage\b/g) ?? []).length, 1);
  assert.match(shell, /className="demo-app-shell__scene"/);
  assert.match(shell, /data-active-surface=\{activeSurfaceType\}/);
  assert.match(styles, /\.demo-app-shell__scene\s*\{[\s\S]*z-index:\s*0/);
  assert.match(styles, /\.demo-app-shell__screen-content\s*\{[\s\S]*z-index:\s*2[\s\S]*background:\s*transparent/);
  assert.match(stage, /data-scene-environment=\{environment\}/);
  assert.match(stage, /className="cortana-model-stage__wake-button"/);
  assert.match(stage, /preacherman:voice-wake-request/);
  assert.match(stage, /aria-pressed=\{awakened\}/);
  assert.match(styles, /\.cortana-model-stage__wake-button\s*\{[\s\S]*bottom:\s*34px;[\s\S]*width:\s*500px;[\s\S]*height:\s*94px;[\s\S]*clip-path:\s*ellipse\(50% 50% at 50% 50%\)[\s\S]*transform:\s*translateX\(-50%\)/);
});

test("Gallery smoothly pushes the persistent model into the close portrait framing", async () => {
  const styles = await readFile(join(hostRoot, "src", "styles.css"), "utf8");

  assert.match(styles, /\.demo-app-shell__scene\s*\{[\s\S]*transform:\s*scale\(1\);[\s\S]*transform-origin:\s*center center;[\s\S]*transform 520ms cubic-bezier\(0\.16, 1, 0\.3, 1\)/);
  assert.match(styles, /\.demo-app-shell\[data-active-surface="market"\] \.demo-app-shell__scene\s*\{[\s\S]*transform:\s*translate3d\(0, 31%, 0\) scale\(1\.9\);[\s\S]*transition-duration:\s*260ms, 760ms, 0s;/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.demo-app-shell__scene,[\s\S]*transition:\s*none/);
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
  assert.doesNotMatch(environment, /<boxGeometry\b/);
  assert.match(environment, /receiveShadow/);
  assert.doesNotMatch(environment, /<planeGeometry args=\{\[0\.018, 2\.5\]\}/);
  assert.match(environment, /const BREATH_CYCLE_SECONDS = 5\.6/);
  assert.match(environment, /MathUtils\.damp\(activationProgress\.current, target, 8, delta\)/);
  assert.match(environment, /const ENERGY_FRAGMENT_SHADER/);
  assert.match(environment, /float sweep = pow/);
  assert.match(environment, /float restingEnergy = 0\.06 \+ uBreath \* 0\.31/);
  assert.match(environment, /float steadyEnergy = mix\(restingEnergy, 0\.95, uActivation\)/);
  assert.match(environment, /float movingEnergy = \(1\.0 - uActivation\)/);
  assert.match(environment, /energyMaterial\.current\.uniforms\.uActivation\.value = progress/);
  assert.match(environment, /<cylinderGeometry args=\{\[0\.555, 0\.555, 0\.08, 128, 1, true\]\}/);
  assert.match(environment, /<circleGeometry args=\{\[0\.555, 128\]\}/);
  assert.equal((environment.match(/color="#ffffff"/g) ?? []).length, 3);
  assert.match(environment, /<meshBasicMaterial color="#000000" side=\{DoubleSide\} toneMapped=\{false\} \/>/);
  assert.doesNotMatch(environment, /#0b66d9|#25baff|#4bc8ff|#188fda/);
  assert.doesNotMatch(environment, /platformGroup|AWAKENED_STAGE_LIFT|position\.y/);
  assert.doesNotMatch(environment, /<rectAreaLight\b/);
  assert.doesNotMatch(environment, /<pointLight\b/);
  assert.match(environment, /prefers-reduced-motion: reduce/);
  assert.match(lights, /CinematicHologramLights/);
  assert.match(lights, /color="#d7f1ff"[\s\S]*intensity=\{11\.5\}/);
  assert.match(lights, /color="#1676df"[\s\S]*intensity=\{7\.4\}/);
  assert.match(scene, /environment === "cinematic" \? <CinematicEnvironment awakened=\{awakened\} \/>/);
  assert.doesNotMatch(scene, /AwakeningRig|AWAKENED_STAGE_LIFT|position\.y/);
  assert.match(scene, /<AvatarModel\b/);
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
  assert.match(styles, /\.demo-app-shell__scene\s*\{[\s\S]*background:\s*var\(--demo-theme-home-canvas\)/);
  assert.match(styles, /\.cortana-model-stage__wake-button:focus-visible\s*\{[\s\S]*var\(--demo-theme-focus\)/);
});
