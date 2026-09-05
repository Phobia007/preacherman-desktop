import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const root = new URL("../public/gallery-v3/portfolio/", import.meta.url);
const source = fs.readFileSync(new URL("task-metadata.js", root), "utf8");
function fixture(initial) {
  const storage = new Map(initial ? [["preacherman.task.nathan-riley.title", initial]] : []);
  const session = new Map();
  let cleanup;
  const context = {
    ref: (value) => ({value}),
    element: (tag, props, children) => ({tag, props, children}),
    onUnmounted: (callback) => {cleanup = callback;},
    localStorage: {getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value)},
    sessionStorage: {getItem:key => session.get(key), setItem:(key,value) => session.set(key,value), removeItem:key => session.delete(key)},
    crypto: {randomUUID: () => "00000000-0000-4000-8000-000000000001"},
    location: {origin:"app://localhost", search:"", href:""},
    URLSearchParams,
    document: {createElement: () => ({}), head: {append() {}}, documentElement: {style: {setProperty() {}}}, addEventListener() {}},
    parent: {document: {querySelector: () => ({}), documentElement: {}}},
    getComputedStyle: () => ({getPropertyValue: () => ""}), addEventListener() {}, URL,
  };
  vm.runInNewContext(source.replace(/^import .*;$/m, "").replaceAll("export const ", "globalThis.").replaceAll("export function ", "function ").replaceAll("import.meta.url", JSON.stringify(new URL("task-metadata.js", root).href)), context);
  const render = context.TaskMetadata.setup({slug: "nathan-riley"});
  const input = () => render().children[0].children[0].props;
  return {context, storage, session, render, input, unmount: () => cleanup()};
}

test("only the selected Nathan Riley entry gets the task metadata template", () => {
  const {context} = fixture();
  assert.equal(context.isTaskTemplate({slug:"nathan-riley"}), true);
  assert.equal(context.isTaskTemplate({slug:"casa-di-solare"}), false);
  assert.equal(context.isTaskTemplate(null), false);
});

test("task names save, survive reopen, cancel and reject empty replacement", () => {
  const f = fixture();
  assert.equal(f.input().value, "未命名任务");
  f.input().onInput({target:{value:"  整理项目资料  "}});
  f.input().onBlur();
  assert.equal(fixture(f.storage.get("preacherman.task.nathan-riley.title")).input().value, "整理项目资料");
  f.input().onInput({target:{value:"   "}}); f.input().onBlur();
  assert.equal(f.input().value, "整理项目资料");
  f.input().onInput({target:{value:"取消这个名称"}});
  f.input().onKeydown({key:"Escape", preventDefault(){}, stopPropagation(){}, target:{blur:() => f.input().onBlur()}});
  assert.equal(f.input().value, "整理项目资料");
  f.input().onInput({target:{value:"新名称"}}); f.unmount();
  assert.equal(f.storage.get("preacherman.task.nathan-riley.title"), "新名称");
});

test("IME Enter does not prematurely save, and storage failure is visible", () => {
  const f = fixture();
  f.input().onKeydown({key:"Enter", isComposing:true, target:{blur:() => assert.fail("IME must not commit")}});
  f.context.localStorage.setItem = () => {throw new Error("blocked");};
  f.input().onInput({target:{value:"仍可编辑"}}); f.input().onBlur();
  assert.equal(f.render().children[3].props.role, "alert");
  assert.equal(f.input().value, "仍可编辑");
});

test("saved names synchronize the authored card and index copy without changing other projects", () => {
  const f = fixture("preacherman");
  const selected = {slug:"nathan-riley", title:"Nathan Riley"};
  const other = {slug:"casa-di-solare", title:"Casa Di Solare"};
  assert.equal(f.context.taskDisplayTitle(selected), "preacherman");
  assert.equal(f.context.taskDisplayTitle(other), "Casa Di Solare");
  f.input().onInput({target:{value:"  新的任务  "}}); f.input().onBlur();
  assert.equal(f.context.taskDisplayTitle(selected), "新的任务");
  f.context.localStorage.setItem = () => {throw new Error("blocked");};
  f.input().onInput({target:{value:"未保存"}}); f.input().onBlur();
  assert.equal(f.context.taskDisplayTitle(selected), "新的任务");
  f.context.localStorage.getItem = () => {throw new Error("blocked");};
  assert.equal(f.context.taskDisplayTitle(selected), "Nathan Riley");
  assert.equal(fixture().context.taskDisplayTitle(selected), "Nathan Riley");
});

test("card and full index keep original text nodes and typography with synchronized titles", () => {
  const cards = fs.readFileSync(new URL("_nuxt/DxOxRmZ4.js", root), "utf8");
  const index = fs.readFileSync(new URL("_nuxt/CCsiJzJJ.js", root), "utf8");
  const featuredHtml = fs.readFileSync(new URL("index.html", root), "utf8");
  assert.ok(cards.includes('E("span",te,F(taskDisplayTitle(l)),1)'));
  assert.ok(cards.includes('whitespace-nowrap text-16 s:text-18 tracking-[-0.05em]'));
  assert.equal(index.match(/k\(taskDisplayTitle\(a\)\)/g)?.length, 3);
  assert.ok(index.includes('text-18 s:text-30 leading-none tracking-[-0.05em]'));
  assert.ok(cards.includes('e.showTitles('));
  assert.ok(cards.includes("augmentTaskProjects"));
  assert.ok(cards.includes("TaskCreateControl"));
  assert.ok(featuredHtml.includes('class="task-create"'));
  assert.ok(index.includes('t.text(e,{reveal:!1})'));
});

test("new conversation cards persist as blank task projects and relate to their source", () => {
  const f = fixture("preacherman");
  const created = f.context.createTaskProject();
  assert.equal(created.title,"new one");
  assert.equal(created.parentId,"nathan-riley");
  assert.equal(f.storage.get(`preacherman.task.${created.id}.title`),"new one");
  const augmented = f.context.augmentTaskProjects([{slug:"nathan-riley",title:"Nathan Riley"},{slug:"casa",title:"Casa"}]);
  assert.deepEqual(Array.from(augmented, project => project.slug),["nathan-riley",created.id,"casa"]);
  assert.equal(augmented[1].src.endsWith("task-empty-card.svg"),true);
  const relations = f.render().children[2];
  assert.equal(relations.children[1].tag,"ul");
  assert.equal(relations.children[1].children[0].children[0].children[0].children,"new one");
});

test("floating create control saves then returns to the task rail", () => {
  const f = fixture();
  const render = f.context.TaskCreateControl.setup();
  render().children[0].props.onClick();
  assert.equal(f.context.location.href,"/gallery-v3/portfolio/index.html");
  assert.equal(JSON.parse(f.storage.get("preacherman.task.projects")).length,1);
  assert.equal(f.session.get("preacherman.task.pending-focus"),"task-00000000-0000-4000-8000-000000000001");
});

test("only selected detail skips rasterized copy, media, marks and progress; original sheet/close remain", () => {
  const runtime = fs.readFileSync(new URL("_nuxt/Dr-ZLxUY.js", root), "utf8");
  const css = fs.readFileSync(new URL("task-metadata.css", root), "utf8");
  assert.ok(runtime.includes('z=b(isTaskTemplate(e.value)?[]:'));
  assert.ok(runtime.includes('!isTaskTemplate(n(e))&&(n(e)?.tags'));
  assert.ok(runtime.includes('isTaskTemplate(n(e))?X(TaskMetadata'));
  assert.ok(runtime.includes('r.pendingTitle?.dispose()'));
  assert.ok(runtime.includes('"data-gl":"sheet"'));
  assert.ok(runtime.includes('"aria-label":"Close project"'));
  assert.ok(css.includes('--demo-theme-gallery-detail-action-rest-text'));
  assert.ok(css.includes('.task-metadata__relations'));
  assert.ok(css.includes('.task-create__button'));
  assert.ok(css.includes(':focus-visible'));
  assert.doesNotMatch(css, /#[\da-f]{3,8}\b/i);
});
