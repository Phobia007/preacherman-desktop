import type { AvatarMotionRigBinding } from "@preacherman/avatar-renderer";
import speechMapJson from "../../../../tools/speech2motion/dlp3d-to-preacherman-rig.json";
import zimaMapJson from "../../../../asset-library/digital-humans/assets/classified-actions/v1/bindings/zima/bone-map.json";
import characterRigs from "./characterMotionRigs.json";

const characterBindings = new Map<string, AvatarMotionRigBinding>();
for (const [characterId, rig] of Object.entries(characterRigs)) {
  characterBindings.set(characterId, { id: `speech2motion-upper-body:${characterId}`, characterId, bones: rig.bones });
}
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
