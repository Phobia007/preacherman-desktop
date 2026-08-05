import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const hostRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const assetRoot = join(
  hostRoot,
  "public",
  "assets",
  "avatars",
  "cortana",
);

function parseGlbJson(buffer) {
  assert.equal(buffer.toString("ascii", 0, 4), "glTF");
  assert.equal(buffer.readUInt32LE(4), 2);
  assert.equal(buffer.readUInt32LE(8), buffer.byteLength);
  const jsonLength = buffer.readUInt32LE(12);
  assert.equal(buffer.toString("ascii", 16, 20), "JSON");
  return JSON.parse(buffer.toString("utf8", 20, 20 + jsonLength).trim());
}

test("Cortana runtime manifest registers only the real idle clip", async () => {
  const manifest = JSON.parse(
    await readFile(join(assetRoot, "animation-manifest.json"), "utf8"),
  );
  assert.equal(manifest.avatarId, "cortana");
  assert.equal(manifest.rigId, "cortanaskele_skeleton");
  assert.equal(manifest.model, "cortana-runtime.glb");
  assert.equal(manifest.defaultAction, "idle.catwalk");
  assert.deepEqual(manifest.actions, [{
    id: "idle.catwalk",
    clipName: "cortana.idle.catwalk.v1",
    category: "idle",
    loop: "repeat",
    fadeIn: 0.35,
    fadeOut: 0.35,
    timeScale: 1,
    priority: 10,
    interruptible: true,
  }]);
  assert.deepEqual(manifest.stateMap, { idle: "idle.catwalk" });
  assert.deepEqual(manifest.reservedStates, [
    "listening",
    "thinking",
    "speaking",
    "success",
    "error",
    "sleeping",
    "wakeup",
  ]);
});

test("faithful runtime GLB contains one Cortana, one skin, and the named clip", async () => {
  const glb = parseGlbJson(
    await readFile(join(assetRoot, "cortana-runtime.glb")),
  );
  const nodeNames = glb.nodes.map((node) => node.name).filter(Boolean);

  assert.equal(glb.animations.length, 1);
  assert.equal(glb.animations[0].name, "cortana.idle.catwalk.v1");
  assert.equal(glb.skins.length, 1);
  assert.equal(glb.skins[0].joints.length, 111);
  assert.deepEqual(
    glb.materials.map((material) => material.name).sort(),
    ["rt_body", "rt_eyelashes", "rt_eyes", "rt_face", "rt_hair"],
  );
  assert.equal(glb.cameras, undefined);
  assert.equal(
    glb.extensions?.KHR_lights_punctual,
    undefined,
  );
  for (const excluded of [
    "SOURCE_MIXAMO_RIG",
    "Cortana_Body",
    "Cortana_Eyelashes",
    "Cortana_Eyes",
    "Cortana_Hair",
    "Camera",
    "Plane",
    "smd_bone_vis",
  ]) {
    assert.equal(nodeNames.includes(excluded), false, excluded);
  }
  for (const formal of [
    "cortana",
    "body_subd",
    "eyelashes:default",
    "eyes",
    "hair_subd",
  ]) {
    assert.equal(nodeNames.includes(formal), true, formal);
  }

  const skinnedMeshNodes = glb.nodes.filter(
    (node) => node.mesh !== undefined,
  );
  assert.equal(skinnedMeshNodes.length, 4);
  assert.equal(
    skinnedMeshNodes.every((node) => node.skin === 0),
    true,
  );
  const pelvis = glb.nodes.find((node) => node.name === "b_pelvis");
  assert.ok(pelvis);
  assert.ok(
    Math.abs(pelvis.translation[2] - 0.9541775) < 0.00001,
    "runtime skeleton must stay in the viewport's metre-scale space",
  );
  const clipEndSeconds = Math.max(
    ...glb.animations[0].samplers.map(
      (sampler) => glb.accessors[sampler.input].max[0],
    ),
  );
  assert.equal(clipEndSeconds, 10);
});
