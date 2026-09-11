import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";
import { Box3, Vector3 } from "three";

const host = join(import.meta.dirname, "..");
const renderer = await import(pathToFileURL(join(host, "../../packages/preacherman-avatar-renderer/dist/index.js")));
const models = renderer.importedAvatarModels;
const catalogSource = await readFile(join(host, "../../packages/preacherman-avatar-renderer/src/avatarCatalog.ts"), "utf8");
const catalogCode = ts.transpileModule(catalogSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { importedAvatarProfiles } = await import("data:text/javascript;base64," + Buffer.from(catalogCode).toString("base64"));


test("new characters fill vacant cards in source order while existing characters retain their slots", async () => {
  const source = await readFile(join(host, "src/surfaces/gallery/galleryModelBindings.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  const bindings = await import("data:text/javascript;base64," + Buffer.from(outputText).toString("base64"));
  const cards = JSON.parse(await readFile(join(host, "public/active-theory-gallery/gallery/external/storage.googleapis.com/activetheory-v6.appspot.com/cms/projects-dev.json"), "utf8")).sort((a,b)=>a.priority-b.priority);
  const manifest = JSON.parse(await readFile(join(host,"avatar-intake-20260911.json"),"utf8"));
  assert.equal(manifest.models.length,16);
  assert.equal(new Set(manifest.models.map(m=>m.id)).size,16);
  const kept = {0:"cortana",1:"zima",2:"jubilee-midnight-mutant",3:"halo-mk-v-model",5:"punk-magik",8:"clove-t-pose"};
  let next=0;
  const order=cards.map((_,i)=>kept[i]??manifest.models[next++]?.id??null);
  assert.deepEqual(cards.map(c=>bindings.galleryModelForProject(c.slug)),order);
  assert.equal(bindings.galleryModelForProject("unknown"),null);
  const available=order.filter(Boolean);
  for(let i=0;i<available.length;i++) {
    assert.equal(bindings.adjacentGalleryModel(available[i]),available[i+1]??available[i-1]);
    assert.equal(renderer.isAvatarModelId(available[i]),true);
  }
  for(const value of ["__proto__","constructor","unknown",null,4]) assert.equal(renderer.isAvatarModelId(value),false);
  assert.ok(available.includes("nier-print-2b") && available.includes("nier-automata-2b"));
});

for (const { id } of models) {
  test(id + " has one animated, normalized, self-contained model using original materials", { timeout: 30000 }, async () => {
    globalThis.ProgressEvent ??= class ProgressEvent extends Event {};
    const bytes = await readFile(join(host, "public/assets/avatars", id, id + "-runtime.glb"));
    assert.ok(bytes.length < 52 * 1024 * 1024, "fits the 64 MiB cache while retaining source detail");
    const length = bytes.readUInt32LE(12), offset = 20 + length;
    const gltf = JSON.parse(bytes.toString("utf8", 20, offset));
    assert.equal(gltf.animations.length, 1);
    assert.ok(gltf.animations[0].channels.length <= 64, "fixed accessory transforms do not need per-frame tracks");
    assert.equal(gltf.animations[0].name, importedAvatarProfiles[id].actions[0].clipName);
    assert.match(gltf.animations[0].name, /\.idle\.((female|male|breathing|neutral|standard|weight_shift|ready)\.v2|seated\.v3)$/);
    assert.ok(gltf.animations[0].channels.every(channel => channel.target.path !== "scale"), "retargeting preserves authored bone scale");
    assert.ok((gltf.images?.length ?? 0) > 0 || ["iron-man-mark-85", "modural-robot-mecha-chimera-dyan-high-poly-mesh"].includes(id), "authored texture or original untextured PBR material");
    assert.ok((gltf.images ?? []).every(image => image.bufferView !== undefined && !image.uri));
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
      actions: importedAvatarProfiles[id].actions.map(action => ({ ...action, fadeIn: 0, fadeOut: 0 })),
    });
    try {
      await adapter.load(); await adapter.setState("idle"); adapter.update(0.4);
      const root = adapter.getRoot(); root.updateMatrixWorld(true);
      const box = new Box3().setFromObject(root, true);
      assert.ok(box.max.y - box.min.y > 1.5 && box.max.y - box.min.y < 2.05, "consistent display height");
      const bones = []; root.traverse(object => { if (object.isBone) bones.push(object); });
      const pose = () => bones.flatMap(bone => [...bone.position.toArray(), ...bone.quaternion.toArray()]);
      const first = pose(); adapter.update(0.3); assert.notDeepEqual(pose(), first);
      for (let frame = 0; frame < 1260; frame++) {
        adapter.update(1 / 60);
        if (id !== "sanhua-wuthering-waves" || frame % 120 !== 0) continue;
        root.updateMatrixWorld(true);
        root.traverse(mesh => {
          if (!mesh.isSkinnedMesh) return;
          mesh.skeleton.update();
          const position = mesh.geometry.attributes.position, weights = mesh.geometry.attributes.skinWeight;
          assert.equal(weights.itemSize, 4);
          const posed = [];
          for (let vertex = 0; vertex < position.count; vertex++) {
            assert.ok(Math.abs(weights.getX(vertex) + weights.getY(vertex) + weights.getZ(vertex) + weights.getW(vertex) - 1) < 0.00001);
            posed.push(mesh.getVertexPosition(vertex, new Vector3()).applyMatrix4(mesh.matrixWorld));
            assert.ok(posed.at(-1).toArray().every(Number.isFinite));
          }
          // The GLB stores normalized bind vertices. Compare actual desktop LBS edges
          // throughout two loops to catch stretched shoulders, neck and split hip seams.
          const indices = mesh.geometry.index;
          for (let triangle = 0; triangle < (indices?.count ?? position.count); triangle += 3) {
            for (let edge = 0; edge < 3; edge++) {
              const a = indices ? indices.getX(triangle + edge) : triangle + edge;
              const b = indices ? indices.getX(triangle + (edge + 1) % 3) : triangle + (edge + 1) % 3;
              const length = new Vector3().fromBufferAttribute(position, a).distanceTo(new Vector3().fromBufferAttribute(position, b));
              if (length < 0.002) continue;
              const limit = mesh.name === "身体" ? 1.5 : 2.3;
              assert.ok(posed[a].distanceTo(posed[b]) / length < limit, `${mesh.name}: skin edge stretched at frame ${frame}`);
            }
          }
        });
      }
      assert.ok(pose().every(Number.isFinite));
      assert.equal(adapter.getDebugSnapshot().currentAction, "idle.default");
      assert.equal(adapter.getDebugSnapshot().registeredActions, 1);
      assert.deepEqual(adapter.getDebugSnapshot().missingClipErrors, []);
    } finally { adapter.dispose(); }
  });
}

test("all characters share the existing dark stage lights while retaining authored materials", async () => {
  const source = await readFile(join(host, "../../packages/preacherman-avatar-renderer/src/InteractiveAvatarScene.tsx"), "utf8");
  assert.match(source, /environment === "cinematic" \? <CinematicHologramLights \/> : <HologramLights \/>/);
  assert.doesNotMatch(source, /AuthoredAvatarLights|RoomEnvironment|avatarUsesHologram/);
  assert.ok(new Set(Object.values(importedAvatarProfiles).map(profile => profile.actions[0].clipName.split(".idle.")[1])).size >= 5);
});
