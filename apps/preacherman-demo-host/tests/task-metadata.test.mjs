import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const root = new URL("../public/gallery-v3/portfolio/", import.meta.url);
const source = fs.readFileSync(new URL("task-metadata.js", root), "utf8");
function fixture(initial) {
  const storage = new Map(initial ? [["preacherman.task.nathan-riley.title", initial]] : []);
  const session = new Map();
  const events = [];
  let cleanup;
  let mount;
  const context = {
    ref: (value) => ({value}),
    element: (tag, props, children) => ({tag, props, children}),
    onUnmounted: (callback) => {cleanup = callback;},
    onMounted: (callback) => {mount = callback;},
    localStorage: {getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value)},
    sessionStorage: {getItem:key => session.get(key), setItem:(key,value) => session.set(key,value), removeItem:key => session.delete(key)},
    crypto: {randomUUID: () => "00000000-0000-4000-8000-000000000001"},
    Event,
    window: {dispatchEvent: event => events.push(event.type)},
    location: {origin:"app://localhost", search:"", href:""},
    URLSearchParams,
    document: {createElement: () => ({}), head: {append() {}}, documentElement: {style: {setProperty() {}}}, addEventListener() {}},
    parent: {document: {querySelector: () => ({}), documentElement: {}}},
    getComputedStyle: () => ({getPropertyValue: () => ""}), addEventListener() {}, URL,
  };
  vm.runInNewContext(source.replace(/^import .*;$/m, "").replaceAll("export const ", "globalThis.").replaceAll("export function ", "function ").replaceAll("import.meta.url", JSON.stringify(new URL("task-metadata.js", root).href)), context);
  const render = context.TaskMetadata.setup({slug: "nathan-riley"});
  const input = () => render().children[0].children[0].props;
  return {context, storage, session, events, render, input, mount: () => mount(), unmount: () => cleanup()};
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
  assert.equal(f.context.taskDisplayTitle({slug:created.id,preachermanTask:true,title:created.title}),"new one");
  const augmented = f.context.augmentTaskProjects([{slug:"nathan-riley",title:"Nathan Riley"},{slug:"casa",title:"Casa"}]);
  assert.deepEqual(Array.from(augmented, project => project.slug),["nathan-riley",created.id,"casa"]);
  assert.equal(augmented[1].src.endsWith("task-empty-card.svg"),true);
  assert.equal(augmented[1].video, null);
  assert.equal(augmented[1].images.length, 0);
  const relations = f.render().children[2];
  assert.equal(relations.children[1].tag,"ul");
  assert.equal(relations.children[1].children[0].children[0].children[0].children,"new one");
});

test("blank tasks retain the authored card material, caption and arrow instead of CSS wash overrides", () => {
  const css = fs.readFileSync(new URL("task-metadata.css", root), "utf8");
  const runtime = fs.readFileSync(new URL("_nuxt/DxOxRmZ4.js", root), "utf8");
  assert.doesNotMatch(css, /\[data-gl="card"\]\[data-id\^="task-"\]/);
  assert.ok(runtime.includes('F(taskDisplayTitle(l)),1),G(a)'));
  assert.ok(runtime.includes('arrowRight:!0,strip:!0'));
  assert.ok(runtime.includes('e.showHome(c.value,o.value)'));
});

test("floating plus requests only the empty dialog without creating or navigating", () => {
  const f = fixture();
  const render = f.context.TaskCreateControl.setup();
  render().children[0].props.onClick();
  assert.equal(f.context.location.href,"");
  assert.equal(f.storage.get("preacherman.task.projects"),undefined);
  assert.equal(f.session.get("preacherman.task.pending-focus"),undefined);
  assert.deepEqual(f.events,["preacherman:task-create-open"]);
  assert.equal(render().children[0].props["aria-haspopup"],"dialog");
});

test("task creation reuses the authored profile lens and owns dismiss/focus cleanup", () => {
  const runtime = fs.readFileSync(new URL("_nuxt/D9b8F35K.js", root), "utf8");
  const dialog = fs.readFileSync(new URL("task-create-dialog.js", root), "utf8");
  assert.ok(runtime.includes('e.openHole(_),taskDialog?.opened||f(_)'));
  assert.ok(runtime.includes('taskDialog?.dispose()'));
  assert.ok(runtime.includes('this.taskCreateDialogOpen?0:this.hole.p'));
  assert.ok(dialog.includes('profileOpen.value = true'));
  assert.ok(dialog.includes('event.key === "Escape"'));
  assert.ok(dialog.includes('event.key === "Tab"'));
  assert.ok(dialog.includes('event.stopImmediatePropagation()'));
  assert.ok(dialog.includes('stopWatching()'));
  assert.doesNotMatch(dialog, /localStorage|location\.href/);
  assert.ok(dialog.includes("folio.prepareTaskCreation"));
  assert.ok(dialog.includes("if (busy) return"));
});

test("creation persists all three fields atomically, normalizes limits and restores detail", () => {
  const f = fixture();
  const project = f.context.createTaskProject({title:"  测试   任务  ",summary:"  第一行\n第二行  ",group:"  项目 A  "});
  assert.equal(project.title, "测试 任务");
  assert.equal(project.summary, "第一行\n第二行");
  assert.equal(project.group, "项目 A");
  assert.equal(f.storage.size, 2); // last-active marker plus one atomic project-list write
  assert.equal(f.session.size, 0); // no delayed route reload or old pending-focus
  f.context.location.search = "?task=" + project.id;
  const detail = f.context.TaskMetadata.setup({slug:"nathan-riley"})();
  assert.equal(detail.children[0].children[0].props.value, project.title);
  assert.equal(detail.children[1].children[0].children, project.summary);
  assert.equal(detail.children[1].children[1].children, project.group);
  assert.equal(f.context.createTaskProject({title:"t".repeat(150),summary:"s".repeat(2100),group:"g".repeat(90)}).group.length,80);
});

test("live augmentation adds later tasks exactly once without disturbing authored order", () => {
  const f = fixture();
  const base = [{slug:"nathan-riley"},{slug:"griflan"}];
  const first = f.context.createTaskProject({title:"first"});
  const one = f.context.augmentTaskProjects(base);
  f.context.crypto.randomUUID = () => "second";
  const second = f.context.createTaskProject({title:"second"});
  const two = f.context.augmentTaskProjects(one);
  assert.deepEqual(Array.from(two, item => item.slug),["nathan-riley",first.id,second.id,"griflan"]);
  assert.equal(f.context.augmentTaskProjects(two).length,4);
  assert.equal(two[2].video,null);
});

test("failed storage cannot leave partial title or pending navigation records", () => {
  const f = fixture();
  const initial = [...f.storage.entries()];
  f.context.localStorage.setItem = () => {throw new Error("quota");};
  assert.throws(() => f.context.createTaskProject({title:"保留草稿"}),/quota/);
  assert.deepEqual([...f.storage.entries()],initial);
  assert.equal(f.session.size,0);
});

test("live creation preserves rail and shaders, uses smooth existing centering and cancels arrival on disposal", () => {
  const rail = fs.readFileSync(new URL("task-create-rail.js",root),"utf8");
  const cards = fs.readFileSync(new URL("_nuxt/DxOxRmZ4.js",root),"utf8");
  const scroll = fs.readFileSync(new URL("_nuxt/CUxRtAWE.js",root),"utf8");
  assert.ok(rail.includes("folio.scan(root.value, projects.value)"));
  assert.ok(rail.includes("center(anchorIndex, false, offset)"));
  assert.ok(rail.includes("centerX(index, animate); centerY(index, animate)"));
  assert.ok(rail.includes("arrival?.kill()"));
  assert.ok(cards.includes("animate?s.t=s.a+M.utils.wrap"));
  assert.ok(scroll.includes("animate?e.t=e.c+"));
  assert.doesNotMatch(rail,/location\.|router\.|showHome\(/);
  assert.doesNotMatch(rail,/folio\.returning\s*=/);
  const css = fs.readFileSync(new URL("task-metadata.css",root),"utf8");
  assert.ok(css.includes("task-create-charge-outline 680ms"));
  assert.ok(css.includes("--demo-theme-brand-menu-focus"));
  assert.ok(css.includes("prefers-reduced-motion"));
});

test("task creation fields stay transparent curved outlines in either theme", () => {
  const css = fs.readFileSync(new URL("task-metadata.css",root),"utf8");
  const start = css.indexOf('.task-create-dialog__field input,');
  const field = css.slice(start,css.indexOf('}',start));
  assert.ok(field.includes('background: transparent'));
  assert.ok(field.includes('border-radius: 999px'));
  assert.ok(field.includes('--demo-theme-brand-menu-text-hover'));
  assert.ok(css.includes('height: 10rem; padding: 2rem 3rem; border-radius: 5rem'));
});

test("create control enters the browser top layer and cleans up on unmount", () => {
  const f = fixture();
  const control = f.context.TaskCreateControl.setup()();
  assert.equal(control.props.popover, "manual");
  let shown = false;
  control.props.ref.value = {showPopover() {shown = true;}, hidePopover() {shown = false;}};
  f.mount();
  assert.equal(shown, true);
  f.unmount();
  assert.equal(shown, false);
});

test("editable content follows the authored enter and leave timeline without delayed remnants", () => {
  const runtime = fs.readFileSync(new URL("_nuxt/D9b8F35K.js", root), "utf8");
  assert.ok(runtime.includes('duration:n.c.title.dur,ease:"power2.out",overwrite:!0},x0.page.at)'));
  assert.ok(runtime.includes('e.inert=!0,ve.to(e,{"--task-content-opacity":0,duration:Ff'));
  assert.ok(runtime.includes('e.querySelector(".task-create")?.hidePopover()'));
  for (const file of ["task-metadata.css", "task-conversation.css"]) {
    const css = fs.readFileSync(new URL(file, root), "utf8");
    assert.ok(css.includes("opacity: var(--task-content-opacity, 0)"));
    assert.ok(css.includes("cursor: default"));
  }
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
