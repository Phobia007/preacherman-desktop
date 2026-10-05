import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const characters = JSON.parse(read('src/surfaces/asset/characters.json'));
test('Every current Gallery model has exactly one local card and matching detail', () => {
  const bindings = read('src/surfaces/gallery/galleryModelBindings.ts');
  const modelIds = [...bindings.matchAll(/"[^"\n]+": "([^"\n]+)"/g)].map(match => match[1]);
  assert.deepEqual(characters.map(c => c.id), modelIds);
  assert.equal(new Set(characters.map(c => c.id)).size, characters.length);
  for (const character of characters) {
    assert.ok(character.label && character.paragraphs.length);
    assert.ok(character.imageWidth > 0 && character.imageHeight > 0);
    for (const key of ['cardImage', 'image']) {
      assert.ok(character[key].startsWith('/'));
      assert.ok(existsSync(new URL('../public' + character[key], import.meta.url)), character[key]);
    }
    assert.ok(character.cardImage.includes(character.id));
    assert.ok(character.image.includes(character.id));
  }
  assert.equal(characters.filter(c => c.image.startsWith('/asset-characters/cutouts/')).length, 7);
  assert.deepEqual(characters.filter(c => c.image === c.cardImage).map(c => c.id), ['zima', 'stellar-blade-lily-stargazer-coat', 'iron-man-mark-85']);
});
test('Cards use real RGBA bust renders and isolated artwork stays background-free', () => {
  for (const character of characters) {
    assert.ok(character.cardImage.startsWith('/asset-characters/busts/'));
    const png = readFileSync(new URL('../public' + character.cardImage, import.meta.url));
    assert.equal(png.readUInt32BE(16), character.cardImageWidth);
    assert.equal(png.readUInt32BE(20), character.cardImageHeight);
    assert.equal(png[25], 6, 'RGBA PNG, not an opaque studio photograph');
    assert.equal(character.detailFraming, character.image === character.cardImage ? 'bust' : 'artwork');
  }
  const css = read('src/surfaces/asset/asset-collection.css');
  assert.doesNotMatch(css, /asset-card__image::before|asset-card__image::after|filter: brightness\(1.12\)/);
  assert.match(css, /object-fit: contain/);
});
test('Detail scrolling cannot expose unrelated characters', () => {
  const component = read('src/surfaces/asset/AssetCollection.tsx');
  assert.match(component, /const character = characters.find/);
  assert.equal((component.match(/<article/g) || []).length, 1);
  assert.doesNotMatch(component, /characters.map\(character => <article|switchingUntil|addEventListener\("scroll"/);
  assert.match(component, /viewport.current\?\.scrollTo\(\{ top: 0/);
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
  assert.match(component, /observer.disconnect\(\)/);
});
for (const appearance of ['light', 'dark']) test(`Asset controls use deliberate semantic theme tokens in ${appearance}`, () => {
  const styles = read('src/styles.css');
  const block = [...styles.matchAll(/\.demo-app-shell([^{}]*)\{([^{}]*)\}/g)].filter(m => m[1].trim() === (appearance === 'dark' ? '[data-appearance="dark"]' : '')).map(m => m[2]).join('\n');
  const css = read('src/surfaces/asset/asset-collection.css') + read('src/surfaces/asset/asset-detail-layout.css');
  for (const token of new Set(css.match(/--demo-theme-[a-z-]+/g))) assert.ok(block.includes(token + ':'), token);
  assert.match(css, /:focus-visible/); assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\.asset-detail__heading\s*\{[^}]*color: var\(--demo-theme-market-text\)/);
  assert.doesNotMatch(css, /https?:\/\/|background-color:\s*#|color:\s*#/);
});
