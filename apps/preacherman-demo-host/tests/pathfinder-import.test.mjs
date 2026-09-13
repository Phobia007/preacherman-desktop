import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url);
const id = "apex-legend-pathfinder";
test("Pathfinder retains the complete mechanical body, source-resolution textures and original skin", async () => {
  const report = JSON.parse(await readFile(new URL("avatar-pathfinder-import.json", root), "utf8"));
  const bytes = await readFile(new URL(`public/assets/avatars/${id}/${id}-runtime.glb`, root));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), report.runtimeSha256);
  const end = 20 + bytes.readUInt32LE(12), gltf = JSON.parse(bytes.toString("utf8", 20, end));
  assert.equal(gltf.images.length, 11); assert.equal(gltf.skins[0].joints.length, 145);
  assert.equal(report.runtimeTriangles, 45055); assert.equal(report.sourceTriangles - report.runtimeTriangles, 110, "only eleven overlapping screen variants are removed");
  assert.equal(report.selectedScreen, "def_c_screen_06"); assert.equal(report.geometryDecimation, false); assert.equal(report.textureDownsampling, false);
  for (const material of gltf.materials) assert.equal(material.alphaMode ?? "OPAQUE", "OPAQUE", "solid mechanical parts have no opacity holes");
  for (const material of gltf.materials.filter(m => /body|head|gear/.test(m.name))) assert.ok(material.normalTexture, "source normal detail remains connected");
  for (const name of ["lens", "emotes"]) assert.ok(gltf.materials.find(m => m.name.endsWith(name)).emissiveTexture);
  const binary = bytes.subarray(end + 8), dimensions = gltf.images.map(image => {
    const view = gltf.bufferViews[image.bufferView], png = binary.subarray(view.byteOffset, view.byteOffset + view.byteLength);
    assert.equal(image.mimeType, "image/png"); return [png.readUInt32BE(16), png.readUInt32BE(20)];
  });
  assert.equal(dimensions.filter(([w,h]) => w===2048&&h===2048).length, 2, "both body color and normal maps retain 2K resolution");
  const animation = gltf.animations[0]; assert.equal(gltf.animations.length, 1); assert.equal(animation.channels.length, 6);
  assert.equal(animation.name, `${id}.idle.neutral.v2`);
  for (const channel of animation.channels) {
    assert.equal(channel.target.path, "rotation"); assert.doesNotMatch(gltf.nodes[channel.target.node].name, /hip|thigh|knee|ankle|ball/);
    const times = gltf.accessors[animation.samplers[channel.sampler].input];
    assert.ok(Math.abs(times.max[0] - times.min[0] - 6.4) < 1e-5);
  }
  assert.equal(report.clipOptimization.loop_seam_max_component_error, 0);
});
