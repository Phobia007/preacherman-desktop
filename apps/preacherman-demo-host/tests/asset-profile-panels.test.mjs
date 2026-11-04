import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { transform } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const characters = JSON.parse(await read('src/surfaces/asset/characters.json'));
const nativeRequire = createRequire(import.meta.url);
async function component(path, extra = {}) {
  const { code } = await transform(await read(path), { loader:'tsx',format:'cjs',jsx:'automatic' });
  const context={module:{exports:{}},AbortController,require:id=>id.endsWith('.css')?{}:extra[id]??(id.includes('useCharacterState')?{useCharacterState:()=>({state:null,loading:true,refresh:async()=>{}})}:id.includes('/client')?{}:id.includes('TaskReference')?{TaskReference:()=>null}:nativeRequire(id))};
  vm.runInNewContext(code,context);return context.module.exports;
}
const {AssetInfoMap}=await component('src/surfaces/asset/AssetInfoMap.tsx');
const {AssetSkills}=await component('src/surfaces/asset/AssetProfilePanels.tsx',{'./AssetInfoMap':{AssetInfoMap}});
for(const appearance of ['light','dark']) test(`character panels preserve identity and honest loading in ${appearance}`,async()=>{
  for(const character of characters){
    const skills=renderToStaticMarkup(createElement('div',{'data-appearance':appearance},createElement(AssetSkills,{character})));
    const map=renderToStaticMarkup(createElement('div',{'data-appearance':appearance},createElement(AssetInfoMap,{character})));
    assert.ok(skills.includes(character.cardImage));assert.match(skills,/Loading registered skills/);
    assert.doesNotMatch(skills,/Installed|Connected|Frontend Design|aria-checked="true"/);
    assert.ok(map.includes(character.image));assert.match(map,/Loading character history/);
    assert.match(map,/Rapport/);assert.doesNotMatch(map,/LV\. 1/,'level must come from real state');
    assert.doesNotMatch(map+skills,/[\u3400-\u9fff]/);
    await access(new URL('../public'+character.image,import.meta.url));
  }
  const theme=await read('src/styles.css');
  for(const path of ['src/surfaces/asset/asset-profile-panels.css','src/character-state/character-state.css']){
    const css=await read(path);assert.doesNotMatch(css,/#[0-9a-f]{3,8}\b|rgba?\(/i);
    for(const match of css.matchAll(/var\((--demo-theme-[a-z-]+)/g))assert.ok(theme.includes(match[1]),`missing theme token ${match[1]}`);
    assert.match(css,/:focus-visible/);
  }
});
