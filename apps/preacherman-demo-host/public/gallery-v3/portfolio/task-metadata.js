// Task detail extension. Keep the authored sheet, columns, card rail and close motion.
// Editable DOM text must not enter the portfolio's WebGL text rasterizer.
import { ad as ref, a8 as element, a3 as onMounted, a6 as onUnmounted } from "./_nuxt/D9b8F35K.js";

const ROOT_TASK_ID = "nathan-riley";
const TASK_PROJECTS_KEY = "preacherman.task.projects";
const LAST_TASK_KEY = "preacherman.task.last-active";
const PENDING_TASK_KEY = "preacherman.task.pending-focus";
const EMPTY_CARD_URL = new URL("./task-empty-card.svg", import.meta.url).href;

export const titleStorageKey = (slug) => `preacherman.task.${slug}.title`;
export const normalizeTitle = (value) => String(value).replace(/\s+/g, " ").trim().slice(0, 120);

function validTaskProject(value) {
  return value && typeof value.id === "string" && value.id.startsWith("task-") &&
    typeof value.title === "string" && typeof value.parentId === "string";
}

export function readTaskProjects() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TASK_PROJECTS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(validTaskProject) : [];
  } catch {
    return [];
  }
}

function writeTaskProjects(projects) {
  localStorage.setItem(TASK_PROJECTS_KEY, JSON.stringify(projects));
}

function taskId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `task-${uuid ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function readLastTaskId() {
  try {
    const candidate = localStorage.getItem(LAST_TASK_KEY);
    return candidate === ROOT_TASK_ID || readTaskProjects().some(project => project.id === candidate)
      ? candidate
      : ROOT_TASK_ID;
  } catch {
    return ROOT_TASK_ID;
  }
}

export function createTaskProject() {
  const project = {
    id: taskId(),
    title: "new one",
    parentId: readLastTaskId(),
    createdAt: new Date().toISOString(),
  };
  const projects = [...readTaskProjects(), project];
  writeTaskProjects(projects);
  localStorage.setItem(titleStorageKey(project.id), project.title);
  sessionStorage.setItem(PENDING_TASK_KEY, project.id);
  return project;
}

function updateTaskProjectTitle(id, title) {
  const projects = readTaskProjects();
  const index = projects.findIndex(project => project.id === id);
  if (index < 0) return;
  projects[index] = {...projects[index], title};
  writeTaskProjects(projects);
}

function projectRecord(project) {
  return {
    id: project.id,
    slug: project.id,
    featured: true,
    title: project.title,
    description: "",
    awards: null,
    link: null,
    outlined: false,
    tags: [],
    src: EMPTY_CARD_URL,
    thumb: EMPTY_CARD_URL,
    card: EMPTY_CARD_URL,
    width: 2048,
    height: 1172,
    alt: "",
    video: null,
    images: [],
    preachermanTask: true,
  };
}

export function augmentTaskProjects(projects) {
  const dynamic = readTaskProjects().map(projectRecord);
  if (!dynamic.length || projects.some(project => project?.preachermanTask)) return projects;
  const rootIndex = projects.findIndex(project => project?.slug === ROOT_TASK_ID);
  if (rootIndex < 0) return [...projects, ...dynamic];
  return [...projects.slice(0, rootIndex + 1), ...dynamic, ...projects.slice(rootIndex + 1)];
}

export function taskProjectRoute(project) {
  if (!project?.preachermanTask) return `/projects/${project?.slug ?? ROOT_TASK_ID}`;
  return `/projects/${ROOT_TASK_ID}?task=${encodeURIComponent(project.slug)}`;
}

export function preferredTaskSlug(returning) {
  try {
    const pending = sessionStorage.getItem(PENDING_TASK_KEY);
    if (pending) {
      sessionStorage.removeItem(PENDING_TASK_KEY);
      return pending;
    }
  } catch {}
  return returning;
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

export const isTaskTemplate = (project) => project?.slug === ROOT_TASK_ID;

const titleRevision = ref(0);
// Keep the authored labels and their WebGL font rasterization; change only copy.
export const taskDisplayTitle = (project) => {
  void titleRevision.value;
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

function syncTheme() {
  const source = parent.document.querySelector(".demo-app-shell") ?? parent.document.documentElement;
  const styles = getComputedStyle(source);
  for (const name of ["--demo-theme-gallery-detail-action-rest-text", "--demo-theme-gallery-detail-action-rest-bg", "--demo-theme-gallery-detail-action-focus",
    ...["composer", "text", "muted", "border", "message", "hover", "send", "send-text", "disabled", "focus", "error"].map(key => "--demo-theme-chat-" + key)]) {
    document.documentElement.style.setProperty(name, styles.getPropertyValue(name));
  }
}
syncTheme();
addEventListener("message", (event) => {
  if (event.source === parent && event.origin === location.origin && event.data?.type === "gallery-theme") syncTheme();
});

function relatedTaskProjects(currentId) {
  const projects = readTaskProjects();
  const current = projects.find(project => project.id === currentId);
  const relations = [];
  if (current?.parentId) {
    const parentProject = projects.find(project => project.id === current.parentId);
    relations.push({
      id: current.parentId,
      title: parentProject?.title ?? (current.parentId === ROOT_TASK_ID ? taskDisplayTitle({slug: ROOT_TASK_ID, title: "Nathan Riley"}) : "未命名任务"),
      relation: "来源任务",
    });
  }
  for (const project of projects) {
    if (project.parentId === currentId) relations.push({id: project.id, title: project.title, relation: "后续任务"});
  }
  return relations;
}

function openTask(id) {
  try { localStorage.setItem(LAST_TASK_KEY, id); } catch {}
  try { sessionStorage.setItem(PENDING_TASK_KEY, id); } catch {}
  const router = document.querySelector("#__nuxt")?.__vue_app__?.config?.globalProperties?.$router;
  if (router) {
    Promise.resolve(router.push("/")).catch(() => { location.href = "/gallery-v3/portfolio/index.html"; });
    return;
  }
  location.href = "/gallery-v3/portfolio/index.html";
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
    const error = ref("");
    const create = () => {
      try {
        createTaskProject();
        location.href = "/gallery-v3/portfolio/index.html";
      } catch {
        error.value = "新任务未能保存，请重试。";
      }
    };
    return () => element("div", {ref:overlay, class:"task-create", popover:"manual"}, [
      element("button", {type:"button", class:"task-create__button", title:"创建新对话", "aria-label":"创建新对话", onClick:create}, [plusIcon()]),
      error.value ? element("p", {class:"task-create__error", role:"alert"}, error.value) : null,
    ]);
  },
};

export const TaskMetadata = {
  props: { slug: { type: String, required: true } },
  setup(props) {
    const task = resolveTaskId(props.slug);
    const fallback = task === ROOT_TASK_ID ? "未命名任务" : "new one";
    let saved = fallback;
    try { saved = normalizeTitle(localStorage.getItem(titleStorageKey(task)) ?? "") || fallback; } catch {}
    const title = ref(saved);
    const error = ref("");
    const commit = () => {
      title.value = normalizeTitle(title.value) || saved;
      try {
        localStorage.setItem(titleStorageKey(task), title.value);
        updateTaskProjectTitle(task, title.value);
        saved = title.value;
        error.value = "";
        titleRevision.value++;
      } catch { error.value = "名称未能保存，请重新编辑后重试。"; }
    };
    onUnmounted(commit);
    return () => {
      const related = relatedTaskProjects(task);
      return element("div", { class: "task-metadata", "data-task-id": task, tabindex: 0 }, [
        element("h1", { class: "task-metadata__heading" }, [
          element("input", {
            class: "task-metadata__title",
            "aria-label": "任务名称",
            title: "点击修改任务名称，按 Enter 保存",
            type: "text", maxlength: 120, autocomplete: "off", spellcheck: false,
            value: title.value,
            onInput: (event) => { title.value = event.target.value; },
            onBlur: commit,
            onKeydown: (event) => {
              if (event.isComposing) return;
              if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); event.target.blur(); }
              if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); title.value = saved; event.target.blur(); }
            },
          }),
        ]),
        element("p", { class: "task-metadata__summary", "aria-label": "任务摘要" }, "暂无任务摘要。"),
        element("section", {class:"task-metadata__relations", "aria-labelledby":`task-relations-${task}`}, [
          element("h2", {id:`task-relations-${task}`, class:"task-metadata__relations-title"}, "关联任务"),
          related.length
            ? element("ul", {class:"task-metadata__relations-list"}, related.map(relation => element("li", {key:relation.id}, [
                element("button", {type:"button", class:"task-metadata__relation", onClick:() => openTask(relation.id)}, [
                  element("span", {class:"task-metadata__relation-name"}, relation.title),
                  element("span", {class:"task-metadata__relation-kind"}, relation.relation),
                ]),
              ])))
            : element("p", {class:"task-metadata__relations-empty"}, "暂无关联任务。新建的对话会排列在这里。"),
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
