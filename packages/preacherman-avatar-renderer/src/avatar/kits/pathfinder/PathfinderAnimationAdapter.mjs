import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createPathfinderRuntime,motions} from './pathfinder-player.mjs';
import {profile} from './profile.mjs';
import {screenExpressions} from './screen-expressions.mjs';
import {normalizeAIReply} from './ai-reply.mjs';
export {pathfinderAIReplySchema,pathfinderExpressionInstructions,normalizeAIReply} from './ai-reply.mjs';
export {profile as pathfinderAvatarProfile};
function release(root){const gs=new Set(),ms=new Set(),ts=new Set(),ss=new Set(),images=new Set();root.traverse(n=>{if(n.geometry)gs.add(n.geometry);if(n.skeleton)ss.add(n.skeleton);for(const m of Array.isArray(n.material)?n.material:n.material?[n.material]:[]){ms.add(m);Object.values(m).forEach(v=>{if(v?.isTexture){ts.add(v);if(v.image?.close)images.add(v.image);}});}});gs.forEach(v=>v.dispose());ms.forEach(v=>v.dispose());ts.forEach(v=>v.dispose());ss.forEach(v=>v.dispose());images.forEach(v=>v.close());}
export class PathfinderAnimationAdapter {
 constructor({modelUrl,loadGLTF,random=Math.random,onError=()=>{}}={}){if(!modelUrl)throw new Error('Pathfinder modelUrl required');this.modelUrl=modelUrl;this.loader=loadGLTF??(url=>new GLTFLoader().loadAsync(url));this.random=random;this.onError=onError;this.root=null;this.runtime=null;this.pending=null;this.disposed=false;this.listeners=new Set();this.aiTurnId=0;this.aiReplyActive=false;}
 load(){if(this.disposed)return Promise.reject(new Error('Pathfinder adapter disposed'));if(this.pending)return this.pending;return this.pending=(async()=>{const g=await this.loader(this.modelUrl);if(this.disposed){release(g.scene);throw new Error('Load cancelled');}this.root=g.scene;try{this.runtime=createPathfinderRuntime({THREE,root:g.scene,animations:g.animations,random:this.random,onChange:()=>this.emit()});}catch(e){release(g.scene);this.root=null;throw e;}this.emit();})().catch(e=>{const error=new Error(e.message);error.name='AvatarAnimationError';error.code='MODEL_LOAD_FAILED';error.details={avatarId:profile.avatarId};if(!this.disposed)this.onError(error);this.pending=null;throw error;});}
 listActions(){return profile.actions.map(a=>({...a}));}
 hasAction(id){return profile.actions.some(a=>a.id===id);}
 async play(id){await this.load();const action=profile.actions.find(a=>a.id===id);if(!action)throw new Error('Unknown Pathfinder action: '+id);this.runtime.select(motions.find(m=>m.clip===action.clipName).key);}
 crossFadeTo(id){return this.play(id);}
 stop(){this.runtime?.player.setPlaying(false);this.emit();}
 async setState(state){await this.load();if(!Object.hasOwn(profile.stateMap,state))throw new Error('Unknown Pathfinder state');this.runtime.setCompanionState(state);}
 listExpressions(){return screenExpressions.map(e=>({...e}));}
 async setExpression(id){await this.load();this.runtime.screen.setExpression(id);}
 async setEmotion(id,options){await this.load();this.runtime.screen.setEmotion(id,options);}
 async clearEmotion(){await this.load();this.runtime.screen.clearEmotion();}
 async setAutomaticExpressions(enabled){await this.load();this.runtime.screen.setAutomatic(enabled);}
 async setSpeechLevel(level){await this.load();this.runtime.screen.setSpeechLevel(level);}
 async beginAITurn(){const turnId=++this.aiTurnId;await this.load();if(turnId!==this.aiTurnId)return turnId;this.aiReplyActive=false;this.runtime.setCompanionState('thinking');this.runtime.screen.clearEmotion();this.runtime.screen.releaseReplyExpression();return turnId;}
 async applyAIReply(raw,{turnId=this.aiTurnId}={}){await this.load();if(turnId!==this.aiTurnId)return {text:'',expression:'happy',expressionFallback:false,turnId,accepted:false};const reply=normalizeAIReply(raw);this.aiReplyActive=true;this.runtime.screen.holdReplyExpression(reply.expression);return {...reply,turnId,accepted:true};}
 async startAIReplySpeech(turnId=this.aiTurnId){await this.load();if(turnId!==this.aiTurnId||!this.aiReplyActive)return false;this.runtime.setCompanionState('speaking');return true;}
 async finishAIReply(turnId=this.aiTurnId){await this.load();if(turnId!==this.aiTurnId)return false;this.aiReplyActive=false;this.runtime.setCompanionState('idle');this.runtime.screen.releaseReplyExpression();return true;}
 async cancelAITurn(){const turnId=++this.aiTurnId;await this.load();if(turnId===this.aiTurnId){this.aiReplyActive=false;this.runtime.setCompanionState('idle');this.runtime.screen.releaseReplyExpression();}return turnId;}
 setRandomEnabled(enabled){if(!this.runtime)throw new Error('Load Pathfinder first');this.runtime.player.setRandomEnabled(Boolean(enabled));}
 update(delta){this.runtime?.update(delta);}
 getRoot(){return this.root;}
 getDebugSnapshot(){const p=this.runtime?.player;return {avatarId:profile.avatarId,rigId:profile.rigId,loadedClips:this.runtime?.clips.map(c=>c.name)??[],currentAction:p?profile.actions.find(a=>a.clipName===p.clips[p.currentIndex].name)?.id??null:null,currentDuration:p?.clips[p.currentIndex].duration??null,mixerState:this.disposed?'disposed':p?.playing?'playing':'idle',boneCount:this.root?145:0,missingClipErrors:[],registeredActions:profile.actions.length,body:p?.getState(),screen:this.runtime?.screen.getState()??null};}
 subscribeDebug(fn){this.listeners.add(fn);fn(this.getDebugSnapshot());return()=>this.listeners.delete(fn);}
 emit(){for(const fn of this.listeners)fn(this.getDebugSnapshot());}
 dispose(){if(this.disposed)return;this.disposed=true;this.runtime?.dispose();if(this.root)release(this.root);this.root=null;this.runtime=null;this.listeners.clear();}
}
