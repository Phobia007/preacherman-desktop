import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';

const read = path => readFileSync(new URL('../' + path, import.meta.url));
const json = path => JSON.parse(read(path));
const characters = [
  { key: 'aerith', name: 'Aerith', hash: 'a1d3d85ed7bba2885a6f9cb3886732f4b44239ff8b76df8f1d0fa29a623edc3f', textures: 14, auto: ['awaiting', 'thought'] },
  { key: 'yuffie', name: 'Yuffie', hash: '7620a94fcaa129db13ce97db5ed0c1164eb036f0e4f7ce72c083e1bdeae6eef1', textures: 18, auto: ['small_swing', 'hand_on_hip'] },
];

for (const character of characters) {
  const id = character.key + '-ff7re';
  const runtime = '../../../packages/preacherman-avatar-renderer/src/avatar/kits/' + character.key + '/';
  const { IdleSuiteController } = await import(runtime + 'idle-suite-controller.mjs');
  const { playbackConfig } = await import(runtime + 'playback-config.mjs');

  test(`${character.name} preserves the supplied model, embedded textures and complete authored clips`, () => {
    const bytes = read(`public/assets/avatars/${id}/${id}-runtime.glb`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), character.hash);
    const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
    assert.deepEqual(gltf.animations.map(a => a.name).sort(), Object.values(playbackConfig.clips).sort());
    assert.equal(gltf.images.length, character.textures);
    assert.ok(gltf.images.every(i => i.bufferView !== undefined && !i.uri));
    assert.ok(gltf.buffers.every(b => !b.uri));
    assert.deepEqual(json(`public/assets/avatars/${id}/playback.json`).autoEventKeys, character.auto);
  });

  test(`${character.name} has consistent Gallery, Asset and Market identity and supplied biography`, () => {
    const card = json('public/active-theory-gallery/gallery/external/storage.googleapis.com/activetheory-v6.appspot.com/cms/projects-dev.json').find(c => c.slug === id);
    const asset = json('src/surfaces/asset/characters.json').find(c => c.id === id);
    const market = json('public/market-love/characters.json').find(c => c.id === id);
    const info = json(`public/assets/avatars/${id}/character-info.json`);
    assert.equal(card.name, character.name);
    assert.equal(card.description, (info.galleryDescription ?? info.description).en);
    assert.equal(asset.paragraphs.join(' '), card.description);
    assert.equal(market.summary, card.description);
    assert.ok(read('public/market-love/cartier-love.html').includes(Buffer.from(`love-configurator.html?character=${id}`)));
  });

  test(`${character.name} pauses its idle clock, completes gestures and avoids repeating automatic actions`, () => {
    const root = new THREE.Group();
    const clips = Object.values(playbackConfig.clips).map(name => new THREE.AnimationClip(name, 5, [new THREE.NumberKeyframeTrack('.position[x]', [0, 5], [0, .01])]));
    const suite = new IdleSuiteController(THREE, root, clips, { ...playbackConfig, random: () => 0 });
    try {
      suite.update(9); assert.equal(suite.getSnapshot().currentKey, 'idle');
      suite.setPaused(true); suite.update(30); assert.equal(suite.getSnapshot().nextRandomInSeconds.toFixed(1), '1.0');
      suite.setPaused(false); suite.update(1.01); assert.equal(suite.getSnapshot().currentKey, character.auto[0]);
      suite.update(6); assert.equal(suite.getSnapshot().currentKey, 'idle');
      suite.update(10); assert.equal(suite.getSnapshot().currentKey, character.auto[1]);
      assert.ok(suite.getSnapshot().weights.every(w => w.weight >= 0 && w.weight <= 1));
      if (character.key === 'yuffie') {
        assert.ok(!playbackConfig.autoEventKeys.includes('in_the_balance'));
        suite.setAutoRandom(false); suite.update(6); suite.request('in_the_balance'); suite.update(2);
        assert.equal(suite.getSnapshot().currentKey, 'in_the_balance');
      }
    } finally { suite.dispose(); }
  });
}
