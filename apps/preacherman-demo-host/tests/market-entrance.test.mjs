import assert from 'node:assert/strict';
import test from 'node:test';
import { animateMarketPanels, MARKET_LOGO_MS, MARKET_PANELS_MS } from '../src/surfaces/market/marketEntrance.ts';
for(const appearance of ['light','dark']) test(`Market columns enter together from opposite sides and release in ${appearance}`,async()=>{
 const recorded=[];
 const panel=(left,top)=>({getBoundingClientRect:()=>({left,top,bottom:top+900}),animate(frames,options){const a={frames,options,cancelled:false,finished:Promise.resolve(),cancel(){this.cancelled=true;}};recorded.push(a);return a;}});
 const doc={documentElement:{dataset:{appearance}},defaultView:{innerWidth:1800,innerHeight:900},timeline:{currentTime:42},querySelectorAll:()=>[panel(0,0),panel(900,0),panel(0,900),panel(900,900)]};
 const motion=animateMarketPanels(doc,false);
 assert.equal(recorded.length,2,'offscreen rows do not allocate animation layers');
 assert.match(recorded[0].frames[0].transform,/-100%/);assert.match(recorded[1].frames[0].transform,/\(100%/);
 assert(recorded.every(a=>a.startTime===42&&a.options.duration===MARKET_PANELS_MS));
 assert.equal(MARKET_LOGO_MS,420);assert.equal(MARKET_PANELS_MS,760);
 await motion.finished;motion.cancel();assert(recorded.every(a=>a.cancelled));
 recorded.length=0;await animateMarketPanels(doc,true).finished;assert.equal(recorded.length,0,'reduced motion reveals content without translation');
});

for(const appearance of ['light','dark']) test(`Details reverses both visible columns in ${appearance} and cancels cleanly`,async()=>{
 const recorded=[];
 const panel=(left,top)=>({getBoundingClientRect:()=>({left,top,bottom:top+900}),animate(frames,options){const a={frames,options,cancelled:false,finished:Promise.resolve(),cancel(){this.cancelled=true;}};recorded.push(a);return a;}});
 const doc={documentElement:{dataset:{appearance}},defaultView:{innerWidth:1800,innerHeight:1000},timeline:{currentTime:42},querySelectorAll:()=>[panel(0,-400),panel(900,-400),panel(0,500),panel(900,500),panel(0,1400)]};
 const motion=animateMarketPanels(doc,false,'out');
 assert.equal(recorded.length,4,'both partially visible rows leave together');
 assert(recorded.every(a=>a.frames[0].transform==='translate3d(0, 0, 0)'&&a.startTime===42));
 assert.match(recorded[0].frames[1].transform,/-100%/);assert.match(recorded[1].frames[1].transform,/\(100%/);
 await motion.finished;motion.cancel();assert(recorded.every(a=>a.cancelled));
 recorded.length=0;await animateMarketPanels(doc,true,'out').finished;assert.equal(recorded.length,0);
});
import { revealMarketDetails, MARKET_MODEL_REVEAL_MS, MARKET_DETAILS_CONTENT_MS } from '../src/surfaces/market/marketEntrance.ts';
import { marketCategories, marketCategoryReducer, initialMarketCategory, animateMarketFrost } from '../src/surfaces/market/marketEntrance.ts';
for (const appearance of ['light', 'dark']) test(`Market category buttons sequence exit before entry and reject repeated transitions in ${appearance}`, () => {
 let state = initialMarketCategory;
 for (const category of [...marketCategories.slice(1), 'Discover']) {
   const previous = state.active;
   state = marketCategoryReducer(state, { type: 'select', category });
   assert.equal(state.active, previous); assert.equal(state.phase, 'exiting');
   assert.equal(marketCategoryReducer(state, { type: 'select', category: 'Sell' }), state, 'Rapid clicks do not replace an active transition');
   assert.equal(marketCategoryReducer(state, { type: 'entered' }), state, 'Stale completion cannot skip exit');
   state = marketCategoryReducer(state, { type: 'exited' });
   assert.equal(state.active, category); assert.equal(state.phase, 'entering');
   state = marketCategoryReducer(state, { type: 'entered' });
   assert.equal(state.phase, 'idle'); assert.equal(state.next, null);
   assert.equal(marketCategoryReducer(state, { type: 'select', category }), state);
 }
});
for (const appearance of ['light', 'dark']) test(`Market uses one seamless blur with opposite reveal edges in ${appearance}`, async () => {
 const recorded = [];
 const layer = { ownerDocument: { documentElement: { dataset: { appearance } }, timeline: { currentTime: 42 } }, animate(frames, options) { const animation = {frames, options, finished:Promise.resolve(),cancel(){this.cancelled=true;}};recorded.push(animation);return animation; } };
 const motion = animateMarketFrost(layer, false, 'out');
 assert.equal(recorded.length, 1, 'Only one backdrop is rendered, including across the center');
 assert.match(recorded[0].frames[0].clipPath, /50%/);
 assert.doesNotMatch(recorded[0].frames[1].clipPath, /50%/);
 assert.equal(recorded[0].startTime, 42);assert.equal(recorded[0].options.duration, MARKET_PANELS_MS);
 await motion.finished;motion.cancel();assert.ok(recorded[0].cancelled, 'Settling removes the clip entirely');
 recorded.length=0;const enter=animateMarketFrost(layer,false);assert.doesNotMatch(recorded[0].frames[0].clipPath,/50%/);assert.match(recorded[0].frames[1].clipPath,/50%/);enter.cancel();
 recorded.length=0;await animateMarketFrost(layer,true).finished;assert.equal(recorded.length,0);
});
for (const appearance of ['light', 'dark']) for (const part of ['model', 'content']) test(`Details ${part} fade is reversible and cancellable in ${appearance}`, async () => {
 const frames = new Map(), animations = [];
 let serial = 0;
 const viewport = { requestAnimationFrame(fn) { frames.set(++serial, fn); return serial; }, cancelAnimationFrame(id) { frames.delete(id); } };
 const flush = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn()); };
 const panel = { ownerDocument: { defaultView: viewport, documentElement: { dataset: { appearance } } }, querySelectorAll: () => Array.from({length:part==='content'?3:1}, () => ({ animate(keyframes, options) { const a = { keyframes, options, plays:0, cancelled:false, finished:Promise.resolve(), pause() {}, play() { this.plays++; }, cancel() { this.cancelled=true; } }; animations.push(a); return a; } })) };
 const entrance = revealMarketDetails(panel, part, false);
 flush();flush();await entrance.finished;
 assert(animations.every(a=>a.keyframes[0].opacity===0&&a.keyframes[1].opacity===1&&a.plays===1));
 entrance.cancel();animations.length=0;
 const reverse = revealMarketDetails(panel, part, false, 'out');
 assert(animations.every(a=>a.keyframes[0].opacity===1&&a.keyframes[1].opacity===0&&a.plays===0));
 assert(animations.every(a=>a.options.duration===(part==='model'?MARKET_MODEL_REVEAL_MS:MARKET_DETAILS_CONTENT_MS)));
 flush();flush();await reverse.finished;assert(animations.every(a=>a.plays===1));reverse.cancel();assert(animations.every(a=>a.cancelled));
 animations.length=0;
 const interrupted=revealMarketDetails(panel,part,false,'out');flush();interrupted.cancel();flush();assert(animations.every(a=>a.plays===0&&a.cancelled),'unmount cancels the queued fade before it can play');
 animations.length=0;await revealMarketDetails(panel,part,true,'out').finished;assert.equal(animations.length,0);assert.equal(frames.size,0);
});
