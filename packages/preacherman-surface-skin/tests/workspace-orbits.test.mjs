import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import typescript from "typescript";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
let geometryModule;

async function orbitGeometry() {
  if (!geometryModule) {
    const source = await readFile(join(packageRoot, "src", "surfaces", "workspace", "orbitGeometry.ts"), "utf8");
    const output = typescript.transpileModule(source, {
      compilerOptions: {
        module: typescript.ModuleKind.ESNext,
        target: typescript.ScriptTarget.ES2022,
      },
    }).outputText;
    geometryModule = import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
  }
  return geometryModule;
}

function nearlyEqual(actual, expected, epsilon = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} must be within ${epsilon} of ${expected}`);
}

test("workspace defines two shared ellipses with exactly two opposite nodes each", async () => {
  const { workspaceOrbitDefinitions } = await orbitGeometry();

  assert.equal(workspaceOrbitDefinitions.length, 2);
  for (const orbit of workspaceOrbitDefinitions) {
    assert.equal(orbit.nodes.length, 2, orbit.id);
    nearlyEqual(orbit.nodes[1].phaseOffset - orbit.nodes[0].phaseOffset, Math.PI);
  }
});

test("opposite nodes remain on the same rotated ellipse at every sampled time", async () => {
  const { ellipseEquationValue, orbitFrameAtElapsed, workspaceOrbitDefinitions } = await orbitGeometry();
  const sampleTimes = [0, 1_000, 9_000, 18_000, 27_000, 44_000];

  for (const orbit of workspaceOrbitDefinitions) {
    for (const elapsedMs of sampleTimes) {
      const frame = orbitFrameAtElapsed(orbit, elapsedMs);
      assert.equal(frame.nodes.length, 2);
      nearlyEqual((frame.nodes[1].phase - frame.nodes[0].phase + Math.PI * 2) % (Math.PI * 2), Math.PI);
      for (const node of frame.nodes) {
        nearlyEqual(ellipseEquationValue(orbit, node, frame.tiltRadians), 1, 1e-7);
      }
      nearlyEqual(frame.nodes[0].x + frame.nodes[1].x, orbit.cx * 2, 1e-7);
      nearlyEqual(frame.nodes[0].y + frame.nodes[1].y, orbit.cy * 2, 1e-7);
    }
  }
});

test("one elapsed time drives stable node coordinates and phase-derived front/back depth", async () => {
  const { orbitFrameAtElapsed, workspaceOrbitDefinitions } = await orbitGeometry();

  for (const orbit of workspaceOrbitDefinitions) {
    const first = orbitFrameAtElapsed(orbit, orbit.durationMs * 0.25);
    const repeated = orbitFrameAtElapsed(orbit, orbit.durationMs * 0.25);
    assert.deepEqual(first, repeated, `${orbit.id} must not free-drift at the same elapsed time`);
    assert.notEqual(first.nodes[0].layer, first.nodes[1].layer);

    const later = orbitFrameAtElapsed(orbit, orbit.durationMs * 0.75);
    assert.equal(later.nodes[0].layer, first.nodes[1].layer);
    assert.equal(later.nodes[1].layer, first.nodes[0].layer);
  }
});

test("workspace corner controls and Alive trigger use the requested fixed positions", async () => {
  const userSource = await readFile(join(packageRoot, "src", "surfaces", "workspace", "UserIdentity.tsx"), "utf8");
  const statusSource = await readFile(join(packageRoot, "src", "surfaces", "workspace", "TopLiveStatus.tsx"), "utf8");
  const css = await readFile(join(packageRoot, "src", "surfaces", "workspace", "workspace.css"), "utf8");
  const identityRule = css.match(/\.pm-workspace__identity\s*\{[^}]*\}/s)?.[0] ?? "";
  const bellRule = css.match(/\.pm-workspace__bell\s*\{[^}]*\}/s)?.[0] ?? "";
  const statusRule = css.match(/\.pm-workspace__status-indicator\s*\{[^}]*\}/s)?.[0] ?? "";

  assert.doesNotMatch(userSource, /account-divider/);
  assert.match(identityRule, /left:\s*24px/);
  assert.match(identityRule, /bottom:\s*25px/);
  assert.doesNotMatch(identityRule, /\btop:|\bright:/);
  assert.match(bellRule, /right:\s*30px/);
  assert.match(bellRule, /bottom:\s*32px/);
  assert.doesNotMatch(bellRule, /\btop:/);
  assert.match(statusSource, />Alive<\/span>/);
  assert.match(statusRule, /width:\s*54px/);
  assert.match(statusRule, /height:\s*14px/);
  assert.match(statusRule, /font-size:\s*9px/);
});

test("workspace orbit renderer consumes one geometry frame and keeps bridge buttons semantic", async () => {
  const source = await readFile(join(packageRoot, "src", "surfaces", "workspace", "OrbitLayer.tsx"), "utf8");
  const vessel = await readFile(join(packageRoot, "src", "surfaces", "workspace", "StateVessel.tsx"), "utf8");
  const css = await readFile(join(packageRoot, "src", "surfaces", "workspace", "workspace.css"), "utf8");

  assert.match(source, /orbitFrameAtElapsed/);
  assert.match(source, /requestAnimationFrame/);
  assert.equal((source.match(/<button\b/g) ?? []).length, 1, "one mapped semantic button template");
  assert.match(source, /dispatch\(orbitNodeCommand\(node\.id,\s*node\.label\)\)/);
  assert.match(source, /data-orbit-node=\{node\.id\}/);
  assert.match(source, /data-orbit-layer=\{node\.layer\}/);
  assert.match(source, /pm-workspace__orbit-node-visual/);
  assert.match(source, /pm-workspace__orbit-node-hit/);
  assert.match(vessel, /pm-workspace__human-occluder/);
  assert.match(vessel, /humanAsset/);
  assert.match(css, /\.pm-workspace__orbit-node-visual\s*\{[^}]*pointer-events:\s*none/s);
  assert.match(css, /\.pm-workspace__orbit-node-hit\s*\{[^}]*z-index:\s*6[^}]*pointer-events:\s*auto/s);
});
