import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const visualRoot = join(packageRoot, "src", "surfaces", "homeVisual");

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test("Workspace swaps only its avatar viewport for the isolated Home visual", async () => {
  const workspace = await readFile(
    join(packageRoot, "src", "surfaces", "workspace", "WorkspaceConversationSurface.tsx"),
    "utf8",
  );

  assert.match(workspace, /<HomeVisualScene\s*\/>/);
  assert.doesNotMatch(workspace, /AvatarSlotComponent|avatar-stage|avatar-viewport/);
  assert.match(workspace, /data-figma-frame="281:538"/);
});

test("Home visual contains only the background, vignette, and binary rain", async () => {
  const scene = await readFile(join(visualRoot, "HomeVisualScene.tsx"), "utf8");
  const css = await readFile(join(visualRoot, "homeVisualScene.css"), "utf8");

  assert.match(scene, /<BinaryRain theme=\{theme\}\s*\/>/);
  assert.doesNotMatch(scene, /DefaultFigure|Orbs|OrbitRings|home-visual-scene__stage/);
  assert.doesNotMatch(css, /home-(?:figure|orbs?|orbits)/);
  for (const file of [
    ["components", "DefaultFigure.tsx"],
    ["components", "Orbs.tsx"],
    ["components", "OrbitRings.tsx"],
    ["config", "sceneGeometry.ts"],
  ]) {
    assert.equal(await exists(join(visualRoot, ...file)), false);
  }
  assert.doesNotMatch(scene, /<button|onClick|onPointer|onMouse/);
  assert.match(css, /\.home-visual-scene\s*\{[\s\S]*pointer-events:\s*none/s);
  for (const zIndex of [3, 10]) {
    assert.match(css, new RegExp(`z-index:\\s*${zIndex}`));
  }
});

test("binary rain uses three pre-rendered canvases and a compositor-only animation", async () => {
  const component = await readFile(
    join(visualRoot, "components", "BinaryRain.tsx"),
    "utf8",
  );
  const hook = await readFile(
    join(visualRoot, "hooks", "useBinaryRain.ts"),
    "utf8",
  );
  const config = await readFile(
    join(visualRoot, "config", "binaryRainConfig.ts"),
    "utf8",
  );

  assert.equal((component.match(/<canvas/g) ?? []).length, 3);
  assert.match(hook, /ResizeObserver/);
  assert.doesNotMatch(hook, /requestAnimationFrame|visibilitychange/);
  assert.match(hook, /height \* 2 \* RAIN_RENDER_SCALE/);
  assert.match(hook, /if \(layer === "edge"\) continue/);
  assert.match(config, /RAIN_RENDER_SCALE\s*=\s*0\.78/);
  assert.equal((config.match(/centerSpacing:\s*4/g) ?? []).length, 2);
  assert.match(config, /edgeSpacing:\s*14/);
  assert.match(config, /centerOpacity:\s*0\.32/);
  assert.equal((config.match(/edgeOpacity:\s*0\.012/g) ?? []).length, 2);
  assert.match(config, /Math\.pow\(centerStrength,\s*0\.78\)/);
  assert.match(config, /Math\.pow\(centerStrength,\s*0\.8\)/);
  assert.match(config, /Math\.pow\(centerStrength,\s*0\.75\)/);
  assert.match(config, /edgeSpacing:\s*12/);
  assert.match(config, /centerOpacity:\s*0\.34/);
  assert.match(hook, /createLinearGradient/);
  assert.match(hook, /fillRect/);
  assert.match(hook, /layer === "edge" \|\| layer === "sharp"/);
});

test("rain mask fades continuously through both outer halves", async () => {
  const css = await readFile(join(visualRoot, "homeVisualScene.css"), "utf8");
  const rainRule = css.match(/\.binary-rain\s*\{[\s\S]*?\n\}/)?.[0] ?? "";

  for (const stop of ["5%) 4%", "15%) 10%", "32%) 18%", "55%) 28%", "78%) 38%"]) {
    assert.match(rainRule, new RegExp(stop.replace(/[()]/g, "\\$&")));
  }
  assert.match(rainRule, /#000000 48%/);
  assert.match(rainRule, /#000000 52%/);
  assert.match(rainRule, /transparent 100%/);
});

test("binary rain movement stays on the CSS compositor", async () => {
  const css = await readFile(join(visualRoot, "homeVisualScene.css"), "utf8");

  assert.match(css, /@keyframes binary-rain-drift/);
  assert.match(css, /animation:\s*binary-rain-drift 42s linear infinite/);
  assert.match(css, /animation-duration:\s*64s/);
  assert.match(css, /transform:\s*translate3d\(0,\s*50%,\s*0\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /animation-play-state:\s*paused/);
});
