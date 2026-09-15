import fs from "node:fs";
import path from "node:path";

const runtimeRoot = path.resolve(
  process.cwd(),
  "apps/preacherman-demo-host/public/active-theory-gallery",
);

if (!runtimeRoot.endsWith(path.join("public", "active-theory-gallery"))) {
  throw new Error(`Unexpected runtime root: ${runtimeRoot}`);
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected one source match, found ${count}`);
  }
  return source.replace(before, after);
}

function replaceExact(source, before, after, expectedCount, label) {
  if (source.includes(after)) return source;
  const count = source.split(before).length - 1;
  if (count !== expectedCount) {
    throw new Error(`${label}: expected ${expectedCount} source matches, found ${count}`);
  }
  return source.split(before).join(after);
}

const scenePath = path.join(
  runtimeRoot,
  "gallery",
  "assets",
  "js",
  "app.1780406240914.js",
);
let scene = fs.readFileSync(scenePath, "utf8");

const originalSpine = "let batch=_this.createFragment(MeshBatch),meshes=[];for(let i=0;i<40;i++){let mesh=_this.mesh.clone();mesh.position.set(0,0,0),mesh.position.y=-.65*i+4,mesh.rotation.y=.4*i,batch.add(mesh),meshes.push(mesh)}_this.mesh.visible=!1,_this.startRender((_=>{_this.group.position.copy(_this.mesh.position)}));";
const firstPassReplacement = "let cortanaRoot=new Group;try{let loader=new GLTFLoader,cortanaNodes=await loader.parse(\"/assets/avatars/cortana/cortana-runtime.glb\");for(let i=0;i<cortanaNodes.length;i++)cortanaRoot.add(cortanaNodes[i]);cortanaRoot.position.set(0,-4.82,0),cortanaRoot.rotation.y=-Math.PI/2,cortanaRoot.scale.set(1.06,1.06,1.06),cortanaRoot.traverse?.((node=>{node.frustumCulled=!1})),_this.group.add(cortanaRoot),window.__PREACHERMAN_CORTANA_READY__=!0,parent.postMessage({type:\"preacherman-active-gallery-ready\"},\"*\")}catch(error){console.error(\"[Preacherman Gallery] Cortana could not replace the spine.\",error),parent.postMessage({type:\"preacherman-active-gallery-error\",message:String(error)},\"*\")}_this.mesh.visible=!1,_this.startRender((_=>{_this.group.position.copy(_this.mesh.position)}));";
const previousCortanaReplacement = "let cortanaRoot=new Group;try{let loader=new GLTFLoader,cortanaNodes=await loader.parse(\"/assets/avatars/cortana/cortana-runtime.glb\");for(let i=0;i<cortanaNodes.length;i++)cortanaRoot.add(cortanaNodes[i]);cortanaRoot.position.set(0,-4.82,0),cortanaRoot.rotation.y=-Math.PI/2,cortanaRoot.scale.set(1.06,1.06,1.06),cortanaRoot.traverse?.((node=>{node.frustumCulled=!1,node.shader&&(node.shader=_this.shader)})),_this.group.add(cortanaRoot),window.__PREACHERMAN_CORTANA_ROOT__=cortanaRoot,window.__PREACHERMAN_CORTANA_READY__=!0,parent.postMessage({type:\"preacherman-active-gallery-ready\"},\"*\")}catch(error){console.error(\"[Preacherman Gallery] Cortana could not replace the spine.\",error),parent.postMessage({type:\"preacherman-active-gallery-error\",message:String(error)},\"*\")}_this.mesh.visible=!1,_this.startRender((_=>{_this.group.position.copy(_this.mesh.position)}));";
const sideCortanaReplacement = "let cortanaRoot=new Group,cortanaShaderBound=!1;try{let loader=new GLTFLoader,cortanaNodes=await loader.parse(\"/assets/avatars/cortana/cortana-runtime.glb\");for(let i=0;i<cortanaNodes.length;i++)cortanaRoot.add(cortanaNodes[i]);cortanaRoot.position.set(0,-5.296,0),cortanaRoot.rotation.y=-Math.PI/2,cortanaRoot.scale.set(2.55,2.55,2.55),_this.group.add(cortanaRoot),window.__PREACHERMAN_CORTANA_ROOT__=cortanaRoot,window.__PREACHERMAN_CORTANA_READY__=!0,parent.postMessage({type:\"preacherman-active-gallery-ready\"},\"*\")}catch(error){console.error(\"[Preacherman Gallery] Cortana could not replace the spine.\",error),parent.postMessage({type:\"preacherman-active-gallery-error\",message:String(error)},\"*\")}_this.mesh.visible=!1,_this.startRender((_=>{_this.group.position.copy(_this.mesh.position),cortanaShaderBound||(()=>{let cortanaMeshes=0;cortanaRoot.traverse?.((node=>{node.frustumCulled=!1,node.shader&&(node.shader=_this.shader,node.renderOrder=_this.mesh.renderOrder,cortanaMeshes++)})),cortanaShaderBound=cortanaMeshes>0})()}));";
const cortanaReplacement = "let cortanaRoot=new Group,cortanaShaderBound=!1;try{let loader=new GLTFLoader,cortanaNodes=await loader.parse(\"/assets/avatars/cortana/cortana-runtime.glb\");for(let i=0;i<cortanaNodes.length;i++)cortanaRoot.add(cortanaNodes[i]);cortanaRoot.position.set(0,-5.296,0),cortanaRoot.rotation.y=0,cortanaRoot.scale.set(2.55,2.55,2.55),_this.group.add(cortanaRoot),window.__PREACHERMAN_CORTANA_ROOT__=cortanaRoot,window.__PREACHERMAN_CORTANA_READY__=!0,parent.postMessage({type:\"preacherman-active-gallery-ready\"},\"*\")}catch(error){console.error(\"[Preacherman Gallery] Cortana could not replace the spine.\",error),parent.postMessage({type:\"preacherman-active-gallery-error\",message:String(error)},\"*\")}_this.mesh.visible=!1,_this.startRender((_=>{_this.group.position.copy(_this.mesh.position),cortanaShaderBound||(()=>{let cortanaMeshes=0;cortanaRoot.traverse?.((node=>{node.frustumCulled=!1,node.shader&&(node.shader=_this.shader,node.renderOrder=_this.mesh.renderOrder,cortanaMeshes++)})),cortanaShaderBound=cortanaMeshes>0})()}));";
const hiddenSpineReplacement = "_this.mesh.visible=!1,window.__PREACHERMAN_SPINE_REMOVED__=!0,parent.postMessage({type:\"preacherman-active-gallery-ready\"},\"*\"),_this.startRender((_=>{_this.group.position.copy(_this.mesh.position)}));";

if (scene.includes(cortanaReplacement)) {
  scene = scene.replace(cortanaReplacement, hiddenSpineReplacement);
} else if (scene.includes(sideCortanaReplacement)) {
  scene = scene.replace(sideCortanaReplacement, hiddenSpineReplacement);
} else if (scene.includes(previousCortanaReplacement)) {
  scene = scene.replace(previousCortanaReplacement, hiddenSpineReplacement);
} else if (scene.includes(firstPassReplacement)) {
  scene = scene.replace(firstPassReplacement, hiddenSpineReplacement);
} else {
  scene = replaceOnce(
    scene,
    originalSpine,
    hiddenSpineReplacement,
    "hide SpineInstancer for the fixed portrait Cortana layer",
  );
}

scene = replaceOnce(
  scene,
  'const geo=await get("https://us-central1-at-services.cloudfunctions.net/geo")',
  'const geo={location:{countryCode:"US"}}',
  "keep the copied Gallery cookie check offline",
);
scene = replaceOnce(
  scene,
  'server:"wss://s.dreamwave.network/ws",roomKey:_this.key,playerClass:"ScrollPlayer",maxInRoom:2',
  'server:"",roomKey:_this.key,playerClass:"ScrollPlayer",maxInRoom:-1',
  "disable the copied Gallery remote multiplayer client",
);
scene = replaceExact(
  scene,
  "await _this.initSync(_this.ui.group),await _this.initSync(_this.ui),_this.set(\"ready\",!0)",
  "_this.initSync&&(await _this.initSync(_this.ui.group),await _this.initSync(_this.ui)),_this.set(\"ready\",!0)",
  2,
  "keep the copied contact view local when multiplayer sync is unavailable",
);
scene = replaceOnce(
  scene,
  "_this.bitmap.capture.rt.upload(),await _this.initSync(_this.element.group),await _this.initSync(_this.element),_this.set(\"ready\",!0)",
  "_this.bitmap.capture.rt.upload(),_this.initSync&&(await _this.initSync(_this.element.group),await _this.initSync(_this.element)),_this.set(\"ready\",!0)",
  "keep copied Gallery cards local when multiplayer sync is unavailable",
);
scene = replaceOnce(
  scene,
  "function update(){if(_requestId=null,!_this.destroy||!_video.destroy)return;let updateTex",
  "function update(){if(_requestId=null,!_this.destroy||!_video.destroy||!_this.texture)return;let updateTex",
  "guard the copied Gallery video texture frame race",
);

// Gallery uses the host navigation; do not construct legacy Work / Contact UI.
scene = replaceOnce(
  scene,
  "function NavUI(_params,...restArgs){const _this=this;Inherit(_this,GLUIElement),Inherit(_this,Initialization),Inherit(_this,XComponent),_this.fragName=\"NavUI\",_this.contexts=\"GLUIElement,Initialization\",_this.params=_params,_this.args=arguments,this.isFragment=!0;var _promises=[];!async function(){",
  "function NavUI(_params,...restArgs){const _this=this;Inherit(_this,GLUIElement),Inherit(_this,Initialization),Inherit(_this,XComponent),_this.fragName=\"NavUI\",_this.contexts=\"GLUIElement,Initialization\",_this.params=_params,_this.args=arguments,this.isFragment=!0;var _promises=[];!async function(){if(window.__GALLERY_MODE__){_this.set(\"ready\",!0),_this.flag?.(\"__ready\",!0);return}",
  "omit legacy Gallery Work / Contact switch before rendering and event binding",
);
fs.writeFileSync(scenePath, scene);

const entryPath = path.join(runtimeRoot, "gallery", "work.html");
let entry = fs.readFileSync(entryPath, "utf8");
entry = replaceOnce(
  entry,
  '<base href="/">',
  '<base href="/active-theory-gallery/">',
  "scope Gallery base path",
);
fs.writeFileSync(entryPath, entry);

console.log(JSON.stringify({
  runtimeRoot,
  entry: path.relative(process.cwd(), entryPath),
  scene: path.relative(process.cwd(), scenePath),
  framing: "fixed portrait Cortana layer",
}, null, 2));
