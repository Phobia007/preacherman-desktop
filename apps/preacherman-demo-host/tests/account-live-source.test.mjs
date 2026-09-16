import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source=await readFile(new URL("../src/surfaces/account/AccountScene.tsx",import.meta.url),"utf8");
for(const appearance of ["light","dark"])test("Account composites live frames once, caches static layers and disconnects in "+appearance,()=>{
 const created=[],frames=[],after=[],cleanup=[],events=new Map();let draws=0,renders=0,boundsReads=0,styleReads=0;
 const sceneCanvas={getBoundingClientRect(){boundsReads++;return {left:-450,top:0,width:1800,height:1000};}};
 const document={hidden:false,createElement(){
  const canvas={width:0,height:0,getContext(){return context;}};
  const context={drawImage(image){frames.push(image);},clearRect(){},fillRect(){draws++;},createImageData:()=>({data:new Uint8ClampedArray(160*160*4)}),putImageData(){},createPattern:()=>({}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})};
  created.push(canvas);return canvas;
 }};
 const window={addEventListener:(key,fn)=>events.set(key,fn),removeEventListener:key=>events.delete(key),dispatchEvent:event=>events.get(event.type)?.(event)};
 const react={useRef:value=>({current:value}),useEffect:effect=>cleanup.push(effect())};
 const fiber={useThree:()=>({gl:{render(){renders++;},domElement:sceneCanvas},scene:{},camera:{}}),useFrame:fn=>framesOfScene.push(fn),addAfterEffect:fn=>{after.push(fn);return()=>after.splice(after.indexOf(fn),1);}};
 const framesOfScene=[];
 const module={exports:{},require:name=>name==='react'?react:name==='@react-three/fiber'?fiber:{},document,window,CustomEvent:class{constructor(type,options){this.type=type;Object.assign(this,options);}},getComputedStyle(){styleReads++;return {getPropertyValue:()=>appearance==='light'?'#fff':'#000'};}};
 runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,module);
 module.exports.AccountSceneCapture();
 const capture=module.exports.captureAccountFrame({clientWidth:900,clientHeight:1000,getBoundingClientRect:()=>({left:0,top:0,width:900,height:1000}),querySelector:()=>null});
 const initialCanvases=created.length,initialPaints=draws;let updates=0;
 const off=capture.subscribe(()=>updates++);
 const step=()=>{framesOfScene.forEach(fn=>fn());after.forEach(fn=>fn());};
 step();step();step();
 assert.equal(updates,3);assert.equal(renders,1,"only the initial capture renders synchronously");
 assert.equal(frames.filter(frame=>frame===sceneCanvas).length,4);
 assert.equal(created.length,initialCanvases);assert.equal(draws,initialPaints);
 assert.equal(styleReads,1);assert.equal(boundsReads,1);
 after.forEach(fn=>fn());assert.equal(updates,3,"other R3F roots cannot duplicate the capture");
 document.hidden=true;step();assert.equal(updates,3);
 document.hidden=false;off();step();assert.equal(updates,3,"closed or unmounted lens stops copying");
 cleanup.filter(Boolean).forEach(fn=>fn());assert.equal(after.length,0);assert.equal(events.size,0);
});

