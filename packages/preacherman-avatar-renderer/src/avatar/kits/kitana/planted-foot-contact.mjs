// Geometric foot contact after full-body blending; no authored gesture curves.
export class PlantedFootContact {
 constructor({THREE,root,player}){
  this.THREE=THREE;this.root=root;this.player=player;this.appliedSteps=0;this.maximumCorrectionMeters=0;
  const nodes=[];root.traverse(n=>nodes.push(n));const find=name=>{const canonical=THREE.PropertyBinding.sanitizeNodeName(name);const node=nodes.find(n=>THREE.PropertyBinding.sanitizeNodeName(n.name)===canonical);if(!node)throw new Error('Missing foot-contact bone: '+name);return node;};
  root.updateMatrixWorld(true);
  this.legs=['left','right'].map(side=>{const [hip,knee,ankle,toes]=['thigh','knee','ankle','toes'].map(p=>find('leg '+side+' '+p));return {hip,knee,ankle,toes,goal:ankle.getWorldPosition(new THREE.Vector3())};});
  this.previousAfterStep=player.afterStep;this.hook=()=>{this.previousAfterStep();this.apply();};player.afterStep=this.hook;
 }
 setWorldQuaternion(node,q){const parent=node.parent.getWorldQuaternion(new this.THREE.Quaternion());node.quaternion.copy(parent.invert().multiply(q));this.root.updateMatrixWorld(true);}
 apply(){
  const p=this.player,newSpeech=(p.speechIndices||[]).filter(i=>i!==p.speechIndex);
  const speechBlend=newSpeech.includes(p.currentIndex)||p.blend?.sources.some(s=>newSpeech.some(i=>p.actions[i]===s.action));
  if(!speechBlend&&(!['touch','tilt'].includes(p.activeEventKind)||!['entering_talk','talking','returning_idle'].includes(p.mode)))return;
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
 }
 destroy(){if(this.player.afterStep===this.hook)this.player.afterStep=this.previousAfterStep;this.legs=[];}
}
