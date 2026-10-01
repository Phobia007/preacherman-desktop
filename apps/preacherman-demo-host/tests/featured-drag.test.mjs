import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const source=await readFile(new URL('../src/surfaces/market/featuredDrag.ts',import.meta.url),'utf8');
function harness(scale=1) {
  class Element {closest(){return this;} blur(){this.blurred=true;} click(){this.clicks=(this.clicks||0)+1;} }
  const button=new Element(), listeners=new Map(), windowListeners=new Map(), captures=new Set(), deltas=[];
  let active=true;
  const host={dataset:{},clientWidth:1800,getBoundingClientRect:()=>({width:1800*scale}),contains:el=>el===button,
    setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id),
    addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  const env={exports:{},Element,HTMLElement:Element,document:{activeElement:null},window:{addEventListener:(name,fn)=>windowListeners.set(name,fn),removeEventListener:name=>windowListeners.delete(name)}};
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,env);
  const binding=env.exports.bindFeaturedDrag(host,delta=>deltas.push(delta),()=>active);
  const fire=(type,props={})=>{const event={pointerId:1,isPrimary:true,button:0,clientX:100,target:button,detail:1,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...props};listeners.get(type)?.(event);return event;};
  return {host,button,listeners,windowListeners,captures,deltas,binding,fire,env,setActive:value=>active=value};
}
test('drag displacement uses stage scale, accumulates in both directions and leaves the automatic clock independent',()=>{
  const h=harness(.5);try{let auto=100;h.fire('pointerdown');h.fire('pointermove',{clientX:150});auto+=24;
    h.fire('pointermove',{clientX:120});assert.deepEqual(h.deltas,[100,-60]);assert.equal(auto-h.deltas.reduce((a,b)=>a+b,0),84);
    assert.equal(h.host.dataset.dragging,'true');assert.ok(h.captures.has(1));h.fire('pointerup',{clientX:120});assert.equal(h.button.clicks,undefined);assert.equal(h.captures.size,0);
  }finally{h.binding.dispose();}
});
test('small pointer jitter selects exactly once and keyboard activation is not swallowed',()=>{
  const h=harness();try{h.fire('pointerdown');h.fire('pointermove',{clientX:102});h.fire('pointerup',{clientX:102});assert.equal(h.button.clicks,1);assert.deepEqual(h.deltas,[]);
    const native=h.fire('click');assert.ok(native.prevented&&native.stopped);assert.equal(h.fire('click',{detail:0}).prevented,undefined);
  }finally{h.binding.dispose();}
});
test('drag release outside the strip cannot open a model, and the next ordinary click still works',()=>{
  const h=harness();try{h.fire('pointerdown');h.fire('pointermove',{clientX:-500,target:h.host});h.fire('pointerup',{clientX:-500,target:h.host});
    assert.equal(h.button.clicks,undefined);assert.ok(h.fire('click').stopped);h.fire('pointerdown');h.fire('pointerup');assert.equal(h.button.clicks,1);
  }finally{h.binding.dispose();}
});
test('cancellation, lost capture, hidden state and window blur release drag state without selecting a card',()=>{
  for(const interrupt of ['pointercancel','lostpointercapture','hidden','blur']) {
    const h=harness();try{h.fire('pointerdown');h.fire('pointermove',{clientX:180});
      if(interrupt==='hidden'){h.setActive(false);h.fire('pointermove',{clientX:250});}else if(interrupt==='blur')h.windowListeners.get('blur')();else h.fire(interrupt);
      assert.equal(h.captures.size,0);assert.equal(h.host.dataset.dragging,undefined);h.fire('pointerup');assert.equal(h.button.clicks,undefined);
    }finally{h.binding.dispose();assert.equal(h.listeners.size,0);assert.equal(h.windowListeners.size,0);}
  }
});
test('only the active primary pointer can drag; pointer focus cannot leave keyboard motion paused',()=>{
  const h=harness();try{h.fire('pointerdown',{button:2});h.fire('pointerdown',{isPrimary:false});assert.equal(h.captures.size,0);
    h.env.document.activeElement=h.button;assert.ok(h.fire('pointerdown').prevented);assert.ok(h.button.blurred);
    h.fire('pointermove',{pointerId:2,clientX:300});assert.deepEqual(h.deltas,[]);h.binding.dispose();assert.equal(h.captures.size,0);
  }finally{h.binding.dispose();}
});
