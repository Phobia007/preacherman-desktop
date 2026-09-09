import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function animatedGltfDataUrl(animationNames = ["cortana.idle.catwalk.v1"]) {
  const animationBytes = Buffer.alloc(32);
  animationBytes.writeFloatLE(0, 0);
  animationBytes.writeFloatLE(1, 4);
  animationBytes.writeFloatLE(0, 8);
  animationBytes.writeFloatLE(0, 12);
  animationBytes.writeFloatLE(0, 16);
  animationBytes.writeFloatLE(1, 20);
  animationBytes.writeFloatLE(0, 24);
  animationBytes.writeFloatLE(0, 28);
  const gltf = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "cortana" }],
    buffers: [{
      byteLength: animationBytes.byteLength,
      uri: `data:application/octet-stream;base64,${animationBytes.toString("base64")}`,
    }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 8 },
      { buffer: 0, byteOffset: 8, byteLength: 24 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 2,
        type: "SCALAR",
        min: [0],
        max: [1],
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: 2,
        type: "VEC3",
      },
    ],
    animations: animationNames.map((name) => ({
      name,
      samplers: [{ input: 0, output: 1, interpolation: "LINEAR" }],
      channels: [{
        sampler: 0,
        target: { node: 0, path: "translation" },
      }],
    })),
  };
  return `data:model/gltf+json;base64,${Buffer.from(
    JSON.stringify(gltf),
  ).toString("base64")}`;
}

test("Cortana controller finds clips by name and keeps one mixer lifecycle", async () => {
  if (!globalThis.ProgressEvent) {
    globalThis.ProgressEvent = class ProgressEvent extends Event {};
  }
  const entry = await import(
    pathToFileURL(join(packageRoot, "dist", "index.js"))
  );
  const adapter = new entry.ThreeAvatarAnimationAdapter({
    avatarId: entry.CORTANA_AVATAR_ID,
    rigId: entry.CORTANA_RIG_ID,
    modelUrl: animatedGltfDataUrl(),
    actions: entry.cortanaAnimationManifest,
    defaultActionId: entry.CORTANA_DEFAULT_ACTION_ID,
    stateMap: entry.cortanaMotionStateMap,
  });
  const controller = new entry.CortanaAnimationController(adapter);

  await Promise.all([controller.load(), controller.load()]);
  assert.equal(controller.hasAction("idle.catwalk"), true);
  assert.deepEqual(
    controller.listActions().map(({ id, clipName }) => ({ id, clipName })),
    [{
      id: "idle.catwalk",
      clipName: "cortana.idle.catwalk.v1",
    }],
  );

  await controller.setState("idle");
  await controller.play("idle.catwalk");
  adapter.update(1 / 60);
  assert.deepEqual(adapter.getDebugSnapshot(), {
    avatarId: "cortana",
    rigId: "cortanaskele_skeleton",
    loadedClips: ["cortana.idle.catwalk.v1"],
    currentAction: "idle.catwalk",
    currentDuration: 1,
    mixerState: "playing",
    boneCount: 0,
    missingClipErrors: [],
    registeredActions: 1,
  });

  const originalConsoleError = console.error;
  console.error = () => undefined;
  try {
    await assert.rejects(
      controller.setState("speaking"),
      (error) => error.code === "STATE_UNMAPPED",
    );
  } finally {
    console.error = originalConsoleError;
  }

  controller.dispose();
  assert.equal(adapter.getDebugSnapshot().mixerState, "disposed");
});


// Exercise the actual shipped skeletons and animation data. Only material/image
// decoding is omitted because this unit test has no browser image APIs.
for (const modelId of ["cortana", "zima"]) {
  test(modelId + " plays and loops its sole embedded default animation", async () => {
    globalThis.ProgressEvent ??= class ProgressEvent extends Event {};
    const entry = await import(pathToFileURL(join(packageRoot, "dist", "index.js")));
    const prefix = modelId.toUpperCase();
    const bytes = await readFile(join(packageRoot, "../../apps/preacherman-demo-host/public/assets/avatars", modelId, modelId + "-runtime.glb"));
    const jsonLength = bytes.readUInt32LE(12);
    const gltf = JSON.parse(bytes.toString("utf8", 20, 20 + jsonLength));
    const binOffset = 20 + jsonLength;
    const binary = bytes.subarray(binOffset + 8, binOffset + 8 + bytes.readUInt32LE(binOffset));
    assert.equal(gltf.animations.length, 1);
    const actions = entry[modelId + "AnimationManifest"];
    assert.equal(actions.length, 1);
    assert.equal(gltf.animations[0].name, actions[0].clipName);
    gltf.buffers[0].uri = "data:application/octet-stream;base64," + binary.toString("base64");
    delete gltf.images; delete gltf.textures; delete gltf.materials;
    for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) delete primitive.material;
    const adapter = new entry.ThreeAvatarAnimationAdapter({
      avatarId: modelId,
      rigId: entry[prefix + "_RIG_ID"],
      modelUrl: "data:model/gltf+json;base64," + Buffer.from(JSON.stringify(gltf)).toString("base64"),
      actions,
      defaultActionId: entry[prefix + "_DEFAULT_ACTION_ID"],
      stateMap: entry[modelId + "MotionStateMap"],
    });
    try {
      await adapter.load();
      await adapter.setState("idle");
      const bones = [];
      adapter.getRoot().traverse(object => { if (object.isBone) bones.push(object); });
      assert.ok(bones.length > 0);
      const pose = () => bones.flatMap(bone => [...bone.position.toArray(), ...bone.quaternion.toArray()]);
      adapter.update(0.4);
      const first = pose();
      adapter.update(0.3);
      assert.notDeepEqual(pose(), first, "default animation must move the actual skeleton");
      const duration = adapter.getDebugSnapshot().currentDuration;
      assert.ok(duration > 0);
      for (let i = 0; i < Math.ceil(duration * 2 * 60); i++) adapter.update(1 / 60);
      assert.equal(adapter.getDebugSnapshot().mixerState, "playing");
      assert.equal(adapter.getDebugSnapshot().currentAction, entry[prefix + "_DEFAULT_ACTION_ID"]);
      assert.equal(adapter.getDebugSnapshot().registeredActions, 1);
      const originalError = console.error;
      console.error = () => undefined;
      try {
        await assert.rejects(adapter.play("conversation_loop"), error => error.code === "ACTION_UNKNOWN");
        await assert.rejects(adapter.play("motion-0"), error => error.code === "ACTION_UNKNOWN");
      } finally { console.error = originalError; }
      await adapter.play(entry[prefix + "_DEFAULT_ACTION_ID"], { restart: true });
      assert.equal(adapter.getDebugSnapshot().mixerState, "playing");
      const urls = entry.createAvatarAssetUrls("/assets/avatars/" + modelId, modelId);
      assert.deepEqual(Object.keys(urls).sort(), ["model", "textures"]);
    } finally { adapter.dispose(); }
    assert.equal(adapter.getDebugSnapshot().mixerState, "disposed");
  });
}
