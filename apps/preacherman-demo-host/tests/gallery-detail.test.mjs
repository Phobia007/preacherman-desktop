import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read = path => fs.readFileSync(new URL('../'+path, import.meta.url), 'utf8');
const bridgeSource = read('public/active-theory-gallery/gallery/detail-bridge.js');

function fixture(projects = []) {
  let observer, timer, render, videoUrl;
  const scroll = {scroll: 4217};
  const document = {documentElement:{dataset:{},setAttribute(){}},baseURI:"https://tauri.localhost/active-theory-gallery/",hidden:false,addEventListener(){},removeEventListener(){}};
  const window = {document,addEventListener(){}, CMS_DATA: {projects}};
  const work = {
    startRender(callback) { render = callback; },
    bind(_key, callback) { observer = callback; },
    findParent() { return {scroll:{renderManager:{controller:scroll}}}; },
    set(key, value) { if (key === 'WorkItems/videoURL') videoUrl = value; else {assert.equal(key,'Work/project'); observer(value);} },
  };
  vm.runInNewContext(bridgeSource, {window,document,URL,Set,Number,Math,setTimeout:fn=>(timer=fn,1),clearTimeout:()=>{timer=null;}});
  const api=window.PreachermanGalleryDetail;
  api.attach(work);
  return {api,scroll,videoUrl:()=>videoUrl,enter:project=>observer(project),finish:()=>timer?.(),tick:()=>render?.()};
}

test('small-window close preserves the project and only explicit back closes detail',()=>{
  const f=fixture(),states=[];
  const unsubscribe=f.api.subscribe(s=>states.push(s));
  f.enter({perma:'cortana',title:'Cortana'});
  f.api.closeWindow();
  assert.equal(f.api.snapshot.phase,'open');
  assert.equal(f.api.snapshot.project,'cortana');
  assert.equal(f.api.snapshot.smallWindow,false);
  f.scroll.scroll=9999;
  f.api.back();
  assert.equal(f.api.snapshot.phase,'closing');
  assert.equal(f.scroll.scroll,4217);
  f.finish();
  assert.equal(f.api.snapshot.phase,'closed');
  unsubscribe();const count=states.length;
  f.enter({perma:'zima',title:'Zima'});
  assert.equal(states.length,count);
  assert.equal(f.api.snapshot.smallWindow,true);
});

test('late old routes cannot cancel exit or replace the newly selected card',()=>{
  const one={perma:'one',title:'One'},two={perma:'two',title:'Two'};
  const f=fixture([one,two]);f.api.openProject('one');f.api.back();
  assert.equal(f.api.acceptsProjectRoute('one'),false);
  f.enter(one);f.enter(two);f.finish();
  assert.equal(f.api.snapshot.phase,'closed');
  f.api.openProject('two');f.enter(one);
  assert.equal(f.api.snapshot.project,'two');
  assert.equal(f.api.acceptsProjectRoute('two'),true);
  assert.equal(f.api.acceptsProjectRoute('one'),false);
});

test('duplicate router acknowledgement does not reopen a dismissed video',()=>{
  const project={perma:'one',title:'One'};const f=fixture([project]);
  f.api.openProject('one');f.api.closeWindow();f.enter(project);
  assert.equal(f.api.snapshot.smallWindow,false);
});

test('detail carries the card cover without leaking it into the next card',()=>{
  const f=fixture();
  f.enter({perma:'secret-sky',title:'Cortana',thumbnailURL:'/assets/gallery/cortana-intro-cover.jpg'});
  assert.equal(f.api.snapshot.poster,'/assets/gallery/cortana-intro-cover.jpg');
  f.enter({perma:'two',title:'Two'});
  assert.equal(f.api.snapshot.poster,'');
  f.api.back();f.finish();
  assert.equal(f.api.snapshot.poster,undefined);
});

test('the first Gallery card uses one packaged introduction video and the supplied cover',()=>{
  const projects=JSON.parse(read('public/active-theory-gallery/gallery/external/storage.googleapis.com/activetheory-v6.appspot.com/cms/projects-dev.json'));
  assert.equal(projects.length,31);
  const first=[...projects].sort((a,b)=>a.priority-b.priority)[0];
  assert.equal(first.slug,'secret-sky');
  assert.equal(first.video.url,'/assets/gallery/cortana-intro.mp4');
  assert.equal(first.video.thumbnail,'/assets/gallery/cortana-intro-cover.jpg');
  assert.equal(fs.statSync(new URL('../public'+first.video.url,import.meta.url)).size,first.video.filesize);
  assert.ok(fs.statSync(new URL('../public'+first.video.thumbnail,import.meta.url)).size>100_000);
  assert.ok(projects.slice(1).every(p=>!p.video.url.includes('cortana-intro')));
});

test('first card shares Cortana identity and translated copy without changing its routing or playback',()=>{
  const projects=JSON.parse(read('public/active-theory-gallery/gallery/external/storage.googleapis.com/activetheory-v6.appspot.com/cms/projects-dev.json'));
  const first=projects.find(p=>p.slug==='secret-sky');
  assert.equal(first.name,'Cortana');
  assert.equal(first.clientName,'HALO 4');
  assert.equal(new Date(first.completionDate).getUTCFullYear(),2003);
  assert.equal(first.tags,'Preacherman Avatar');
  assert.equal(first.description,"Cortana is from the Halo series. An advanced AI created from Dr. Catherine Halsey's neural architecture, she was initially tasked with system infiltration, intelligence analysis, and tactical support.");
  assert.equal(first.priority,0);
  assert.equal(first.video.url,'/assets/gallery/cortana-intro.mp4');
  assert.equal(first.projectLogo.url,'../assets/gallery/microsoft-logo.png');
  assert.equal(first.projectLogo.mimeType,'image/png');
  assert.equal(first.projectLogo.width/first.projectLogo.height,2);
  const logoPath=new URL(first.projectLogo.url,'http://tauri.localhost/active-theory-gallery/').pathname;
  assert.equal(logoPath,'/assets/gallery/microsoft-logo.png');
  assert.equal(fs.statSync(new URL('../public'+logoPath,import.meta.url)).size,first.projectLogo.filesize);
  const png=fs.readFileSync(new URL('../public'+logoPath,import.meta.url));
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16),400);
  assert.equal(png.readUInt32BE(20),200);
  assert.equal(png[25],6,'RGBA PNG preserves transparent background');
  const logo=read('public/assets/gallery/microsoft-logo.svg');
  assert.match(logo,/viewBox="-10.5 0 42 21"/);
  assert.equal((logo.match(/<rect /g)||[]).length,4);
  for(const color of ['#f25022','#00a4ef','#7fba00','#ffb900'])assert.ok(logo.includes(color));
  assert.ok(projects.filter(p=>p!==first).every(p=>p.projectLogo?.url!==first.projectLogo.url));
});

test('late native scroll and route updates cannot move the rail during detail or return',()=>{
  const f=fixture();f.enter({perma:'one',title:'One'});
  f.scroll.scroll=4817;f.tick();assert.equal(f.scroll.scroll,4217);
  f.api.back();f.scroll.scroll=5300;f.tick();assert.equal(f.scroll.scroll,4217);
  f.scroll.scroll=5250;f.finish();assert.equal(f.scroll.scroll,4217);
  f.scroll.scroll=4500;f.tick();assert.equal(f.scroll.scroll,4500,'normal rail scroll resumes');
});

test('runtime retains the reflection pass and rail, without scroll exit or old close text',()=>{
  const runtime=read('public/active-theory-gallery/gallery/assets/js/app.1780406240914.js');
  assert.match(runtime,/window\.PreachermanGalleryDetail\.attach\(_this\)/);
  assert.match(runtime,/attachContent\(_this,video\)/);
  assert.doesNotMatch(runtime,/_this\.startRender\(checkScrollOut\)|_this\.stopRender\(checkScrollOut\)/);
  assert.doesNotMatch(runtime,/title:"<- Close"/);
  assert.match(runtime,/_this\.layers\.body\.visible=!1;window\.PreachermanGalleryDetail/);
  assert.match(runtime,/cube\.shader\.set\("tPrevFrame",_this\.nuke\.finalTexture\)/);
  assert.match(runtime,/_this\.startRender\(_this\.handleCameraScroll\)/);
  assert.doesNotMatch(bridgeSource,/document\.createElement\("video"/);
  assert.doesNotMatch(bridgeSource.slice(bridgeSource.indexOf("    closeWindow()"), bridgeSource.indexOf("    back()")),/\.pause\(|\.play\(/);
});

test('mirror uses the room video, preserves aspect, and releases frame callbacks',()=>{
  const overlay=read('src/surfaces/gallery/GalleryDetailOverlay.tsx');
  assert.match(overlay,/const video = bridge\.video/);
  assert.match(overlay,/requestVideoFrameCallback\(draw\)/);
  assert.match(overlay,/cancelVideoFrameCallback\(callback\)/);
  assert.match(overlay,/cancelAnimationFrame\(frame\)/);
  assert.match(overlay,/Math\.max\(canvas\.width \/ sourceWidth/);
  assert.match(overlay,/drawSource\(video, video\.videoWidth, video\.videoHeight\)/);
  assert.match(overlay,/drawSource\(poster, poster\.naturalWidth, poster\.naturalHeight\)/);
  assert.match(overlay,/poster\.onload = null/);
  assert.doesNotMatch(overlay,/\.pause\(|\.play\(|<video/);
  assert.match(overlay,/Close video window/);assert.match(overlay,/Back to Gallery cards/);
});

test('new controls are theme semantic and keyboard accessible in both appearances',()=>{
  const css=read('src/surfaces/gallery/active-theory-gallery-surface.css');
  const shell=read('src/styles.css');
  for(const token of ['gallery-detail-control-bg','gallery-detail-control-text','gallery-detail-control-border','gallery-detail-control-hover']){
    assert.match(css,new RegExp('var\\(--demo-theme-'+token+'\\)'));
    assert.ok(shell.split('--demo-theme-'+token+':').length>=3,token+' supplied for both themes');
  }
  assert.match(css,/width: 163\.2px;[\s\S]*height: 49\.6px;/);
  assert.match(css,/font-size: 22px;/);
  assert.match(read('src/surfaces/gallery/GalleryDetailOverlay.tsx'),/M43 12H5m8-8-8 8 8 8/);
  assert.match(css,/:focus-visible/);assert.match(css,/:disabled/);assert.match(css,/:hover/);assert.match(css,/prefers-reduced-motion/);
  assert.match(shell,/data-gallery-detail="true"[^}]+mix-blend-mode: normal/s);
  assert.match(read('src/App.tsx'),/isolateCompanion=\{activeSurfaceType === "market" && galleryDetailOpen\}/);
});

test('foreground isolation ends before exit paints, while the overlay still fades',()=>{
  const surface=read('src/surfaces/gallery/ActiveTheoryGallerySurface.tsx');
  assert.match(surface,/useLayoutEffect\(\(\) => \{[\s\S]*?onDetailChange\?\.\(active && detail\.phase === "open"\)/);
  assert.doesNotMatch(surface,/onDetailChange\?\.\(active && detail\.phase !== "closed"\)/);
  assert.match(surface,/portal && bridge && active && detail\.phase !== "closed"/);
  assert.match(read('src/surfaces/gallery/active-theory-gallery-surface.css'),/data-phase="closing"[^}]*opacity: 0; transition: opacity 300ms ease/);
});

test('detail clears the R3F restored background and uses this workspace renderer',()=>{
  const scene=fs.readFileSync(new URL('../../../packages/preacherman-avatar-renderer/src/InteractiveAvatarScene.tsx',import.meta.url),'utf8');
  assert.match(scene,/if \(isolateCompanion\) scene\.background = null/);
  assert.match(scene,/setClearAlpha\(environment === "cinematic" && !isolateCompanion \? 1 : 0\)/);
  assert.ok(read('vite.config.ts').includes('find: /^@preacherman\\/avatar-renderer$/, replacement: rendererSource("index.ts")'));
  const viewport=fs.readFileSync(new URL('../../../packages/preacherman-avatar-renderer/src/InteractiveAvatarViewport.tsx',import.meta.url),'utf8');
  assert.match(viewport,/setClearColor\(0x010409, environment === "cinematic" && !isolateCompanion \? 1 : 0\)/);
});

test('Cortana activation is persistent, while detail preview never equips on entry',()=>{
  const app=read('src/App.tsx'),surface=read('src/surfaces/gallery/ActiveTheoryGallerySurface.tsx');
  assert.match(surface,/galleryModelForProject\(detail.project\)/);
  assert.match(surface,/onPreviewModelChange\(active && detail.phase === "open" \? modelId : null\)/);
  assert.match(app,/setPreferences\(\(current\) => \(\{ \.\.\.current, activeModelId: current\.activeModelId === modelId \? null : modelId \}\)\)/);
  assert.match(app,/savePreferences\(preferences\)/);
  assert.match(app,/const galleryModelId = galleryDetailOpen \? galleryPreviewModelId : activeModelId/);
  assert.match(app,/activeSurfaceType === "market" \? galleryModelId : activeModelId/);
  assert.match(read('src/surfaces/gallery/GalleryDetailOverlay.tsx'),/activated=\{activeModelId === modelId\}/);
});

test('click toggles application immediately with semantic keyboard support and visual feedback',()=>{
  const button=read('src/surfaces/gallery/GalleryActivateButton.tsx'),css=read('src/surfaces/gallery/active-theory-gallery-surface.css');
  assert.match(button,/onClick=\{\(\) => \{\s*onActivate\(modelId\)/);
  assert.match(button,/aria-pressed=\{activated\}/);
  assert.match(button,/disabled=\{!enabled\}/);
  assert.doesNotMatch(button,/onPointerDown|onKeyDown|onKeyUp|Hold to activate/);
  assert.match(button,/setTimeout\(\(\) => setShowFeedback\(false\)/);
  assert.match(button,/activated \? "Activated" : "Activate"/);
  assert.match(button,/M102 1H173/);assert.match(button,/M102 1H31/);
  assert.match(css,/\.gallery-detail__activate \{[^}]*background: transparent;/s);
  assert.match(css,/\.gallery-detail__activate \{[^}]*font-family: var\(--demo-font-primary\);/s);
  assert.match(css,/\.gallery-detail__back:hover \{[^}]*border: 0;[^}]*background: transparent;/s);
  assert.match(css,/align-items: flex-end/);
  assert.match(css,/prefers-reduced-motion/);
});

test('both assigned avatars share the Details label with their own links',()=>{
  const runtime=read('public/active-theory-gallery/gallery/assets/js/app.1780406240914.js');
  assert.ok(runtime.includes('title:title==="Cortana"||title==="ZIMA"?"Details":"Medium Case Study",href:caseStudyURL,animated:animateEntry,delay:800'));
});

test('second card presents the supplied ZIMA identity and the existing local model', () => {
  const projects = JSON.parse(read('public/active-theory-gallery/gallery/external/storage.googleapis.com/activetheory-v6.appspot.com/cms/projects-dev.json'));
  const second = [...projects].sort((a, b) => a.priority - b.priority)[1];
  assert.equal(second.slug, 'watson-masters');
  assert.equal(second.name, 'ZIMA');
  assert.equal(second.clientName, 'Alastair Reynolds');
  assert.equal(new Date(second.completionDate).getUTCFullYear(), 2019);
  assert.equal(second.tags, 'Preacherman Avatar');
  assert.equal(second.video.url, '/assets/gallery/zima-card-video.mp4');
  assert.equal(second.video.thumbnail, '/assets/gallery/zima-card-cover.jpg');
  assert.equal(fs.statSync(new URL('../public' + second.video.url, import.meta.url)).size, second.video.filesize);
  assert.ok(fs.statSync(new URL('../public' + second.video.thumbnail, import.meta.url)).size > 50_000);
  assert.equal(second.description, 'ZIMA is an artificial intelligence character created by science fiction writer Alastair Reynolds. Originally a simple robot tasked with cleaning blue swimming pool tiles, he became an artist renowned across the universe after years of upgrades and evolving intelligence. His work always centers on a shade of blue known as "Zima Blue".');
  assert.ok(fs.statSync(new URL('../public/assets/avatars/zima/zima-runtime.glb', import.meta.url)).size > 0);
});

test('detail navigation follows the card order, shares the selected video and keeps the original rail position', () => {
  const projects = [{perma:'secret-sky',title:'Cortana',videoURL:'cortana.mp4'}, {perma:'watson-masters',title:'ZIMA',videoURL:'zima.mp4'}, {perma:'third',title:'Third',videoURL:'third.mp4'}];
  const f = fixture(projects);
  assert.equal(f.api.navigate(1), false);
  f.enter(projects[0]);
  assert.equal(f.api.snapshot.hasPrevious, false);
  assert.equal(f.api.snapshot.hasNext, true);
  assert.equal(f.api.navigate(-1), false);
  f.api.closeWindow();
  assert.equal(f.api.navigate(1), true);
  assert.equal(f.api.snapshot.project, 'watson-masters');
  assert.equal(f.api.snapshot.smallWindow, true);
  assert.equal(f.api.snapshot.navigationEntry, true);
  assert.equal(f.videoUrl(), 'zima.mp4');
  assert.equal(f.api.isSwitching, true);
  assert.equal(f.api.navigate(1), true);
  assert.equal(f.api.snapshot.hasNext, false);
  assert.equal(f.api.navigate(1), false);
  assert.equal(f.api.navigate(-1), true);
  assert.equal(f.api.snapshot.project, 'watson-masters');
  assert.equal(f.api.navigate(0), false);
  f.scroll.scroll = 9200;
  f.api.back();f.finish();
  assert.equal(f.scroll.scroll, 4217);
});

test('side navigation keeps semantic chevrons stationary and moves all content in the correct direction', () => {
  const overlay = read('src/surfaces/gallery/GalleryDetailOverlay.tsx');
  const motion = read('src/surfaces/gallery/useGalleryCardNavigation.ts');
  const css = read('src/surfaces/gallery/active-theory-gallery-surface.css');
  assert.match(overlay, /aria-label="Previous character"/);
  assert.match(overlay, /aria-label="Next character"/);
  assert.match(overlay, /M24 8 12 32 24 56/);
  assert.match(overlay, /switching \|\| !detail.hasNext/);
  for (const layer of ['active-theory-gallery-surface', 'demo-app-shell__scene', 'gallery-detail__content']) assert.ok(motion.includes(layer));
  assert.match(motion, /animate\(0, -direction \* 100/);
  assert.match(motion, /animate\(direction \* 100, 0/);
  assert.match(motion, /animation.cancel\(\)/);
  assert.match(motion, /observer.disconnect\(\)/);
  assert.match(motion, /prefers-reduced-motion/);
  assert.match(css, /gallery-detail__step:focus-visible[^}]*var\(--demo-theme-focus\)/);
  assert.match(css, /gallery-detail__step:disabled/);
});
