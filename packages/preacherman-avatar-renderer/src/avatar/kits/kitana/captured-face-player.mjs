import {capturedFaceLibrary} from './captured-face-clips.mjs';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const ease=x=>{x=clamp(x);return x*x*(3-2*x);};
export function sampleCapturedFace(clip,seconds){
  let at=clamp(seconds*clip.fps,0,clip.values.length-1);if(Math.abs(at-Math.round(at))<1e-10)at=Math.round(at);
  const i=Math.floor(at),j=Math.min(i+1,clip.values.length-1),t=at-i;
  return clip.values[i].map((v,k)=>v+(clip.values[j][k]-v)*t);
}
// Recorded one-shots at 20 fps. Only the entry/exit weights are authored.
export class CapturedFacePlayer{
  constructor(){this.channels=capturedFaceLibrary.channels;this.clips=new Map(capturedFaceLibrary.clips.map(c=>[c.id,c]));this.current=null;this.values=Array(51).fill(0);this.from=this.values.slice();this.blendTime=1;this.lastKey=null;this.weight=0;}
  play(id,strength=.45){
    const clip=this.clips.get(id);this.from=this.values.slice();this.blendTime=0;
    this.current=clip?{clip,time:0,strength:clamp(Number.isFinite(strength)?strength:.45,0,.65)}:null;
    return Boolean(clip);
  }
  setState(state){
    if(state.error||state.state==='error'||state.state==='idle'&&(!state.expressionId||state.expressionId==='neutral')){this.lastKey=null;if(this.current)this.play('neutral');return;}
    const id=state.state==='listening'?'attentive':state.expressionId;
    if(!['listening','speaking','idle'].includes(state.state))return;
    const key=String(state.epoch)+':'+id;
    if(key===this.lastKey)return;
    this.lastKey=key;this.play(id,state.state==='listening'?.35:state.intensity);
  }
  update(delta){
    delta=clamp(Number.isFinite(delta)?delta:0,0,.2);this.blendTime+=delta;
    let desired=Array(51).fill(0);this.weight=0;
    if(this.current){
      const {clip,strength}=this.current;this.current.time+=delta;const time=this.current.time;
      if(time<=clip.duration){this.weight=ease((clip.duration-time)/.65);desired=sampleCapturedFace(clip,time).map((v,i)=>v*this.weight*(i===8||i===9?1:strength/.65));}
      else this.current=null;
    }
    const blend=ease(this.blendTime/.45);this.values=desired.map((v,i)=>clamp(this.from[i]+(v-this.from[i])*blend));
    return Object.fromEntries(this.channels.map((name,i)=>[name,this.values[i]]));
  }
  getState(){return {expressionId:this.current?.clip.id||'neutral',time:this.current?.time||0,duration:this.current?.clip.duration||0,source:this.current?.clip.sourceEntry||null,playing:Boolean(this.current),blending:this.blendTime<.45};}
  dispose(){this.current=null;this.values.fill(0);this.from.fill(0);}
}
