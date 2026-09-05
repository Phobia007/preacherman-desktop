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

test("live removal persists before retiring only selected card resources and keeps last-card removal empty", async () => {
  const source = fs.readFileSync(new URL("../public/gallery-v3/portfolio/task-create-rail.js", import.meta.url), "utf8");
  const operations=[];
  let fail=false;
  const context={deleteTaskProjects:ids=>{if(fail)throw new Error("quota");operations.push("save:"+ids.join(","));},augmentTaskProjects:()=>[]};
  vm.runInNewContext(source.replace(/^import .*;\n/m,"").replace("export function ","function "),context);
  const target={slug:"task-last",el:{contains:el=>el===pillElement}};
  const pillElement={};
  const title={slug:"task-last",material:{uniforms:{}},dispose:()=>operations.push("title")};
  const unrelatedTitle={slug:"other"};
  const folio={cards:[target],texts:[title,unrelatedTitle],pills:[{el:pillElement,mesh:{}},{el:{}}],reg:{retire:()=>operations.push("card")},disposeMesh:()=>operations.push("pill"),scan:()=>[]};
  const projects={value:[{slug:"task-last"}]};
  const dispose=context.installTaskCreateRail({folio,projects,root:{value:{isConnected:true}},nextTick:async()=>{},measureX(){},measureY(){},centerX(){assert.fail("empty rail cannot center");},centerY(){assert.fail("empty rail cannot center");},motion:{killTweensOf(){}}});
  fail=true;await assert.rejects(folio.removeTaskCard("task-last"),/quota/);
  assert.deepEqual(operations,[]);assert.equal(projects.value.length,1);assert.equal(folio.texts.length,2);
  fail=false;await folio.removeTaskCard("task-last");
  assert.deepEqual(operations,["save:task-last","title","pill","card"]);
  assert.equal(projects.value.length,0);assert.equal(folio.cards.length,0);assert.equal(folio.pills.length,1);assert.equal(folio.texts[0],unrelatedTitle);
  dispose();assert.equal(folio.removeTaskCard,undefined);
  assert.equal(folio.removeTaskCards,undefined);
});

test("batch removal validates every id, persists once and rescans once without touching survivors", async () => {
  const source=fs.readFileSync(new URL("../public/gallery-v3/portfolio/task-create-rail.js",import.meta.url),"utf8");
  const operations=[];
  const context={deleteTaskProjects:ids=>operations.push("save:"+ids.join(",")),augmentTaskProjects:projects=>projects.filter(p=>p.slug==="keep")};
  vm.runInNewContext(source.replace(/^import .*;\n/m,"").replace("export function ","function "),context);
  const cards=["a","keep","b"].map(slug=>({slug,el:{contains:()=>false}}));
  const folio={cards,texts:[],pills:[],reg:{retire:card=>operations.push("retire:"+card.slug)},scan:()=>{operations.push("scan");return[cards[1]];}};
  cards[1].el.dataset={gl:"card"};
  const projects={value:cards.map(({slug})=>({slug}))};
  context.installTaskCreateRail({folio,projects,root:{value:{isConnected:true}},nextTick:async()=>{},measureX(){},measureY(){},centerX:index=>operations.push("center:"+index),centerY(){},motion:{killTweensOf(){}}});
  await folio.removeTaskCards([]);
  await assert.rejects(folio.removeTaskCards(["a","missing"]));
  assert.deepEqual(operations,[]);
  await folio.removeTaskCards(["a","b","a"]);
  assert.deepEqual(operations,["save:a,b","retire:a","retire:b","scan","center:0"]);
  assert.equal(folio.cards[0],cards[1]);
  assert.equal(projects.value.length,1);
});
