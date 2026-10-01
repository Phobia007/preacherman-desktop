import test from 'node:test';
import assert from 'node:assert/strict';
import {createSurfaceNavigator} from '../src/app-shell/surfaceNavigation.ts';
const route=surfaceType=>({kind:'surface',surfaceType});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
 const states=[],motions=[];
 const controller=createSurfaceNavigator(route('workspace'),()=>{
  const runs=[];const motion={runs,disposed:false,play(direction){let resolve;const finished=new Promise(r=>resolve=r);runs.push({direction,resolve});return finished;},dispose(){this.disposed=true;}};
  motions.push(motion);return motion;
 },(r,phase,target)=>states.push({surface:r.surfaceType,phase,target:target.surfaceType}));
 return {controller,states,motions};
}
test('outgoing page remains mounted and consecutive choices replace one destination',async()=>{
 const {controller,states,motions}=harness();
 controller.request(route('market'));controller.request(route('ledger'));controller.request(route('settings'));
 assert.equal(motions.length,1);assert.equal(motions[0].runs.length,1);
 assert.ok(states.every(s=>s.surface==='workspace'&&s.phase==='exiting'));
 motions[0].runs[0].resolve();await tick();
 assert.deepEqual(states.at(-1),{surface:'settings',phase:'idle',target:'settings'});assert.ok(motions[0].disposed);
 controller.dispose();
});
test('clicking the outgoing page reverses in place and ignores superseded completions',async()=>{
 const {controller,states,motions}=harness();
 controller.request(route('account'));controller.request(route('workspace'));
 assert.deepEqual(motions[0].runs.map(r=>r.direction),['out','in']);
 motions[0].runs[0].resolve();await tick();assert.equal(states.at(-1).phase,'returning');
 controller.request(route('asset'));assert.equal(motions[0].runs[2].direction,'out');
 motions[0].runs[1].resolve();await tick();assert.equal(states.at(-1).phase,'exiting');
 motions[0].runs[2].resolve();await tick();assert.equal(states.at(-1).surface,'asset');controller.dispose();
});
test('same-page requests are no-ops; dispose suppresses late route commits',async()=>{
 const {controller,states,motions}=harness();controller.request(route('workspace'));assert.equal(motions.length,0);
 controller.request(route('extension'));controller.dispose();motions[0].runs[0].resolve();await tick();
 assert.equal(states.at(-1).phase,'exiting');assert.ok(motions[0].disposed);
});
