import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read = file => fs.readFileSync(new URL('../'+file, import.meta.url), 'utf8');
const runtime = read('public/active-theory-gallery/gallery/assets/js/app.1780406240914.js');

// Execute the shipped runtime bindings, so camera/property drift is caught.
function bindProject(className, context) {
  const start = runtime.indexOf('function '+className+'(');
  const binding = runtime.indexOf('_this.bind("Work/project",', start);
  let depth=0,quote='',escaped=false,end=binding;
  for (;end<runtime.length;end++) {
    const char=runtime[end];
    if (quote) { if (escaped) escaped=false; else if(char==='\\') escaped=true; else if(char===quote) quote=''; continue; }
    if ('"\'`'.includes(char)) {quote=char;continue;}
    if(char==='(') depth++;
    if(char===')' && --depth===0) {end++;break;}
  }
  let callback;
  context._this.bind=(_key,fn)=>{callback=fn;};
  vm.runInNewContext(runtime.slice(binding,end),context);
  return callback;
}

for(const appearance of ['light','dark']) {
  test(`native room never blends the retired orbit on entry, switch or exit in ${appearance}`,()=>{
    const calls=[],detail={visible:false};
    const view={lockScroll(){calls.push('lock');},unlockScroll(){calls.push('unlock');}};
    const context={document:{documentElement:{dataset:{appearance,galleryNavigationOwner:'native'}}},_this:{
      detail,composite:{set(key,value){calls.push([key,value]);},tween(){assert.fail('legacy blend ran');}},
      findParent:()=>view,fire(){},navigate(){}
    }};
    const update=bindProject('Work',context);
    update({perma:'one'},null);assert.equal(detail.visible,true);
    update({perma:'two'},{perma:'one'});update(null,{perma:'two'});
    assert.equal(calls.filter(c=>Array.isArray(c)&&c[0]==='uTransition'&&c[1]===1).length,3);
    assert.equal(calls.at(-1),'unlock');
  });
  test(`detail camera stays in the room throughout native transitions in ${appearance}`,()=>{
    const camera={group:{position:{z:0}}},particles={layers:{camera:{group:{position:{z:25}}}}},texts=[];
    const update=bindProject('WorkDetail',{document:{documentElement:{dataset:{appearance,galleryNavigationOwner:'native'}}},camera,_targetZ:6,_this:{particles,fire:(_event,data)=>texts.push(data.perma)},tween(){assert.fail('retired camera fly-through ran');}});
    update({perma:'one'});update(null,{perma:'one'});update({perma:'two'});
    assert.equal(camera.group.position.z,6);assert.equal(particles.layers.camera.group.position.z,0);assert.deepEqual(texts,['one','two']);
  });
  test(`a cancelled first-frame reveal cannot flash the previous room in ${appearance}`,()=>{
    const rafs=new Map(),timers=new Map(),bindings=new Map();let next=0;
    const document={documentElement:{dataset:{appearance},setAttribute(){}},baseURI:'https://tauri.localhost/',hidden:false,addEventListener(){},removeEventListener(){}};
    const window={document,CMS_DATA:{projects:[{perma:'one',title:'One'},{perma:'two',title:'Two'}]},addEventListener(){},requestAnimationFrame:fn=>{rafs.set(++next,fn);return next;},cancelAnimationFrame:id=>rafs.delete(id),matchMedia:()=>({matches:false})};
    vm.runInNewContext(read('public/active-theory-gallery/gallery/detail-bridge.js'),{window,document,URL,setTimeout:fn=>{timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id)});
    const api=window.PreachermanGalleryDetail;
    api.attach({bind:(name,fn)=>bindings.set(name,fn),set:(name,value)=>bindings.get(name)?.(value),startRender(){},findParent:()=>({scroll:{renderManager:{controller:{scroll:10}}}})});
    const frame=()=>{const pending=[...rafs.values()];rafs.clear();pending.forEach(fn=>fn());};
    api.openProject('one');assert.equal(document.documentElement.dataset.galleryRoom,'preparing');
    frame();api.back();frame();assert.equal(document.documentElement.dataset.galleryRoom,'hidden');
    [...timers.values()].forEach(fn=>fn());timers.clear();
    api.openProject('two');frame();assert.equal(document.documentElement.dataset.galleryRoom,'preparing');
    frame();assert.equal(document.documentElement.dataset.galleryRoom,'visible');assert.equal(api.snapshot.project,'two');
    api.back();assert.equal(document.documentElement.dataset.galleryRoom,'hidden');
  });
}

test('native compositor skips drawing the old geometry and bypasses its costly distortion pass',()=>{
  assert.ok(runtime.includes('dataset.galleryNavigationOwner==="native")_this.nuke.preventNewRender=!0'));
  assert.ok(runtime.includes('uTransition:{value:document.documentElement.dataset.galleryNavigationOwner==="native"?1:0}'));
  const html=read('public/active-theory-gallery/gallery/work.html');
  assert.match(html,/data-gallery-room="preparing"/);assert.match(html,/visibility: hidden !important; transition: none/);
  assert.match(html,/prefers-reduced-motion/);assert.match(html,/data-gallery-contact="true"/);
});


test('Escape consumed by navigation cannot also close the restored Gallery detail',()=>{
  const source=read('src/surfaces/gallery/GalleryDetailOverlay.tsx');
  const handler=source.match(/const escape = \(event: KeyboardEvent\) => \{([\s\S]*?)\n    \};/)[1];
  let exits=0;
  const escape=vm.runInNewContext('(event)=>{'+handler+'}',{document:{querySelector:()=>null},onBack:()=>exits++});
  escape({key:'Escape',defaultPrevented:true});assert.equal(exits,0);
  escape({key:'Escape',defaultPrevented:false});assert.equal(exits,1);
});
