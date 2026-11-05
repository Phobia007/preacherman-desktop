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
  id: "speech2motion-cortana-anatomical-v3",
  faceRig: "cortana-jaw-eyes",
  motionTransitions: { enter: 0.65, release: 0.85, interrupt: 0.45 },
  bones: { ...cortanaRig.bones, Spine: "b_spine0", Neck: "b_neck1",
    Hips: "b_pelvis",
    Left_leg: "b_l_thigh", Left_knee: "b_l_calf", Left_ankle: "b_l_foot", Left_toe: "b_l_toe",
    Right_leg: "b_r_thigh", Right_knee: "b_r_calf", Right_ankle: "b_r_foot", Right_toe: "b_r_toe",
  },
  grounding: { feet: ["b_l_foot", "b_l_toe", "b_r_foot", "b_r_toe"], maxVertical: 0.18, maxHorizontal: 0.08 },
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
      Left_leg: { source: "Left_knee", target: "b_l_calf" },
      Left_knee: { source: "Left_ankle", target: "b_l_foot" },
      Left_ankle: { source: "Left_toe", target: "b_l_toe" },
      Right_leg: { source: "Right_knee", target: "b_r_calf" },
      Right_knee: { source: "Right_ankle", target: "b_r_foot" },
      Right_ankle: { source: "Right_toe", target: "b_r_toe" },
    },
    jointLimits: {
      Spine: 0.35, Chest: 0.45, Neck: 0.35, Head: 0.7,
      Left_shoulder: 0.5, Right_shoulder: 0.5,
      Left_wrist: 0.95, Right_wrist: 0.95,
      Hips: 0.3, Left_leg: 0.6, Right_leg: 0.6,
      Left_knee: 0.95, Right_knee: 0.95,
      Left_ankle: 0.55, Right_ankle: 0.55, Left_toe: 0.35, Right_toe: 0.35,
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
