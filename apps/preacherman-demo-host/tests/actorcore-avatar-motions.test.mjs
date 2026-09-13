import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('avatar-actorcore-talk-20260914.json',root),'utf8'));
const expected=Object.fromEntries(['kitana-mk11-in-mk9-suit','stellar-blade-lily-stargazer-coat','the-twins-atomic-heart'].map(id=>[id,'stand-talk-378997.fbx']));
for(const model of manifest.models)test(`${model.id}: ActorCore motion preserves original asset buffers and loops on the existing skeleton`,async()=>{
 assert.equal(model.source.split('/').at(-1),expected[model.id]);
 const b=await readFile(new URL(`public/assets/avatars/${model.id}/${model.id}-runtime.glb`,root));
 assert.equal(createHash('sha256').update(b).digest('hex'),model.runtimeSha256);
 const end=20+b.readUInt32LE(12),g=JSON.parse(b.toString('utf8',20,end)),binary=b.subarray(end+8);
 assert.equal(createHash('sha256').update(binary.subarray(0,model.originalBinaryBytes)).digest('hex'),model.originalBinarySha256,'all previous geometry, textures and inverse bind buffers are preserved byte for byte');
 assert.ok(model.footGoalMaxError<0.0001,'leg-length correction keeps foot targets within 0.1 mm');
 assert.equal(model.sourceFps,60);assert.ok(Math.abs(model.duration-1688/60)<.0001,'complete source talk sequence is retained');assert.equal(model.sampleFps,30);assert.equal(g.animations.length,1);
 if(model.skinWeightCorrection){
  assert.equal(model.id,'the-twins-atomic-heart');
  for(const mesh of g.meshes)for(const primitive of mesh.primitives){
   const a=g.accessors[primitive.attributes.WEIGHTS_0],v=g.bufferViews[a.bufferView],offset=(v.byteOffset??0)+(a.byteOffset??0);
   assert.ok(v.byteOffset>=model.originalBinaryBytes,'corrected weights are appended while source data remains preserved');
   for(let row=0;row<a.count;row++){let total=0;for(let k=0;k<4;k++){const w=binary.readFloatLE(offset+(row*4+k)*4);assert.ok(w>=0&&w<=1);total+=w}assert.ok(Math.abs(total-1)<0.000001)}
  }
 }
 const a=g.animations[0];assert.equal(a.name,model.clip);assert.ok(a.channels.length<=64);
 assert.ok(a.channels.some(c=>/forearm|lowerarm|elbow/i.test(g.nodes[c.target.node].name)));
 for(const c of a.channels){
  assert.ok(c.target.path==='rotation'||c.target.path==='translation');
  if(c.target.path==='translation')assert.equal(g.nodes[c.target.node].name,model.boneMapping.b_pelvis,'limb translations cannot stretch the target anatomy');
  const sampler=a.samplers[c.sampler],times=g.accessors[sampler.input];assert.ok(Math.abs(times.max[0]-model.duration)<0.0001);assert.equal(times.min[0],0);
  const accessor=g.accessors[sampler.output],view=g.bufferViews[accessor.bufferView],size=accessor.type==='VEC4'?4:3,offset=(view.byteOffset??0)+(accessor.byteOffset??0);
  for(let i=0;i<size;i++){const first=binary.readFloatLE(offset+i*4),last=binary.readFloatLE(offset+(accessor.count-1)*size*4+i*4);assert.equal(first,last,'loop must return without a pose jump');}
 }
});
