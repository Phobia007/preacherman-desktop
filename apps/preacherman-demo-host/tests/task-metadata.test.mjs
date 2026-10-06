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
    useNuxtApp: () => ({$folio:{}}),
    useNavigation: () => ({to:path => events.push(path)}),
    CustomEvent: class {constructor(type,options){this.type=type;this.detail=options.detail;}},
    ref: (value) => ({value}),
    taskCoverUrl: id => id === "cover-saved" ? "blob:local-cover" : null,
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
  vm.runInNewContext(source.replace(/^import .*;$/gm, "").replaceAll("export const ", "globalThis.").replaceAll("export function ", "function ").replaceAll("import.meta.url", JSON.stringify(new URL("task-metadata.js", root).href)), context);
  const render = context.TaskMetadata.setup({slug: "nathan-riley"});
  const input = () => render().children[0].children[0].props;
  return {context, storage, session, events, render, input, mount: () => mount(), unmount: () => cleanup()};
}

test("every authored card uses the same task metadata and conversation template", () => {
  const {context} = fixture();
  assert.equal(context.isTaskTemplate({slug:"nathan-riley"}), true);
  assert.equal(context.isTaskTemplate({slug:"casa-di-solare"}), true);
  assert.equal(context.isTaskTemplate({slug:"griflan"}), true);
  assert.equal(context.isTaskTemplate(null), false);
});

test("settings are the only name editor; optional fields stay blank; saves are atomic", () => {
 const f=fixture("old name");
 assert.equal(f.render().children[0].children[0].tag,"span");
 assert.equal(f.input().onInput,undefined);
 f.render().children[0].children[1].props.onClick();
 assert.deepEqual(f.events,["preacherman:task-edit-open"]);
 const empty=f.context.readTaskSettings("demo",{title:"Demo"});
 for(const key of ["summary","group","workspacePath"])assert.equal(empty[key],"");
 f.context.updateTaskSettings("nathan-riley",{title:"  new name  ",summary:"notes",group:"g",workspacePath:"D:/preacherman",coverId:"cover-saved"});
 assert.equal(f.context.taskDisplayTitle({slug:"nathan-riley"}),"new name");
 assert.equal(f.context.readTaskSettings("nathan-riley").workspacePath,"D:/preacherman");
 assert.equal(f.context.readTaskSettings("nathan-riley").coverId,"cover-saved");
 const saved=f.storage.get("preacherman.task.settings");
 assert.throws(()=>f.context.updateTaskSettings("nathan-riley",{title:" "}));
 f.context.localStorage.setItem=()=>{throw new Error("quota");};
 assert.throws(()=>f.context.updateTaskSettings("nathan-riley",{title:"not saved"}),/quota/);
 assert.equal(f.storage.get("preacherman.task.settings"),saved);
 assert.equal(f.context.readTaskSettings("nathan-riley").title,"new name");
 assert.equal(f.context.taskDisplayTitle({slug:"casa",title:"Casa"}),"Casa");
});

test("cards retain authored typography and the bounded timeline uses synchronized titles", () => {
  const cards = fs.readFileSync(new URL("_nuxt/DxOxRmZ4.js", root), "utf8");
  const index = fs.readFileSync(new URL("_nuxt/CCsiJzJJ.js", root), "utf8");
  const featuredHtml = fs.readFileSync(new URL("index.html", root), "utf8");
  assert.ok(cards.includes('E("span",te,F(taskDisplayTitle(l)),1)'));
  assert.ok(cards.includes('whitespace-nowrap text-16 s:text-18 tracking-[-0.05em]'));
  const timeline = fs.readFileSync(new URL("task-timeline.js", root), "utf8");
  assert.ok(index.includes('export {default} from "../task-timeline.js"'));
  assert.ok(timeline.includes("taskDisplayTitle(project)"));
  assert.ok(cards.includes('e.showTitles('));
  assert.ok(cards.includes("augmentTaskProjects"));
  assert.ok(cards.includes("TaskCreateControl"));
  assert.ok(featuredHtml.includes('class="task-create"'));
  assert.ok(timeline.includes("folio.text(event.currentTarget, {reveal: false})"));
});

test("new conversation cards persist without invented source relationships", () => {
  const f = fixture("preacherman");
  const created = f.context.createTaskProject();
  assert.equal(created.title,"new one");
  assert.equal(created.parentId,"");
  assert.equal(f.context.taskDisplayTitle({slug:created.id,preachermanTask:true,title:created.title}),"new one");
  const augmented = f.context.augmentTaskProjects([{slug:"nathan-riley",title:"Nathan Riley"},{slug:"casa",title:"Casa"}]);
  assert.deepEqual(Array.from(augmented, project => project.slug),["nathan-riley",created.id,"casa"]);
  assert.equal(augmented[1].src.endsWith("task-empty-card.svg"),true);
  assert.equal(augmented[1].video, null);
  assert.equal(augmented[1].images.length, 0);
  const relations = f.render().children[2];
  assert.equal(relations.children[1].tag,"p");
  assert.equal(relations.children[2].props["aria-label"],"关联任务");
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

test("both floating task controls keep transparent centers and their existing outlines and motion", () => {
  const css = fs.readFileSync(new URL("task-metadata.css", root), "utf8");
  const control = css.match(/\.task-create__button \{([^}]+)\}/)[1];
  const hover = css.match(/\.task-create__button:hover \{([^}]+)\}/)[1];
  const deletion = fs.readFileSync(new URL("task-delete-control.js", root), "utf8");
  assert.match(control, /background: transparent;/);
  assert.match(control, /color: var\(--demo-theme-brand-menu-text-hover\)/);
  assert.match(control, /border: 1px solid color-mix\(in srgb, currentColor 28%, transparent\)/);
  assert.match(control, /border-radius: 50%/);
  assert.match(hover, /transform: scale\(1\.06\)/);
  assert.doesNotMatch(hover, /background/);
  assert.match(deletion, /class:"task-create__button task-delete__button"/);
  assert.match(css, /\.task-create__button:focus-visible \{\s*outline: 2px solid var\(--demo-theme-brand-menu-focus\) !important/);
  const deleteCss = fs.readFileSync(new URL("task-delete-control.css", root), "utf8");
  assert.match(deleteCss, /\.task-delete__button\[aria-pressed="true"\] \{ border-color: var\(--demo-theme-brand-menu-focus\)/);
  assert.match(deleteCss, /\.task-delete \.task-delete__button:focus-visible \{ outline-color: var\(--demo-theme-brand-menu-focus\)/);
});

test("task creation reuses the authored profile lens and owns dismiss/focus cleanup", () => {
  const runtime = fs.readFileSync(new URL("_nuxt/D9b8F35K.js", root), "utf8");
  const dialog = fs.readFileSync(new URL("task-create-dialog.js", root), "utf8");
  assert.ok(runtime.includes('e.openHole(_),taskDialog?.opened||f(_)'));
  assert.ok(runtime.includes('taskDialog?.dispose()'));
  assert.ok(runtime.includes('installTaskCreateDialog'));
  assert.ok(dialog.includes('profileOpen.value = true'));
  assert.ok(dialog.includes('event.key === "Escape"'));
  assert.ok(dialog.includes('event.key === "Tab"'));
  assert.ok(dialog.includes('event.stopImmediatePropagation()'));
  assert.ok(dialog.includes('stopWatching()'));
  assert.doesNotMatch(dialog, /localStorage|location\.href/);
  assert.ok(dialog.includes("folio.prepareTaskCreation"));
  assert.ok(dialog.includes("if (busy || readingCover) return"));
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
  assert.equal(detail.children[0].children[0].children, project.title);
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

test("deleting a task removes it from every list without cascading or destroying recoverable data", () => {
  const f = fixture();
  const first = f.context.createTaskProject({title:"first"});
  f.storage.set("preacherman.task.last-active", first.id);
  f.context.crypto.randomUUID = () => "child";
  const child = f.context.createTaskProject({title:"child"});
  const stored = f.storage.get("preacherman.task.projects");
  f.storage.set(`preacherman.task.${first.id}.messages`, '[{"text":"keep"}]');
  f.context.deleteTaskProject(first.id);
  assert.deepEqual(Array.from(f.context.readTaskProjects(), p=>p.id), [child.id]);
  assert.equal(f.storage.get("preacherman.task.projects"), stored);
  assert.equal(f.storage.get(`preacherman.task.${first.id}.messages`), '[{"text":"keep"}]');
  const cards = f.context.augmentTaskProjects([{slug:"nathan-riley"},{slug:first.id,preachermanTask:true}]);
  assert.deepEqual(Array.from(cards, p=>p.slug), ["nathan-riley", child.id]);
  f.context.location.search = "?task=" + child.id;
  const detail = f.context.TaskMetadata.setup({slug:"nathan-riley"})();
  assert.equal(detail.children[2].children[1].tag,"p"); // no dead parent link
});

test("last dynamic card and authored cards stay deleted after repeated augmentation", () => {
  const f = fixture();
  const project = f.context.createTaskProject();
  const original = [{slug:"nathan-riley"},{slug:"griflan"}];
  const populated = f.context.augmentTaskProjects(original);
  f.context.deleteTaskProject(project.id);
  f.context.deleteTaskProject("griflan");
  assert.deepEqual(Array.from(f.context.augmentTaskProjects(populated), p=>p.slug), ["nathan-riley"]);
  f.context.deleteTaskProject("nathan-riley");
  assert.equal(f.context.augmentTaskProjects(populated).length,0);
  assert.equal(f.context.preferredTaskSlug("griflan"),null);
  const newTask = f.context.createTaskProject({title:"after empty"});
  assert.equal(newTask.parentId,"");
});

test("failed deletion is atomic and preserves the visible task list", () => {
  const f = fixture();
  const project = f.context.createTaskProject();
  const before = [...f.storage.entries()];
  f.context.localStorage.setItem = () => {throw new Error("quota");};
  assert.throws(()=>f.context.deleteTaskProject(project.id),/quota/);
  assert.deepEqual([...f.storage.entries()],before);
  assert.equal(f.context.readTaskProjects()[0].id,project.id);
});

test("full index shares created names, task routes, framed empty previews and deletion filtering", () => {
  const f = fixture();
  const authored={slug:"nathan-riley",src:"original.jpg"};
  const created=f.context.createTaskProject({title:"新增名称"});
  const index=f.context.taskIndexProjects([authored]);
  assert.equal(index[0],authored);
  assert.equal(index[1].slug,created.id);
  assert.equal(f.context.taskDisplayTitle(index[1]),"新增名称");
  assert.equal(index[1].src.endsWith("task-empty-preview.svg"),true);
  assert.equal(f.context.projectRecord(created).src.endsWith("task-empty-card.svg"),true);
  assert.equal(f.context.taskProjectRoute(index[1]),"/projects/nathan-riley?task="+created.id);
  f.storage.set(f.context.titleStorageKey(created.id),"改名后");
  assert.equal(f.context.taskDisplayTitle(index[1]),"改名后");
  f.context.deleteTaskProject(created.id);
  assert.equal(f.context.taskIndexProjects(index).length,1);
  const runtime=fs.readFileSync(new URL("task-timeline.js",root),"utf8");
  assert.ok(runtime.includes("projects.value = taskIndexProjects(data.value ?? [])"));
  assert.ok(runtime.includes("folio.texture(project.src)"));
  assert.ok(runtime.includes("folio.rail.bind(panel.value, projects.value, previewBounds)"));
  assert.ok(runtime.includes("folio.rail.pick(index)"));
});

test("batch deletion writes once, preserves all records and excludes every selection from both lists", () => {
  const f=fixture();
  const first=f.context.createTaskProject({title:"first"});
  f.context.crypto.randomUUID=()=>"second";
  const second=f.context.createTaskProject({title:"second"});
  const stored=f.storage.get("preacherman.task.projects");
  let writes=0;
  f.context.localStorage.setItem=(key,value)=>{writes++;f.storage.set(key,value);};
  f.context.deleteTaskProjects([first.id,second.id,"griflan"]);
  assert.equal(writes,1);
  assert.equal(f.context.readTaskProjects().length,0);
  assert.equal(f.storage.get("preacherman.task.projects"),stored);
  const authored=[{slug:"nathan-riley"},{slug:"griflan"}];
  assert.deepEqual(Array.from(f.context.augmentTaskProjects(authored),p=>p.slug),["nathan-riley"]);
  assert.deepEqual(Array.from(f.context.taskIndexProjects(authored),p=>p.slug),["nathan-riley"]);
});

test("failed batch deletion retains every selected task without partial deletion", () => {
  const f=fixture();
  const first=f.context.createTaskProject();
  f.context.crypto.randomUUID=()=>"second";
  const second=f.context.createTaskProject();
  const before=[...f.storage.entries()];
  f.context.localStorage.setItem=()=>{throw new Error("quota");};
  assert.throws(()=>f.context.deleteTaskProjects([first.id,second.id]),/quota/);
  assert.deepEqual([...f.storage.entries()],before);
  assert.equal(f.context.readTaskProjects().length,2);
});

test("delete controls inherit semantic colors, mirrored placement, modal semantics and reduced motion", () => {
  const css = fs.readFileSync(new URL("task-delete-control.css",root),"utf8");
  const control = fs.readFileSync(new URL("task-delete-control.js",root),"utf8");
  assert.ok(css.includes("clamp(2rem, 4vw, 6rem)"));
  assert.ok(css.includes("border-radius: 4rem"));
  assert.ok(css.includes("prefers-reduced-motion: reduce"));
  assert.doesNotMatch(css,/#[\da-f]{3,8}\b/i);
  for (const token of ["composer","text","muted","border","hover","focus","disabled","error"]) assert.ok(css.includes(`--demo-theme-chat-${token}`));
  assert.ok(control.includes("showModal()"));
  assert.ok(control.includes('event.key === "Escape"'));
  assert.ok(control.includes("cancelAnimationFrame(frame)"));
  assert.ok(control.includes("window.removeEventListener(type, guard, true)"));
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

test("all task details skip original portfolio copy and media; original sheet/close remain", () => {
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

test("cover references persist without placing image bytes in task or chat storage", () => {
  const f = fixture();
  const created = f.context.createTaskProject({title:"图片封面",coverId:"cover-saved",coverBlob:"never serialize"});
  assert.equal(created.coverId,"cover-saved");
  assert.equal(f.context.projectRecord(created).src,"blob:local-cover");
  assert.equal(f.context.taskIndexProjects([])[0].src,"blob:local-cover");
  assert.doesNotMatch(f.storage.get("preacherman.task.projects"),/never serialize|blob:|base64/);
});

test("authored cards retain their own title, summary state and creation provenance", () => {
  const f = fixture();
  const authored = {slug:"griflan",title:"Griflan"};
  f.context.augmentTaskProjects([authored]);
  const detail = f.context.TaskMetadata.setup({slug:authored.slug,title:authored.title});
  assert.equal(detail().children[0].children[0].children,"Griflan");
  assert.equal(detail().children[1].children[0].children,"暂无任务摘要。");
  f.context.updateTaskSettings(authored.slug,{title:"独立任务"});
  f.mount();
  assert.equal(f.context.taskDisplayTitle(authored),"独立任务");
  assert.equal(f.context.taskDisplayTitle({slug:"nathan-riley",title:"Nathan Riley"}),"Nathan Riley");
  const child = f.context.createTaskProject({title:"后续"});
  assert.equal(child.parentId, "");
  f.context.linkTaskProjects(authored.slug,child.id);
  f.context.location.search="?task="+child.id;
  const childDetail=f.context.TaskMetadata.setup({slug:"nathan-riley"})();
  assert.equal(childDetail.children[2].children[1].children[0].children[0].children[0].children,"独立任务");
});

test("creation removes redundant close controls only while creating and retains Escape/outside dismissal", () => {
  const dialog=fs.readFileSync(new URL("task-create-dialog.js",root),"utf8");
  const css=fs.readFileSync(new URL("task-metadata.css",root),"utf8");
  assert.doesNotMatch(dialog,/closeButton|task-create-dialog__close/);
  assert.ok(dialog.includes('event.key === "Escape"'));
  assert.ok(dialog.includes('if (event.type === "click") close()'));
  assert.ok(dialog.includes('removeAttribute("data-task-creating")'));
  assert.ok(css.includes('html[data-task-creating] [data-od-id="profile-toggle"]'));
  assert.ok(dialog.includes('coverPicker.accept = "image/jpeg,image/png,image/webp"'));
  assert.ok(css.includes('task-create-dialog__cover:focus-visible'));
});


test("manual links are reciprocal, unique and direct; unopened demos, deleted and self links are excluded", () => {
 const f=fixture();
 f.context.augmentTaskProjects([{slug:"nathan-riley",title:"Preacherman"},{slug:"demo",title:"Unused"}]);
 f.mount();
 const a=f.context.createTaskProject({title:"A",workspacePath:"D:/preacherman"});
 f.context.crypto.randomUUID=()=>"second";
 const b=f.context.createTaskProject({title:"B"});
 assert.equal(f.context.taskLinkCandidates().length,3);
 assert.equal(f.context.readTaskProjects()[0].workspacePath,"D:/preacherman");
 f.context.linkTaskProjects(a.id,b.id);f.context.linkTaskProjects(b.id,a.id);
 assert.equal(JSON.parse(f.storage.get("preacherman.task.links")).length,1);
 assert.equal(f.context.relatedTaskProjects(a.id)[0].id,b.id);
 assert.equal(f.context.relatedTaskProjects(b.id)[0].id,a.id);
 assert.throws(()=>f.context.linkTaskProjects(a.id,a.id));assert.throws(()=>f.context.linkTaskProjects(a.id,"demo"));
 f.context.location.search="?task="+a.id;
 const detail=f.context.TaskMetadata.setup({slug:"nathan-riley"})();
 detail.children[2].children[1].children[0].children[0].props.onClick();
 assert.equal(f.events.at(-1),"/projects/nathan-riley?task="+b.id);
 f.context.deleteTaskProject(b.id);
 assert.equal(f.context.relatedTaskProjects(a.id).length,0);
 assert.throws(()=>f.context.linkTaskProjects(a.id,b.id));
});

test("failed association leaves no partial link",()=>{
 const f=fixture();const a=f.context.createTaskProject();f.context.crypto.randomUUID=()=>"second";const b=f.context.createTaskProject();
 f.context.localStorage.setItem=()=>{throw new Error("quota");};
 assert.throws(()=>f.context.linkTaskProjects(a.id,b.id),/quota/);
 assert.equal(f.context.relatedTaskProjects(a.id).length,0);assert.equal(f.context.relatedTaskProjects(b.id).length,0);
});

test("new controls use both appearance modes' inherited semantic colors and keyboard access",()=>{
 const css=fs.readFileSync(new URL("task-metadata.css",root),"utf8");
 assert.doesNotMatch(css,/#[0-9a-f]{3,8}\b/i);
 for(const key of ["text","border","focus","error","hover"])assert.ok(css.includes("--demo-theme-chat-"+key));
 const picker=fs.readFileSync(new URL("task-link-picker.js",root),"utf8");
 assert.ok(picker.includes('event.key === "Escape"'));assert.ok(picker.includes('event.key === "Tab"'));
 assert.ok(picker.includes('window.removeEventListener("resize", shrink)'));
});
