import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const root = new URL("../public/gallery-v3/portfolio/", import.meta.url);
const source = fs.readFileSync(new URL("task-conversation.js", root), "utf8");
function fixture(initial = null, slug = "nathan-riley") {
  const storage = new Map(initial === null ? [] : [[`preacherman.task.${slug}.messages`, initial]]);
  const handlers = {};
  const context = {
    ref: value => ({value}), element: (tag, props, children) => ({tag, props:props ?? {}, children}),
    nextTick: callback => callback(), document:{addEventListener:(name, callback) => {handlers[name] = callback;}},
    localStorage:{getItem:key => storage.get(key), setItem:(key,value) => storage.set(key,value)},
  };
  vm.runInNewContext(source.replace(/^import .*;$/m, "").replaceAll("export ", "") + "\nglobalThis.component = TaskConversation;", context);
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
  return {storage, context, render, find, input, submit, sendButton, handlers};
}

test("local send renders one user card, clears draft, reopens and isolates task keys", () => {
  const f = fixture();
  assert.equal(f.sendButton().disabled, true);
  f.submit(); assert.equal(f.storage.size, 0);
  const text = "第一条消息\n<script>不是 HTML</script>";
  f.input().onInput({target:{value:text}});
  f.submit();
  assert.equal(f.input().value, "");
  const card = f.find(n => n.tag === "article");
  assert.equal(card.children[0].children, text);
  assert.equal(card.children[0].props.innerHTML, undefined);
  const saved = f.storage.get("preacherman.task.nathan-riley.messages");
  assert.equal(fixture(saved).find(n => n.tag === "article").children[0].children, text);
  assert.equal(f.storage.has("preacherman.task.casa-di-solare.messages"), false);
});

test("Enter sends; Shift+Enter and IME do not; unavailable runtime controls are disabled", () => {
  const f = fixture();
  f.input().onInput({target:{value:"输入中"}});
  const key = (extras) => ({key:"Enter", preventDefault(){}, stopPropagation(){}, ...extras});
  f.input().onKeydown(key({isComposing:true})); assert.equal(f.storage.size,0);
  f.input().onKeydown(key({shiftKey:true})); assert.equal(f.storage.size,0);
  f.input().onKeydown(key({keyCode:229})); assert.equal(f.storage.size,0);
  f.input().onKeydown(key({})); assert.equal(f.storage.size,1);
  assert.equal(f.find(n => n.props.title === "执行权限尚未接入").props.disabled,true);
  assert.equal(f.find(n => n.props.title === "尚未连接模型；消息仅保存在本机").props.disabled,true);
});

test("failed persistence preserves draft and prior history; corrupted history is never overwritten", () => {
  const f = fixture();
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
  f.submit();
  const saved = f.storage.get("preacherman.task.nathan-riley.messages");
  assert.deepEqual(JSON.parse(saved),[{text:"",files:["brief.txt"]}]);
  assert.match(f.find(n => n.props.role === "status").children,/未读取或上传/);
});

test("interaction shield is confined to the conversation; no network or raw HTML rendering", () => {
  const f = fixture(); let stopped = 0;
  for(const handler of Object.values(f.handlers)) {
    handler({target:{closest:() => null}, stopPropagation:() => stopped++});
    handler({target:{closest:() => ({})}, stopPropagation:() => stopped++});
  }
  assert.equal(stopped,3);
  assert.doesNotMatch(source,/fetch\(|XMLHttpRequest|innerHTML|v-html|new WebSocket/);
});

test("divider and chat are Nathan-only; semantic tokens exist in both appearances", () => {
  const css = fs.readFileSync(new URL("task-conversation.css", root),"utf8");
  const runtime = fs.readFileSync(new URL("_nuxt/Dr-ZLxUY.js",root),"utf8");
  const tokens = fs.readFileSync(new URL("../src/styles.css",import.meta.url),"utf8");
  assert.ok(css.includes('[data-gl="sheet"][data-id="nathan-riley"]::after'));
  assert.ok(css.includes("left: 50%"));
  assert.ok(runtime.includes("isTaskTemplate(n(e))?X(TaskConversation"));
  assert.ok(runtime.includes("enabled:P(()=>!isTaskTemplate(e.value))"), "the image-loop scroller must not reposition the conversation");
  assert.ok(css.includes("prefers-reduced-motion"));
  assert.ok(css.includes(".task-chat .task-chat__input:focus { outline: none !important; }"), "the textarea must override the host's important focus rectangle");
  assert.ok(css.includes(".task-chat :focus-visible { outline: 2px solid var(--demo-theme-chat-focus)"), "retain keyboard focus on toolbar controls");
  for (const key of ["composer","text","muted","border","message","hover","send","send-text","disabled","focus","error"]) {
    assert.equal(tokens.split("--demo-theme-chat-"+key+":").length-1,2,key);
  }
});
