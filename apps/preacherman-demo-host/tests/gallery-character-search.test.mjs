import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { findGalleryCharacter } from "../public/active-theory-gallery/gallery/character-search.js";
import { galleryFocusScroll, galleryLeadIndex, galleryOrbitPose, GALLERY_LEAD_OFFSET } from "../src/surfaces/gallery/galleryOrbitMath.ts";
const read = path => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
const cms = JSON.parse(read("public/active-theory-gallery/gallery/external/storage.googleapis.com/activetheory-v6.appspot.com/cms/projects-dev.json"));
const cards = cms.slice(0, 14).map(p => ({ id: p.slug, title: p.name }));

test("search matches every displayed character, aliases and model suffixes without falling back on no match", () => {
  for (const card of cards) assert.equal(findGalleryCharacter(cards, card.title.toUpperCase())?.id, card.id);
  for (const value of ["cortana", "Cortana model", " Cortana 的模型 ", "科塔娜", "Ｃｏｒｔａｎａ"]) assert.equal(findGalleryCharacter(cards, value)?.id, "secret-sky");
  assert.equal(findGalleryCharacter(cards, "Tony Stark")?.id, "i-will-what-i-want");
  assert.equal(findGalleryCharacter(cards, "Noble 6")?.id, "witness-gotham");
  assert.equal(findGalleryCharacter(cards, "探路者")?.id, "halo-5-visualizer");
  assert.equal(findGalleryCharacter([{id:"unbound-project",title:"Portfolio"}],"Portfolio"),null);
  for (const value of ["", "  ", "!!!", "model", "not a real character"]) assert.equal(findGalleryCharacter(cards, value), null);
});

test("Cortana starts at the upper left; search follows the nearest existing orbit lap", () => {
  assert.equal(cards[0].id, "secret-sky");
  assert.equal(galleryLeadIndex(GALLERY_LEAD_OFFSET, cards.length), 0);
  for (let index = 0; index < cards.length; index++) for (const current of [-45.2, -1, 0, 1, 7.3, 27, 99]) {
    const target = galleryFocusScroll(index, current, cards.length);
    assert.ok(Math.abs(target - current) <= cards.length / 2);
    assert.equal(galleryLeadIndex(target, cards.length), index);
    const pose = galleryOrbitPose(index, target, 1, cards.length);
    assert.ok(pose.x < -.6 && pose.y > 1.4 && pose.visible && pose.scale === .76);
  }
});

function fixture(appearance) {
  const timers = new Map(); let sequence = 0;
  class Element {
    dataset = {}; attrs = {}; handlers = {}; value = ""; classList = { remove() {} };
    setAttribute(k,v) { this.attrs[k] = v; }
    addEventListener(k,v) { this.handlers[k] = v; }
    removeEventListener(k) { delete this.handlers[k]; }
    insertBefore(node) { this.status = node; }
    remove() { this.removed = true; }
  }
  const wrapper = new Element(), input = new Element(), log = new Element(), styles = {};
  input.placeholder = "Ask me anything...";
  const document = { createElement: () => new Element(), documentElement: {dataset:{appearance},style:{setProperty:(k,v)=>styles[k]=v}} };
  const window = new Element(), parent = {postMessage: data => posted.push(data)}, posted = [], focused = [];
  let railListener, unsubscribed = false;
  const chat = {wrapper:{div:wrapper},input:{div:input},messages:{div:log},copy:["What are you looking for?","-> websites","-> installations","-> XR / VR / AI","-> multiplayer","-> games"],onInit(){},clearChat(){throw new Error("Original categories must stay")},addMessage(){throw new Error("Do not add descriptions")},set(){},fire(){}};
  const bridge = {snapshot:{phase:"closed"},subscribeRail(fn){railListener=fn;fn(cards);return ()=>{unsubscribed=true}},focusProject:id=>focused.push(id)};
  const context = {window,document,parent,location:{origin:"https://tauri.localhost"},findGalleryCharacter,
    setTimeout:fn=>{timers.set(++sequence,fn);return sequence},clearTimeout:id=>timers.delete(id)};
  const source = read("public/active-theory-gallery/gallery/conversation-bridge.js").replace(/^import .*;$/m, "").replace("export function", "function").replace(/start\(\);\s*$/, "");
  vm.runInNewContext(source + "\nglobalThis.install = installCharacterSearch;",context);
  const cleanup = context.install(chat,bridge);
  return {input,wrapper,log,chat,posted,focused,styles,document,window,cleanup,get unsubscribed(){return unsubscribed},
    flush(){const entries=[...timers.values()];timers.clear();entries.forEach(fn=>fn())},
    type(value, composing=false){input.value=value;input.handlers.input({isComposing:composing})},
    key(key, props={}){const event={key,target:input,preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true},...props};wrapper.handlers.keydown(event);return event},
    theme(){window.handlers.message({source:parent,origin:"https://tauri.localhost",data:{type:"gallery-conversation-theme",appearance,theme:{text:appearance==="dark"?"#eee":"#111",surface:"surface",focus:"focus",muted:"muted"}}})},
    rail(value){railListener(value)}};
}
for (const appearance of ["dark", "light"]) test(`character input owns typing, IME and Enter without AI messages (${appearance})`, () => {
  const f=fixture(appearance);
  try {
    assert.equal(f.input.placeholder,"Ask me anything...");
    assert.equal(f.input.attrs.role,"searchbox");
    assert.ok(f.chat.copy.includes("-> websites"));assert.equal(f.wrapper.status,undefined);
    f.theme();assert.equal(f.styles["--demo-theme-settings-text"],appearance==="dark"?"#eee":"#111");
    f.type("cortana");f.type("pathfinder");f.flush();assert.deepEqual(f.focused,["halo-5-visualizer"]);
    f.type("unknown");const enter=f.key("Enter");assert.ok(enter.prevented&&enter.stopped);assert.equal(f.wrapper.dataset.searchState,"empty");assert.equal(f.focused.length,1);
    f.input.handlers.compositionstart();f.type("科塔娜",true);f.key("Enter",{isComposing:true});f.flush();assert.equal(f.focused.length,1);
    f.input.handlers.compositionend();assert.equal(f.focused.at(-1),"secret-sky");assert.equal(f.input.value,"科塔娜");
    f.key("Escape");assert.equal(f.input.value,"");assert.equal(f.wrapper.dataset.searchMatch,undefined);
    f.type("kitana");f.flush();assert.equal(f.focused.at(-1),"bon-iver-viisualiizer");
    const before=f.focused.length;f.rail(cards.slice(2));assert.equal(f.focused.length,before,"Category changes must not re-run the previous search");
    assert.deepEqual(f.posted.map(x=>x.type),["gallery-theme-request"]);
    f.type("cortana");
  } finally {f.cleanup();}
  const count=f.focused.length;f.flush();assert.equal(f.focused.length,count);assert.ok(f.unsubscribed);
  assert.equal(f.wrapper.status,undefined);assert.deepEqual(Object.keys(f.input.handlers),[]);
});

test("search from an open detail waits for the existing exit before focusing the latest requested card", async () => {
  const handlers = {}, values = new Map(), bindings = new Map(); let draw;
  const project=cards.map(c=>({perma:c.id,title:c.title,thumbnailURL:"cover.jpg"}));
  const document={documentElement:{dataset:{},setAttribute(){}},addEventListener(){},removeEventListener(){},querySelectorAll:()=>[]};
  const window={document,CMS_DATA:{projects:project},World:{NUKE:{}},addEventListener:(k,v)=>handlers[k]=v,removeEventListener(){},matchMedia:()=>({matches:true})};
  const view={flag:()=>true,uniforms:{uVisible:{value:1}},scroll:{renderManager:{controller:{scroll:0}}}};
  const work={get:k=>values.get(k),set(k,v){values.set(k,v);bindings.get(k)?.(v)},bind:(k,v)=>bindings.set(k,v),startRender:fn=>draw=fn,findParent:()=>view};
  vm.runInNewContext(read("public/active-theory-gallery/gallery/detail-bridge.js"),{window,document,URL,setTimeout,clearTimeout});
  document.baseURI="https://tauri.localhost/gallery/";
  const api=window.PreachermanGalleryDetail;api.attach(work);draw();
  const input=[];api.subscribeInput(value=>input.push(value));
  api.openProject("secret-sky");api.focusProject("emmit-fenn");assert.equal(api.snapshot.phase,"closing");assert.equal(input.length,0);
  api.focusProject("halo-5-visualizer");await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(api.snapshot.phase,"closed");assert.equal(input.length,1);assert.equal(input[0].id,"halo-5-visualizer");assert.equal(values.get("Work/project"),null);
  api.focusProject("missing");assert.equal(input.length,1);
  // A restored category can exclude the requested character. Publish the full
  // rail before sending focus, so the native listener sees its current index.
  values.set("WorkItems/items",[project[2]]);draw();
  let requested;
  window.CMSData={showProjects(ids){requested=ids;values.set("WorkItems/items",project)}};
  api.focusProject("secret-sky");assert.equal(input.length,1);
  assert.equal(requested.length,project.length);draw();
  assert.equal(input.length,2);assert.equal(input[1].id,"secret-sky");
  handlers.pagehide();
});

test("search styling preserves the authored pill without extra rings, colors or descriptions", () => {
  const css=read("public/active-theory-gallery/gallery/conversation-bridge.css");
  const bridge=read("public/active-theory-gallery/gallery/conversation-bridge.js");
  assert.doesNotMatch(css,/outline:|outline-offset:|\[data-gallery-search\]/);
  assert.doesNotMatch(bridge,/input\.placeholder\s*=|chat\.onInit\s*=|addMessage\(|createElement\(/);
});
