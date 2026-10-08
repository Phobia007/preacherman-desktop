// Geometric foot contact after full-body blending; no authored gesture curves.
export class PlantedFootContact {
 constructor({THREE,root,player}){
  this.THREE=THREE;this.root=root;this.player=player;this.appliedSteps=0;this.maximumCorrectionMeters=0;
  const nodes=[];root.traverse(n=>nodes.push(n));const find=name=>{const canonical=THREE.PropertyBinding.sanitizeNodeName(name);const node=nodes.find(n=>THREE.PropertyBinding.sanitizeNodeName(n.name)===canonical);if(!node)throw new Error('Missing foot-contact bone: '+name);return node;};
  root.updateMatrixWorld(true);
  this.legs=['l','r'].map(side=>{const [hip,knee,ankle,toes]=['thigh','knee','ankle','ball'].map(p=>find('def_'+side+'_'+p));return {hip,knee,ankle,toes,goal:ankle.getWorldPosition(new THREE.Vector3())};});
  this.happyHand=['def_r_shoulder','def_r_elbow','def_r_wrist'].map(find);
  this.speechHands=['l','r'].map(side=>['shoulder','elbow','wrist'].map(part=>find('def_'+side+'_'+part)));
  this.previousAfterStep=player.afterStep;this.hook=()=>{this.previousAfterStep();this.apply();};player.afterStep=this.hook;
 }
 setWorldQuaternion(node,q){const parent=node.parent.getWorldQuaternion(new this.THREE.Quaternion());node.quaternion.copy(parent.invert().multiply(q));this.root.updateMatrixWorld(true);}
 apply(){
  const p=this.player;if(p.currentIndex===p.originalIndex&&!p.blend&&p.mode==='manual')return;
  const T=this.THREE;this.root.updateMatrixWorld(true);
  for(const {hip,knee,ankle,toes,goal} of this.legs){
   const h=hip.getWorldPosition(new T.Vector3()),k=knee.getWorldPosition(new T.Vector3()),a=ankle.getWorldPosition(new T.Vector3());
   this.maximumCorrectionMeters=Math.max(this.maximumCorrectionMeters,a.distanceTo(goal));
   const aq=ankle.getWorldQuaternion(new T.Quaternion()),tq=toes.getWorldQuaternion(new T.Quaternion());
   const l1=k.distanceTo(h),l2=a.distanceTo(k),axis=goal.clone().sub(h).normalize(),distance=Math.max(Math.abs(l1-l2)+1e-7,Math.min(h.distanceTo(goal),l1+l2-1e-7));
   const along=(l1*l1-l2*l2+distance*distance)/(2*distance);
   const pole=k.clone().sub(h).addScaledVector(axis,-k.clone().sub(h).dot(axis));
   if(pole.length()<1e-6)pole.set(0,0,1).addScaledVector(axis,-axis.z);
   const mid=h.clone().addScaledVector(axis,along).addScaledVector(pole.normalize(),Math.sqrt(Math.max(0,l1*l1-along*along)));
   const swing=new T.Quaternion().setFromUnitVectors(k.clone().sub(h).normalize(),mid.clone().sub(h).normalize());
   this.setWorldQuaternion(hip,swing.multiply(hip.getWorldQuaternion(new T.Quaternion())));
   const updatedKnee=knee.getWorldPosition(new T.Vector3()),updatedAnkle=ankle.getWorldPosition(new T.Vector3());
   const lowerSwing=new T.Quaternion().setFromUnitVectors(updatedAnkle.sub(updatedKnee).normalize(),goal.clone().sub(updatedKnee).normalize());
   this.setWorldQuaternion(knee,lowerSwing.multiply(knee.getWorldQuaternion(new T.Quaternion())));
   this.setWorldQuaternion(ankle,aq);this.setWorldQuaternion(toes,tq);
  }
  this.appliedSteps++;
  // The preserved Happy take brushes its right fingertips against the thigh
  // near its end. Fit a small constant clearance, weighted with that action;
  // the original recorded curves and model file remain unchanged.
  const happy=p.actions[p.originalIndex],weight=happy.isScheduled()&&happy.enabled?happy.getEffectiveWeight():0;
  if(weight>1e-7){
   const [upper,lower,wrist]=this.happyHand,h=upper.getWorldPosition(new T.Vector3()),a=wrist.getWorldPosition(new T.Vector3());
   const offset=new T.Vector3(-.025*weight,0,0).applyMatrix4(this.root.matrixWorld).sub(this.root.getWorldPosition(new T.Vector3()));
   const swing=new T.Quaternion().setFromUnitVectors(a.clone().sub(h).normalize(),a.clone().add(offset).sub(h).normalize());
   const uq=upper.getWorldQuaternion(new T.Quaternion()),lq=lower.getWorldQuaternion(new T.Quaternion()),wq=wrist.getWorldQuaternion(new T.Quaternion());
   this.setWorldQuaternion(upper,swing.clone().multiply(uq));this.setWorldQuaternion(lower,swing.clone().multiply(lq));this.setWorldQuaternion(wrist,wq);
  }
  // A joint-space fade can sweep a hand through the thigh even when both
  // endpoint poses clear it. A small bell-shaped clearance exists only while
  // a speaking take blends against the idle pose, with zero endpoint offset.
  if(p.blend&&p.speechIndices){
   const speechWeight=p.speechIndices.reduce((sum,index)=>{const a=p.actions[index];return sum+(a.isScheduled()&&a.enabled?a.getEffectiveWeight():0);},0),bell=4*speechWeight*(1-speechWeight);
   if(bell>1e-7)this.speechHands.forEach(([upper,lower,wrist],i)=>{
    const h=upper.getWorldPosition(new T.Vector3()),a=wrist.getWorldPosition(new T.Vector3()),offset=new T.Vector3((i===0?1:-1)*.065*bell,0,.03*bell).applyMatrix4(this.root.matrixWorld).sub(this.root.getWorldPosition(new T.Vector3()));
    const swing=new T.Quaternion().setFromUnitVectors(a.clone().sub(h).normalize(),a.clone().add(offset).sub(h).normalize()),uq=upper.getWorldQuaternion(new T.Quaternion()),lq=lower.getWorldQuaternion(new T.Quaternion()),wq=wrist.getWorldQuaternion(new T.Quaternion());
    this.setWorldQuaternion(upper,swing.clone().multiply(uq));this.setWorldQuaternion(lower,swing.clone().multiply(lq));this.setWorldQuaternion(wrist,wq);
   });
  }
 }
 destroy(){if(this.player.afterStep===this.hook)this.player.afterStep=this.previousAfterStep;this.legs=[];}
}
