import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

function fixture() {
  const listeners=new Map(), refs=[], calls=[];
  let mount,unmount,fail=false;
  const element=(tag,props,children)=>({tag,props,children});
  const cards=["one","two","three"].map(id=>{
    const attrs=new Map([["role","link"],["aria-label","Open "+id]]);
    const el={dataset:{id},getAttribute:key=>attrs.get(key)??null,setAttribute:(key,value)=>attrs.set(key,value),removeAttribute:key=>attrs.delete(key),querySelector:()=>({textContent:id}),closest:selector=>selector==='[data-gl="card"]'?el:null};
    return {el};
  });
  const context={
    ref:value=>{const r={value};refs.push(r);return r;},element,
    onMounted:callback=>{mount=callback;},onUnmounted:callback=>{unmount=callback;},nextTick:async()=>{},
    requestAnimationFrame:()=>1,cancelAnimationFrame(){},
    document:{querySelector:()=>null},
    window:{addEventListener:(type,callback)=>listeners.set(type,callback),removeEventListener:type=>listeners.delete(type)},
  };
  const source=fs.readFileSync(new URL("../public/gallery-v3/portfolio/task-delete-control.js",import.meta.url),"utf8");
  vm.runInNewContext(source.replace(/^import .*;$/m,"").replace("export const TaskDeleteControl","globalThis.TaskDeleteControl"),context);
  const render=context.TaskDeleteControl.setup({folio:{cards,removeTaskCards:async ids=>{calls.push(Array.from(ids));if(fail)throw new Error("quota");}}});
  refs[0].value={showPopover(){},hidePopover(){}};
  refs[1].value={focus(){}};
  const dialog={open:false,showModal(){this.open=true;},close(){this.open=false;},querySelector:()=>({focus(){}})};
  refs[2].value=dialog;
  const choose=(i,type="click",key)=>listeners.get(type)({type,key,target:cards[i].el,preventDefault(){},stopImmediatePropagation(){},stopPropagation(){}});
  const button=()=>render().children[0];
  const dialogContent=()=>render().children.at(-1).children[0];
  const confirm=()=>dialogContent().children.at(-1).children[1].props.onClick();
  return {mount,unmount,render,choose,button,dialogContent,confirm,dialog,cards,calls,listeners,setFail:value=>{fail=value;}};
}

test("card selection is additive and toggleable with independent markers and count", async()=>{
  const f=fixture();await f.mount();f.button().props.onClick();
  f.choose(0);f.choose(1);
  assert.equal(f.cards[0].el.getAttribute("aria-pressed"),"true");
  assert.equal(f.cards[1].el.getAttribute("aria-pressed"),"true");
  assert.equal(f.render().children.filter(n=>n.props?.class==="task-delete__marker").length,2);
  assert.match(f.render().children[1].children[0].children,/已选择 2 张/);
  f.choose(0);
  assert.equal(f.cards[0].el.getAttribute("aria-pressed"),"false");
  assert.equal(f.cards[1].el.getAttribute("aria-pressed"),"true");
  f.choose(1,"keydown"," ");
  assert.equal(f.button().props["aria-label"],"退出删除选择");
  assert.match(f.render().children[1].children[0].children,/可多选/);
  f.unmount();assert.equal(f.listeners.size,0);
});

test("confirmation deletes the whole selection once and cancel retains selection",async()=>{
  const f=fixture();await f.mount();f.button().props.onClick();f.choose(0);f.choose(1,"keydown","Enter");
  f.button().props.onClick();
  assert.equal(f.dialogContent().children[0].children,"确定删除 2 张卡片？");
  assert.equal(f.dialogContent().children[1].children,"one、two");
  f.dialogContent().children.at(-1).children[0].props.onClick();
  assert.equal(f.dialog.open,false);assert.deepEqual(f.calls,[]);
  f.button().props.onClick();await f.confirm();
  assert.deepEqual(f.calls,[["one","two"]]);assert.equal(f.dialog.open,false);
  assert.equal(f.render().children[1].children,"已删除 2 张卡片");
  assert.equal(f.cards[0].el.getAttribute("role"),"link");
  assert.equal(f.cards[1].el.getAttribute("aria-pressed"),null);
  f.unmount();
});

test("failed batch retains selection for retry; Escape and teardown restore all cards",async()=>{
  const f=fixture();await f.mount();f.button().props.onClick();f.choose(0);f.choose(1);f.button().props.onClick();
  f.setFail(true);await f.confirm();assert.equal(f.dialog.open,true);
  assert.equal(f.cards[0].el.getAttribute("aria-pressed"),"true");
  assert.equal(f.cards[1].el.getAttribute("aria-pressed"),"true");
  assert.ok(f.dialogContent().children.some(n=>n?.props?.role==="alert"));
  f.choose(0,"keydown","Escape");assert.equal(f.dialog.open,false);
  f.choose(0,"keydown","Escape");
  assert.equal(f.button().props["aria-label"],"删除卡片");
  for(const {el} of f.cards)assert.equal(el.getAttribute("aria-pressed"),null);
  f.unmount();assert.equal(f.listeners.size,0);
});
