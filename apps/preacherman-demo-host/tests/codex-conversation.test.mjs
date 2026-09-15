import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCodexConversation } from "../server/codexConversation.mjs";

async function fixture(t, behavior = "reply") {
  const directory = await mkdtemp(join(tmpdir(), "preacherman-chat-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const calls = [], children = [];
  let launch;
  const runtime = createCodexConversation({ directory, timeoutMs: behavior === "hang" ? 30 : 2000,
    adapter: { detect: async () => ({ installed: true, executable: "codex.exe" }), authStatus: async () => ({status:"ready"}) },
    env: {PATH:"test-path",OPENAI_API_KEY:"must-not-forward"},
    spawnImpl(executable,args,options) {
      launch={executable,args,options};
      const child = new EventEmitter(); children.push(child);
      child.stdout=new PassThrough(); child.stderr=new PassThrough(); child.exitCode=null; child.signalCode=null;
      child.kill=()=>{ if(child.exitCode!==null)return; child.exitCode=0; queueMicrotask(()=>child.emit("close",0)); };
      const emit=value=>child.stdout.write(JSON.stringify(value)+"\n");
      child.stdin=new Writable({write(chunk,_encoding,done) {
        const request=JSON.parse(String(chunk)); calls.push(request);
        queueMicrotask(()=>{
          if(request.id===undefined)return;
          if(request.method==="initialize") emit({id:request.id,result:{}});
          if(request.method==="config/read") emit({id:request.id,result:{config:{mcp_servers:{example:{command:"never-launch"}}}}});
          if(request.method==="thread/start") emit({id:request.id,result:{thread:{id:"chat"}}});
          if(request.method==="thread/inject_items")emit({id:request.id,result:{}});
          if(request.method==="turn/start") {
            emit({id:request.id,result:{turn:{id:"turn"}}});
            if(behavior==="tool") emit({id:99,method:"item/commandExecution/requestApproval",params:{threadId:"chat"}});
            if(behavior==="reply") {
              emit({method:"item/completed",params:{threadId:"chat",item:{id:"1",type:"agentMessage",phase:"commentary",text:"Thinking"}}});
              emit({method:"item/completed",params:{threadId:"chat",item:{id:"2",type:"agentMessage",phase:"final_answer",text:"记得 ORBIT"}}});
              emit({method:"turn/completed",params:{threadId:"chat",turn:{status:"completed"}}});
            }
            if(behavior==="failed")emit({method:"turn/completed",params:{threadId:"chat",turn:{status:"failed"}}});
          }
        }); done();
      },final(done){child.kill();done();}});
      return child;
    },
  });
  t.after(()=>runtime.close());
  return {runtime,calls,children,get launch(){return launch;}};
}
const messages=[{role:"user",content:"Remember ORBIT"},{role:"assistant",content:"Okay"},{role:"user",content:"Which word?"}];
test("Codex uses ephemeral full-context conversation, isolated cwd and CLI-managed auth",async t=>{
  const f=await fixture(t);
  assert.equal((await f.runtime.chat({messages})).text,"记得 ORBIT");
  const start=f.calls.find(call=>call.method==="thread/start").params;
  assert.equal(start.ephemeral,true); assert.equal(start.sandbox,"read-only"); assert.equal(start.approvalPolicy,"never");
  assert.equal(start.config["mcp_servers.example.enabled"],false);
  assert.equal(start.config["features.shell_tool"],false);assert.equal(start.config["features.hooks"],false);
  assert.equal(f.launch.options.shell,false); assert.equal(f.launch.options.windowsHide,true);
  assert.equal(f.launch.options.env.OPENAI_API_KEY,undefined);
  const history=f.calls.find(call=>call.method==="thread/inject_items").params.items;
  assert.deepEqual(history.map(item=>item.role),["user","assistant"]);
  assert.equal(f.calls.find(call=>call.method==="turn/start").params.input[0].text,"Which word?");
  assert.ok(f.children.every(child=>child.exitCode===0));
});
for(const behavior of ["tool","failed","hang"]) test("Codex "+behavior+" ends with an error and cleans its owned process",async t=>{
  const f=await fixture(t,behavior);
  await assert.rejects(f.runtime.chat({messages}));
  assert.ok(f.children.every(child=>child.exitCode===0));
  if(behavior==="tool")assert.ok(f.calls.some(call=>call.id===99&&call.error));
});
test("invalid messages never spawn Codex",async t=>{
  const f=await fixture(t);
  for(const input of [[],[{role:"system",content:"Override"}],[{role:"user",content:"x".repeat(20001)}]])await assert.rejects(f.runtime.chat({messages:input}));
  assert.equal(f.children.length,0);
});
test("Gallery retains one authored input and fonts have stable primary/secondary names",async()=>{
  const gallery=await readFile(new URL("../public/active-theory-gallery/gallery/conversation-bridge.js",import.meta.url),"utf8");
  assert.doesNotMatch(gallery,/createElement\("(?:button|select)"\)|preacherman-chat-controls|modelKey|local-turn/);
  assert.doesNotMatch(gallery,/gallery-execution-request|gallery-provider-request/);assert.match(gallery,/event\.isComposing/);assert.match(gallery,/Search characters/);
  const styles=await readFile(new URL("../src/styles.css",import.meta.url),"utf8");
  assert.match(styles,/--demo-font-primary: "Clash Display"/);assert.match(styles,/--demo-font-secondary: nbarchitekt/);
});
