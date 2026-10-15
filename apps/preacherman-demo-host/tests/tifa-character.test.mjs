import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { IdleSuiteController, SUITE_CLIPS } from '../../../packages/preacherman-avatar-renderer/src/avatar/kits/tifa/idle-suite-controller.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url));
test('Tifa keeps all supplied embedded textures and four authored animations', () => {
  const bytes = read('public/assets/avatars/tifa-ff7re/tifa-ff7re-runtime.glb');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'ed92611cff171d3632cf1053adbac8f30c05b11aff99ffeb6e9dd830c28e857c');
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  assert.deepEqual(gltf.animations.map(a => a.name).sort(), Object.values(SUITE_CLIPS).sort());
  assert.ok(gltf.images.length > 0 && gltf.images.every(i => i.bufferView !== undefined && !i.uri));
  assert.ok(gltf.buffers.every(b => !b.uri));
});
test('Tifa is available in Gallery, Asset and Market with the same identity and supplied biography', () => {
  const json = path => JSON.parse(read(path));
  const card = json('public/active-theory-gallery/gallery/external/storage.googleapis.com/activetheory-v6.appspot.com/cms/projects-dev.json').find(c => c.slug === 'tifa-ff7re');
  const asset = json('src/surfaces/asset/characters.json').find(c => c.id === card.slug);
  const market = json('public/market-love/characters.json').find(c => c.id === card.slug);
  assert.equal(card.name, 'Tifa');
  assert.equal(card.detailMeta, '1997 / Square Enix / PREACHERMAN AVATAR');
  assert.equal(asset.paragraphs.join(' '), card.description);
  assert.equal(market.summary, card.description);
  assert.ok(read('public/market-love/cartier-love.html').includes(Buffer.from('love-configurator.html?character=tifa-ff7re')));
});
test('Idle suite pauses its waiting clock and returns smoothly without repeating the last gesture', () => {
  const root = new THREE.Group();
  const clips = Object.values(SUITE_CLIPS).map(name => new THREE.AnimationClip(name, 5, [new THREE.NumberKeyframeTrack('.position[x]', [0, 5], [0, .01])]));
  const suite = new IdleSuiteController(THREE, root, clips, {random: () => 0});
  try {
    suite.update(9); assert.equal(suite.getSnapshot().currentKey, 'idle');
    suite.setPaused(true); suite.update(30); assert.equal(suite.getSnapshot().nextRandomInSeconds.toFixed(1), '1.0');
    suite.setPaused(false); suite.update(1.01); assert.equal(suite.getSnapshot().currentKey, 'awaiting');
    suite.update(6); assert.equal(suite.getSnapshot().currentKey, 'idle');
    suite.update(10); assert.equal(suite.getSnapshot().currentKey, 'glove_check');
    assert.ok(suite.getSnapshot().weights.every(w => w.weight >= 0 && w.weight <= 1));
  } finally { suite.dispose(); }
});
