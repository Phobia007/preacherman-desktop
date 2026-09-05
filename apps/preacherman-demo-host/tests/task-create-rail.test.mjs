import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

test("new card is fully visible before arrival without revealing or resetting existing cards", async () => {
  const source = fs.readFileSync(new URL("../public/gallery-v3/portfolio/task-create-rail.js", import.meta.url), "utf8");
  const context = {
    createTaskProject: () => ({id:"task-new"}),
    projectRecord: () => ({src:"empty.svg"}),
    augmentTaskProjects: projects => [...projects,{slug:"task-new"}],
    matchMedia: () => ({matches:false}),
  };
  vm.runInNewContext(source.replace(/^import .*;\n/m,"").replace("export function ","function "),context);
  const element = id => ({dataset:{id,gl:"card"},getBoundingClientRect:()=>({left:0,top:0,width:600,height:400}),querySelector:()=>({}),focus(){}});
  const original = {slug:"original",el:element("original"),ox:12,oz:3,mesh:{material:{uniforms:{u_alpha:{value:0.8},u_white:{value:0},u_shade:{value:1}}}}};
  const added = {slug:"task-new",el:element("task-new"),mesh:{material:{uniforms:{u_alpha:{value:0},u_white:{value:0},u_shade:{value:1}}}}};
  const track = {value:{children:[original.el]}};
  let captions = false;
  let arrival;
  const folio = {
    texture:async()=>{},
    scan:()=>[original,added],
    showTitles:async()=>{
      assert.equal(added.mesh.material.uniforms.u_alpha.value,1);
      assert.equal(added.ox,0); assert.equal(added.oz,0);
      captions=true;
    },
  };
  const dispose = context.installTaskCreateRail({
    folio,track,projects:{value:[{slug:"original"}]},root:{value:{isConnected:true}},
    resize:{small:false,ww:1800,wh:1000},
    nextTick:async()=>{track.value.children.push(added.el);},
    measureX(){},measureY(){},centerX(){},centerY(){},
    motion:{delayedCall:(_delay,callback)=>{arrival=callback;return{kill(){arrival=null;}}}},
  });
  const arrive = await folio.prepareTaskCreation({title:"new"});
  assert.equal(captions,true);
  assert.equal(original.mesh.material.uniforms.u_alpha.value,0.8);
  assert.equal(original.ox,12); assert.equal(original.oz,3);
  assert.equal(added.mesh.material.uniforms.u_white.value,0);
  assert.equal(added.mesh.material.uniforms.u_shade.value,1);
  arrive();assert.equal(typeof arrival,"function");
  dispose();assert.equal(arrival,null);
  assert.equal(folio.prepareTaskCreation,undefined);
});
