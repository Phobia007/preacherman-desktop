import {CapturedFacePlayer} from './captured-face-player.mjs';
export const mappedFaceChannels=Object.freeze(['browDownLeft','browDownRight','browInnerUp','browOuterUpLeft','browOuterUpRight','eyeBlinkLeft','eyeBlinkRight','eyeSquintLeft','eyeSquintRight','eyeWideLeft','eyeWideRight','cheekSquintLeft','cheekSquintRight','mouthSmileLeft','mouthSmileRight','mouthFrownLeft','mouthFrownRight',...['Down','In','Out','Up'].flatMap(d=>['Left','Right'].map(s=>'eyeLook'+d+s))]);
// ARKit retarget calibration is authored. Expression curves are recorded human
// motion; restore offsets before the body mixer to prevent accumulation.
export class KitanaFaceLayer {
  constructor({THREE,root,random=Math.random}){
    this.T=THREE;this.root=root;this.random=random;this.saved=[];this.clock=0;this.blinkAt=3+random()*3;this.blinkTime=-1;
    this.jaw=0;this.pulse=0;this.intensity=0;this.target={state:'idle',emotion:'neutral',intensity:0};this.emotionAge=0;this.capture=new CapturedFacePlayer();
    const nodes=[];root.traverse(n=>nodes.push(n));const canonical=THREE.PropertyBinding.sanitizeNodeName;
    this.find=name=>nodes.find(n=>canonical(n.name)===canonical(name));this.head=this.find('head neck upper');this.jawBone=this.find('head jaw');
    if(!this.head||!this.jawBone)throw new Error('Kitana 面部骨骼缺失');this.pairs=[];
    for(const side of ['left','right'])for(let index=1;index<=3;index++){
      const upper=this.find(`head eyelid ${side} upper ${index}`),lower=this.find(`head eyelid ${side} lower ${index}`);
      if(upper&&lower)this.pairs.push({upper,lower,side});
    }
    if(this.pairs.length!==6)throw new Error('Kitana 眼皮映射不完整');
    this.nodes=[this.jawBone,...this.pairs.flatMap(p=>[p.upper,p.lower]),this.find('head eyebrow center'),...['left','right'].flatMap(side=>[1,2,3].map(i=>this.find(`head eyebrow ${side} ${i}`))),...['left','right'].flatMap(side=>[this.find(`head lip corner ${side}`),this.find(`head eyeball ${side}`)])].filter(Boolean);
  }
  setState(target){if(target.emotion!==this.target.emotion||target.state!==this.target.state)this.emotionAge=0;this.target={...target};this.capture.setState(target);if(target.state!=='speaking')this.pulse=0;}
  previewExpression(id,intensity=.45){return this.capture.play(id,intensity);}
  getState(){return this.capture.getState();}
  boundary(event){if(this.target.state==='speaking')this.pulse=Number.isFinite(event?.energy)?Math.max(0,Math.min(.85,event.energy)):.6;}
  restore(){for(const {node,p,q} of this.saved){node.position.copy(p);node.quaternion.copy(q);}this.saved=[];}
  shift(node,worldDelta){if(!node)return;const inverse=new this.T.Matrix4().copy(node.parent.matrixWorld).invert();const origin=new this.T.Vector3().applyMatrix4(inverse);node.position.add(worldDelta.clone().applyMatrix4(inverse).sub(origin));}
  apply(delta){
    this.restore();const T=this.T;delta=Math.max(0,Math.min(.2,Number.isFinite(delta)?delta:0));this.clock+=delta;this.emotionAge+=delta;
    this.saved=this.nodes.map(node=>({node,p:node.position.clone(),q:node.quaternion.clone()}));this.root.updateMatrixWorld(true);
    const up=this.head.getWorldPosition(new T.Vector3()).sub(this.find('head neck lower').getWorldPosition(new T.Vector3())).normalize();
    const right=this.find('head eyeball right').getWorldPosition(new T.Vector3()).sub(this.find('head eyeball left').getWorldPosition(new T.Vector3())).normalize();
    const c=this.capture.update(delta),captureState=this.capture.getState(),active=captureState.playing||captureState.blending;
    // Procedural blinking is restricted to neutral idle, outside recorded clips.
    let blink=0;
    if(!active){
      if(this.clock>=this.blinkAt&&this.blinkTime<0)this.blinkTime=0;
      if(this.blinkTime>=0){this.blinkTime+=delta;blink=Math.sin(Math.PI*Math.min(1,this.blinkTime/.2))**2;if(this.blinkTime>=.2){this.blinkTime=-1;this.blinkAt=this.clock+3.5+this.random()*3;}}
    }else{this.blinkTime=-1;this.blinkAt=this.clock+3.5+this.random()*3;}
    const positions=this.pairs.map(p=>({...p,u:p.upper.getWorldPosition(new T.Vector3()),l:p.lower.getWorldPosition(new T.Vector3())}));
    for(const {upper,lower,u,l,side} of positions){
      const s=side==='left'?'Left':'Right',gap=u.clone().sub(l);
      const close=Math.max(blink,Math.min(1,c['eyeBlink'+s]+c['eyeSquint'+s]*.20+c['cheekSquint'+s]*.08));const wide=c['eyeWide'+s]*.10*(1-close);
      this.shift(upper,gap.clone().multiplyScalar(-.68*close+wide));this.shift(lower,gap.multiplyScalar(.32*close-wide*.35));
    }
    this.shift(this.find('head eyebrow center'),up.clone().multiplyScalar(.004*c.browInnerUp));
    for(const side of ['left','right']){
      const s=side==='left'?'Left':'Right',down=c['browDown'+s],outer=c['browOuterUp'+s];
      const eye=this.find(`head eyeball ${side}`),inverse=eye.parent.getWorldQuaternion(new T.Quaternion()).invert();
      const pitch=(c['eyeLookUp'+s]-c['eyeLookDown'+s])*8*Math.PI/180,yaw=(c['eyeLookOut'+s]-c['eyeLookIn'+s])*(side==='left'?1:-1)*8*Math.PI/180;
      eye.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(up.clone().applyQuaternion(inverse),yaw)).premultiply(new T.Quaternion().setFromAxisAngle(right.clone().applyQuaternion(inverse),pitch)).normalize();
      for(let i=1;i<=3;i++)this.shift(this.find(`head eyebrow ${side} ${i}`),up.clone().multiplyScalar(.003*(c.browInnerUp*(4-i)/3+outer*i/3-down*.65)));
      const smile=c['mouthSmile'+s],frown=c['mouthFrown'+s];
      this.shift(this.find(`head lip corner ${side}`),up.clone().multiplyScalar(.006*smile-.003*frown).addScaledVector(right,(side==='right'?1:-1)*.003*smile));
    }
    // Captured speech phonemes belong to different words: actual audible voice
    // owns the jaw, while recorded smile and brow motion may continue.
    this.pulse*=Math.exp(-delta/.16);const goal=this.target.state==='speaking'?this.pulse:0;this.jaw+=(goal-this.jaw)*(1-Math.exp(-delta/.06));
    const localAxis=right.clone().applyQuaternion(this.jawBone.parent.getWorldQuaternion(new T.Quaternion()).invert());
    this.jawBone.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(localAxis,-this.jaw*5*Math.PI/180)).normalize();
    this.root.updateMatrixWorld(true);return {blink,jaw:this.jaw,intensity:this.target.intensity||0,capture:captureState};
  }
  dispose(){this.restore();this.capture.dispose();this.nodes=[];}
}
