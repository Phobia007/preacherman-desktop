import {
  BufferGeometry,
  Material,
  Mesh,
  Object3D,
  Texture,
} from "three";

export interface AvatarResourceExtras {
  readonly materials?: Iterable<Material>;
  readonly textures?: Iterable<Texture>;
}
export interface AvatarDisposeReport {
  readonly geometries: number;
  readonly materials: number;
  readonly textures: number;
}

function materialList(material: Material | Material[]): Material[] {
  return Array.isArray(material) ? material : [material];
}

function collectMaterialTextures(material: Material, textures: Set<Texture>): void {
  for (const value of Object.values(material)) {
    if (value instanceof Texture) textures.add(value);
  }
  if (!("uniforms" in material)) return;
  const uniforms = (material as Material & {
    uniforms?: Record<string, { value?: unknown }>;
  }).uniforms;
  for (const uniform of Object.values(uniforms ?? {})) {
    if (uniform.value instanceof Texture) textures.add(uniform.value);
  }
}

export function disposeAvatarSceneResources(
  root: Object3D,
  extras: AvatarResourceExtras = {},
): AvatarDisposeReport {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>(extras.materials ?? []);
  const textures = new Set<Texture>(extras.textures ?? []);

  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    for (const material of materialList(object.material)) materials.add(material);
  });
  for (const material of materials) collectMaterialTextures(material, textures);

  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();

  return {
    geometries: geometries.size,
    materials: materials.size,
    textures: textures.size,
  };
}
