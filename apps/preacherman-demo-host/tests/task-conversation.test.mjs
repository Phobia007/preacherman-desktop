import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { boundedChatContext } from "../public/gallery-v3/portfolio/task-chat-context.js";

const root = new URL("../public/gallery-v3/portfolio/", import.meta.url);
const source = fs.readFileSync(new URL("task-conversation.js", root), "utf8");
function fixture(initial = null, slug = "nathan-riley") {
  const storage = new Map(initial === null ? [] : [[`preacherman.task.${slug}.messages`, initial]]);
  const handlers = {};
  const windowHandlers = {};
  const posted = [];
  const context = {
    boundedChatContext, crypto: {randomUUID:() => "fixture-request"},
    setTimeout:() => 1, clearTimeout() {},
    ref: value => ({value}), element: (tag, props, children) => ({tag, props:props ?? {}, children}),
    nextTick: callback => callback(), onMounted: callback => callback(), onUnmounted() {},
    resolveTaskId: value => value,
    document:{addEventListener:(name, callback) => {handlers[name] = [...(handlers[name] ?? []), callback];}, removeEventListener() {}},
    localStorage:{getItem:key => storage.get(key), setItem:(key,value) => storage.set(key,value)},
    parent:{postMessage:(message, origin) => posted.push({message, origin})},
    location:{origin:"app://localhost"},
    addEventListener:(name, callback) => {windowHandlers[name] = callback;}, removeEventListener() {},
  };
  vm.runInNewContext(source.replace(/^import .*;$/gm, "").replaceAll("export ", "") + "\nglobalThis.component = TaskConversation;", context);
  const render = context.component.setup({slug});
  const find = (predicate, node = render()) => {
    if (!node || typeof node !== "object") return null;
    if (predicate(node)) return node;
    for (const child of Array.isArray(node.children) ? node.children : []) {const match = find(predicate, child); if (match) return match;}
    return null;
  };
  const input = () => find(n => n.tag === "textarea").props;
  const submit = () => find(n => n.tag === "form").props.onSubmit({preventDefault() {}});
  const sendButton = () => find(n => n.props["aria-label"] === "发送消息").props;
  const connect = () => windowHandlers.message({source:context.parent,origin:context.location.origin,data:{
    type:"gallery-provider-catalog",providers:[{id:"fixture",label:"Fixture",kind:"api",models:[{id:"model",label:"Model"}]}],
    active:{mode:"api",connectionId:"fixture",model:"model"},
  }});
  return {storage, context, render, find, input, submit, sendButton, handlers, windowHandlers, posted, connect};
}

test("local send renders one user card, clears draft, reopens and isolates task keys", () => {
  const f = fixture();
  assert.equal(f.sendButton().disabled, true);
  f.submit(); assert.equal(f.storage.size, 0);
  f.connect();
  const text = "第一条消息\n<script>不是 HTML</script>";
  f.input().onInput({target:{value:text}});
  f.submit();
  assert.equal(f.input().value, "");
  const card = f.find(n => n.tag === "article");
  assert.equal(card.children[1].children, text);
  assert.equal(card.children[1].props.innerHTML, undefined);
  const saved = f.storage.get("preacherman.task.nathan-riley.messages");
  assert.equal(fixture(saved).find(n => n.tag === "article").children[1].children, text);
  assert.equal(f.storage.has("preacherman.task.casa-di-solare.messages"), false);
});

test("Enter sends; Shift+Enter and IME do not; unavailable runtime controls are disabled", () => {
  const f = fixture();
  f.connect();
  f.input().onInput({target:{value:"输入中"}});
  const key = (extras) => ({key:"Enter", preventDefault(){}, stopPropagation(){}, ...extras});
  f.input().onKeydown(key({isComposing:true})); assert.equal(f.storage.size,0);
  f.input().onKeydown(key({shiftKey:true})); assert.equal(f.storage.size,0);
  f.input().onKeydown(key({keyCode:229})); assert.equal(f.storage.size,0);
  f.input().onKeydown(key({})); assert.equal(f.storage.size,2);
  assert.equal(f.find(n => n.props.title === "执行权限尚未接入"),null);
  assert.equal(f.find(n => n.props["aria-haspopup"] === "listbox").props.disabled,true);
  assert.equal(f.posted[0].message.type,"gallery-provider-request");
});

test("provider catalog enables grouped model selection and persists it per task", () => {
  const f = fixture();
  f.windowHandlers.message({source:f.context.parent, origin:"app://localhost", data:{type:"gallery-provider-catalog", providers:[{
    id:"deepseek", label:"DeepSeek", models:[{id:"deepseek-chat", label:"DeepSeek Chat"}],
  }]}});
  const trigger = f.find(n => n.props["aria-haspopup"] === "listbox").props;
  assert.equal(trigger.disabled,false);
  trigger.onClick();
  const option = f.find(n => n.props.role === "option");
  assert.equal(option.children,"DeepSeek Chat");
  option.props.onClick();
  assert.equal(f.storage.get("preacherman.task.nathan-riley.model"),"deepseek::deepseek-chat");
  assert.equal(f.find(n => n.props["aria-haspopup"] === "listbox").children[0].children,"DeepSeek Chat");
});

test("unused conversation follows the saved default, while an explicit choice remains pinned", () => {
  const f = fixture();
  const catalog = active => f.windowHandlers.message({source:f.context.parent,origin:"app://localhost",data:{
    type:"gallery-provider-catalog",providers:[{id:"one",label:"One",models:[{id:"m",label:"One model"}]},{id:"two",label:"Two",models:[{id:"m",label:"Two model"}]}],
    active:{mode:"api",connectionId:active,model:"m"},
  }});
  catalog("one");catalog("two");
  assert.equal(f.find(n => n.props["aria-haspopup"] === "listbox").children[0].children,"Two model");
  f.find(n => n.props["aria-haspopup"] === "listbox").props.onClick();
  f.find(n => n.props.role === "option" && n.children === "One model").props.onClick();
  catalog("two");
  assert.equal(f.find(n => n.props["aria-haspopup"] === "listbox").children[0].children,"One model");
});

test("failed persistence preserves draft and prior history; corrupted history is never overwritten", () => {
  const f = fixture();
  f.connect();
  f.input().onInput({target:{value:"不能丢失"}});
  f.context.localStorage.setItem = () => {throw Error("quota");};
  f.submit(); assert.equal(f.input().value,"不能丢失");
  assert.ok(f.find(n => n.props.role === "alert"));
  const corrupt = fixture("{invalid");
  corrupt.input().onInput({target:{value:"新消息"}}); corrupt.submit();
  assert.equal(corrupt.sendButton().disabled,true);
  assert.equal(corrupt.storage.get("preacherman.task.nathan-riley.messages"),"{invalid");
});

test("attachment selection stores names only and supports removal", () => {
  const f = fixture();
  const picker = f.find(n => n.props.type === "file").props;
  picker.onChange({target:{files:[{name:"brief.txt", secretBytes:"not read"}],value:""}});
  f.find(n => n.props["aria-label"] === "移除附件 brief.txt").props.onClick();
  assert.equal(f.sendButton().disabled,true);
  picker.onChange({target:{files:[{name:"brief.txt"}],value:""}});
  f.connect(); f.input().onInput({target:{value:"Attached draft"}});
  f.submit();
  const saved = f.storage.get("preacherman.task.nathan-riley.messages");
  assert.equal(saved,undefined);
  assert.match(f.find(n => n.props.role === "alert").children,/尚不支持上传/);
  assert.match(f.find(n => n.props.title?.startsWith("添加附件")).props.title,/不读取或上传/);
});

test("interaction shield is confined to the conversation; provider discovery stays in the parent bridge", () => {
  const f = fixture(); let stopped = 0;
  for(const handler of Object.values(f.handlers).flat()) {
    handler({target:{closest:() => null}, stopPropagation:() => stopped++});
    handler({target:{closest:() => ({})}, stopPropagation:() => stopped++});
  }
  assert.equal(stopped,3);
  assert.doesNotMatch(source,/fetch\(|XMLHttpRequest|innerHTML|v-html|new WebSocket/);
  assert.match(source,/gallery-provider-request/);
});

test("divider and chat cover every task; semantic tokens exist in both appearances", () => {
  const css = fs.readFileSync(new URL("task-conversation.css", root),"utf8");
  const runtime = fs.readFileSync(new URL("_nuxt/Dr-ZLxUY.js",root),"utf8");
  const tokens = fs.readFileSync(new URL("../src/styles.css",import.meta.url),"utf8");
  assert.ok(css.includes('[data-gl="sheet"]:has(.task-metadata)::after'));
  assert.ok(css.includes("left: 50%"));
  assert.ok(css.includes("overflow: hidden"));
  assert.ok(css.includes("overscroll-behavior: contain"));
  assert.ok(runtime.includes("isTaskTemplate(n(e))?X(TaskConversation"));
  assert.ok(runtime.includes("enabled:P(()=>!isTaskTemplate(e.value))"), "the image-loop scroller must not reposition the conversation");
  assert.ok(css.includes("prefers-reduced-motion"));
  assert.match(css, /\.task-chat \.task-chat__input:is\(:focus, :focus-visible\)\s*\{\s*outline: none !important;\s*box-shadow: none !important;/, "the input has no white focus frame; its caret remains visible");
  assert.ok(css.includes('caret-color: var(--demo-theme-chat-text)'));
  assert.ok(css.includes(".task-chat :focus-visible { outline: 2px solid var(--demo-theme-chat-focus)"), "retain keyboard focus on toolbar controls");
  for (const key of ["composer","text","muted","border","message","hover","send","send-text","disabled","focus","error"]) {
    assert.equal(tokens.split("--demo-theme-chat-"+key+":").length-1,2,key);
  }
});

test("detail sheets ignore cover aspect ratios and keep the composer last", () => {
  const css = fs.readFileSync(new URL("task-conversation.css", root), "utf8");
  assert.match(css, /\[data-gl="sheet"\]:has\(\.task-metadata\)\s*\{\s*aspect-ratio: auto;/);
  assert.ok(css.includes('inset: 9rem 3rem 4rem 50%'));
  for (const slug of ['nathan-riley', 'dogelon-mars', 'discoveryland', 'task-example']) {
    const f = fixture(null, slug);
    assert.equal(f.find(n => n.props.class === 'task-chat__status'), null);
    assert.equal(f.render().children.at(-1).props.class, 'task-chat__composer');
    f.input().onInput({target:{value:'未连接时保留必要报错'}});
    f.submit();
    assert.ok(f.find(n => n.props.role === 'alert'));
    assert.equal(f.render().children.at(-1).props.class, 'task-chat__composer');
  }
  assert.doesNotMatch(source, /文本对话与规划 · 发送给所选模型 · 不执行本机任务/);
});
