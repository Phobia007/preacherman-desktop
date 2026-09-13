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
  const animation = gltf.animations[0]; assert.equal(gltf.animations.length, 1); assert.equal(animation.channels.length, report.motionRetarget.channels); assert.ok(animation.channels.length <= 64);
  assert.equal(animation.name, `${id}.idle.happy.v2`);
  for (const channel of animation.channels) {
    assert.ok(["rotation", "translation"].includes(channel.target.path));
    if (channel.target.path === "translation") assert.equal(gltf.nodes[channel.target.node].name, "def_c_hip", "limb translations cannot stretch mechanical parts");
    const times = gltf.accessors[animation.samplers[channel.sampler].input];
    assert.ok(Math.abs(times.max[0] - times.min[0] - 175 / 60) < 1e-5);
  }
  assert.equal(report.clipOptimization.loop_seam_max_component_error, 0);
  const motion=report.motionRetarget;
  assert.equal(motion.source.split('/').at(-1),'Happy_Idle.fbx');
  assert.equal(motion.sourceSha256,'0f6b7fd2b90d9c3bbcaf8a86d6c12bbf961c045e8988107375dafcab47d00e71');
  assert.equal(createHash('sha256').update(binary.subarray(0,motion.originalBinaryBytes)).digest('hex'),motion.originalBinarySha256,'original geometry, skin, UVs, inverse binds and textures remain byte-identical');
  assert.ok(motion.footGoalMaxError<.0001);
  for(const channel of animation.channels){
    const a=gltf.accessors[animation.samplers[channel.sampler].output],v=gltf.bufferViews[a.bufferView],n=a.type==='VEC4'?4:3,o=(v.byteOffset??0)+(a.byteOffset??0);
    for(let k=0;k<n;k++)assert.equal(binary.readFloatLE(o+k*4),binary.readFloatLE(o+((a.count-1)*n+k)*4),'seamless default loop');
  }
});
