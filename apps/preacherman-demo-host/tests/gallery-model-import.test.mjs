import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";
import { Box3 } from "three";

const host = join(import.meta.dirname, "..");
const renderer = await import(pathToFileURL(join(host, "../../packages/preacherman-avatar-renderer/dist/index.js")));
const models = renderer.importedAvatarModels;

test("cards 3 through 10 bind the approved models in upload order", async () => {
  const source = await readFile(join(host, "src/surfaces/gallery/galleryModelBindings.ts"), "utf8");
  const { outputText: code } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  const bindings = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
  const cards = JSON.parse(await readFile(join(host, "public/active-theory-gallery/gallery/external/storage.googleapis.com/activetheory-v6.appspot.com/cms/projects-dev.json"), "utf8")).sort((a, b) => a.priority - b.priority);
  const order = ["cortana", "zima", ...models.map(model => model.id)];
  assert.equal(order.length, 10);
  assert.deepEqual(cards.slice(0, 10).map(card => bindings.galleryModelForProject(card.slug)), order);
  assert.equal(bindings.galleryModelForProject(cards[10].slug), null);
  assert.equal(bindings.galleryModelForProject("unknown"), null);
  for (let index = 0; index < order.length; index++) {
    assert.equal(bindings.adjacentGalleryModel(order[index]), order[index + 1] ?? order[index - 1]);
    assert.equal(renderer.isAvatarModelId(order[index]), true);
  }
  for (const value of ["__proto__", "constructor", "unknown", null, 4]) assert.equal(renderer.isAvatarModelId(value), false);
});

for (const { id } of models) {
  test(id + " has one animated, normalized, self-contained model using original materials", { timeout: 30000 }, async () => {
    globalThis.ProgressEvent ??= class ProgressEvent extends Event {};
    const bytes = await readFile(join(host, "public/assets/avatars", id, id + "-runtime.glb"));
    assert.ok(bytes.length < 24 * 1024 * 1024, "fits the existing bounded model cache");
    const length = bytes.readUInt32LE(12), offset = 20 + length;
    const gltf = JSON.parse(bytes.toString("utf8", 20, offset));
    assert.equal(gltf.animations.length, 1);
    assert.equal(gltf.animations[0].name, id + ".idle.cortana.v1");
    assert.ok(gltf.images.length > 0);
    assert.ok(gltf.images.every(image => image.bufferView !== undefined && !image.uri));
    assert.ok(gltf.buffers.every(buffer => !buffer.uri));
    const urls = renderer.createAvatarAssetUrls("/assets/avatars/" + id, id);
    assert.deepEqual(urls, { model: `/assets/avatars/${id}/${id}-runtime.glb`, textures: [] });
    assert.equal(renderer.avatarUsesHologram(id), false);
    const binary = bytes.subarray(offset + 8, offset + 8 + bytes.readUInt32LE(offset));
    gltf.buffers[0].uri = "data:application/octet-stream;base64," + binary.toString("base64");
    // Browser verification handles texture decoding; this test exercises real skinning and clips.
    delete gltf.images; delete gltf.textures; delete gltf.materials;
    for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) delete primitive.material;
    const adapter = new renderer.ThreeAvatarAnimationAdapter({
      avatarId: id, rigId: id,
      modelUrl: "data:model/gltf+json;base64," + Buffer.from(JSON.stringify(gltf)).toString("base64"),
      defaultActionId: "idle.default", stateMap: { idle: "idle.default" },
      actions: [{ id: "idle.default", clipName: gltf.animations[0].name, category: "idle", loop: "repeat", fadeIn: 0, fadeOut: 0, timeScale: 1, priority: 10, interruptible: true }],
    });
    try {
      await adapter.load(); await adapter.setState("idle"); adapter.update(0.4);
      const root = adapter.getRoot(); root.updateMatrixWorld(true);
      const box = new Box3().setFromObject(root, true);
      assert.ok(box.max.y - box.min.y > 1.5 && box.max.y - box.min.y < 2.05, "consistent display height");
      const bones = []; root.traverse(object => { if (object.isBone) bones.push(object); });
      const pose = () => bones.flatMap(bone => [...bone.position.toArray(), ...bone.quaternion.toArray()]);
      const first = pose(); adapter.update(0.3); assert.notDeepEqual(pose(), first);
      for (let frame = 0; frame < 1260; frame++) adapter.update(1 / 60);
      assert.ok(pose().every(Number.isFinite));
      assert.equal(adapter.getDebugSnapshot().currentAction, "idle.default");
      assert.equal(adapter.getDebugSnapshot().registeredActions, 1);
      assert.deepEqual(adapter.getDebugSnapshot().missingClipErrors, []);
    } finally { adapter.dispose(); }
  });
}
