import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { transform } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const skills = JSON.parse(await read('src/surfaces/asset/skills.json'));
const characters = JSON.parse(await read('src/surfaces/asset/characters.json'));
const { code } = await transform(await read('src/surfaces/asset/AssetProfilePanels.tsx'), { loader: 'tsx', format: 'cjs', jsx: 'automatic' });
const nativeRequire = createRequire(import.meta.url);
const context = { module: { exports: {} }, require: id => id.endsWith('.css') ? {} : id === './skills.json' ? skills : nativeRequire(id) };
vm.runInNewContext(code, context);
const { AssetSkills, AssetInfoMap } = context.module.exports;

test('ten Skills options use the packaged Extension catalog titles, descriptions and real local logos', async () => {
  const html = await read('public/extension-marketplace/claude-marketplace.html');
  const catalog = JSON.parse(html.match(/<script[^>]+id="catalog-data"[^>]*>([\s\S]*?)<\/script>/)[1]).items;
  assert.equal(skills.length, 10);
  assert.equal(new Set(skills.map(skill => skill.id)).size, 10);
  for (const skill of skills) {
    const source = catalog.find(item => item.slug === skill.id);
    assert.equal(skill.name, source.title);
    assert.equal(skill.description, source.oneLiner);
    assert.ok(html.includes(skill.icon.replace('/extension-marketplace/', '')));
    await access(new URL('../public' + skill.icon, import.meta.url));
  }
});

for (const appearance of ['light', 'dark']) test(`Skills and Info Map preserve every character and intentionally empty frames in ${appearance}`, async () => {
  for (const character of characters) {
    const skillHtml = renderToStaticMarkup(createElement('div', { 'data-appearance': appearance }, createElement(AssetSkills, { character })));
    assert.equal((skillHtml.match(/aria-pressed=/g) || []).length, 10);
    assert.equal((skillHtml.match(/aria-pressed="true"/g) || []).length, 1);
    assert.ok(skillHtml.includes(character.cardImage));
    assert.match(skillHtml, /id="asset-skill-demonstration"[^>]+><\/section>/);
    assert.doesNotMatch(skillHtml, /<video|<iframe|Connected|Installed|Play demo/);
    const infoHtml = renderToStaticMarkup(createElement('div', { 'data-appearance': appearance }, createElement(AssetInfoMap, { character })));
    assert.ok(infoHtml.includes(character.image));
    assert.ok(infoHtml.includes('默契度'));
    assert.ok(infoHtml.includes('LV. 1'));
    assert.match(infoHtml, /class="asset-profile__empty"[^>]+><\/section>/);
    await access(new URL('../public' + character.image, import.meta.url));
  }
  const css = await read('src/surfaces/asset/asset-profile-panels.css');
  for (const token of ['market-text', 'market-muted', 'market-border', 'market-focus', 'market-control', 'control-hover-bg']) {
    assert.ok(css.includes(`var(--demo-theme-${token})`));
  }
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(/i);
});
