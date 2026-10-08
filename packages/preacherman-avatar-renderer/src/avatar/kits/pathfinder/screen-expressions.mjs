// Select the twelve authored game-style faces already embedded in this model.
// The chest mesh, UVs and atlas pixels are not modified.
export const screenExpressions=[
 {id:'angry',label:'生气',column:0,row:0},
 {id:'defeated',label:'晕倒',column:1,row:0},
 {id:'alert',label:'警示',column:2,row:0},
 {id:'glitch',label:'故障',column:3,row:0},
 {id:'happy',label:'友好笑脸',column:0,row:1},
 {id:'ko',label:'KO！',column:1,row:1},
 {id:'love',label:'爱心眼',column:2,row:1},
 {id:'awkward',label:'害羞苦笑',column:3,row:1},
 {id:'curious',label:'疑惑',column:0,row:2},
 {id:'sad',label:'难过哭脸',column:1,row:2},
 {id:'blank',label:'休息空屏',column:2,row:2},
 {id:'portrait',label:'点赞小机器人',column:3,row:2}
];
export const screenStateExpressions={idle:'happy',listening:'happy',thinking:'curious',speaking:'happy',success:'portrait',error:'alert',sleeping:'blank',wakeup:'happy'};
export class PathfinderScreenExpressions {
 constructor({THREE,root,onChange=()=>{}}){
  this.THREE=THREE;this.root=root;this.onChange=onChange;this.elapsed=0;this.automatic=true;this.state='idle';this.current='happy';this.target='happy';this.manual=null;this.emotion=null;this.replyExpression=null;this.transition=null;this.pending=null;this.destroyed=false;this.speechLevel=0;this.receivedSpeechLevel=false;
  const matches=[];root.traverse(n=>{if(n.isMesh){const materials=Array.isArray(n.material)?n.material:[n.material];materials.forEach((m,index)=>{if(m?.name==='pathfinder_base_emotes')matches.push({mesh:n,index,material:m});});}});
  if(matches.length!==1)throw new Error('Expected exactly one Pathfinder chest screen');this.binding=matches[0];const source=this.binding.material;
  if(!source.map)throw new Error('Pathfinder screen atlas is missing');
  this.texture=source.map.clone();this.texture.offset.set(0,0);this.texture.repeat.set(1,1);this.texture.rotation=0;this.texture.updateMatrix();
  this.uniforms={screenFrom:{value:new THREE.Vector2(0,0)},screenTo:{value:new THREE.Vector2(0,0)},screenBlend:{value:1},screenPulse:{value:1}};
  this.material=new THREE.MeshBasicMaterial({name:'pathfinder_screen_expressions',map:this.texture,side:source.side,toneMapped:false});
  this.material.onBeforeCompile=shader=>{Object.assign(shader.uniforms,this.uniforms);shader.fragmentShader='uniform vec2 screenFrom;\nuniform vec2 screenTo;\nuniform float screenBlend;\nuniform float screenPulse;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
    vec4 faceA = texture2D(map, vMapUv + screenFrom);
    vec4 faceB = texture2D(map, vMapUv + screenTo);
    diffuseColor *= mix(faceA, faceB, screenBlend);
    diffuseColor.rgb *= screenPulse;
    #endif`);};
  this.material.customProgramCacheKey=()=> 'pathfinder-screen-original-atlas-v1';
  if(Array.isArray(this.binding.mesh.material)){this.originalMaterials=this.binding.mesh.material;this.binding.mesh.material=[...this.originalMaterials];this.binding.mesh.material[this.binding.index]=this.material;}else this.binding.mesh.material=this.material;
 }
 offset(id){const e=screenExpressions.find(e=>e.id===id);if(!e)throw new Error('Unknown Pathfinder screen expression: '+id);return new this.THREE.Vector2(e.column*.25,(e.row-1)*.375);}
 request(id){this.offset(id);if(this.transition){this.pending=id;return;}if(id===this.current)return;this.target=id;this.uniforms.screenFrom.value.copy(this.offset(this.current));this.uniforms.screenTo.value.copy(this.offset(id));this.uniforms.screenBlend.value=0;this.transition={elapsed:0,duration:.24};this.onChange();}
 resolve(){const id=!this.automatic?this.manual??'happy':this.replyExpression??this.emotion?.id??screenStateExpressions[this.state];this.request(id);}
 holdReplyExpression(id){if(this.destroyed)throw new Error('Disposed screen');this.offset(id);this.replyExpression=id;this.emotion=null;this.automatic=true;this.manual=null;this.resolve();this.onChange();}
 releaseReplyExpression(){this.replyExpression=null;this.resolve();this.onChange();}
 setExpression(id){if(this.destroyed)throw new Error('Disposed screen');this.offset(id);this.manual=id;this.automatic=false;this.resolve();this.onChange();}
 setAutomatic(enabled){if(this.destroyed)throw new Error('Disposed screen');this.automatic=Boolean(enabled);if(this.automatic)this.manual=null;this.resolve();this.onChange();}
 setState(state){if(!Object.hasOwn(screenStateExpressions,state))throw new Error('Unknown companion state');if(this.state===state)return;this.state=state;if(state!=='speaking'){this.receivedSpeechLevel=false;this.speechLevel=0;}this.resolve();this.onChange();}
 setEmotion(id,{durationSeconds=5}={}){this.offset(id);if(!Number.isFinite(durationSeconds)||durationSeconds<.25||durationSeconds>120)throw new Error('Emotion duration must be 0.25–120 seconds');this.emotion={id,remaining:durationSeconds};this.automatic=true;this.manual=null;this.resolve();this.onChange();}
 clearEmotion(){this.emotion=null;this.resolve();this.onChange();}
 setSpeechLevel(level){if(!Number.isFinite(level))throw new Error('Invalid speech level');this.receivedSpeechLevel=true;this.speechLevel=Math.max(0,Math.min(1,level));}
 update(delta){if(this.destroyed||!Number.isFinite(delta)||delta<=0)return;this.elapsed+=delta;
  if(this.emotion){this.emotion.remaining=Math.max(0,this.emotion.remaining-delta);if(this.emotion.remaining===0){this.emotion=null;this.resolve();this.onChange();}}
  if(this.transition){const t=this.transition;t.elapsed=Math.min(t.duration,t.elapsed+delta);const x=t.elapsed/t.duration;this.uniforms.screenBlend.value=x*x*(3-2*x);if(x>=1){this.current=this.target;this.uniforms.screenFrom.value.copy(this.uniforms.screenTo.value);this.transition=null;const pending=this.pending;this.pending=null;if(pending)this.request(pending);this.onChange();}}
  const active=this.automatic&&this.state==='speaking',level=this.receivedSpeechLevel?this.speechLevel:(Math.sin(this.elapsed*2*Math.PI)*.5+.5);this.uniforms.screenPulse.value=active?.94+.06*level:1;
 }
 getState(){return {automatic:this.automatic,state:this.state,expression:this.current,target:this.target,manual:this.manual,emotion:this.emotion?{...this.emotion}:null,replyExpression:this.replyExpression,blending:Boolean(this.transition),atlasCells:12,screenMesh:this.binding.mesh.name};}
 dispose(){if(this.destroyed)return;this.destroyed=true;if(this.originalMaterials)this.binding.mesh.material=this.originalMaterials;else this.binding.mesh.material=this.binding.material;this.texture.dispose();this.material.dispose();this.onChange=()=>{};}
}
