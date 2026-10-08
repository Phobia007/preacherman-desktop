// Geometric clearance after blending; recorded body curves stay unchanged.
export class HandContact {
 constructor({THREE,root,player}){
  this.T=THREE;this.root=root;this.player=player;this.maximumShiftMeters=0;this.appliedSteps=0;
  const nodes=[];root.traverse(n=>nodes.push(n));const find=name=>nodes.find(n=>THREE.PropertyBinding.sanitizeNodeName(n.name)===THREE.PropertyBinding.sanitizeNodeName(name));
  this.hands=['left','right'].map((side,i)=>({sign:i===0?1:-1,upper:find(`arm ${side} shoulder 2`),lower:find(`arm ${side} elbow`),wrist:find(`arm ${side} wrist`),hip:find(`leg ${side} thigh`),knee:find(`leg ${side} knee`),points:nodes.filter(n=>THREE.PropertyBinding.sanitizeNodeName(n.name).startsWith(THREE.PropertyBinding.sanitizeNodeName(`arm ${side} finger`)))}));
  this.previous=player.afterStep;this.hook=d=>{this.previous(d);this.apply();};player.afterStep=this.hook;
 }
 worldQ(n,q){const parent=n.parent.getWorldQuaternion(new this.T.Quaternion());n.quaternion.copy(parent.invert().multiply(q));this.root.updateMatrixWorld(true);}
 point(n){return n.getWorldPosition(new this.T.Vector3()).applyMatrix4(this.inverseRoot);}
 apply(){
  const p=this.player,indices=(p.speechIndices||[]).filter(i=>i!==p.speechIndex);
  if(!p.blend||(!indices.includes(p.currentIndex)&&!p.blend.sources.some(s=>indices.some(i=>p.actions[i]===s.action))))return;
  const t=Math.max(0,Math.min(1,p.blend.elapsed/p.blend.duration));
  const gate=16*t*t*(1-t)*(1-t)*Math.min(1,indices.reduce((sum,i)=>sum+(p.actions[i].isScheduled()?p.actions[i].getEffectiveWeight():0),0));
  const T=this.T;this.root.updateMatrixWorld(true);this.inverseRoot=new T.Matrix4().copy(this.root.matrixWorld).invert();
  for(const hand of this.hands)for(let iteration=0;iteration<2;iteration++){
   const {sign,upper,lower,wrist,hip,knee,points}=hand,h=this.point(upper),a=this.point(wrist),thigh=this.point(hip),k=this.point(knee);let required=0;
   for(const n of [wrist,...points]){
    const v=this.point(n);if(v.y<k.y-.02||v.y>thigh.y+.03)continue;
    const t=Math.max(0,Math.min(1,(thigh.y-v.y)/(thigh.y-k.y))),center=thigh.clone().lerp(k,t),depth=v.z-center.z;
    const radius=.135,edge=Math.max(0,Math.min(1,(radius+.03-Math.abs(depth))/.03));
    const contact=edge*edge*(3-2*edge);
    required=Math.max(required,(Math.sqrt(Math.max(0,radius*radius-depth*depth))+.070-sign*(v.x-center.x))*contact);
   }
   required*=gate;if(required<1e-7)continue;
   const target=a.clone().add(new T.Vector3(sign*required,0,0)),localSwing=new T.Quaternion().setFromUnitVectors(a.clone().sub(h).normalize(),target.sub(h).normalize()),rootQ=this.root.getWorldQuaternion(new T.Quaternion()),swing=rootQ.clone().multiply(localSwing).multiply(rootQ.clone().invert());
   const uq=upper.getWorldQuaternion(new T.Quaternion()),lq=lower.getWorldQuaternion(new T.Quaternion()),wq=wrist.getWorldQuaternion(new T.Quaternion());
   this.worldQ(upper,swing.clone().multiply(uq));this.worldQ(lower,swing.clone().multiply(lq));this.worldQ(wrist,wq);
   this.maximumShiftMeters=Math.max(this.maximumShiftMeters,this.point(wrist).distanceTo(a));this.appliedSteps++;
  }
 }
 destroy(){if(this.player.afterStep===this.hook)this.player.afterStep=this.previous;this.hands=[];}
}
