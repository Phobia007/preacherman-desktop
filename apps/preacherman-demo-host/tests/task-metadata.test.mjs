import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const root = new URL("../public/gallery-v3/portfolio/", import.meta.url);
const source = fs.readFileSync(new URL("task-metadata.js", root), "utf8");
function fixture(initial) {
  const storage = new Map(initial ? [["preacherman.task.nathan-riley.title", initial]] : []);
  let cleanup;
  const context = {
    ref: (value) => ({value}),
    element: (tag, props, children) => ({tag, props, children}),
    onUnmounted: (callback) => {cleanup = callback;},
    localStorage: {getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value)},
    document: {createElement: () => ({}), head: {append() {}}, documentElement: {style: {setProperty() {}}}, addEventListener() {}},
    parent: {document: {querySelector: () => ({}), documentElement: {}}},
    getComputedStyle: () => ({getPropertyValue: () => ""}), addEventListener() {}, URL,
  };
  vm.runInNewContext(source.replace(/^import .*;$/m, "").replaceAll("export const ", "globalThis.").replaceAll("import.meta.url", JSON.stringify(new URL("task-metadata.js", root).href)), context);
  const render = context.TaskMetadata.setup({slug: "nathan-riley"});
  const input = () => render().children[0].children[0].props;
  return {context, storage, render, input, unmount: () => cleanup()};
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
  assert.equal(f.render().children[2].props.role, "alert");
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
  assert.ok(cards.includes('E("span",te,F(taskDisplayTitle(l)),1)'));
  assert.ok(cards.includes('whitespace-nowrap text-16 s:text-18 tracking-[-0.05em]'));
  assert.equal(index.match(/k\(taskDisplayTitle\(a\)\)/g)?.length, 3);
  assert.ok(index.includes('text-18 s:text-30 leading-none tracking-[-0.05em]'));
  assert.ok(cards.includes('e.showTitles('));
  assert.ok(index.includes('t.text(e,{reveal:!1})'));
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
  assert.ok(css.includes(':focus-visible'));
  assert.doesNotMatch(css, /#[\da-f]{3,8}\b/i);
});
