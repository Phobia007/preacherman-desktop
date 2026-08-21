import assert from "node:assert/strict";
import test from "node:test";
import { Bone, BufferGeometry, Group, Mesh, MeshBasicMaterial } from "three";
import { ThreeAvatarMotionStreamPlayer } from "../dist/index.js";

test("realtime player consumes body and facial values on one frame clock", () => {
  const root = new Group();
  const hips = new Bone();
  hips.name = "b_pelvis";
  root.add(hips);
  const face = new Mesh(new BufferGeometry(), new MeshBasicMaterial());
  face.morphTargetDictionary = { smile: 0 };
  face.morphTargetInfluences = [0];
  root.add(face);
  root.updateMatrixWorld(true);

  const player = new ThreeAvatarMotionStreamPlayer(root, {
    id: "fixture",
    bones: { Hips: "b_pelvis" },
  });
  player.receive({
    type: "started",
    metadata: {
      streamId: "stream-1",
      interactionEpoch: 1,
      frameRate: 30,
      jointNames: ["Hips"],
      blendshapeNames: ["smile"],
      restPoseId: "fixture",
      restJoints: [{
        name: "Hips",
        parent: null,
        matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      }],
      timelineStartFrame: 0,
    },
  });
  player.receive({
    type: "frames",
    streamId: "stream-1",
    values: new Float32Array([
      1, 0, 0,
      0, 1, 0,
      0, 0, 1,
      0, 0, 0,
      0, 0, 0,
      0.75,
    ]),
  });
  player.update(1 / 30);
  assert.equal(face.morphTargetInfluences[0], 0.75);

  player.receive({
    type: "face-started",
    streamId: "face-1",
    interactionEpoch: 1,
    frameRate: 15,
    blendshapeNames: ["smile"],
  });
  player.receive({
    type: "face-frames",
    streamId: "face-1",
    values: new Float32Array([0.25, 0.9]),
  });
  player.update(1 / 30);
  assert.equal(face.morphTargetInfluences[0], 0.25);
  player.receive({ type: "face-failed", streamId: "face-1", error: new Error("fixture") });

  player.receive({ type: "ended", streamId: "stream-1" });
  player.update(1);
  player.dispose();
});
