import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { Bone, Group, Matrix4, Quaternion, Vector3 } from "../../../packages/preacherman-avatar-renderer/node_modules/three/build/three.module.js";
import { ThreeAvatarMotionStreamPlayer } from "../../../packages/preacherman-avatar-renderer/dist/index.js";

const bindingFile = new URL("../src/motion/avatarRigBindings.ts", import.meta.url);
const exports = {};
runInNewContext(ts.transpileModule(readFileSync(bindingFile, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, { exports, require: name => JSON.parse(readFileSync(new URL(name, bindingFile), "utf8")) });
const binding = exports.characterSpeechMotionBinding("cortana");
const rest = JSON.parse(readFileSync(new URL("../../../asset-library/digital-humans/assets/realtime-performance/v1/rigs/KQ-default.json", import.meta.url), "utf8")).joints;
const restByName = new Map(rest.map(j => [j.name, j]));
const conversion = new Quaternion().fromArray(binding.calibration.sourceToAvatar)
  .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2));
function matrix(values) { return new Matrix4().fromArray(values).transpose(); }

function fixture() {
  const bytes = readFileSync(new URL("../public/assets/avatars/cortana/cortana-runtime.glb", import.meta.url));
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  const joints = new Set(gltf.skins.flatMap(s => s.joints));
  const nodes = gltf.nodes.map((n, i) => {
    const object = joints.has(i) ? new Bone() : new Group(); object.name = n.name ?? "";
    if (n.matrix) new Matrix4().fromArray(n.matrix).decompose(object.position, object.quaternion, object.scale);
    else { object.position.fromArray(n.translation ?? [0, 0, 0]); object.quaternion.fromArray(n.rotation ?? [0, 0, 0, 1]); object.scale.fromArray(n.scale ?? [1, 1, 1]); }
    return object;
  });
  gltf.nodes.forEach((n, i) => n.children?.forEach(child => nodes[i].add(nodes[child])));
  const root = new Group(); for (const index of gltf.scenes[gltf.scene ?? 0].nodes) root.add(nodes[index]);
  root.updateMatrixWorld(true);
  const original = new Map(nodes.map(n => [n, n.quaternion.clone()]));
  const player = new ThreeAvatarMotionStreamPlayer(root, binding);
  return { root, player, original, nodes: new Map(nodes.map(n => [n.name, n])) };
}
function play(f, rotations = {}, time = .5) {
  const stride = rest.length * 9 + 6, values = new Float32Array(stride * 32);
  for (let frame = 0; frame < 32; frame++) rest.forEach((j, index) => {
    const q = typeof rotations[j.name] === "function" ? rotations[j.name](frame) : rotations[j.name] ?? new Quaternion();
    const m = new Matrix4().makeRotationFromQuaternion(q).elements;
    values.set([m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]], frame * stride + index * 9);
  });
  f.player.beginFrame();
  f.player.receive({ type: "started", metadata: { streamId: "calibration", characterId: "cortana", interactionEpoch: 1, frameRate: 30,
    jointNames: rest.map(j => j.name), restJoints: rest, blendshapeNames: [], restPoseId: "KQ-default", timelineStartFrame: 0, strength: 1, playbackTime: () => time } });
  f.player.receive({ type: "frames", streamId: "calibration", values }); f.player.update(0); f.root.updateMatrixWorld(true);
}
function sourcePose(name, rotations) {
  const joint = restByName.get(name), parent = restByName.get(joint.parent);
  const local = parent ? matrix(parent.matrix).invert().multiply(matrix(joint.matrix)) : matrix(joint.matrix);
  const basis = new Matrix4().makeRotationFromQuaternion(rotations[name] ?? new Quaternion());
  return (parent ? sourcePose(parent.name, rotations).multiply(local) : local).multiply(basis);
}
function direction(a, b) { return b.getWorldPosition(new Vector3()).sub(a.getWorldPosition(new Vector3())).normalize(); }

test("Cortana face uses actual jaw and eye axes, holds until audio, and never accumulates on idle", () => {
  const f = fixture(); let clock = null;
  const jaw = f.nodes.get("b_jaw"), original = f.original.get(jaw).clone().normalize();
  const delta = () => original.clone().invert().multiply(jaw.quaternion.clone().normalize());
  const names = ["JawOpen", "MouthClose", "EyeLookOutLeft", "EyeLookInRight"];
  const values = new Float32Array(120 * names.length);
  for (let i = 0; i < 120; i++) values.set([i < 60 ? .5 : 1, 0, .5, .5], i * names.length);
  const frame = (dt = 1 / 60, energy = 0) => { f.player.beginFrame(); f.player.update(dt, energy); };
  try {
    f.player.receive({ type: "face-started", streamId: "face", interactionEpoch: 1, characterId: "cortana", frameRate: 30, blendshapeNames: names, playbackTime: () => clock });
    f.player.receive({ type: "face-frames", streamId: "face", values });
    f.player.receive({ type: "face-ended", streamId: "face" });
    frame(1); assert.ok(delta().angleTo(new Quaternion()) < 1e-5);
    clock = .3; for (let i = 0; i < 180; i++) frame(1 / 60, 1);
    assert.ok(Math.abs(delta().angleTo(new Quaternion()) - .12) < 1e-4, "energy fallback must not double the jaw angle");
    assert.ok(delta().x > 0, "jaw opens down around the authored positive X axis");
    f.root.updateMatrixWorld(true);
    const eyeDelta = name => f.nodes.get(name).getWorldQuaternion(new Quaternion()).multiply(
      f.nodes.get(name).parent.getWorldQuaternion(new Quaternion()).multiply(f.original.get(f.nodes.get(name))).invert());
    assert.ok(eyeDelta("b_l_eye").angleTo(eyeDelta("b_r_eye")) < 1e-4, "different local axes must produce coherent gaze");
    f.player.receive({ type: "face-started", streamId: "other", interactionEpoch: 2, characterId: "zima", frameRate: 30, blendshapeNames: names });
    f.player.receive({ type: "face-cancelled", streamId: "face", reason: "barge-in" });
    clock = 3; frame(.05); assert.ok(delta().angleTo(new Quaternion()) < .1, "discard unheard frames");
    for (let i = 0; i < 30; i++) frame();
    assert.ok(delta().angleTo(new Quaternion()) < 1e-4);
    for (let i = 0; i < 60; i++) frame(1 / 60, .5);
    assert.ok(Math.abs(delta().angleTo(new Quaternion()) - .12) < 1e-4, "unavailable face stream keeps bounded energy fallback");
  } finally { f.player.dispose(); }
  assert.deepEqual(jaw.quaternion.toArray(), f.original.get(jaw).toArray());
});

test("Cortana arm reference follows anatomical source directions without the old 90-degree axis error", () => {
  const f = fixture();
  try {
    const rotations = { Left_arm: new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), .3), Left_elbow: new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), .7),
      Right_arm: new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -.25), Right_elbow: new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -.6) };
    play(f, rotations);
    for (const source of ["Left_arm", "Left_elbow", "Right_arm", "Right_elbow"]) {
      const child = binding.calibration.aimChildren[source];
      const expected = new Vector3().setFromMatrixPosition(sourcePose(child.source, rotations))
        .sub(new Vector3().setFromMatrixPosition(sourcePose(source, rotations))).applyQuaternion(conversion).normalize();
      const actual = direction(f.nodes.get(binding.bones[source]), f.nodes.get(child.target));
      assert.ok(actual.dot(expected) > .999, `${source}: ${actual.dot(expected)}`);
    }
    for (const name of ["b_pelvis", "b_l_thigh", "b_r_thigh", "b_l_calf", "b_r_calf"])
      assert.deepEqual(f.nodes.get(name).quaternion.toArray(), f.original.get(f.nodes.get(name)).toArray(), name);
  } finally { f.player.dispose(); }
});

test("source pelvis turns cannot twist the anchored upper body; idle restores after cancellation", () => {
  const f = fixture();
  try {
    play(f); const neutral = new Map([...f.nodes].map(([name, bone]) => [name, bone.quaternion.clone()]));
    play(f, { Hips: new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 1.5) });
    for (const target of Object.values(binding.bones)) assert.ok(f.nodes.get(target).quaternion.clone().normalize().angleTo(neutral.get(target).clone().normalize()) < 1e-5, target);
    f.player.receive({ type: "cancelled", streamId: "calibration", reason: "barge-in" });
    f.player.beginFrame(); f.player.update(.2); f.player.beginFrame();
    for (const [bone, original] of f.original) assert.deepEqual(bone.quaternion.toArray(), original.toArray(), bone.name);
  } finally { f.player.dispose(); }
});

test("calibrated wrist limits bound extreme rotations and subframe playback interpolates", () => {
  const f = fixture();
  try {
    play(f, { Left_wrist: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 2.8) });
    const hand = f.nodes.get("b_l_hand"); assert.ok(hand.quaternion.angleTo(f.original.get(hand)) <= .95001);
    const rotation = { Head: frame => new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), frame < 16 ? 0 : .4) };
    play(f, rotation, 15 / 30); const a = f.nodes.get("b_head").quaternion.clone();
    play(f, rotation, 16 / 30); const b = f.nodes.get("b_head").quaternion.clone();
    play(f, rotation, 15.5 / 30); const middle = f.nodes.get("b_head").quaternion;
    assert.ok(middle.angleTo(a.clone().slerp(b, .5)) < .001);
    assert.ok(middle.angleTo(a) > .05);
    assert.equal(exports.characterSpeechMotionBinding("zima").calibration, undefined);
  } finally { f.player.dispose(); }
});
