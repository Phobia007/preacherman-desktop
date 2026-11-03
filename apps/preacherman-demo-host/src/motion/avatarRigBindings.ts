import type { AvatarMotionRigBinding } from "@preacherman/avatar-renderer";
import speechMapJson from "../../../../tools/speech2motion/dlp3d-to-preacherman-rig.json";
import zimaMapJson from "../../../../asset-library/digital-humans/assets/classified-actions/v1/bindings/zima/bone-map.json";
import characterRigs from "./characterMotionRigs.json";

const characterBindings = new Map<string, AvatarMotionRigBinding>();
for (const [characterId, rig] of Object.entries(characterRigs)) {
  characterBindings.set(characterId, { id: `speech2motion-upper-body:${characterId}`, characterId, bones: rig.bones });
}
// Cortana is authored facing +X, with the left arm along -Z. The source faces
// +Z after Blender conversion. Her elbow bind pose also has a 30-degree bend.
// Correct both reference frames instead of applying source rotations on top of it.
const cortanaRig = characterBindings.get("cortana")!;
characterBindings.set("cortana", {
  ...cortanaRig,
  id: "speech2motion-cortana-anatomical-v2",
  faceRig: "cortana-jaw-eyes",
  motionTransitions: { enter: 0.65, release: 0.85, interrupt: 0.45 },
  bones: { ...cortanaRig.bones, Spine: "b_spine0", Neck: "b_neck1" },
  calibration: {
    sourceToAvatar: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
    anchor: { source: "Hips", target: "b_pelvis" },
    aimChildren: {
      Left_arm: { source: "Left_elbow", target: "b_l_forearm" },
      Left_elbow: { source: "Left_wrist", target: "b_l_hand" },
      Left_wrist: { source: "MiddleFinger1_L", target: "b_l_middle1" },
      Right_arm: { source: "Right_elbow", target: "b_r_forearm" },
      Right_elbow: { source: "Right_wrist", target: "b_r_hand" },
      Right_wrist: { source: "MiddleFinger1_R", target: "b_r_middle1" },
    },
    jointLimits: {
      Spine: 0.35, Chest: 0.45, Neck: 0.35, Head: 0.7,
      Left_shoulder: 0.5, Right_shoulder: 0.5,
      Left_wrist: 0.95, Right_wrist: 0.95,
    },
  },
});
export function characterSpeechMotionBinding(characterId: string): AvatarMotionRigBinding | undefined {
  return characterBindings.get(characterId);
}

const speechMap = speechMapJson.bones as Readonly<Record<string, string>>;
const zimaMap = zimaMapJson.bones as Readonly<Record<string, string>>;

export const cortanaSpeechMotionBinding: AvatarMotionRigBinding = {
  id: "speech2motion-to-cortana-v1",
  bones: speechMap,
  rootJoint: "Hips",
  rootTarget: "b_pelvis",
};

export const zimaSpeechMotionBinding: AvatarMotionRigBinding = {
  id: "speech2motion-to-zima-v1",
  bones: Object.fromEntries(
    Object.entries(speechMap)
      .map(([source, canonical]) => [source, zimaMap[canonical]])
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  ),
  rootJoint: "Hips",
  rootTarget: "root.x",
};
