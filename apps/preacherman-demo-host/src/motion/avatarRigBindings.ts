import type { AvatarMotionRigBinding } from "@preacherman/avatar-renderer";
import speechMapJson from "../../../../tools/speech2motion/dlp3d-to-preacherman-rig.json";
import zimaMapJson from "../../../../asset-library/digital-humans/assets/classified-actions/v1/bindings/zima/bone-map.json";

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
