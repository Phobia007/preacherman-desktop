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
