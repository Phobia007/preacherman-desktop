import { Material, Mesh, MeshStandardMaterial, Object3D, Texture } from "three";
import { createHologramMaterial } from "./hologramMaterial";

export function captureAvatarMaterials(root: Object3D): Map<Mesh, Material | Material[]> {
  const originals = new Map<Mesh, Material | Material[]>();
  root.traverse(object => { if (object instanceof Mesh) originals.set(object, object.material); });
  return originals;
}

// Read the authored snapshot, never the currently installed viewer materials.
// A texture-cache refresh can rebuild bindings before React cleans up the old ones.
export function buildHologramBindings(
  originals: ReadonlyMap<Mesh, Material | Material[]>,
  scanlineMap: Texture,
  irisNormalMap: Texture,
  controlMaps: Readonly<Record<string, Texture>>,
  avatarGain: number,
) {
  const holograms = new Map<Mesh, Material | Material[]>();
  const clonedMaterials = new Set<MeshStandardMaterial>();
  const cloneBySource = new Map<MeshStandardMaterial, MeshStandardMaterial>();
  for (const [mesh, original] of originals) {
    const next = (Array.isArray(original) ? original : [original]).map(material => {
      if (!(material instanceof MeshStandardMaterial)) return material;
      let clone = cloneBySource.get(material);
      if (!clone) {
        clone = createHologramMaterial(material, scanlineMap, irisNormalMap, controlMaps[material.name], avatarGain);
        cloneBySource.set(material, clone);
        clonedMaterials.add(clone);
      }
      return clone;
    });
    holograms.set(mesh, Array.isArray(original) ? next : next[0]);
  }
  return { originals, holograms, clonedMaterials };
}

const textureUsers = new WeakMap<Texture, number>();

// useTexture shares objects between the desktop and detail canvases. One view
// must not dispose or evict them while the other is still using those objects.
export function retainHologramTextures(textures: readonly Texture[], clearCache: () => void): () => void {
  const unique = [...new Set(textures)];
  for (const texture of unique) textureUsers.set(texture, (textureUsers.get(texture) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const texture of unique) {
      const count = (textureUsers.get(texture) ?? 1) - 1;
      if (count > 0) textureUsers.set(texture, count);
      else { textureUsers.delete(texture); texture.dispose(); }
    }
    if (unique.every(texture => !textureUsers.has(texture))) clearCache();
  };
}
