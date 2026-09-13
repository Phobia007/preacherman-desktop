import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { galleryEntryProgress, galleryOrbitPose } from "../src/surfaces/gallery/galleryOrbitMath.ts";
const read = path => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Gallery helix rises from below and goes behind the companion without putting foreground cards across its head", () => {
  const points = Array.from({ length: 101 }, (_, i) => galleryOrbitPose(0, 0, galleryEntryProgress(i * .0185, false), 31));
  assert(points[0].y < 0);
  for (let i = 1; i < points.length; i++) assert(points[i].y >= points[i - 1].y);
  assert(points.some(p => p.x > .3) && points.some(p => p.x < -.3), "the entrance must circle, not just translate vertically");
  assert(points.at(-1).z < -.5, "the focused card sits behind the model");
  for (let offset = -2; offset < 4; offset += .02) {
    const p = galleryOrbitPose(offset, 0, 1, 31);
    if (p.visible && p.z > .1) assert(p.y + .44 * p.scale < 1.5, "foreground cards must leave the face clear");
  }
  assert.equal(galleryEntryProgress(0, true), 1);
});

test("Gallery helix wraps without a gap and bounds resident cards independently of catalog length", () => {
  for (const count of [13, 31, 200]) {
    for (const scroll of [0, .4, count - .25, count, count * 3 + .5, -.5]) {
      const visible = Array.from({length: count}, (_, i) => galleryOrbitPose(i, scroll, 1, count)).filter(p => p.visible);
      assert(visible.length >= 4 && visible.length <= 6);
    }
    assert.deepEqual(galleryOrbitPose(0, 0, 1, count), galleryOrbitPose(0, count, 1, count));
  }
});

for (const appearance of ["light", "dark"]) test(`Gallery rail preserves input ownership, detail transitions and background suspension in ${appearance}`, () => {
  const handlers = new Map(), bindings = new Map(); let draw;
  const document = { hidden:false, baseURI:"https://tauri.localhost/active-theory-gallery/", documentElement:{dataset:{appearance},setAttribute(){}}, body:{style:{}}, addEventListener(){}, removeEventListener(){}, querySelectorAll:()=>[] };
  const project={perma:"secret-sky",title:"Cortana",clientName:"HALO 4",thumbnailURL:"https://assets.example/cover.jpg",videoURL:"/assets/gallery/cortana-intro.mp4"};
  const values = new Map([["WorkItems/items",[project]],["WorkItems/videoURL",""]]);
  const window={document,World:{NUKE:{paused:false}},CMS_DATA:{projects:[project]},PreachermanGalleryRailAssets:{"https://assets.example/cover.jpg":"/assets/gallery/cortana-intro-cover.jpg"},addEventListener:(key,fn)=>handlers.set(key,fn),removeEventListener(){}};
  const view={flag:()=>true,uniforms:{uVisible:{value:1}},scroll:{renderManager:{controller:{scroll:124}}}};
  const work={get:key=>values.get(key),startRender:fn=>{draw=fn},findParent:()=>view,bind:(key,fn)=>bindings.set(key,fn),set:(key,value)=>{values.set(key,value);bindings.get(key)?.(value)},navigate(){}};
  vm.runInNewContext(read("public/active-theory-gallery/gallery/detail-bridge.js"),{window,document,URL,innerWidth:1800,innerHeight:1000,setTimeout,clearTimeout});
  const api=window.PreachermanGalleryDetail;api.attach(work);draw();
  assert.equal(window.World.NUKE.paused,true);
  let cards,input;const unsubscribe=api.subscribeRail(value=>{cards=value});api.subscribeInput(value=>{input=value});
  assert.equal(cards[0].thumbnail,"https://tauri.localhost/assets/gallery/cortana-intro-cover.jpg");
  const event={type:"wheel",deltaY:100,deltaMode:0,target:{closest:()=>null},preventDefault(){this.prevented=true},stopImmediatePropagation(){}};
  handlers.get("wheel")(event);assert.equal(input.delta,100);assert.equal(event.prevented,true);
  input=null;handlers.get("wheel")({...event,target:{closest:()=>({})}});assert.equal(input,null,"chat retains wheel ownership");
  api.previewProject("secret-sky");assert.equal(values.get("WorkItems/videoURL"),project.videoURL);
  api.openProject("secret-sky");assert.equal(api.snapshot.project,"secret-sky");assert.equal(window.World.NUKE.paused,false);assert.equal(document.documentElement.dataset.galleryNativeRail,"false");
  input=null;handlers.get("wheel")(event);assert.equal(input,null,"detail keeps its existing wheel contract");unsubscribe();
});

test("Gallery overview shares model camera and depth while keeping theme controls and original packaged covers", () => {
  const css=read("src/styles.css"),surface=read("src/surfaces/gallery/active-theory-gallery-surface.css");
  assert.doesNotMatch(css,/mix-blend-mode:\s*screen/);
  assert.match(surface,/gallery-orbit-nav[\s\S]*--demo-theme-gallery-detail-control-text/);
  assert.match(surface,/color-scheme:\s*light/);
  const scene=read("../../packages/preacherman-avatar-renderer/src/InteractiveAvatarViewport.tsx");
  assert.match(scene,/<Canvas[\s\S]*<InteractiveAvatarScene[\s\S]*\{sceneContent\}[\s\S]*<\/Canvas>/);
  const mapping={};vm.runInNewContext(read("public/active-theory-gallery/gallery/rail-assets.js"),{window:mapping});
  assert.equal(Object.keys(mapping.PreachermanGalleryRailAssets).length,29);
  for(const url of Object.values(mapping.PreachermanGalleryRailAssets))assert(fs.statSync(new URL("../public"+url,import.meta.url)).size>1000);
});
