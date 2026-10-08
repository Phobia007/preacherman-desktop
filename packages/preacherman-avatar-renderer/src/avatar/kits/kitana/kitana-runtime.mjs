import {kitanaConfig} from './kitana-config.mjs';
import {IdleTalkPlayer,prepareSpeechClip} from './idle-talk-player.mjs';
import {HeadGestureLayer} from './head-gesture-layer.mjs';
import {PlantedFootContact} from './planted-foot-contact.mjs';
import {HandContact} from './hand-contact.mjs';
import {CompanionMotion} from './companion-motion.mjs';
import {KitanaFaceLayer} from './kitana-face-layer.mjs';
import {EXPRESSION_IDS,expressionCatalog} from './expression-catalog.mjs';
export {kitanaConfig,expressionCatalog};

export class KitanaRuntime {
 constructor({THREE,root,animations,random=Math.random,onChange=()=>{}}){
  this.THREE=THREE;this.root=root;this.config=kitanaConfig;this.onChange=onChange;this.disposed=false;this.state='idle';this.epoch=0;
  const names=new Set();root.traverse(n=>names.add(THREE.PropertyBinding.sanitizeNodeName(n.name)));
  this.rigBoneCount=(kitanaConfig.rigJointNames||[]).filter(n=>names.has(THREE.PropertyBinding.sanitizeNodeName(n))).length;
  if(this.rigBoneCount!==225)throw new Error('Kitana package needs all 225 calibrated rig joints');
  const c=this.config,find=name=>{const clip=animations.find(a=>a.name===name);if(!clip)throw new Error('Kitana clip missing: '+name);return clip;};
  this.clips=c.playerClipNames.map(n=>prepareSpeechClip(find(n)));this.mixer=new THREE.AnimationMixer(root);
  try{
   this.player=new IdleTalkPlayer({THREE,mixer:this.mixer,clips:this.clips,talkIndex:c.talkIndex,speechIndices:c.speechIndices,stretchIndex:c.stretchIndex,touchIndex:c.touchIndex,tiltIndex:c.tiltIndex,continuousIndex:c.continuousIndex,minimumDelay:c.playback.bodyEventDelay[0],maximumDelay:c.playback.bodyEventDelay[1],safeWindows:c.playback.safeTalkWindows,returnPhase:c.playback.returnPhase,enterFade:c.playback.enterFade,exitFade:c.playback.exitFade,random,onChange:()=>this.onChange()});
   const allowed=[];root.traverse(n=>{if(['head neck lower','head neck middle','head neck upper'].some(name=>THREE.PropertyBinding.sanitizeNodeName(name)===THREE.PropertyBinding.sanitizeNodeName(n.name)))allowed.push(n.name,n.uuid);});
   this.head=new HeadGestureLayer({THREE,mixer:this.mixer,player:this.player,sourceClips:animations.filter(a=>a.name.startsWith('kitana.gesture.look_')),referenceClip:this.clips[c.referenceIndex],neutralIndex:c.neutralIndex,eligibleIndices:c.headEligibleIndices,allowedNodeNames:allowed,...c.playback.headPacing,random,onChange:()=>this.onChange()});
   this.player.select(0,true);root.updateMatrixWorld(true);
   this.feet=new PlantedFootContact({THREE,root,player:this.player});
   this.footAnchors=this.feet.legs.map(l=>root.worldToLocal(l.goal.clone()));
   this.hands=new HandContact({THREE,root,player:this.player});
   this.motion=new CompanionMotion({player:this.player,head:this.head});this.face=new KitanaFaceLayer({THREE,root,random});
  }catch(error){this.dispose();throw error;}
 }
 assertLive(){if(this.disposed)throw new Error('Kitana runtime has been disposed');}
 listActions(){return this.config.profile.actions.map(a=>({...a}));}
 hasAction(id){return this.config.profile.actions.some(a=>a.id===id);}
 setState(state,{expressionId='neutral',emotion='neutral',intensity=.35}={}){
  this.assertLive();if(!this.config.supportedStates.includes(state))throw new Error('Unsupported Kitana state: '+state);
  if(!EXPRESSION_IDS.includes(expressionId))throw new Error('Unknown recorded expression: '+expressionId);
  if(!['neutral','warm','concerned','curious'].includes(emotion))throw new Error('Unknown expression emotion');
  if(!Number.isFinite(intensity)||intensity<0||intensity>.65)throw new Error('Expression intensity must be 0–0.65');
  this.player.setPlaying(true);if(state!==this.state)++this.epoch;
  const body=['success','sleeping','wakeup'].includes(state)?'idle':state;
  this.motion.setState(body);this.face.setState({epoch:this.epoch,state:body,expressionId,emotion,intensity});
  if(state==='success'&&expressionId==='neutral')this.face.previewExpression('gentle_smile',.4);
  this.state=state;this.onChange();
 }
 beginSpeaking(face={}){
  if(this.state==='speaking')this.interrupt();
  this.setState('speaking',face);
 }
 endSpeaking(){this.setState('idle');}
 interrupt(){if(!this.disposed){this.setState('idle');this.head.cancelForManualSelection();}}
 playExpression(id,intensity=.45){this.assertLive();if(!EXPRESSION_IDS.includes(id))throw new Error('Unknown recorded expression');if(!Number.isFinite(intensity)||intensity<0||intensity>.65)throw new Error('Invalid expression intensity');return this.face.previewExpression(id,intensity);}
 audioEnergy(value){this.assertLive();if(!Number.isFinite(value))throw new Error('Audio energy must be finite');this.face.boundary({energy:Math.max(0,Math.min(.85,value))});}
 play(id,{fadeIn}={}){
  this.assertLive();const a=this.config.profile.actions.find(a=>a.id===id);if(!a)throw new Error('Unknown Kitana action: '+id);
  if(fadeIn!==undefined&&(!Number.isFinite(fadeIn)||fadeIn<=0))throw new Error('Positive fadeIn required');
  if(this.state!=='idle')this.interrupt();this.player.setPlaying(true);
  if(a.category==='head'){
   this.player.select(0);this.head.cancelForManualSelection();if(!this.head.request(a.clipName))throw new Error('Head event is busy');return;
  }
  this.head.cancelForManualSelection();const index=this.clips.findIndex(c=>c.name===a.clipName);if(index<0)throw new Error('Missing configured clip');
  if(a.loop==='repeat'){this.player.select(index);return;}
  this.player.select(0);this.player.manualIndex=0;this.player.talkIndex=index;
  this.player.activeEventKind=a.category==='speaking'?'talk':id==='gesture.stretch'?'stretch':id==='gesture.hand'?'touch':'tilt';
  if(a.category==='speaking')this.player.lastSpeechIndex=index;
  this.player.lastTriggerReason='requested';this.player.mode='entering_talk';this.player.enterFade=fadeIn??a.fadeIn;this.player.exitFade=a.fadeOut;
  this.player.transitionTo(index,{duration:fadeIn??a.fadeIn,once:true,kind:'entering_talk'});
 }
 crossFadeTo(id,duration=.55){return this.play(id,{fadeIn:duration});}
 stop(id){if(this.disposed)return;if(id&&this.config.profile.actions.find(a=>a.id===id)?.clipName!==this.player.clips[this.player.currentIndex].name)return;this.interrupt();this.player.setPlaying(false);}
 setRandomEvents({speech,stretch,hand,headTilt,look}={}){
  this.assertLive();if(!['idle','success','sleeping','wakeup','error'].includes(this.state))throw new Error('Random settings cannot change during conversation');
  for(const [value,method] of [[speech,'setRandomEnabled'],[stretch,'setStretchEnabled'],[hand,'setTouchEnabled'],[headTilt,'setTiltEnabled']])if(value!==undefined)this.player[method](Boolean(value));
  if(look!==undefined)this.head.setEnabled(Boolean(look));
 }
 update(deltaSeconds){
  this.assertLive();if(!Number.isFinite(deltaSeconds)||deltaSeconds<0)throw new Error('Nonnegative frame delta required');
  if(!this.player.playing||deltaSeconds===0)return;const delta=Math.min(.1,deltaSeconds);
  this.face.restore();this.root.updateMatrixWorld(true);
  // Anchors follow the app's parent/root placement rather than the preview world.
  this.feet.legs.forEach((l,i)=>l.goal.copy(this.footAnchors[i]).applyMatrix4(this.root.matrixWorld));
  this.player.update(delta);this.motion.update();this.face.apply(delta);
 }
 getDebugSnapshot(){const p=this.player;return {avatarId:this.config.profile.avatarId,rigId:this.config.profile.rigId,loadedClips:this.clips.map(c=>c.name),currentAction:p?this.config.profile.actions.find(a=>a.clipName===p.clips[p.currentIndex].name)?.id??null:null,currentDuration:p?.clips[p.currentIndex].duration??null,mixerState:this.disposed?'disposed':p?.playing?'playing':'idle',boneCount:this.rigBoneCount,missingClipErrors:[],registeredActions:this.config.profile.actions.length,state:this.state,body:p?.getState(),head:this.head?.getState(),face:this.face?.getState(),speechSelectionCount:this.motion?.selections??0};}
 dispose(){if(this.disposed)return;this.disposed=true;this.onChange=()=>{};this.face?.dispose();this.hands?.destroy();this.feet?.destroy();this.head?.destroy();this.player?.destroy();this.mixer?.stopAllAction();this.mixer?.uncacheRoot(this.root);}
}
export const createKitanaRuntime=options=>new KitanaRuntime(options);
