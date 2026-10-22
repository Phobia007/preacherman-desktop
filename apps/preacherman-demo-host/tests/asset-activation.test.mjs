import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { transform } from 'esbuild';

const source=await readFile(new URL('../src/surfaces/asset/AssetActivateButton.tsx',import.meta.url),'utf8');
const {code}=await transform(source,{loader:'tsx',format:'cjs',jsx:'automatic'});
function fixture(options={}) {
  let now=0,id=0,phase='idle';const frames=new Map(),timers=new Map(),effects=[],cleanups=[],windowEvents=new Map(),documentEvents=new Map(),calls=[],styles={};
  const captures=new Set();
  const element={style:{setProperty:(key,value)=>styles[key]=value},focus(){},getBoundingClientRect:()=>({left:0,top:0,right:160,bottom:54}),setPointerCapture:value=>captures.add(value),hasPointerCapture:value=>captures.has(value),releasePointerCapture:value=>captures.delete(value)};
  const document={hidden:false,addEventListener:(key,fn)=>documentEvents.set(key,fn),removeEventListener:key=>documentEvents.delete(key)};
  const jsx=(type,props)=>({type,props});
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,performance:{now:()=>now},requestAnimationFrame:fn=>(frames.set(++id,fn),id),cancelAnimationFrame:id=>frames.delete(id),setTimeout:(fn,ms)=>(timers.set(++id,{fn,at:now+ms}),id),clearTimeout:id=>timers.delete(id),document,
    window:{addEventListener:(key,fn)=>windowEvents.set(key,fn),removeEventListener:key=>windowEvents.delete(key)},
    require:name=>name==='react/jsx-runtime'?{jsx,jsxs:jsx,Fragment:'fragment'}:name==='react'?{useCallback:fn=>fn,useRef:current=>({current}),useState:value=>[value,next=>{if(typeof value==='string')phase=next;}],useId:()=>':activation:',useEffect:fn=>effects.push(fn),useLayoutEffect:fn=>effects.push(fn)}:name==='@preacherman/avatar-renderer'?{avatarModelName:()=> 'Cortana'}:{}});
  const tree=module.exports.AssetActivateButton({modelId:'cortana',activated:false,enabled:true,onActivate:id=>calls.push(id),...options});
  const button=tree.props.children.find(child=>child.type==='button').props;button.ref.current=element;
  for(const effect of effects)cleanups.push(effect());
  const event=values=>({currentTarget:element,isPrimary:true,button:0,pointerId:1,preventDefault(){},...values});
  return {button,calls,styles,frames,event,get phase(){return phase;},
    pointer:()=>button.onPointerDown(event()),
    key:(key,repeat=false)=>button.onKeyDown(event({key,repeat})),
    tick:time=>{now=time;const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(now);for(const[id,timer]of timers){if(timer.at<=now){timers.delete(id);timer.fn();}}},
    blur:()=>windowEvents.get('blur')(),hidden:()=>{document.hidden=true;documentEvents.get('visibilitychange')();},
    cleanup:()=>{for(const fn of cleanups)fn?.();assert.equal(frames.size,0);assert.equal(timers.size,0);assert.equal(windowEvents.size,0);assert.equal(documentEvents.size,0);}
  };
}

test('a full hold accelerates from the center and activates exactly once at completion',()=>{
  const f=fixture();try{
    f.pointer();f.tick(400);const early=Number(f.styles['--asset-charge']);assert.ok(early>0&&early<.1);assert.deepEqual(f.calls,[]);
    f.tick(800);const middle=Number(f.styles['--asset-charge']);f.tick(1200);const late=Number(f.styles['--asset-charge']);assert.ok(late-middle>middle-early);
    f.tick(1599);assert.deepEqual(f.calls,[]);f.tick(1600);assert.deepEqual(f.calls,['cortana']);f.tick(3200);assert.deepEqual(f.calls,['cortana']);
  }finally{f.cleanup();}
});
for(const reason of ['release','leave','pointercancel','lostcapture','blur','hidden','escape','unmount'])test(`unfinished hold cancels on ${reason}`,()=>{
  const f=fixture();try{
    f.pointer();f.tick(600);
    if(reason==='release')f.button.onPointerUp(f.event());
    if(reason==='leave')f.button.onPointerMove(f.event({clientX:161,clientY:20}));
    if(reason==='pointercancel')f.button.onPointerCancel();
    if(reason==='lostcapture')f.button.onLostPointerCapture();
    if(reason==='blur')f.blur();if(reason==='hidden')f.hidden();if(reason==='escape')f.key('Escape');
    if(reason==='unmount')f.cleanup();
    f.tick(2000);assert.deepEqual(f.calls,[]);
  }finally{f.cleanup();}
});
test('quick clicks, secondary pointers, and disabled controls cannot activate',()=>{
  const f=fixture(),disabled=fixture({enabled:false});try{
    f.button.onClick(f.event());f.pointer();f.tick(80);f.button.onPointerUp(f.event());f.tick(2000);assert.deepEqual(f.calls,[]);
    f.button.onPointerDown(f.event({button:2}));f.button.onPointerDown(f.event({isPrimary:false}));f.tick(4000);assert.deepEqual(f.calls,[]);
    disabled.key('Enter');disabled.tick(2000);assert.deepEqual(disabled.calls,[]);
  }finally{f.cleanup();disabled.cleanup();}
});
for(const key of ['Enter',' '])test(`${key===' '?'Space':key} requires a continuous hold and ignores repeat events`,()=>{
  const f=fixture({activated:true});try{
    f.key(key);f.tick(700);f.button.onKeyUp(f.event({key}));f.tick(2000);assert.deepEqual(f.calls,[]);
    f.key(key);f.tick(2600);f.key(key,true);f.tick(3600);assert.deepEqual(f.calls,['cortana']);f.button.onKeyUp(f.event({key}));
  }finally{f.cleanup();}
});

test('release retraces the original charge curve for the same elapsed duration',()=>{
  const f=fixture();try{
    f.pointer();f.tick(400);const quarter=Number(f.styles['--asset-charge']);f.tick(800);const half=Number(f.styles['--asset-charge']);
    f.button.onPointerUp(f.event());assert.equal(f.phase,'releasing');assert.equal(Number(f.styles['--asset-charge']),half,'No disappearance on release');
    f.tick(1200);assert.equal(Number(f.styles['--asset-charge']),quarter);assert.deepEqual(f.calls,[]);
    f.tick(1599);assert.ok(Number(f.styles['--asset-charge'])>0);f.tick(1600);assert.equal(Number(f.styles['--asset-charge']),0);assert.equal(f.phase,'idle');
  }finally{f.cleanup();}
});

test('pressing again during rewind resumes continuously from the remaining charge',()=>{
  const f=fixture();try{
    f.pointer();f.tick(800);f.button.onPointerUp(f.event());f.tick(1000);const remaining=f.styles['--asset-charge'];
    f.pointer();assert.equal(f.styles['--asset-charge'],remaining);f.tick(1999);assert.deepEqual(f.calls,[]);f.tick(2000);assert.deepEqual(f.calls,['cortana']);
  }finally{f.cleanup();}
});

for(const activated of [false,true])test(`completion shows the check before the ${activated?'Activate':'Activated'} label, blocking double activation`,()=>{
  const f=fixture({activated});try{
    f.pointer();f.tick(1600);assert.equal(f.phase,'confirmed');assert.deepEqual(f.calls,['cortana']);
    f.key('Enter');f.tick(1900);assert.equal(f.phase,'confirmed');assert.deepEqual(f.calls,['cortana']);
    f.tick(2320);assert.equal(f.phase,'idle');assert.equal(Number(f.styles['--asset-charge']),0);assert.deepEqual(f.calls,['cortana']);
  }finally{f.cleanup();}
});
