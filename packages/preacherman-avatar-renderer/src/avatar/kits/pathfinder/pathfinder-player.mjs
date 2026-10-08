import {IdleTalkPlayer,createSeededRandom} from './motion-player-base.mjs';
import {PlantedFootContact} from './foot-contact.mjs';
import {PathfinderScreenExpressions} from './screen-expressions.mjs';
export {createSeededRandom};
export const motions=[
 {key:'complete',clip:'pathfinder.idle.male.complete.v1',label:'完整男性待机',source:'男性站立与换重心 · 24 秒连续循环'},
 {key:'stand',clip:'pathfinder.idle.male.stand.v1',label:'男性放松站立',source:'ACCAD Male 1 · Stand，排除离开站位的尾段'},
 {key:'sway',clip:'pathfinder.idle.male.sway.v1',label:'男性换重心',source:'ACCAD Male 1 · Sway'},
 {key:'swing',clip:'pathfinder.gesture.male.swing.v1',label:'男性自然摆臂',source:'ACCAD Male 1 · Swing Arms，连续原始片段'},
 {key:'look',clip:'pathfinder.gesture.male.look.v1',label:'自然环顾',source:'ACCAD Male 1 · Look Around，头颈映射'},
 {key:'original',clip:'apex-legend-pathfinder.idle.happy.v2',label:'Happy Idle',source:'APP 原动作 · 偶尔随机出现，单次播放后回到待机'},
 {key:'conversation',clip:'pathfinder.talk.rokoko.conversation.v1',label:'自然交流',source:'Rokoko · Conversation · 真人聊天录制'},
 {key:'chatting',clip:'pathfinder.talk.rokoko.chatting.v1',label:'聊天手势 A',source:'Rokoko · Chatting · 真人聊天录制'},
 {key:'chatting02',clip:'pathfinder.talk.rokoko.chatting02.v1',label:'聊天手势 B',source:'Rokoko · Chatting02 · 真人聊天录制'}
];
export class PathfinderPlayer extends IdleTalkPlayer {
 constructor(options){super({...options,continuousIndex:0,talkIndex:3,minimumDelay:30,maximumDelay:55,enterFade:1,exitFade:1,returnPhase:0,safeWindows:[[0,4],[20,24]]});this.originalIndex=5;this.eventIndices=[3,4,5];this.speechIndices=[6,7,8];this.lastEvent=null;this.lastSpeech=null;this.speakingActive=false;this.pendingEvent=null;this.eventCounts={swing:0,look:0,original:0,conversation:0,chatting:0,chatting02:0};}
 requestEvent(index){if(![...this.eventIndices,...this.speechIndices].includes(index))throw new Error('Unknown Pathfinder gesture');if(!this.canRequestOneShot)return false;this.pendingEvent=index;return super.requestOneShot();}
 beginTalk(){const speech=this.speakingActive||this.speechIndices.includes(this.pendingEvent),all=speech?this.speechIndices:this.eventIndices,last=speech?this.lastSpeech:this.lastEvent,pool=all.filter(i=>i!==last),choices=pool.length?pool:all;const index=this.pendingEvent??choices[Math.min(choices.length-1,Math.floor(this.random()*choices.length))];this.pendingEvent=null;if(speech)this.lastSpeech=index;else this.lastEvent=index;this.talkIndex=index;this.eventCounts[motions[index].key]++;this.enterFade=this.exitFade=index===5?.65:speech?1.3:1;super.beginTalk();this.activeAction.setEffectiveTimeScale(index===4?.65:1);}
 beginReturn(){if(this.speakingActive){this.beginTalk();return;}super.beginReturn();if(!this.blend){this.mode='idle';this.resetInterval();}}
 setSpeaking(enabled){const value=Boolean(enabled);if(value===this.speakingActive)return;this.speakingActive=value;this.pendingEvent=null;this.oneShotPending=false;if(value){this.manualIndex=0;this.setPlaying(true);this.beginTalk();}else if(this.speechIndices.includes(this.currentIndex)){this.beginReturn();}this.onChange();}
 select(index,immediate=false){this.speakingActive=false;this.pendingEvent=null;super.select(index,immediate);}
 getState(){return {...super.getState(),lastEvent:this.lastEvent,lastSpeech:this.lastSpeech,speakingActive:this.speakingActive,eventCounts:{...this.eventCounts},pendingEvent:this.pendingEvent,activeLabel:motions[this.currentIndex].label};}
}
// Host-independent runtime for the import package; no page or provider dependency.
export function createPathfinderRuntime({THREE,root,animations,random=Math.random,onChange=()=>{}}){
 const clips=motions.map(m=>{const clip=animations.find(c=>c.name===m.clip);if(!clip)throw new Error('Missing Pathfinder clip: '+m.clip);return clip;});
 const mixer=new THREE.AnimationMixer(root),player=new PathfinderPlayer({THREE,mixer,clips,random,onChange});player.select(0,true);root.updateMatrixWorld(true);
 const feet=new PlantedFootContact({THREE,root,player}),localAnchors=feet.legs.map(l=>root.worldToLocal(l.goal.clone())),screen=new PathfinderScreenExpressions({THREE,root,onChange});let disposed=false,companionState='idle';
 return {player,clips,mixer,root,motions,screen,
  update(delta){if(disposed||!Number.isFinite(delta)||delta<=0)return;const dt=Math.min(.1,delta);root.updateMatrixWorld(true);feet.legs.forEach((l,i)=>l.goal.copy(localAnchors[i]).applyMatrix4(root.matrixWorld));player.update(dt);const speaking=player.speakingActive||(player.speechIndices.includes(player.currentIndex)&&['entering_talk','talking'].includes(player.mode));screen.setState(speaking?'speaking':companionState==='speaking'?'idle':companionState);if(player.playing)screen.update(dt*player.speed);},
  select(key){if(disposed)throw new Error('Disposed Pathfinder');const i=motions.findIndex(m=>m.key===key);if(i<0)throw new Error('Unknown Pathfinder motion');companionState='idle';screen.setState('idle');if([...player.eventIndices,...player.speechIndices].includes(i)){player.select(0);player.requestEvent(i);}else player.select(i);},
  setSpeaking(enabled){this.setCompanionState(enabled?'speaking':'idle');},
  setCompanionState(state){if(disposed)throw new Error('Disposed Pathfinder');screen.setState(state);companionState=state;player.setSpeaking(state==='speaking');if(state!=='speaking'&&player.manualIndex!==0)player.select(0);},
  getState:()=>({...player.getState(),screen:screen.getState()}),feet,
  dispose(){if(disposed)return;disposed=true;screen.dispose();feet.destroy();player.destroy();mixer.uncacheRoot(root);},
 };
}
