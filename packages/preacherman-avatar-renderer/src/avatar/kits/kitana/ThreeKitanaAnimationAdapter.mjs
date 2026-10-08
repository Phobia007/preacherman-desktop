import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {KitanaRuntime,kitanaConfig,expressionCatalog} from './kitana-runtime.mjs';
export {KitanaRuntime,kitanaConfig,expressionCatalog};
export const kitanaAvatarProfile=kitanaConfig.profile;

function releaseRoot(root){
 const geometries=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set(),images=new Set();
 root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){materials.add(m);Object.values(m).forEach(v=>{if(v?.isTexture){textures.add(v);if(v.image?.close)images.add(v.image);}});}if(o.skeleton)skeletons.add(o.skeleton);});
 geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());skeletons.forEach(s=>s.dispose());images.forEach(i=>i.close());
}
// Matches the app's AvatarAnimationPort and adds its existing update/getRoot/debug APIs.
export class ThreeKitanaAnimationAdapter {
 constructor({modelUrl,random=Math.random,onError=()=>{},loadGLTF}={}){
  if(!modelUrl)throw new Error('Kitana modelUrl required');
  this.modelUrl=modelUrl;this.random=random;this.onError=onError;this.loader=loadGLTF??(url=>new GLTFLoader().loadAsync(url));this.promise=null;this.runtime=null;this.root=null;this.disposed=false;this.listeners=new Set();
 }
 load(){
  if(this.disposed)return Promise.reject(new Error('Kitana adapter disposed'));
  if(this.promise)return this.promise;
  this.promise=(async()=>{const gltf=await this.loader(this.modelUrl);if(this.disposed){releaseRoot(gltf.scene);throw new Error('Kitana load cancelled after disposal');}
   this.root=gltf.scene;try{this.runtime=new KitanaRuntime({THREE,root:gltf.scene,animations:gltf.animations,random:this.random,onChange:()=>this.emit()});}catch(e){releaseRoot(this.root);this.root=null;throw e;}this.emit();
  })().catch(e=>{const error=new Error(e.message);error.name='AvatarAnimationError';error.code='MODEL_LOAD_FAILED';error.details={avatarId:kitanaConfig.profile.avatarId,modelUrl:this.modelUrl};if(!this.disposed)this.onError(error);this.promise=null;throw error;});return this.promise;
 }
 listActions(){return kitanaConfig.profile.actions.map(a=>({...a}));}
 hasAction(id){return kitanaConfig.profile.actions.some(a=>a.id===id);}
 async play(id,options){await this.load();this.runtime.play(id,options);}
 async crossFadeTo(id,duration=.55){await this.load();this.runtime.crossFadeTo(id,duration);}
 stop(id){this.runtime?.stop(id);}
 async setState(state,face){await this.load();this.runtime.setState(state,face);}
 async beginSpeaking(face){await this.load();this.runtime.beginSpeaking(face);}
 endSpeaking(){this.runtime?.endSpeaking();}
 interrupt(){this.runtime?.interrupt();}
 async playExpression(id,intensity=.45){await this.load();return this.runtime.playExpression(id,intensity);}
 audioEnergy(energy){this.runtime?.audioEnergy(energy);}
 setRandomEvents(options){if(!this.runtime)throw new Error('Load Kitana first');this.runtime.setRandomEvents(options);}
 update(deltaSeconds){this.runtime?.update(deltaSeconds);}
 getRoot(){return this.root;}
 getDebugSnapshot(){return this.runtime?.getDebugSnapshot()??{avatarId:kitanaConfig.profile.avatarId,rigId:kitanaConfig.profile.rigId,loadedClips:[],currentAction:null,currentDuration:null,mixerState:this.disposed?'disposed':'idle',boneCount:0,missingClipErrors:[],registeredActions:kitanaConfig.profile.actions.length};}
 subscribeDebug(fn){this.listeners.add(fn);fn(this.getDebugSnapshot());return()=>this.listeners.delete(fn);}
 emit(){for(const fn of this.listeners)fn(this.getDebugSnapshot());}
 dispose(){if(this.disposed)return;this.disposed=true;this.runtime?.dispose();if(this.root)releaseRoot(this.root);this.root=null;this.runtime=null;this.listeners.clear();}
}
