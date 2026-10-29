import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Box3, AnimationMixer } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { isAvatarModelId, avatarModelName, avatarDefaultActionId, createAvatarAssetUrls } from '../../../packages/preacherman-avatar-renderer/dist/index.js';
import { createCharacterConversation } from '../server/characterConversation.mjs';

const read = path => readFile(new URL(path, import.meta.url));
const intake = JSON.parse(await read('../../../docs/avatar-import-ai-moe-20261029.json'));
const characters = JSON.parse(await read('../src/surfaces/asset/characters.json'));
const cards = JSON.parse(await read('../public/active-theory-gallery/gallery/external/storage.googleapis.com/activetheory-v6.appspot.com/cms/projects-dev.json'));
globalThis.ProgressEvent ??= class ProgressEvent extends Event {};

test('All ten imported identities have local cards, independent bindings and intentionally empty biographies', async () => {
  assert.equal(intake.models.length, 10);
  const bindings = (await read('../src/surfaces/gallery/galleryModelBindings.ts')).toString();
  for (const { id, name } of intake.models) {
    assert.equal(isAvatarModelId(id), true);
    assert.equal(avatarModelName(id), name);
    assert.equal(avatarDefaultActionId(id), 'idle.default');
    assert.deepEqual(createAvatarAssetUrls(`/assets/avatars/${id}`, id), { model: `/assets/avatars/${id}/${id}-runtime.glb`, textures: [] });
    assert.ok(bindings.includes(`"${id}": "${id}"`));
    const asset = characters.filter(c => c.id === id), gallery = cards.filter(c => c.slug === id);
    assert.equal(asset.length, 1); assert.equal(gallery.length, 1);
    assert.deepEqual(asset[0].paragraphs, []); assert.equal(asset[0].designation, '');
    assert.equal(gallery[0].description, ''); assert.equal(gallery[0].detailMeta, '');
    const portrait = await read('../public' + asset[0].cardImage);
    assert.equal(portrait[25], 6, 'transparent RGBA card');
    assert.ok((await read('../public' + gallery[0].video.url)).length > 1000);
  }
});

for (const { id, runtime, clip } of intake.models) test(`${id}: packaged skin, default motion and desktop framing`, async () => {
  const buffer = await read('../public/' + runtime);
  const end = 20 + buffer.readUInt32LE(12);
  const gltf = JSON.parse(buffer.toString('utf8', 20, end));
  assert.equal(gltf.skins.length, 1); assert.equal(gltf.skins[0].joints.length, 209);
  assert.deepEqual(gltf.animations.map(a => a.name), [clip]);
  assert.ok(gltf.images.length > 0 && gltf.images.every(i => i.bufferView !== undefined && !i.uri));
  assert.ok(gltf.buffers.every(b => !b.uri));
  gltf.buffers[0].uri = 'data:application/octet-stream;base64,' + buffer.subarray(end + 8).toString('base64');
  delete gltf.images; delete gltf.textures; delete gltf.materials;
  for (const mesh of gltf.meshes) for (const p of mesh.primitives) {
    assert.ok(p.attributes.JOINTS_0 !== undefined && p.attributes.WEIGHTS_0 !== undefined);
    delete p.material;
  }
  const loaded = await new GLTFLoader().parseAsync(JSON.stringify(gltf), '');
  const mixer = new AnimationMixer(loaded.scene);
  try {
    mixer.clipAction(loaded.animations[0]).play();
    const bones = []; loaded.scene.traverse(o => { if (o.isBone) bones.push(o); });
    const pose = () => bones.flatMap(b => [...b.position.toArray(), ...b.quaternion.toArray()]);
    mixer.setTime(0); const start = pose();
    mixer.setTime(1); assert.notDeepEqual(pose(), start);
    for (const fraction of [0, .33, .66, .99]) {
      mixer.setTime(loaded.animations[0].duration * fraction);
      loaded.scene.updateMatrixWorld(true);
      const box = new Box3().setFromObject(loaded.scene, true);
      assert.ok(box.min.toArray().concat(box.max.toArray()).every(Number.isFinite));
      assert.ok(box.max.y > 1.65 && box.max.y < 1.96, `head stays in frame: ${box.max.y}`);
      assert.ok(Math.abs(box.min.y) < .08, `feet stay grounded: ${box.min.y}`);
    }
  } finally {
    mixer.stopAllAction(); mixer.uncacheRoot(loaded.scene);
    loaded.scene.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  }
});

test('New characters join the existing execution profile flow with separate memory identities', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'preacherman-ai-moe-'));
  try {
    const execution = { mode: 'api', connectionId: 'fixture', model: 'fixture' };
    const service = createCharacterConversation({ file: join(folder, 'profiles.json'), connections: { status: async () => ({ active: execution }) } });
    for (const { id, name } of intake.models) {
      const saved = await service.profile(id);
      assert.equal(saved.name, name); assert.equal(saved.memorySpaceId, 'character:' + id);
      assert.deepEqual(saved.execution, execution);
    }
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('Incremental release includes the character catalog dependency in the service build decision', async () => {
  const build = (await read('../../../tools/Build-DesktopRelease.ps1')).toString();
  assert.match(build, /git .*diff --quiet .*src\/surfaces\/asset\/characters\.json/);
});
