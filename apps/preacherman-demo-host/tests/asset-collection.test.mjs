import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const characters = JSON.parse(read('src/surfaces/asset/characters.json'));
test('Every card maps to the matching local English character detail and authored images', () => {
  assert.deepEqual(characters.map(c => c.label), ['2B', '9S', 'A2', 'Pod 042 / 153', 'YoRHa Commander', 'Operator 6O / 21O', 'Adam / Eve', 'Pascal', 'Devola / Popola', 'Emil', 'Anemone']);
  characters.forEach((character, index) => {
    assert.equal(character.id, `id${String(index + 1).padStart(2, '0')}`);
    assert.ok(character.designation && character.paragraphs.length && character.voice);
    assert.ok(character.imageWidth > 0 && character.imageHeight > 0, 'Reserve the true image ratio before lazy decoding');
    for (const key of ['cardImage', 'cardName', 'image', 'background', 'thumbnail']) {
      assert.ok(character[key].startsWith(`/asset-characters/${character.id}-`));
      assert.ok(existsSync(new URL('../public' + character[key], import.meta.url)), character[key]);
    }
  });
  assert.equal(characters[6].second.name, 'Eve');
});
test('Collection is Asset-only, preserves the shared frost, and uses internal selection instead of external navigation', () => {
  const surface = read('src/surfaces/FrostedSurface.tsx'), component = read('src/surfaces/asset/AssetCollection.tsx');
  assert.match(surface, /name === "Asset" \? <AssetCollection \/> : null/);
  assert.match(surface, /className="demo-frosted-surface"/);
  assert.match(surface, /<SurfaceBrandHeader \/>/);
  assert.doesNotMatch(component, /href=|window\.open|location\.|fetch\(|<iframe/);
  assert.match(component, /setSelected\(character.id\)/);
  assert.match(component, /initialId=\{selected\}/);
  assert.match(component, /onBack=\{\(\) => setSelected\(null\)\}/);
  assert.match(component, /cancelAnimationFrame\(frame\); observer.disconnect\(\)/);
});
for (const appearance of ['light', 'dark']) test(`Asset controls use deliberate semantic theme tokens in ${appearance}`, () => {
  const styles = read('src/styles.css');
  const block = [...styles.matchAll(/\.demo-app-shell([^{}]*)\{([^{}]*)\}/g)].filter(m => m[1].trim() === (appearance === 'dark' ? '[data-appearance="dark"]' : '')).map(m => m[2]).join('\n');
  const css = read('src/surfaces/asset/asset-collection.css');
  for (const token of new Set(css.match(/--demo-theme-[a-z-]+/g))) assert.ok(block.includes(token + ':'), token);
  assert.match(css, /:focus-visible/); assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(css, /https?:\/\/|background-color:\s*#|color:\s*#/);
});
