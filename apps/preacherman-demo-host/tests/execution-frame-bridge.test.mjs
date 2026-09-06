import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import { transform } from "esbuild";

const source = await readFile(new URL("../src/execution/useExecutionFrameBridge.ts", import.meta.url), "utf8");
const compiled = (await transform(source.replace(/^import .*;$/gm, "").replace("export function", "function"), {loader:"ts", target:"es2022"})).code;
function fixture() {
  let cleanup, effect, observerCallback;
  const handlers = new Map(), posts = [], calls = [];
  const frame = {postMessage:data => posts.push(data)};
  const config = {connections:[{id:"connection",name:"Work API",model:"model",keySaved:true,apiKey:"never-forward"}],local:{agentId:"codex-cli",label:"Codex CLI",workspaceId:"workspace"},active:{mode:"api",connectionId:"connection",model:"model"}};
  const context = {
    useEffect:callback=>{effect=callback;}, AbortController, AbortSignal, location:{origin:"http://localhost"}, getComputedStyle:()=>({getPropertyValue:()=>"#fff"}),
    document:{querySelector:()=>null,documentElement:{dataset:{appearance:"dark"}}},
    MutationObserver:class {constructor(callback){observerCallback=callback;}observe(){}disconnect(){}},
    window:{addEventListener:(name,callback)=>handlers.set(name,callback),removeEventListener:name=>handlers.delete(name)},
    preachermanServiceRequest:async(path,init)=>{calls.push({path,init});return path==="/api/settings/execution"?config:{text:"Reply",task:{taskId:"local-task",status:"awaiting-approval"}};},
  };
  vm.runInNewContext(compiled+"\nglobalThis.hook=useExecutionFrameBridge;",context);
  context.hook({current:{contentWindow:frame}});cleanup=effect();
  const receive=data=>handlers.get("message")({source:frame,origin:"http://localhost",data});
  return {frame,posts,calls,config,handlers,receive,cleanup,theme:()=>observerCallback()};
}
const settled=()=>new Promise(resolve=>setImmediate(resolve));

test("both conversation frames receive only saved public connections and refresh after Settings changes",async()=>{
  const task=fixture(),gallery=fixture();
  try {
    for(const f of [task,gallery]){
      f.receive({type:"gallery-provider-request"});await settled();
      const catalog=f.posts.find(p=>p.type==="gallery-provider-catalog");
      assert.equal(catalog.providers.length,2);assert.equal(catalog.providers[1].kind,"cli");
      assert.equal(JSON.stringify(f.posts).includes("never-forward"),false);
      f.config.active={mode:"cli",agentId:"codex-cli",model:"default"};
      await f.handlers.get("preacherman-execution-changed")();
      assert.equal(f.posts.at(-1).active.mode,"cli");
      f.theme();assert.equal(f.posts.at(-1).type,"gallery-conversation-theme");
    }
  } finally {task.cleanup();gallery.cleanup();}
});
test("API messages and local task approvals route through their real service endpoints",async()=>{
  const f=fixture();
  try{
    f.receive({type:"gallery-execution-request",requestId:"api",action:"chat",selection:{providerId:"connection",modelId:"model"},messages:[{role:"user",content:"Hello"}]});await settled();
    assert.equal(f.calls.at(-1).path,"/api/execution/chat");
    assert.equal(JSON.parse(f.calls.at(-1).init.body).connectionId,"connection");
    f.receive({type:"gallery-execution-request",requestId:"cli",action:"chat",selection:{providerId:"codex-cli",modelId:"default"},messages:[{role:"user",content:"Local objective"}]});await settled();
    assert.equal(f.calls.at(-1).path,"/api/execution/local-turn");
    assert.equal(JSON.parse(f.calls.at(-1).init.body).workspaceId,"workspace");
    assert.ok(!f.calls.some(c=>c.path.endsWith("/commands")));
    for(const action of ["status","approve","reject","cancel"]){
      f.receive({type:"gallery-execution-request",requestId:action,action,taskId:"local-task",approvalId:"approval"});await settled();
      assert.equal(f.calls.at(-1).path,"/api/tasks/local-task"+(action==="status"?"":"/commands"));
      if(action!=="status")assert.equal(JSON.parse(f.calls.at(-1).init.body).type,action);
    }
  }finally{f.cleanup();}
});
test("foreign frames and invalid operations cannot use the bridge; disposal removes listeners",async()=>{
  const f=fixture(),message=f.handlers.get("message");
  message({source:{},origin:"http://localhost",data:{type:"gallery-provider-request"}});
  message({source:f.frame,origin:"https://foreign.example",data:{type:"gallery-provider-request"}});
  assert.equal(f.calls.length,0);
  f.receive({type:"gallery-execution-request",requestId:"bad",action:"approve",taskId:"../settings"});
  await settled();assert.equal(f.calls.length,0);assert.match(f.posts.at(-1).error,/Invalid task/);
  f.cleanup();assert.equal(f.handlers.size,0);
});
