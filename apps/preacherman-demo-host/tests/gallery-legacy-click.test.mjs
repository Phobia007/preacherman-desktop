import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
const runtime=fs.readFileSync(new URL('../public/active-theory-gallery/gallery/assets/js/app.1780406240914.js',import.meta.url),'utf8');
const click=runtime.match(/defer\(\(_=>\{([^{}]*ChatDOM\/isFocused[\s\S]*?)\}\)\)\}\),\{url:`work\//)[1];
function fixture(nativeRail='false',owner){
 const calls=[];
 const card={data:{perma:'cortana'},get:key=>key==='ChatDOM/lastClick'?0:false,findParent:()=>({scrollProgress:0}),navigate:url=>calls.push(url)};
 const flush=vm.runInNewContext('(function(){'+click+'})',{_this:card,document:{documentElement:{dataset:{galleryNativeRail:nativeRail,galleryNavigationOwner:owner}}},Date});
 return {card,flush,calls};
}
test('Deferred legacy click ignores a card destroyed before the next frame',()=>{const f=fixture();delete f.card.get;assert.doesNotThrow(f.flush);assert.deepEqual(f.calls,[]);});
test('The native orbit owns card picking while the legacy canvas is hidden',()=>{const f=fixture('true');f.card.get=()=>{throw Error('legacy interaction should be bypassed');};assert.doesNotThrow(f.flush);assert.deepEqual(f.calls,[]);});
test('A live legacy room card retains its original navigation',()=>{const f=fixture();f.flush();assert.deepEqual(f.calls,['work/cortana']);});

for (const phase of ['open','closing']) test(`Queued legacy picking cannot navigate during native ${phase}`,()=>{
 const f=fixture('false','native');f.flush();assert.deepEqual(f.calls,[]);
});

test('legacy fallback installs no mouse handlers when native navigation owns the Gallery',()=>{
 const source=fs.readFileSync(new URL('../public/active-theory-gallery/gallery/interaction-bridge.js',import.meta.url),'utf8');
 const window={};
 vm.runInNewContext(source,{window,document:{documentElement:{dataset:{galleryNavigationOwner:'native'}}}});
 assert.equal(window.__PREACHERMAN_INTERACTION_BRIDGE__.owner,'native');
 assert.equal(window.__PREACHERMAN_INTERACTION_BRIDGE__.installed,true);
});
