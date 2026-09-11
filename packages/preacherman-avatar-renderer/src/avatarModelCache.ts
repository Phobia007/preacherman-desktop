import { FileLoader } from "three";
import { AsyncResourceCache } from "./AsyncResourceCache";

// Cache source bytes only. Each live adapter exclusively owns its parsed GPU resources.
const modelFiles = new AsyncResourceCache<ArrayBuffer>(2, 64 * 1024 * 1024, value => value.byteLength);
export const avatarModelCacheSnapshot = () => modelFiles.snapshot;
export function loadAvatarModelFile(url: string): Promise<ArrayBuffer> {
  return modelFiles.get(url, async () => {
    return await new FileLoader().setResponseType("arraybuffer").loadAsync(url) as ArrayBuffer;
  });
}
export async function prefetchAvatarModel(url: string): Promise<void> {
  // Current model requests take priority; speculative work is limited to one neighbour.
  if (modelFiles.snapshot.pending > 0) return;
  await loadAvatarModelFile(url);
}
