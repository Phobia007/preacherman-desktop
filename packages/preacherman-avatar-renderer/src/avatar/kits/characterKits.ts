import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { loadAvatarModelFile } from "../../avatarModelCache";
import type { AvatarAnimationError } from "../types/avatarAnimation";
import { PathfinderAnimationAdapter, pathfinderAvatarProfile } from "./pathfinder/PathfinderAnimationAdapter.mjs";
import { ThreeKitanaAnimationAdapter, kitanaAvatarProfile } from "./kitana/ThreeKitanaAnimationAdapter.mjs";
import { TifaAnimationAdapter } from "./tifa/TifaAnimationAdapter.mjs";
import { tifaAvatarProfile } from "./tifa/profile.mjs";
import { AerithAnimationAdapter } from "./aerith/AerithAnimationAdapter.mjs";
import { aerithAvatarProfile } from "./aerith/profile.mjs";

import { YuffieAnimationAdapter } from "./yuffie/YuffieAnimationAdapter.mjs";
import { yuffieAvatarProfile } from "./yuffie/profile.mjs";

export { YuffieAnimationAdapter, AerithAnimationAdapter, PathfinderAnimationAdapter, ThreeKitanaAnimationAdapter, TifaAnimationAdapter };
export const characterKitProfiles = {
  "yuffie-ff7re": yuffieAvatarProfile,
  "aerith-ff7re": aerithAvatarProfile,
  "tifa-ff7re": tifaAvatarProfile,
  "apex-legend-pathfinder": pathfinderAvatarProfile,
  "kitana-mk11-in-mk9-suit": kitanaAvatarProfile,
} as const;

// Cache only the source bytes; each controller owns its parsed rig and textures.
async function loadGLTF(url: string) {
  return new GLTFLoader().parseAsync(await loadAvatarModelFile(url), url.slice(0, url.lastIndexOf("/") + 1));
}

export function createCharacterKit(modelId: string, modelUrl: string, onError: (error: AvatarAnimationError) => void) {
  const options = { modelUrl, loadGLTF, onError };
  if (modelId === "yuffie-ff7re") return new YuffieAnimationAdapter({ modelUrl, loadModelFile: loadAvatarModelFile, onError });
  if (modelId === "aerith-ff7re") return new AerithAnimationAdapter({ modelUrl, loadModelFile: loadAvatarModelFile, onError });
  if (modelId === "tifa-ff7re") return new TifaAnimationAdapter({ modelUrl, loadModelFile: loadAvatarModelFile, onError });
  if (modelId === "apex-legend-pathfinder") return new PathfinderAnimationAdapter(options);
  if (modelId === "kitana-mk11-in-mk9-suit") return new ThreeKitanaAnimationAdapter(options);
  return null;
}
