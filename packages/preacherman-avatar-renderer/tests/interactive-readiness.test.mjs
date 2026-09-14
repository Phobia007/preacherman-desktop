import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const pkg=join(import.meta.dirname,'..');
const names={'black-widow-aquatic-assassin':'Black Widow','clove-t-pose':'Clove'};

// Execute the real component with controlled hook commits. Canvas intentionally
// retains its previous child while a transient model selection has not rendered.
async function componentHarness(file,exportName,extraServices={}){
 const slots=[];let index=0,dirty=false,effects=[];
 const state=init=>{const i=index++;if(!(i in slots))slots[i]=typeof init==='function'?init():init;return [slots[i],v=>{const next=typeof v==='function'?v(slots[i]):v;if(!Object.is(next,slots[i])){slots[i]=next;dirty=true;}}];};
 const effect=(fn,deps)=>{const i=index++;if(!slots[i]||deps?.some((d,j)=>!Object.is(d,slots[i].deps?.[j]))){effects.push(()=>{slots[i]?.cleanup?.();slots[i]={deps,cleanup:fn()};});}};
 const memo=(fn,deps)=>{const i=index++;if(!slots[i]||deps.some((d,j)=>!Object.is(d,slots[i].deps[j])))slots[i]={deps,value:fn()};return slots[i].value;};
 const react={useState:state,useRef:init=>state(()=>({current:init}))[0],useCallback:(fn,deps)=>memo(()=>fn,deps),useMemo:memo,useEffect:effect,useLayoutEffect:effect};
 const jsx=(_,props)=>({type:_,props});const error=class extends Error{};
 const services={avatarModelName:id=>names[id],avatarDefaultActionId:()=> 'idle.default',useAvatarInteractionState:()=> 'idle',localAvatarAssetBaseUrl:id=>'/assets/avatars/'+id,...extraServices};
 const require=name=>name==='react'?react:name==='react/jsx-runtime'?{jsx,jsxs:jsx,Fragment:'Fragment'}:new Proxy(services,{get:(o,key)=>key in o?o[key]:key==='normalizeAvatarError'?e=>e:key==='AvatarError'?error:String(key)});
 const exports={};const source=await readFile(file,'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 const browser={addEventListener(){},removeEventListener(){},WebGLRenderingContext:{},devicePixelRatio:1};
 vm.runInNewContext(code,{exports,require,window:browser,document:{hidden:false,...browser},setTimeout,clearTimeout});
 return {render(props){let tree;for(let i=0;i<12;i++){index=0;dirty=false;effects=[];tree=exports[exportName](props);for(const f of effects)f();if(!dirty)return tree;}throw Error('Hook updates did not settle');},close(){for(const s of slots)s?.cleanup?.();}};
}
function find(tree,type){if(!tree||typeof tree!=='object')return null;if(tree.type===type)return tree;for(const c of [tree.props?.children].flat(Infinity)){const result=find(c,type);if(result)return result;}return null;}

test('a retained Canvas model stays ready after an unrendered A-B-A selection and ignores stale completion',async()=>{
 const h=await componentHarness(join(pkg,'src/InteractiveAvatarViewport.tsx'),'InteractiveAvatarViewport');
 const a={modelId:'black-widow-aquatic-assassin',assetBaseUrl:'/widow'},b={modelId:'clove-t-pose',assetBaseUrl:'/clove'};
 let readyCalls=0;a.onReady=b.onReady=()=>readyCalls++;
 try{
  let tree=h.render(a);assert.equal(tree.props['data-avatar-load-state'],'loading');
  find(tree,'InteractiveAvatarScene').props.onFirstFrame({drawCalls:1,triangles:1});
  tree=h.render(a);assert.equal(tree.props['data-avatar-load-state'],'ready');assert.equal(tree.props['aria-label'],'Interactive Black Widow model');
  tree=h.render(b);const pending=find(tree,'InteractiveAvatarScene').props;assert.equal(tree.props['data-avatar-load-state'],'loading');
  tree=h.render(a);assert.equal(tree.props['data-avatar-load-state'],'ready');
  pending.onFirstFrame({drawCalls:2,triangles:2});pending.onAnimationError(new Error('stale load'));
  tree=h.render(a);assert.equal(tree.props['data-avatar-load-state'],'ready');assert.equal(readyCalls,1);
  find(tree,'InteractiveAvatarScene').props.onAnimationError(new Error('current load'));
  tree=h.render(a);assert.equal(tree.props['data-avatar-load-state'],'error');
  tree=h.render(b);assert.equal(tree.props['data-avatar-load-state'],'loading');
  find(tree,'InteractiveAvatarScene').props.onFirstFrame({drawCalls:2,triangles:2});
  tree=h.render(b);assert.equal(tree.props['data-avatar-load-state'],'ready');assert.equal(readyCalls,2);
 }finally{h.close();}
});

test('host loading chrome also follows the last actually rendered character',async()=>{
 const h=await componentHarness(join(pkg,'../../apps/preacherman-demo-host/src/gallery/CortanaModelStage.tsx'),'CortanaModelStage');
 const a={modelId:'black-widow-aquatic-assassin',ariaLabel:'Scene',renderActive:false},b={...a,modelId:'clove-t-pose'};
 const loading=tree=>JSON.stringify(tree).includes('Loading Black Widow');
 try{
  let tree=h.render(a);assert.equal(loading(tree),true);find(tree,'InteractiveAvatarViewport').props.onReady();
  tree=h.render(a);assert.equal(loading(tree),false);h.render(b);tree=h.render(a);assert.equal(loading(tree),false);
  find(tree,'InteractiveAvatarViewport').props.onError();tree=h.render(a);assert.ok(JSON.stringify(tree).includes('The local model could not be loaded.'));
 }finally{h.close();}
});

test('changing host callbacks preserves the current model adapter and forwards errors to the latest owner',async()=>{
 const adapters=[];let first=0,latest=0;
 class Adapter {constructor(options){this.options=options;adapters.push(this);}}
 class Controller {load(){return new Promise(()=>{});}dispose(){}}
 const profile={avatarId:'black-widow-aquatic-assassin',modelFile:'avatar.glb',actions:[],rigId:'widow',defaultActionId:'idle.default',stateMap:{idle:'idle.default'},jawBone:null};
 const h=await componentHarness(join(pkg,'src/AvatarModel.tsx'),'AvatarModel',{
  importedAvatarProfiles:{'black-widow-aquatic-assassin':profile},avatarUsesHologram:()=>false,
  useTexture:()=>[],useThree:()=>({gl:{},invalidate(){},size:{width:1,height:1}}),useFrame(){},
  Vector2:class {},ThreeAvatarAnimationAdapter:Adapter,CortanaAnimationController:Controller,
 });
 const props={modelId:'black-widow-aquatic-assassin',assetBaseUrl:'/widow',onAnimationError:()=>first++};
 try{h.render(props);h.render({...props,onAnimationError:()=>latest++});assert.equal(adapters.length,1);adapters[0].options.onError(new Error('current'));assert.equal(first,0);assert.equal(latest,1);}finally{h.close();}
});

for (const cancel of [false,true]) test(`character shader preparation keeps rendering responsive and handles cancellation=${cancel}`,async()=>{
 let finish,disposed=0,firstFrames=0,afterFrame;const root={name:'prepared character'};
 const pending=new Promise(resolve=>{finish=resolve;});
 const gl={compileAsync(object,camera,scene){assert.equal(object,root);assert.equal(camera,'camera');assert.equal(scene,'scene');return pending;},info:{render:{calls:4,triangles:20}}};
 class Adapter {getRoot(){return root;}}
 class Controller {load(){return Promise.resolve();}setState(){return Promise.resolve();}listActions(){return [];}dispose(){disposed++;}}
 const profile={avatarId:'black-widow-aquatic-assassin',modelFile:'avatar.glb',actions:[],rigId:'widow',defaultActionId:'idle.default',stateMap:{idle:'idle.default'},jawBone:null,transform:{scale:1,verticalOffset:0,rotationY:0}};
 const h=await componentHarness(join(pkg,'src/AvatarModel.tsx'),'AvatarModel',{
  importedAvatarProfiles:{'black-widow-aquatic-assassin':profile},avatarUsesHologram:()=>false,
  useTexture:()=>[],useThree:()=>({gl,camera:'camera',scene:'scene',invalidate(){},size:{width:1,height:1}}),useFrame(){},
  addAfterEffect:fn=>{afterFrame=fn;return ()=>{};},Vector2:class {},ThreeAvatarAnimationAdapter:Adapter,CortanaAnimationController:Controller,
 });
 const props={modelId:'black-widow-aquatic-assassin',assetBaseUrl:'/widow',onAnimationError:e=>assert.fail(String(e)),onFirstFrame:()=>firstFrames++};
 const flush=()=>new Promise(resolve=>setTimeout(resolve,5));
 let closed=false;
 try{
  h.render(props);await flush();assert.equal(h.render(props),null,'GPU preparation must precede mounting');
  assert.equal(afterFrame,undefined,'loading is not reported ready');
  await flush(); // Let the asynchronous compile begin before cancelling it.
  if(cancel){h.close();closed=true;await flush();assert.equal(disposed,0,'in-flight shader resources remain owned');}
  finish();await flush();
  if(cancel){assert.equal(disposed,1);assert.equal(firstFrames,0);}
  else{const tree=h.render(props);assert.equal(find(tree,'primitive').props.object,root);afterFrame();assert.equal(firstFrames,1);}
 }finally{if(!closed)h.close();finish();await flush();}
});
