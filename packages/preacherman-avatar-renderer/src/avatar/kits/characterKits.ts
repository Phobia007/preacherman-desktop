import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { loadAvatarModelFile } from "../../avatarModelCache";
import type { AvatarAnimationError } from "../types/avatarAnimation";
import { PathfinderAnimationAdapter, pathfinderAvatarProfile } from "./pathfinder/PathfinderAnimationAdapter.mjs";
import { ThreeKitanaAnimationAdapter, kitanaAvatarProfile } from "./kitana/ThreeKitanaAnimationAdapter.mjs";

export { PathfinderAnimationAdapter, ThreeKitanaAnimationAdapter };
export const characterKitProfiles = {
  "apex-legend-pathfinder": pathfinderAvatarProfile,
  "kitana-mk11-in-mk9-suit": kitanaAvatarProfile,
} as const;

// Cache only the source bytes; each controller owns its parsed rig and textures.
async function loadGLTF(url: string) {
  return new GLTFLoader().parseAsync(await loadAvatarModelFile(url), url.slice(0, url.lastIndexOf("/") + 1));
}

export function createCharacterKit(modelId: string, modelUrl: string, onError: (error: AvatarAnimationError) => void) {
  const options = { modelUrl, loadGLTF, onError };
  if (modelId === "apex-legend-pathfinder") return new PathfinderAnimationAdapter(options);
  if (modelId === "kitana-mk11-in-mk9-suit") return new ThreeKitanaAnimationAdapter(options);
  return null;
}
