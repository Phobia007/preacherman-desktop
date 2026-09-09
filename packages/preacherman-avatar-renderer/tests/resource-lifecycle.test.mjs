import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import {
  BufferGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Bone,
  Skeleton,
  SkinnedMesh,
  Texture,
} from "three";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("scene cleanup disposes each unique geometry, material, and texture exactly once", async () => {
  const { disposeAvatarSceneResources } = await import(
    pathToFileURL(join(packageRoot, "dist", "index.js"))
  );
  const root = new Object3D();
  const geometry = new BufferGeometry();
  const texture = new Texture();
  const sourceMaterial = new MeshStandardMaterial({ map: texture });
  const clonedMaterial = new MeshStandardMaterial({ map: texture });
  root.add(
    new Mesh(geometry, sourceMaterial),
    new Mesh(geometry, [sourceMaterial, sourceMaterial]),
  );

  const calls = { geometry: 0, sourceMaterial: 0, clonedMaterial: 0, texture: 0 };
  geometry.dispose = () => { calls.geometry += 1; };
  sourceMaterial.dispose = () => { calls.sourceMaterial += 1; };
  clonedMaterial.dispose = () => { calls.clonedMaterial += 1; };
  texture.dispose = () => { calls.texture += 1; };

  const report = disposeAvatarSceneResources(root, {
    materials: [clonedMaterial, clonedMaterial],
    textures: [texture, texture],
  });

  assert.deepEqual(calls, {
    geometry: 1,
    sourceMaterial: 1,
    clonedMaterial: 1,
    texture: 1,
  });
  assert.deepEqual(report, { geometries: 1, materials: 2, textures: 1 });
});


test("replacing a character frees a shared skeleton's bone texture once", async () => {
  const { disposeAvatarSceneResources } = await import(pathToFileURL(join(packageRoot, "dist", "index.js")));
  const root = new Object3D(), bone = new Bone(), skeleton = new Skeleton([bone]);
  skeleton.computeBoneTexture();
  let disposed = 0;
  skeleton.boneTexture.addEventListener("dispose", () => disposed++);
  for (let i = 0; i < 2; i++) { const mesh = new SkinnedMesh(new BufferGeometry(), new MeshStandardMaterial()); mesh.bind(skeleton); root.add(mesh); }
  disposeAvatarSceneResources(root);
  assert.equal(disposed, 1);
  assert.equal(skeleton.boneTexture, null);
});
