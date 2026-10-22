import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { Group, Mesh, MeshStandardMaterial, Texture, Vector2 } from 'three';
import * as three from 'three';

const code = buildSync({entryPoints:[fileURLToPath(new URL('../src/hologramResources.ts',import.meta.url))],bundle:true,write:false,format:'cjs',external:['three']}).outputFiles[0].text;
const module = {exports:{}};
const require=createRequire(import.meta.url);
vm.runInNewContext(code,{module,exports:module.exports,require:name=>name==='three'?three:require(name)});
const {captureAvatarMaterials,buildHologramBindings,retainHologramTextures}=module.exports;

test('a cache refresh rebuilds from authored materials while previous bindings are still installed',()=>{
  const root=new Group(),sources=['rt_body','rt_face','rt_hair','rt_eyes','rt_eyelashes'].map(name=>Object.assign(new MeshStandardMaterial(),{name}));
  for(const material of sources)root.add(new Mesh(undefined,material));
  root.add(new Mesh(undefined,[sources[0],sources[1]]));
  const originals=captureAvatarMaterials(root),scan=new Texture(),iris=new Texture();
  const controls=Object.fromEntries(sources.map(m=>[m.name,new Texture()]));
  const first=buildHologramBindings(originals,scan,iris,controls,1);
  for(const[mesh,material]of first.holograms)mesh.material=material;
  // This is the real render-before-effect-cleanup order that caused double grading.
  const refreshed=buildHologramBindings(originals,new Texture(),new Texture(),controls,1);
  for(const material of refreshed.clonedMaterials){
    const name=material.userData.sourceDiagnosticMaterial;
    assert.ok(sources.some(source=>source.name===name));
    assert.equal(material.name,'viewer_hologram:'+name);
    assert.equal(material.userData.sourceRoutedControlConnected,true);
    const shader={uniforms:{},vertexShader:'#include <skinning_vertex>',fragmentShader:'#include <opaque_fragment>'};
    material.onBeforeCompile(shader,{getDrawingBufferSize:v=>v.set(820,850)});
    assert.equal(shader.uniforms.uHoloControlMap.value,controls[name]);
    assert.equal(shader.uniforms.uHoloIsFace.value,name==='rt_face'?1:0);
    assert.ok(shader.uniforms.uHoloResolution.value instanceof Vector2);
  }
  assert.equal(refreshed.clonedMaterials.size,sources.length);
  for(const source of sources)assert.ok(!source.name.startsWith('viewer_hologram:'));
  for(const material of [...first.clonedMaterials,...refreshed.clonedMaterials,...sources])material.dispose();
  root.traverse(o=>o.geometry?.dispose());
});

test('closing either shared viewport preserves textures until the remaining owner releases them',()=>{
  for(const firstOwner of [0,1]){
    const textures=Array.from({length:6},()=>new Texture());let disposed=0,evicted=0;
    for(const texture of textures)texture.addEventListener('dispose',()=>disposed++);
    const releases=[retainHologramTextures(textures,()=>evicted++),retainHologramTextures(textures,()=>evicted++)];
    releases[firstOwner]();assert.equal(disposed,0);assert.equal(evicted,0);
    releases[1-firstOwner]();assert.equal(disposed,6);assert.equal(evicted,1);
    releases[firstOwner]();releases[1-firstOwner]();assert.equal(disposed,6);assert.equal(evicted,1);
  }
});

test('a new owner acquired during pending compilation retains shared textures',async()=>{
  const texture=new Texture();let disposed=0,evicted=0;
  texture.addEventListener('dispose',()=>disposed++);
  const releaseOld=retainHologramTextures([texture,texture],()=>evicted++);
  const pending=Promise.resolve().then(releaseOld);
  const releaseNew=retainHologramTextures([texture],()=>evicted++);
  await pending;assert.equal(disposed,0);assert.equal(evicted,0);
  releaseNew();assert.equal(disposed,1);assert.equal(evicted,1);
});

test('Cortana and Zima texture ownership and cache eviction stay independent',()=>{
  const cortana=new Texture(),zima=new Texture();const cleared=[];
  const releaseC=retainHologramTextures([cortana],()=>cleared.push('cortana'));
  const releaseZ=retainHologramTextures([zima],()=>cleared.push('zima'));
  releaseC();assert.deepEqual(cleared,['cortana']);releaseZ();assert.deepEqual(cleared,['cortana','zima']);
});
