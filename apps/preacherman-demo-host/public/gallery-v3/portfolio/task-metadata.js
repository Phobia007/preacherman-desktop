// Task detail extension. Keep the authored sheet, columns, card rail and close motion.
// Editable DOM text must not enter the portfolio's WebGL text rasterizer.
import { ad as ref, a8 as element, a3 as onMounted, a6 as onUnmounted, a0 as useNuxtApp, aw as useNavigation } from "./_nuxt/D9b8F35K.js";
import { taskCoverUrl } from "./task-covers.js";
import { openTaskLinkPicker } from "./task-link-picker.js";

const ROOT_TASK_ID = "nathan-riley";
const TASK_PROJECTS_KEY = "preacherman.task.projects";
const DELETED_TASKS_KEY = "preacherman.task.deleted-projects";
const LAST_TASK_KEY = "preacherman.task.last-active";
const PENDING_TASK_KEY = "preacherman.task.pending-focus";
const EMPTY_CARD_URL = new URL("./task-empty-card.svg", import.meta.url).href;
const EMPTY_PREVIEW_URL = new URL("./task-empty-preview.svg", import.meta.url).href;
const authoredTasks = new Map();
const SETTINGS_KEY = "preacherman.task.settings";
const LINKS_KEY = "preacherman.task.links";
const OPENED_KEY = "preacherman.task.opened";
const readObject = key => {
  const value = JSON.parse(localStorage.getItem(key) ?? "{}");
  if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("任务资料无法读取。");
  return value;
};
export function readTaskSettings(id, fallback = {}) {
  const original = readStoredTaskProjects().find(item => item.id === id) ?? {};
  const saved = readObject(SETTINGS_KEY)[id] ?? {};
  return {...original, title: normalizeTitle(localStorage.getItem(titleStorageKey(id)) ?? original.title ?? fallback.title ?? ""), summary: original.summary ?? "", group: original.group ?? "", workspacePath: original.workspacePath ?? "", ...saved, id};
}
export function updateTaskSettings(id, values) {
  if (deletedTaskIds().has(id)) throw new Error("任务已被删除。");
  const title = normalizeTitle(values.title ?? "");
  if (!title) throw new Error("请填写任务名称。");
  const settings = readObject(SETTINGS_KEY);
  settings[id] = {...readTaskSettings(id), title, summary: String(values.summary ?? "").trim().slice(0, 2000), group: normalizeTitle(values.group ?? "").slice(0, 80), workspacePath: String(values.workspacePath ?? "").trim().slice(0, 4096), coverId: values.coverId ?? null};
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  titleRevision.value++;
  return settings[id];
}
export function rememberOpenedTask(id) {
  const opened = JSON.parse(localStorage.getItem(OPENED_KEY) ?? "[]");
  if (Array.isArray(opened) && !opened.includes(id)) localStorage.setItem(OPENED_KEY, JSON.stringify([...opened, id]));
}
export function taskLinkCandidates() {
  const created = readTaskProjects();
  const opened = JSON.parse(localStorage.getItem(OPENED_KEY) ?? "[]");
  const ids = new Set(Array.isArray(opened) ? opened : []);
  for (const id of authoredTasks.keys()) if (localStorage.getItem(`preacherman.task.${id}.messages`)) ids.add(id);
  const deleted = deletedTaskIds();
  const authored = [...ids].filter(id => authoredTasks.has(id) && !deleted.has(id)).map(id => readTaskSettings(id, authoredTasks.get(id)));
  return [...authored, ...created].map(item => ({...item, title:taskDisplayTitle({slug:item.id,title:item.title})}));
}
export function savedTaskCoverIds() { return [...readTaskProjects().map(item => item.coverId), ...Object.values(readObject(SETTINGS_KEY)).map(item => item.coverId)]; }

export function relatedTaskProjects(currentId) {
  void titleRevision.value;
  const edges = JSON.parse(localStorage.getItem(LINKS_KEY) ?? "[]");
  if (!Array.isArray(edges)) throw new Error("关联任务无法读取。");
  const ids = new Set(edges.filter(edge => Array.isArray(edge) && edge.length === 2 && edge.includes(currentId)).map(edge => edge.find(id => id !== currentId)));
  const deleted = deletedTaskIds();
  return [...ids].filter(id => id && !deleted.has(id)).map(id => {
    const item = readTaskSettings(id, authoredTasks.get(id));
    return {id, title: item.title || "未命名任务"};
  });
}
export function linkTaskProjects(source, target) {
  const candidates = new Set([...authoredTasks.keys(), ...readTaskProjects().map(item => item.id)].filter(id => !deletedTaskIds().has(id)));
  if (source === target || !candidates.has(source) || !candidates.has(target)) throw new Error("请选择其他可用任务。");
  const edges = JSON.parse(localStorage.getItem(LINKS_KEY) ?? "[]");
  if (!Array.isArray(edges)) throw new Error("关联任务无法读取。");
  if (edges.some(edge => Array.isArray(edge) && edge.includes(source) && edge.includes(target))) return;
  localStorage.setItem(LINKS_KEY, JSON.stringify([...edges, [source, target]]));
  titleRevision.value++;
}

export const titleStorageKey = (slug) => `preacherman.task.${slug}.title`;
export const normalizeTitle = (value) => String(value).replace(/\s+/g, " ").trim().slice(0, 120);

function validTaskProject(value) {
  return value && typeof value.id === "string" && value.id.startsWith("task-") &&
    typeof value.title === "string" && typeof value.parentId === "string";
}

function readStoredTaskProjects() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TASK_PROJECTS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(validTaskProject) : [];
  } catch {
    return [];
  }
}

export function deletedTaskIds() {
  const value = JSON.parse(localStorage.getItem(DELETED_TASKS_KEY) ?? "[]");
  if (!Array.isArray(value) || value.some(id => typeof id !== "string")) throw new Error("Invalid deleted task list");
  return new Set(value);
}

export function readTaskProjects() {
  const deleted = deletedTaskIds();
  return readStoredTaskProjects().filter(project => !deleted.has(project.id)).map(project => ({...project, ...readObject(SETTINGS_KEY)[project.id]}));
}

// A single durable write removes a card everywhere without destroying source media
// or cascading into related tasks. Retained local records remain recoverable.
export function deleteTaskProject(id) {
  deleteTaskProjects([id]);
}

export function deleteTaskProjects(ids) {
  const deleted = deletedTaskIds();
  for (const id of ids) deleted.add(id);
  localStorage.setItem(DELETED_TASKS_KEY, JSON.stringify([...deleted]));
}

function writeTaskProjects(projects) {
  localStorage.setItem(TASK_PROJECTS_KEY, JSON.stringify(projects));
}

function taskId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `task-${uuid ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

export function createTaskProject(values = {}) {
  const project = {
    id: taskId(),
    title: normalizeTitle(values.title ?? "") || "new one",
    summary: String(values.summary ?? "").trim().slice(0, 2000),
    group: normalizeTitle(values.group ?? "").slice(0, 80),
    parentId: "",
    workspacePath: String(values.workspacePath ?? "").trim().slice(0, 4096),
    createdAt: new Date().toISOString(),
    ...(typeof values.coverId === "string" ? {coverId: values.coverId} : {}),
  };
  const projects = [...readStoredTaskProjects(), project];
  writeTaskProjects(projects);
  return project;
}

export function projectRecord(project) {
  const cover = taskCoverUrl(project.coverId);
  return {
    id: project.id,
    slug: project.id,
    featured: true,
    title: project.title,
    description: project.summary ?? "",
    awards: null,
    link: null,
    outlined: false,
    tags: [],
    src: cover ?? EMPTY_CARD_URL,
    thumb: cover ?? EMPTY_CARD_URL,
    card: cover ?? EMPTY_CARD_URL,
    coverId: project.coverId,
    width: 2048,
    height: 1172,
    alt: "",
    video: null,
    images: [],
    preachermanTask: true,
  };
}

export function augmentTaskProjects(projects) {
  for (const project of projects) {
    if (project?.slug && !project.preachermanTask) authoredTasks.set(project.slug, project);
  }
  const dynamic = readTaskProjects().map(projectRecord);
  const deleted = deletedTaskIds();
  const authored = projects.filter(project => !project?.preachermanTask && !deleted.has(project.slug)).map(project => {
    const settings = readObject(SETTINGS_KEY)[project.slug];
    const cover = taskCoverUrl(settings?.coverId);
    return cover ? {...project, src:cover, thumb:cover, card:cover, coverId:settings.coverId} : project;
  });
  const rootIndex = authored.findIndex(project => project?.slug === ROOT_TASK_ID);
  if (rootIndex < 0) return [...authored, ...dynamic];
  return [...authored.slice(0, rootIndex + 1), ...dynamic, ...authored.slice(rootIndex + 1)];
}

export function taskProjectRoute(project) {
  if (!project?.preachermanTask) return `/projects/${project?.slug ?? ROOT_TASK_ID}`;
  return `/projects/${ROOT_TASK_ID}?task=${encodeURIComponent(project.slug)}`;
}

// The full index keeps its original floating preview shader and mouse response.
// A framed black texture makes an empty task visible against the black stage.
export function taskIndexProjects(projects) {
  return augmentTaskProjects(projects).map(project => project.preachermanTask && !taskCoverUrl(project.coverId)
    ? {...project, src:EMPTY_PREVIEW_URL, thumb:EMPTY_PREVIEW_URL}
    : project);
}

export function preferredTaskSlug(returning) {
  try {
    const pending = sessionStorage.getItem(PENDING_TASK_KEY);
    if (pending && !deletedTaskIds().has(pending)) {
      sessionStorage.removeItem(PENDING_TASK_KEY);
      return pending;
    }
  } catch {}
  return deletedTaskIds().has(returning) ? null : returning;
}

export function resolveTaskId(slug = ROOT_TASK_ID) {
  try {
    const candidate = new URLSearchParams(globalThis.location?.search ?? "").get("task");
    if (candidate && readTaskProjects().some(project => project.id === candidate)) {
      localStorage.setItem(LAST_TASK_KEY, candidate);
      return candidate;
    }
  } catch {}
  try { localStorage.setItem(LAST_TASK_KEY, slug); } catch {}
  return slug;
}

export const isTaskTemplate = (project) => typeof project?.slug === "string" && Boolean(project.slug);

const titleRevision = ref(0);
// Keep the authored labels and their WebGL font rasterization; change only copy.
export const taskDisplayTitle = (project) => {
  void titleRevision.value;
  try {
    const updated = readObject(SETTINGS_KEY)[project?.slug]?.title;
    if (updated) return updated;
  } catch {}
  if (project?.preachermanTask) {
    try {
      return normalizeTitle(localStorage.getItem(titleStorageKey(project.slug)) ?? "") || project.title;
    } catch {
      return project.title;
    }
  }
  if (isTaskTemplate(project)) {
    try {
      const saved = normalizeTitle(localStorage.getItem(titleStorageKey(project.slug)) ?? "");
      if (saved) return saved;
    } catch {}
  }
  return project?.title ?? "";
};

const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = new URL("./task-metadata.css", import.meta.url).href;
document.head.append(stylesheet);
const conversationStyle = document.createElement("link");
conversationStyle.rel = "stylesheet";
conversationStyle.href = new URL("./task-conversation.css", import.meta.url).href;
document.head.append(conversationStyle);
const deleteStyle = document.createElement("link");
deleteStyle.rel = "stylesheet";
deleteStyle.href = new URL("./task-delete-control.css", import.meta.url).href;
document.head.append(deleteStyle);

function syncTheme() {
  const source = parent.document.querySelector(".demo-app-shell") ?? parent.document.documentElement;
  const styles = getComputedStyle(source);
  for (const name of ["--demo-theme-gallery-detail-action-rest-text", "--demo-theme-gallery-detail-action-rest-bg", "--demo-theme-gallery-detail-action-rest-border", "--demo-theme-gallery-detail-action-focus",
    ...["text", "text-hover", "focus"].map(key => "--demo-theme-brand-menu-" + key),
    ...["composer", "text", "muted", "border", "message", "hover", "send", "send-text", "disabled", "focus", "error"].map(key => "--demo-theme-chat-" + key)]) {
    document.documentElement.style.setProperty(name, styles.getPropertyValue(name));
  }
}
syncTheme();
addEventListener("message", (event) => {
  if (event.source === parent && event.origin === location.origin && event.data?.type === "gallery-theme") syncTheme();
});

export function taskRoute(id) {
  return taskProjectRoute(readTaskProjects().some(item => item.id === id) ? {slug:id,preachermanTask:true} : {slug:id});
}

function plusIcon() {
  return element("svg", {viewBox:"0 0 24 24", fill:"none", stroke:"currentColor", "stroke-width":1.5, "stroke-linecap":"round", "aria-hidden":"true"}, [
    element("path", {d:"M12 5v14M5 12h14"}),
  ]);
}

export const TaskCreateControl = {
  setup() {
    const overlay = ref(null);
    onMounted(() => overlay.value?.showPopover());
    onUnmounted(() => overlay.value?.hidePopover());
    const open = () => window.dispatchEvent(new Event("preacherman:task-create-open"));
    return () => element("div", {ref:overlay, class:"task-create", popover:"manual"}, [
      element("button", {type:"button", class:"task-create__button", title:"创建新对话", "aria-label":"创建新对话", "aria-haspopup":"dialog", "aria-controls":"task-create-dialog", "aria-expanded":"false", onClick:open}, [plusIcon()]),
      null,
    ]);
  },
};

export const TaskMetadata = {
  props: { slug: { type: String, required: true }, title: {type:String, default:""}, preview:{type:Boolean, default:false} },
  setup(props) {
    const task = props.preview ? props.slug : resolveTaskId(props.slug);
    if (!task.startsWith("task-") && !authoredTasks.has(task)) authoredTasks.set(task, {slug:task, title:props.title});
    const nuxt = useNuxtApp();
    const {$folio: folio} = nuxt;
    const {to: navigate} = useNavigation();
    const error = ref("");
    let picker = null;
    onMounted(() => { if (props.preview) return; try { rememberOpenedTask(task); } catch { error.value = "任务访问记录未能保存。"; } });
    onUnmounted(() => picker?.dispose());
    const settings = () => {
      error.value = "";
      window.dispatchEvent(new CustomEvent("preacherman:task-edit-open", {detail:{id:task, title:props.title}}));
    };
    const associate = event => {
      if (picker) return;
      error.value = "";
      try {
        picker = openTaskLinkPicker({folio, appContext:nuxt.vueApp._context, task, anchor:event.currentTarget, candidates:taskLinkCandidates(), linked:relatedTaskProjects(task).map(item=>item.id),
          onSelect:target => linkTaskProjects(task, target), onClose:()=>{picker=null;}});
      } catch { error.value = "关联任务暂不可用，请重试。"; }
    };
    return () => {
      void titleRevision.value;
      const project = readTaskSettings(task, {title:props.title});
      const related = relatedTaskProjects(task);
      return element("div", { class: "task-metadata", "data-task-id": task, tabindex: 0 }, [
        element("h1", { class: "task-metadata__heading" }, [
          element("span", {class:"task-metadata__title"}, project.title || "未命名任务"),
          element("button", {type:"button", class:"task-metadata__settings", title:"任务设置", "aria-label":"任务设置", onClick:settings}, [
            element("svg", {viewBox:"14 14 52 52", fill:"none", stroke:"currentColor", "stroke-width":2.6, "stroke-linecap":"round", "stroke-linejoin":"round", "aria-hidden":"true"}, [
              element("path", {d:"M55.71,33.49L56.56,36.18L61.73,36.56L61.73,43.44L56.56,43.82L55.71,46.51L54.42,49.01L57.80,52.93L52.93,57.80L49.01,54.42L46.51,55.71L43.82,56.56L43.44,61.73L36.56,61.73L36.18,56.56L33.49,55.71L30.99,54.42L27.07,57.80L22.20,52.93L25.58,49.01L24.29,46.51L23.44,43.82L18.27,43.44L18.27,36.56L23.44,36.18L24.29,33.49L25.58,30.99L22.20,27.07L27.07,22.20L30.99,25.58L33.49,24.29L36.18,23.44L36.56,18.27L43.44,18.27L43.82,23.44L46.51,24.29L49.01,25.58L52.93,22.20L57.80,27.07L54.42,30.99Z"}), element("circle", {cx:40,cy:40,r:8.5}),
            ]),
          ]),
        ]),
        element("div", { class: "task-metadata__description" }, [
          element("p", { class: "task-metadata__summary", "aria-label": "任务摘要" }, project.summary || "暂无任务摘要。"),
          project.group ? element("p", {class:"task-metadata__group", "aria-label":"任务分组"}, project.group) : null,
          project.workspacePath ? element("p", {class:"task-metadata__workspace", title:project.workspacePath, "aria-label":"工作区"}, project.workspacePath) : null,
        ]),
        element("section", {class:"task-metadata__relations", "aria-labelledby":`task-relations-${task}`}, [
          element("h2", {id:`task-relations-${task}`, class:"task-metadata__relations-title"}, "关联任务"),
          related.length
            ? element("ul", {class:"task-metadata__relations-list"}, related.map(relation => element("li", {key:relation.id}, [
                element("button", {type:"button", class:"task-metadata__relation", onClick:() => navigate(taskRoute(relation.id))}, [
                  element("span", {class:"task-metadata__relation-name"}, relation.title),
                  element("span", {class:"task-metadata__relation-kind", "aria-hidden":"true"}, "↗"),
                ]),
              ])))
            : element("p", {class:"task-metadata__relations-empty"}, "暂无关联任务"),
          element("button", {type:"button", class:"task-metadata__link-add", "aria-label":"关联任务", title:"关联任务", onClick:associate}, [plusIcon()]),
        ]),
        error.value ? element("p", { class: "task-metadata__error", role: "alert" }, error.value) : null,
      ]);
    };
  },
};

// Text selection and pane scrolling must not trigger global sheet navigation.
for (const type of ["pointerdown", "wheel", "touchstart"]) {
  document.addEventListener(type, (event) => {
    if (event.target.closest?.(".task-metadata, .task-create")) event.stopPropagation();
  });
}
