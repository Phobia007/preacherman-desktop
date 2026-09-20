import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const hostRoot = join(import.meta.dirname, "..");
const workspaceRoot = join(hostRoot, "..", "..");

test("Home, Task, Settings, and Gallery share one persistent companion scene", async () => {
  const [app, shell, styles, stage] = await Promise.all([
    readFile(join(hostRoot, "src", "App.tsx"), "utf8"),
    readFile(join(hostRoot, "src", "app-shell", "AppShell.tsx"), "utf8"),
    readFile(join(hostRoot, "src", "styles.css"), "utf8"),
    readFile(join(hostRoot, "src", "gallery", "CortanaModelStage.tsx"), "utf8"),
  ]);

  assert.doesNotMatch(app, /sceneHidden=/);
  assert.match(app, /environment="cinematic"/);
  assert.match(app, /variant="persistent"/);
  assert.doesNotMatch(app, /wakeEnabled/);
  assert.equal((app.match(/<CortanaModelStage\b/g) ?? []).length, 1);
  assert.match(app, /sceneModelId \? \(/);
  assert.doesNotMatch(app, /sceneModelId && activeSurfaceType !== "market"/);
  assert.match(app, /cameraFraming=\{activeSurfaceType === "market" \|\| activeSurfaceType === "settings" \? "portrait" : "full-body"\}/);
  assert.match(app, /<ActiveTheoryGallerySurface\s+active=\{activeSurfaceType === "market"\}[\s\S]*?onDetailChange=\{setGalleryDetailOpen\}/);
  assert.match(shell, /className="demo-app-shell__scene"/);
  assert.match(shell, /data-active-surface=\{activeSurfaceType\}/);
  assert.match(styles, /\.demo-app-shell__scene\s*\{[\s\S]*z-index:\s*0/);
  assert.match(styles, /\.demo-app-shell__screen-content\s*\{[\s\S]*z-index:\s*2[\s\S]*background:\s*transparent/);
  assert.match(stage, /data-scene-environment=\{environment\}/);
  assert.doesNotMatch(stage, /cortana-model-stage__wake-button/);
  assert.doesNotMatch(stage, /preacherman:voice-wake-request/);
  assert.doesNotMatch(stage, /awakened/);
  assert.doesNotMatch(stage, /interactionSignal/);
  assert.doesNotMatch(stage, /cortana-model-stage__interaction-target/);
  assert.match(stage, /data-motion-action=\{defaultActionId\}/);
  assert.doesNotMatch(stage, /"conversation_loop"|"looking_around"|motion\.select/);
  assert.doesNotMatch(styles, /cortana-model-stage__wake-button/);
});

test("Gallery moves the shared Cortana into the accepted close portrait above the original runtime", async () => {
  const [app, styles, gallerySurface, galleryStyles, runtime, interactionBridge] = await Promise.all([
    readFile(join(hostRoot, "src", "App.tsx"), "utf8"),
    readFile(join(hostRoot, "src", "styles.css"), "utf8"),
    readFile(
      join(hostRoot, "src", "surfaces", "gallery", "ActiveTheoryGallerySurface.tsx"),
      "utf8",
    ),
    readFile(
      join(hostRoot, "src", "surfaces", "gallery", "active-theory-gallery-surface.css"),
      "utf8",
    ),
    readFile(
      join(
        hostRoot,
        "public",
        "active-theory-gallery",
        "gallery",
        "assets",
        "js",
        "app.1780406240914.js",
      ),
      "utf8",
    ),
    readFile(
      join(
        hostRoot,
        "public",
        "active-theory-gallery",
        "gallery",
        "interaction-bridge.js",
      ),
      "utf8",
    ),
  ]);

  assert.doesNotMatch(styles, /\.demo-app-shell\[data-active-surface="market"\] \.demo-app-shell__scene[\s\S]*scale\(1\.9\)/);
  assert.match(app, /cameraFraming=\{activeSurfaceType === "market" \|\| activeSurfaceType === "settings" \? "portrait" : "full-body"\}/);
  assert.match(app, /sceneModelId \? \(/);
  assert.doesNotMatch(gallerySurface, /CortanaModelStage/);
  assert.match(styles, /data-active-surface="market"\] \.demo-app-shell__scene[\s\S]*mix-blend-mode:\s*screen/);
  assert.match(styles, /data-active-surface="market"\] \.demo-app-shell__scene \*[\s\S]*pointer-events:\s*none !important/);
  assert.match(galleryStyles, /active-theory-gallery-arrive 760ms cubic-bezier\(\.16, 1, \.3, 1\) 140ms both/);
  assert.match(galleryStyles, /@keyframes active-theory-gallery-arrive[\s\S]*translate3d\(12%, 0, 0\)[\s\S]*clip-path:\s*inset\(0\)/);
  assert.match(galleryStyles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none/);
  assert.match(styles, /data-active-surface="market"\] \.demo-app-shell__drag-region--right[\s\S]*pointer-events:\s*none/);
  assert.doesNotMatch(galleryStyles, /cortana-model-stage__interaction-target/);
  assert.match(interactionBridge, /__hoverCallback/);
  assert.match(interactionBridge, /__clickCallback/);
  assert.match(runtime, /__PREACHERMAN_SPINE_REMOVED__=!0/);
  assert.doesNotMatch(runtime, /cortana-runtime\.glb/);
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
  assert.match(environment, /const ENERGY_FRAGMENT_SHADER/);
  assert.match(environment, /<cylinderGeometry args=\{\[0\.555, 0\.555, 0\.08, 128, 1, true\]\}/);
  assert.match(environment, /<circleGeometry args=\{\[0\.555, 128\]\}/);
  assert.match(environment, /<meshBasicMaterial color="#000000" side=\{DoubleSide\} toneMapped=\{false\} \/>/);
  assert.doesNotMatch(environment, /#0b66d9|#25baff|#4bc8ff|#188fda/);
  assert.doesNotMatch(environment, /platformGroup|AWAKENED_STAGE_LIFT|position\.y/);
  assert.doesNotMatch(environment, /<rectAreaLight\b/);
  assert.doesNotMatch(environment, /<pointLight\b/);
  assert.match(environment, /prefers-reduced-motion: reduce/);
  assert.match(lights, /CinematicHologramLights/);
  assert.match(lights, /color="#d7f1ff"[\s\S]*intensity=\{11\.5\}/);
  assert.match(lights, /color="#1676df"[\s\S]*intensity=\{7\.4\}/);
  assert.match(scene, /environment === "cinematic" \? <CinematicEnvironment isolateCompanion=\{isolateCompanion\} \/>/);
  assert.doesNotMatch(scene, /AwakeningRig|AWAKENED_STAGE_LIFT/);
  assert.match(scene, /<AvatarModel\b/);
  assert.match(scene, /const FULL_BODY_CAMERA = \{ x: 0, y: 0\.94, z: 4\.35 \}/);
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
  assert.doesNotMatch(styles, /cortana-model-stage__wake-button/);
});


test("every surface and Gallery overview follows the equipped companion, with card-only previews", async () => {
  const app = await readFile(join(hostRoot, "src", "App.tsx"), "utf8");
  const selection = app.slice(app.indexOf("  const activeModelId = preferences.activeModelId;"), app.indexOf("  const preachermanPanelSurface:"));
  assert.ok(selection.includes("const sceneModelId ="));
  const resolveScene = new Function("preferences", "activeSurfaceType", "galleryDetailOpen", "galleryPreviewModelId", `${selection}; return sceneModelId;`);
  const models = ["cortana", "zima", "jubilee-midnight-mutant", "halo-mk-v-model", "magik-soul-surfer", "punk-magik", "sanhua-wuthering-waves", "black-cat-coastal-cat", "clove-t-pose", "black-widow-aquatic-assassin", null];
  for (const appearance of ["dark", "light"]) {
    for (const activeModelId of models) {
      const preferences = { appearance, activeModelId };
      for (const surface of ["home", "workspace", "market", "ledger", "settings", "account", "lab", "test"]) {
        for (const preview of models) {
          assert.equal(resolveScene(preferences, surface, false, preview), activeModelId, `${appearance}: ${surface} overview must follow ${activeModelId}, including disabled state`);
          assert.equal(resolveScene(preferences, surface, true, preview), surface === "market" ? preview : activeModelId, "only an open Gallery card may override the equipped model");
        }
      }
    }
  }
});
