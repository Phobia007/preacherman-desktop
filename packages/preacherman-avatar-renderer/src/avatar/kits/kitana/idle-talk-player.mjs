import {IdleTalkPlayer as BasePlayer} from './idle-talk-player-base.mjs';
export {createSeededRandom,smootherstep} from './idle-talk-player-base.mjs';
// Preserve the full source; avoid its known palm/torso contact near its tail.
export function prepareSpeechClip(clip){if(clip.name!=='kitana.talk.accad.compatible.v1')return clip;const copy=clip.clone();copy.duration=Math.min(20,clip.duration);return copy.trim().resetDuration();}
export class IdleTalkPlayer extends BasePlayer {
 constructor(options){
  super(options);this.speechIndex=options.talkIndex;
  this.speechIndices=[...new Set(options.speechIndices||[this.speechIndex])];this.lastSpeechIndex=null;
  if(!this.speechIndices.includes(this.speechIndex)||this.speechIndices.some(i=>!Number.isInteger(i)||!this.clips[i]||this.clips[i].duration<4))throw new Error('Invalid speech motion pool');
  for(const kind of ['stretch','touch','tilt']){
   const index=options[kind+'Index'];if(!Number.isInteger(index)||!this.clips[index]||this.clips[index].duration<=2.4)throw new Error('Missing compatible recorded body-event clip: '+kind);
   this[kind+'Index']=index;this[kind+'RandomEnabled']=true;this[kind+'Count']=0;
  }
  this.speechRandomEnabled=true;this.pendingEventKind=null;this.activeEventKind=null;this.lastEventKind=null;
  this.speechEnterFade=this.enterFade;this.speechExitFade=this.exitFade;
 }
 syncEnabled(){super.setRandomEnabled(this.speechRandomEnabled||this.stretchRandomEnabled||this.touchRandomEnabled||this.tiltRandomEnabled);}
 setRandomEnabled(enabled){this.speechRandomEnabled=Boolean(enabled);this.syncEnabled();}
 setStretchEnabled(enabled){this.stretchRandomEnabled=Boolean(enabled);this.syncEnabled();}
 setTouchEnabled(enabled){this.touchRandomEnabled=Boolean(enabled);this.syncEnabled();}
 setTiltEnabled(enabled){this.tiltRandomEnabled=Boolean(enabled);this.syncEnabled();}
 requestEvent(kind){if(!['talk','stretch','touch','tilt'].includes(kind))throw new Error('Unknown body event');if(!this.canRequestOneShot)return false;this.pendingEventKind=kind;return super.requestOneShot();}
 requestOneShot(){return this.requestEvent('talk');}
 requestStretch(){return this.requestEvent('stretch');}
 requestTouch(){return this.requestEvent('touch');}
 requestTilt(){return this.requestEvent('tilt');}
 chooseSpeechIndex(){
  const others=this.speechIndices.filter(i=>i!==this.lastSpeechIndex),pool=others.length?others:this.speechIndices;
  const value=Math.max(0,Math.min(1-Number.EPSILON,this.random()));
  return this.lastSpeechIndex=pool[Math.floor(value*pool.length)];
 }
 beginTalk(){
  const choices=[];if(this.speechRandomEnabled)choices.push('talk');for(const k of ['stretch','touch','tilt'])if(this[k+'RandomEnabled'])choices.push(k);
  const others=choices.filter(k=>k!==this.lastEventKind),pool=others.length?others:choices;
  const kind=this.pendingEventKind||pool[Math.min(pool.length-1,Math.floor(this.random()*pool.length))];
  if(!kind)throw new Error('Body event started with no enabled source.');
  this.activeEventKind=this.lastEventKind=kind;this.pendingEventKind=null;
  this.talkIndex=kind==='talk'?this.chooseSpeechIndex():this[kind+'Index'];
  this.enterFade=kind==='talk'?this.speechEnterFade:kind==='touch'?.8:kind==='tilt'?1.0:1.2;this.exitFade=kind==='talk'?this.speechExitFade:kind==='touch'?.8:kind==='tilt'?1.0:1.2;
  super.beginTalk();if(kind!=='talk'){this.talkCount--;this[kind+'Count']++;}this.onChange();
 }
 select(index,immediate=false){this.pendingEventKind=null;this.activeEventKind=null;super.select(index,immediate);}
 getState(){return {...super.getState(),randomEnabled:this.speechRandomEnabled,bodyRandomEnabled:this.randomEnabled,stretchRandomEnabled:this.stretchRandomEnabled,touchRandomEnabled:this.touchRandomEnabled,tiltRandomEnabled:this.tiltRandomEnabled,stretchCount:this.stretchCount,touchCount:this.touchCount,tiltCount:this.tiltCount,pendingEventKind:this.pendingEventKind,activeEventKind:this.activeEventKind,lastEventKind:this.lastEventKind};}
}
