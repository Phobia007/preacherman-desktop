import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const repositoryRoot = join(import.meta.dirname, "..", "..", "..");

async function readJson(path) {
  return JSON.parse(await readFile(join(repositoryRoot, path), "utf8"));
}

test("speech motion rig map reaches both Preacherman model bindings", async () => {
  const speechMap = await readJson("tools/speech2motion/dlp3d-to-preacherman-rig.json");
  const cortanaMap = await readJson(
    "asset-library/digital-humans/assets/classified-actions/v1/bindings/cortana/bone-map.json",
  );
  const zimaMap = await readJson(
    "asset-library/digital-humans/assets/classified-actions/v1/bindings/zima/bone-map.json",
  );

  assert.equal(speechMap.rigId, "preacherman-humanoid-v1");
  assert.equal(Object.hasOwn(speechMap, "source"), false);
  assert.equal(Object.hasOwn(speechMap, "license"), false);
  assert.equal(Object.keys(speechMap.bones).length, 51);

  const canonicalBones = new Set(Object.values(speechMap.bones));
  const cortanaBones = new Set(
    cortanaMap.mappingMode === "identity"
      ? canonicalBones
      : Object.keys(cortanaMap.bones),
  );
  const zimaBones = new Set(Object.keys(zimaMap.bones));
  assert.deepEqual(
    [...canonicalBones].filter((bone) => !cortanaBones.has(bone)),
    [],
  );
  assert.deepEqual(
    [...canonicalBones].filter((bone) => !zimaBones.has(bone)),
    [],
  );
});

test("realtime performance is a first-class asset without external identity fields", async () => {
  const library = await readJson("asset-library/digital-humans/library.json");
  const performance = await readJson(
    "asset-library/digital-humans/assets/realtime-performance/v1/asset.json",
  );

  assert.equal(
    library.assets.some((asset) => asset.assetId === "realtime-performance"),
    true,
  );
  assert.equal(Object.hasOwn(performance, "source"), false);
  assert.equal(Object.hasOwn(performance, "license"), false);
  assert.equal(performance.body.protocol, "StreamingSpeech2MotionV3");
  assert.equal(performance.face.protocol, "StreamingAudio2FaceV1");
  assert.deepEqual(performance.bindings.map((binding) => binding.modelAssetId), ["cortana", "zima"]);
});

test("speech motion smoke client uses the V3 streaming sequence", async () => {
  const source = await readFile(
    join(repositoryRoot, "tools", "speech2motion", "smoke_v3.py"),
    "utf8",
  );
  assert.match(source, /StreamingSpeech2MotionV3ChunkStart/);
  assert.match(source, /StreamingSpeech2MotionV3ChunkBody/);
  assert.match(source, /StreamingSpeech2MotionV3ChunkEnd/);
  assert.match(source, /joint_rotmat/);
  assert.match(source, /root_world_position/);
});

test("the first TTS chunk starts streaming speech, body, and face in one cancellable epoch", async () => {
  const runtime = await readFile(
    join(repositoryRoot, "apps", "preacherman-demo-host", "src", "motion", "SpeechMotionRuntime.ts"),
    "utf8",
  );
  const voice = await readFile(
    join(repositoryRoot, "apps", "preacherman-demo-host", "src", "realtime", "VoiceSessionControl.tsx"),
    "utf8",
  );
  const service = await readFile(
    join(repositoryRoot, "apps", "preacherman-demo-host", "server", "preachermanServer.mjs"),
    "utf8",
  );

  assert.match(runtime, /startFaceStream\(options: StartAudioFaceStreamOptions\)/);
  assert.match(runtime, /active\.pending\.push\(pcm\)/);
  assert.match(runtime, /socket\.send\(encodeFaceBody/);
  assert.match(runtime, /if \(active\.opened\) socket\.send\(encodeFaceEnd\(id\)\)/);
  assert.match(runtime, /face-cancelled/);
  assert.match(voice, /const startDrivers = \(firstPcm: Int16Array\)/);
  assert.match(voice, /speechMotionRuntime\.start\(\{/);
  assert.match(voice, /speechMotionRuntime\.startFaceStream\(\{/);
  assert.match(voice, /faceInput\.append\(firstPcm\)/);
  assert.match(voice, /scheduleAudio\(pcm\)/);
  assert.match(voice, /faceInput\?\.finish\(\)/);
  assert.ok(
    voice.indexOf("scheduleAudio(pcm)") < voice.indexOf('payload.type === "response.audio.done"'),
    "audio playback must be scheduled from response.audio.delta before response.done",
  );
  assert.doesNotMatch(voice, /const pcmChunks: Int16Array\[\]/);
  assert.match(voice, /speechMotionRuntime\.cancel\(activeSpeechEpoch\.current/);
  assert.match(service, /\/api\/motion\/speech2motion/);
  assert.match(service, /\/api\/face\/audio2face/);
});
