import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {AnimationMixer,Vector3,Quaternion} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

test('Twin: anatomical knees and rigid shoes remain aligned through the complete Talk cycle',{timeout:30000},async()=>{
 const root=new URL('../',import.meta.url),id='the-twins-atomic-heart';
 const records=JSON.parse(await readFile(new URL('avatar-actorcore-talk-20260914.json',root),'utf8'));
 const expected=records.models.find(m=>m.id===id).legRepair;
 const bytes=await readFile(new URL(`public/assets/avatars/${id}/${id}-runtime.glb`,root));
 const end=20+bytes.readUInt32LE(12),g=JSON.parse(bytes.toString('utf8',20,end)),bin=bytes.subarray(end+8);
 const sha=b=>createHash('sha256').update(b).digest('hex');assert.equal(sha(bytes),expected.runtimeSha256);
 for(const track of expected.unchangedUpperBodyTracks){const a=g.accessors[track.accessor],v=g.bufferViews[a.bufferView];assert.equal(sha(bin.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength)),track.sha256,`${track.bone}: assigned upper-body motion is unchanged`);}
 delete g.images;delete g.textures;delete g.materials;for(const m of g.meshes)for(const p of m.primitives)delete p.material;
 g.buffers[0].uri='data:application/octet-stream;base64,'+bin.toString('base64');globalThis.ProgressEvent??=class extends Event{};
 const asset=await new GLTFLoader().parseAsync(JSON.stringify(g),'');const scene=asset.scene,mixer=new AnimationMixer(scene),clip=asset.animations[0];
 const bones={},meshes=[];scene.traverse(o=>{if(o.isBone)bones[o.name]=o;if(o.isSkinnedMesh)meshes.push(o)});
 const point=b=>b.getWorldPosition(new Vector3());scene.updateMatrixWorld(true);
 const lengths={};for(const side of ['l','r']){const h=point(bones[`b_${side}_thigh`]),k=point(bones[`b_${side}_calf`]),a=point(bones[`b_${side}_foot`]);lengths[side]=[h.distanceTo(k),k.distanceTo(a)];assert.ok(Math.abs(Math.abs(k.x)-.0765)<.0001);assert.ok(Math.abs(Math.abs(a.x)-.067)<.0001);}
 const feetRest=Object.fromEntries(['l','r'].map(s=>[s,bones[`b_${s}_foot`].getWorldQuaternion(new Quaternion())]));
 try{
  for(const m of meshes){m.skeleton.update();const pos=m.geometry.attributes.position,v=new Vector3(),r=new Vector3();for(let i=0;i<pos.count;i+=31){m.getVertexPosition(i,v);r.fromBufferAttribute(pos,i);assert.ok(v.distanceTo(r)<.0001,'bind repair preserves authored rest shape');}}
  const shoe=meshes.find(m=>asset.parser.associations.get(m)?.meshes===0);assert.ok(shoe);
  const pos=shoe.geometry.attributes.position,js=shoe.geometry.attributes.skinIndex,ws=shoe.geometry.attributes.skinWeight,shoeIds=[];
  for(let i=0;i<pos.count;i++){if(pos.getY(i)<.08)shoeIds.push(i);if(pos.getY(i)<.80){assert.equal(ws.getX(i),1,'leg shells use rigid segment weights');assert.equal(ws.getY(i)+ws.getZ(i)+ws.getW(i),0);}}
  const action=mixer.clipAction(clip).play();let lastKnees=null;
  for(let i=0;i<1689;i++){
   mixer.setTime(clip.duration*i/1688);scene.updateMatrixWorld(true);const knees=[];
   for(const side of ['l','r']){
    const h=point(bones[`b_${side}_thigh`]),k=point(bones[`b_${side}_calf`]),a=point(bones[`b_${side}_foot`]);knees.push(k);
    assert.ok(Math.abs(h.distanceTo(k)-lengths[side][0])<.0001,'thigh length');assert.ok(Math.abs(k.distanceTo(a)-lengths[side][1])<.0001,'shin length');
    const axis=a.clone().sub(h).normalize(),bend=k.clone().sub(h);bend.addScaledVector(axis,-bend.dot(axis));
    const delta=bones[`b_${side}_foot`].getWorldQuaternion(new Quaternion()).multiply(feetRest[side].clone().invert());const forward=new Vector3(0,0,1).applyQuaternion(delta);forward.y=0;forward.normalize();
    assert.ok(bend.dot(forward)>-.0001,'knees never bend backward');
   }
   assert.ok(knees[0].x-knees[1].x>.10,'knees retain anatomical clearance');
   if(lastKnees)for(let side=0;side<2;side++)assert.ok(knees[side].distanceTo(lastKnees[side])<.035,'no knee flips between adjacent 60 FPS samples');lastKnees=knees;
   if(i%24===0||i===1688){shoe.skeleton.update();const v=new Vector3();for(const j of shoeIds){shoe.getVertexPosition(j,v).applyMatrix4(shoe.matrixWorld);assert.ok(v.y>-.001,`shoe penetrated floor at ${i}: ${v.y}`);}}
  }
  for(const track of clip.tracks){const size=track.getValueSize(),v=track.values;for(let i=0;i<size;i++)assert.ok(Math.abs(v[i]-v[v.length-size+i])<.00001,'loop closes');}
 }finally{mixer.stopAllAction();mixer.uncacheRoot(scene);for(const m of meshes){m.geometry.dispose();for(const material of [m.material].flat())material?.dispose();}}
});
