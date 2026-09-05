import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {discoverLocalAgents} from "../server/local-agent/localAgentDiscovery.mjs";

test("discovery lists actual native binaries and wrappers, never absent products or false adapters",async t=>{
  const root=await mkdtemp(path.join(tmpdir(),"preacherman-discovery-"));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const bin=path.join(root,".local","bin");await mkdir(bin,{recursive:true});
  await writeFile(path.join(bin,"claude.exe"),"fixture");
  await writeFile(path.join(bin,"gemini.cmd"),"must never execute wrapper");
  const calls=[];
  const found=await discoverLocalAgents({platform:"win32",env:{PATH:"",USERPROFILE:root,OPENAI_API_KEY:"secret"},probe:async(command,args,options)=>{
    calls.push(command);assert.deepEqual(args,["--version"]);assert.equal(options.shell,false);assert.equal(options.env.OPENAI_API_KEY,undefined);
    return {stdout:"Claude Code 2.1.128"};
  }});
  assert.deepEqual(found.map(item=>item.id),["claude-code","gemini-cli"]);
  assert.equal(calls.length,1);
  assert.equal(found[0].version,"2.1.128");
  assert.ok(found.every(item=>item.installed && !item.execution.supported && item.auth.state==="unknown"));
});
test("discovery distinguishes a version probe failure from absence",async t=>{
  const root=await mkdtemp(path.join(tmpdir(),"preacherman-discovery-failure-"));t.after(()=>rm(root,{recursive:true,force:true}));
  await writeFile(path.join(root,"claude.exe"),"fixture");
  const [found]=await discoverLocalAgents({platform:"win32",env:{PATH:root},probe:async()=>{throw new Error("fixture");}});
  assert.equal(found.detection.state,"error");assert.equal(found.installed,true);assert.equal(found.version,null);
});
