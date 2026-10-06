import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const src=readFileSync(new URL('../src/surfaces/task/useTaskWorkspaceBridge.ts',import.meta.url),'utf8');
const compiled=ts.transpile(src.replace(/^import .*;$/gm,'').replace('export function','function'),{target:ts.ScriptTarget.ES2022});
function fixture(){
 const handlers=new Map(),frameHandlers=new Map(),posts=[],calls=[];let cleanup,finish,fail;
 const frame={postMessage:value=>posts.push(value)};
 const context={AbortController,AbortSignal,location:{origin:'http://localhost'},useEffect:f=>{cleanup=f();},
 window:{addEventListener:(n,f)=>handlers.set(n,f),removeEventListener:n=>handlers.delete(n)},
 preachermanServiceRequest:(path,init)=>{calls.push({path,init});return new Promise((resolve,reject)=>{finish=resolve;fail=reject;});}};
 vm.runInNewContext(compiled+'\nglobalThis.hook=useTaskWorkspaceBridge;',context);
 context.hook({current:{contentWindow:frame,addEventListener:(n,f)=>frameHandlers.set(n,f),removeEventListener:n=>frameHandlers.delete(n)}});
 const receive=(data,extra={})=>handlers.get('message')({data:{type:'task-workspace-request',requestId:'one',action:'pick',...data},source:frame,origin:'http://localhost',...extra});
 return {receive,calls,posts,handlers,frameHandlers,finish:value=>finish(value),fail:()=>fail(Error('failure')),cleanup:()=>cleanup()};
}
test('workspace picker accepts only its own iframe and returns a path without capability tokens',async()=>{
 const f=fixture();try{
 await f.receive({}, {source:{}});await f.receive({}, {origin:'https://untrusted.example'});assert.equal(f.calls.length,0);
 const done=f.receive({});assert.equal(f.calls[0].path,'/api/execution/workspaces/pick');
 await f.receive({requestId:'duplicate'});assert.equal(f.calls.length,1);
 f.finish({selection:{path:'D:/project',token:'must-stay-in-host'}});await done;
 assert.equal(f.posts[0].workspace.path,'D:/project');assert.ok(!JSON.stringify(f.posts).includes('must-stay-in-host'));
 }finally{f.cleanup();}
});
test('cancel, route load and unmount abort the owned picker without late results',async()=>{
 for(const how of ['cancel','load','unmount']){
 const f=fixture();const done=f.receive({});
 if(how==='cancel')await f.receive({action:'cancel'});else if(how==='load')f.frameHandlers.get('load')();else f.cleanup();
 assert.equal(f.calls[0].init.signal.aborted,true);f.finish({selection:{path:'D:/late'}});await done;assert.equal(f.posts.length,0);f.cleanup();assert.equal(f.handlers.size,0);
 }
});
test('cancelled selection preserves form choice; service failure is returned as a readable error',async()=>{
 const f=fixture();try{let done=f.receive({});f.finish({selection:null});await done;assert.equal(f.posts[0].workspace,null);
 done=f.receive({});f.fail();await done;assert.match(f.posts[1].error,/无法选择/);
 }finally{f.cleanup();}
});
