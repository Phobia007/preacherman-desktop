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
