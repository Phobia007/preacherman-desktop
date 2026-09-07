import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source=fs.readFileSync(new URL("../public/gallery-v3/portfolio/task-covers.js",import.meta.url),"utf8");
function fixture(records=new Map()) {
  let fail=false,sequence=0;
  const revoked=[],canvases=[];
  const db={close(){},transaction(){
    const tx={abort(){tx.onabort?.();},objectStore(){return {
      get:key=>op(()=>records.get(key)),put:(value,key)=>op(()=>records.set(key,value)),delete:key=>op(()=>records.delete(key)),
    };}};
    function op(work){const request={};queueMicrotask(()=>{
      if(fail){tx.error=new Error("quota");tx.onabort();return;}
      request.result=work();tx.oncomplete();
    });return request;}
    return tx;
  }};
  const context={Blob,Map,Set,Promise,setTimeout,clearTimeout,console,addEventListener(){},
    crypto:{randomUUID:()=>"cover-"+(++sequence)},
    URL:{createObjectURL:()=>"blob:local/"+(++sequence),revokeObjectURL:url=>revoked.push(url)},
    indexedDB:{open(){const r={result:db};queueMicrotask(()=>r.onsuccess());return r;}},
    Image:class {naturalWidth=3200;naturalHeight=1800;set src(value){if(value)queueMicrotask(()=>this.onload?.());}},
    document:{createElement(){const canvas={getContext:()=>({drawImage(){canvases.push([canvas.width,canvas.height]);}}),toBlob:callback=>callback(new Blob(["compressed"],{type:"image/webp"}))};return canvas;}},
  };
  vm.runInNewContext(source.replace(/^export /gm,""),context);
  return {context,records,revoked,canvases,setFail:value=>{fail=value;}};
}

test("covers persist separately, restore fresh URLs after reopen and discard only their own blob",async()=>{
  const f=fixture();
  const blob=new Blob(["image"],{type:"image/webp"});
  const id=await f.context.saveTaskCover(blob);
  assert.equal(f.records.get(id),blob);
  assert.ok(f.context.taskCoverUrl(id).startsWith("blob:"));
  const reopened=fixture(f.records);
  await reopened.context.loadTaskCovers([id,id,undefined]);
  assert.ok(reopened.context.taskCoverUrl(id).startsWith("blob:"));
  await reopened.context.discardTaskCover(id);
  assert.equal(reopened.context.taskCoverUrl(id),null);
  assert.equal(f.records.has(id),false);
  assert.equal(reopened.revoked.length,1);
});

test("storage failures reject save, while unreadable/missing covers never block task metadata",async()=>{
  const f=fixture();f.setFail(true);
  await assert.rejects(f.context.saveTaskCover(new Blob(["image"])),/quota/);
  assert.equal(f.records.size,0);
  await f.context.loadTaskCovers(["unreadable"]);
  assert.equal(f.context.taskCoverUrl("unreadable"),null);
  f.setFail(false);await f.context.loadTaskCovers(["missing"]);
  assert.equal(f.context.taskCoverUrl("missing"),null);
});

test("file validation rejects unsupported and oversized files before image decoding",async()=>{
  const f=fixture();
  await assert.rejects(f.context.prepareTaskCover({type:"image/svg+xml",size:100}),/JPG/);
  await assert.rejects(f.context.prepareTaskCover({type:"image/png",size:13*1024*1024}),/12 MB/);
  assert.equal(f.canvases.length,0);assert.equal(f.revoked.length,0);
});

test("images downsample proportionally, retain no filesystem path and release temporary URLs",async()=>{
  const f=fixture();const result=await f.context.prepareTaskCover({type:"image/jpeg",size:1024});
  assert.equal(result.type,"image/webp");
  assert.deepEqual(f.canvases,[[1600,900]]);
  assert.equal(f.revoked.length,1);
});
