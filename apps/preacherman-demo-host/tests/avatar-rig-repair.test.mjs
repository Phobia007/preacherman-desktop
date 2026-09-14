import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {AnimationMixer,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const root=new URL('../',import.meta.url);
const records=(await Promise.all(['supplied','actorcore-talk'].map(async name=>JSON.parse(await readFile(new URL(`avatar-${name==='supplied'?'supplied-motions':name}-20260914.json`,root),'utf8')).models))).flat();
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const record of records)test(`${record.id}: repaired rig preserves authored shape and drives weighted helpers`,async()=>{
 const bytes=await readFile(new URL(`public/assets/avatars/${record.id}/${record.id}-runtime.glb`,root));
 const end=20+bytes.readUInt32LE(12),g=JSON.parse(bytes.toString('utf8',20,end)),bin=bytes.subarray(end+8);
 for(const expected of record.preservedAccessors){
  assert.deepEqual(g.accessors[expected.index],expected.descriptor,'authored vertex/index/bind accessor is unchanged');
  const view=g.bufferViews[expected.descriptor.bufferView];assert.equal(sha(bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength)),expected.viewSha256);
 }
 const parents=new Map(g.nodes.flatMap((n,i)=>(n.children??[]).map(c=>[c,i])));
 for(const [child,parent] of record.id==='kitana-mk11-in-mk9-suit'?[['spine 1','pelvis']]:record.id==='stellar-blade-lily-stargazer-coat'?[['Ab-PT-AXX','Bip001-Pelvis']]:[]){
  const i=g.nodes.findIndex(n=>n.name===child);assert.equal(g.nodes[parents.get(i)].name,parent,'weighted root follows the moving pelvis');
 }
 const animated=new Set(g.animations[0].channels.map(c=>g.nodes[c.target.node].name));
 for(const name of record.auxiliaryBones.filter(n=>!n.endsWith('_end')))assert.ok(animated.has(name),`${name} is driven`);
 for(const mesh of g.meshes)for(const p of mesh.primitives){
  const a=g.accessors[p.attributes.WEIGHTS_0],v=g.bufferViews[a.bufferView],off=(v.byteOffset??0)+(a.byteOffset??0);
  for(let i=0;i<a.count;i++){let sum=0;for(let k=0;k<4;k++){const w=bin.readFloatLE(off+i*(v.byteStride??16)+k*4);assert.ok(Number.isFinite(w)&&w>=0&&w<=1);sum+=w;}assert.ok(Math.abs(sum-1)<1e-5);}
 }
});

// Exercise the same Three.js linear skinning used by the desktop across the
// complete cycle, including the previously torn waist, trouser and skirt areas.
for(const [id,meshIndex,limit,waistOnly] of [['kitana-mk11-in-mk9-suit',null,1.65,true],['stellar-blade-lily-stargazer-coat',2,1.75,false],['nier-automata-2b',0,1.75,false],['the-twins-atomic-heart',0,1.8,false]])test(`${id}: full-cycle skin deformation remains bounded`,{timeout:45000},async()=>{
 const bytes=await readFile(new URL(`public/assets/avatars/${id}/${id}-runtime.glb`,root));const end=20+bytes.readUInt32LE(12),g=JSON.parse(bytes.toString('utf8',20,end));
 const bin=bytes.subarray(end+8,end+8+bytes.readUInt32LE(end));g.buffers[0].uri='data:application/octet-stream;base64,'+bin.toString('base64');
 delete g.images;delete g.textures;delete g.materials;for(const m of g.meshes)for(const p of m.primitives)delete p.material;
 globalThis.ProgressEvent??=class ProgressEvent extends Event{};
 const asset=await new GLTFLoader().parseAsync(JSON.stringify(g),'');const mixer=new AnimationMixer(asset.scene);const action=mixer.clipAction(asset.animations[0]).play();
 try{
  if(id==='the-twins-atomic-heart'){
   asset.scene.updateMatrixWorld(true);const v=new Vector3(),rest=new Vector3();
   asset.scene.traverse(m=>{if(!m.isSkinnedMesh)return;m.skeleton.update();const pos=m.geometry.attributes.position;
    for(let i=0;i<pos.count;i+=37){m.getVertexPosition(i,v);rest.fromBufferAttribute(pos,i);assert.ok(v.distanceTo(rest)<.0001,'corrected pivots and inverse binds preserve the original rest mesh');}
   });
  }
  const meshes=[];asset.scene.traverse(m=>{if(m.isSkinnedMesh&&(meshIndex===null||asset.parser.associations.get(m)?.meshes===meshIndex))meshes.push(m)});assert.ok(meshes.length>0);
  const prepared=meshes.map(m=>{
   const pos=m.geometry.attributes.position,idx=m.geometry.index,edges=[],a=new Vector3(),b=new Vector3();
   for(let i=0;i<idx.count;i+=3)for(let k=0;k<3;k++){
    const x=idx.getX(i+k),y=idx.getX(i+(k+1)%3);a.fromBufferAttribute(pos,x);b.fromBufferAttribute(pos,y);const d=a.distanceTo(b);
    if(d>.0005&&(!waistOnly||(Math.abs(a.x)<.14&&a.y>1.02&&a.y<1.25)))edges.push([x,y,d]);
   }
   return {m,pos,edges};
  });
  for(let sample=0;sample<15;sample++){
   mixer.setTime(action.getClip().duration*sample/15);asset.scene.updateMatrixWorld(true);
   for(const {m,pos,edges} of prepared){
    if(!edges.length)continue;m.skeleton.update();const posed=new Float32Array(pos.count*3),v=new Vector3();
    for(let i=0;i<pos.count;i++){m.getVertexPosition(i,v).applyMatrix4(m.matrixWorld);v.toArray(posed,i*3);}
    const ratios=edges.map(([a,b,d])=>Math.hypot(posed[a*3]-posed[b*3],posed[a*3+1]-posed[b*3+1],posed[a*3+2]-posed[b*3+2])/d).sort((a,b)=>a-b);
    const p=ratios[Math.floor(ratios.length*.995)];assert.ok(p<limit,`${m.name} sample ${sample}: edge p99.5 ${p} exceeds ${limit}`);
   }
  }
 }finally{mixer.stopAllAction();mixer.uncacheRoot(asset.scene);asset.scene.traverse(m=>{m.geometry?.dispose();for(const mat of [m.material].flat())mat?.dispose();});}
});
