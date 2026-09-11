import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
const host=join(import.meta.dirname,'..');
async function asset(id){const b=await readFile(join(host,'public/assets/avatars',id,id+'-runtime.glb'));return JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));}
test('repaired source materials retain usable skin, cloth, metal and cutout channels',async()=>{
 const kitana=await asset('kitana-mk11-in-mk9-suit');
 for(const m of kitana.materials){assert.equal(m.pbrMetallicRoughness.metallicFactor,0);assert.notEqual(m.extensions?.KHR_materials_specular?.specularFactor,0);}
 for(const id of ['nier-print-2b','nier-print-9s']){
  const d=await asset(id),body=d.materials.find(m=>m.name===(id==='nier-print-2b'?'Body':'9S_Body'));
  assert.ok(body.normalTexture);assert.ok(body.pbrMetallicRoughness.metallicRoughnessTexture);
  if(id==='nier-print-2b'){
   assert.equal(d.animations[0].name,'nier-print-2b.idle.seated.v3');
   const metal=d.materials.find(m=>m.name==='Body_Metal');assert.ok(metal.pbrMetallicRoughness.baseColorTexture);assert.ok(metal.normalTexture);
  }
 }
 const myers=await asset('halloween-the-game-michael-myers-samhain');
 for(const name of ['MI_Myers_Samhain_Suit','MI_Myers_Samhain_Hair']){const m=myers.materials.find(m=>m.name===name);assert.equal(m.alphaMode,'MASK');assert.ok(m.pbrMetallicRoughness.baseColorTexture);}
 const lily=await asset('stellar-blade-lily-stargazer-coat');
 for(const name of ['MI_CH_NPC_01_DX_Upper','MI_CH_NPC_01_DX_Lower']){const m=lily.materials.find(m=>m.name===name);assert.equal(m.pbrMetallicRoughness.metallicFactor,0);assert.ok(m.pbrMetallicRoughness.metallicRoughnessTexture);}
 const twins=await asset('the-twins-atomic-heart');
 for(const m of twins.materials){assert.ok(m.pbrMetallicRoughness.metallicRoughnessTexture);assert.notEqual(m.extensions?.KHR_materials_ior?.ior,1);assert.ok(m.normalTexture);}
});
