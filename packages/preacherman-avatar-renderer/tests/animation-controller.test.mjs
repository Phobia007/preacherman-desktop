import assert from "node:assert/strict";
import { createServer } from "node:http";
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

function skinnedAnimatedGltfDataUrl(
  animationNames = ["cortana.idle.catwalk.v1"],
  bindTranslation = 1,
) {
  const animationBytes = Buffer.alloc(32);
  animationBytes.writeFloatLE(0, 0);
  animationBytes.writeFloatLE(1, 4);
  for (const [index, value] of [
    0, bindTranslation, 0,
    0, bindTranslation * 2, 0,
  ].entries()) {
    animationBytes.writeFloatLE(value, 8 + index * 4);
  }
  const gltf = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: "cortana", children: [1] },
      { name: "b_pelvis", translation: [0, bindTranslation, 0] },
    ],
    skins: [{ joints: [1], skeleton: 1 }],
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
        target: { node: 1, path: "translation" },
      }],
    })),
  };
  return `data:model/gltf+json;base64,${Buffer.from(
    JSON.stringify(gltf),
  ).toString("base64")}`;
}

function motionLibraryFixture() {
  const packIds = Array.from({ length: 9 }, (_, index) => `pack-${index}`);
  const motions = Array.from({ length: 412 }, (_, index) => {
    const packIndex = Math.min(8, Math.floor(index / 46));
    return {
      id: `motion-${index}`,
      action: `CT_test_${String(index).padStart(3, "0")}`,
      category: "test",
      loop: false,
      pack_export: `export/packs/${packIds[packIndex]}.glb`,
    };
  });
  return {
    manifest: { motion_count: motions.length, motions },
    index: {
      total_actions: motions.length,
      packs: packIds.map((id) => ({
        id,
        file: `export/packs/${id}.glb`,
        animations: motions
          .filter((motion) => motion.pack_export.endsWith(`${id}.glb`))
          .map((motion) => motion.action),
      })),
    },
  };
}

async function withMotionServer(callback, createPackDataUrl = animatedGltfDataUrl) {
  const fixture = motionLibraryFixture();
  const packAnimations = fixture.index.packs[0].animations;
  const packJson = Buffer.from(
    decodeURIComponent(createPackDataUrl(packAnimations).split(",")[1]),
    "base64",
  );
  let packRequests = 0;
  const server = createServer((request, response) => {
    if (request.url === "/motions.json") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(fixture.manifest));
      return;
    }
    if (request.url === "/index.json") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(fixture.index));
      return;
    }
    if (request.url === "/packs/pack-0.glb") {
      packRequests += 1;
      response.setHeader("Content-Type", "model/gltf+json");
      response.end(packJson);
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await callback(`http://127.0.0.1:${address.port}`, () => packRequests);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
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
    loadedPacks: [],
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

test("motion manifest loads one GLB pack once and caches only its animation clips", async () => {
  if (!globalThis.ProgressEvent) {
    globalThis.ProgressEvent = class ProgressEvent extends Event {};
  }
  const entry = await import(pathToFileURL(join(packageRoot, "dist", "index.js")));

  await withMotionServer(async (baseUrl, packRequests) => {
    const adapter = new entry.ThreeAvatarAnimationAdapter({
      avatarId: entry.CORTANA_AVATAR_ID,
      rigId: entry.CORTANA_RIG_ID,
      modelUrl: animatedGltfDataUrl(),
      actions: entry.cortanaAnimationManifest,
      defaultActionId: entry.CORTANA_DEFAULT_ACTION_ID,
      stateMap: entry.cortanaMotionStateMap,
      motionLibrary: {
        manifestUrl: `${baseUrl}/motions.json`,
        indexUrl: `${baseUrl}/index.json`,
        packsBaseUrl: `${baseUrl}/packs/`,
      },
    });

    await adapter.load();
    const rootChildren = adapter.getRoot().children.length;
    assert.equal(adapter.listActions().length, 413);
    assert.equal(adapter.hasAction("motion-0"), true);
    assert.equal(adapter.getDebugSnapshot().loadedPacks.length, 0);

    await adapter.play("motion-0");
    await adapter.play("motion-1");

    const snapshot = adapter.getDebugSnapshot();
    assert.equal(packRequests(), 1);
    assert.equal(snapshot.loadedPacks.length, 1);
    assert.equal(snapshot.registeredActions, 413);
    assert.equal(snapshot.loadedClips.length, 3);
    for (let i = 2; i < 20; i++) { await adapter.play(`motion-${i}`); adapter.update(0.5); }
    assert.ok(adapter.getDebugSnapshot().loadedClips.length <= 9, "idle plus eight requested motions");
    await adapter.play("motion-0");
    assert.equal(adapter.getDebugSnapshot().currentAction, "motion-0");
    assert.equal(packRequests(), 1, "retired clip can be recovered from the bounded pack cache");
    assert.equal(adapter.getRoot().children.length, rootChildren);
    adapter.dispose();
  });
});

test("motion packs scale translation tracks to the runtime skeleton units", async () => {
  if (!globalThis.ProgressEvent) {
    globalThis.ProgressEvent = class ProgressEvent extends Event {};
  }
  const entry = await import(pathToFileURL(join(packageRoot, "dist", "index.js")));

  await withMotionServer(async (baseUrl) => {
    const adapter = new entry.ThreeAvatarAnimationAdapter({
      avatarId: entry.CORTANA_AVATAR_ID,
      rigId: entry.CORTANA_RIG_ID,
      modelUrl: skinnedAnimatedGltfDataUrl(undefined, 1),
      actions: entry.cortanaAnimationManifest,
      defaultActionId: entry.CORTANA_DEFAULT_ACTION_ID,
      stateMap: entry.cortanaMotionStateMap,
      motionLibrary: {
        manifestUrl: `${baseUrl}/motions.json`,
        indexUrl: `${baseUrl}/index.json`,
        packsBaseUrl: `${baseUrl}/packs/`,
      },
    });

    await adapter.load();
    await adapter.play("motion-0");
    adapter.update(0.5);
    const pelvis = adapter.getRoot().getObjectByName("b_pelvis");
    assert.ok(Math.abs(pelvis.position.y - 1.5) < 1e-5);
    adapter.dispose();
  }, (animationNames) => skinnedAnimatedGltfDataUrl(animationNames, 34));
});
