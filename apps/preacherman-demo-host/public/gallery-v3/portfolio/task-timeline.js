import {a0 as useNuxtApp, a1 as withAsyncContext, a2 as useHead, a3 as onMounted, a4 as nextTick, a6 as onUnmounted, a8 as h, ac as useAsyncData, ad as ref, af as computed, aj as navigateTo} from "./_nuxt/D9b8F35K.js";
import {u as usePrefetch} from "./_nuxt/DXCfcV2M.js";
import {loadTaskCovers} from "./task-covers.js";
import {readTaskProjects, taskDisplayTitle, taskIndexProjects, taskProjectRoute} from "./task-metadata.js";
import {taskTimelineGroups} from "./task-timeline-data.js";

const style = document.createElement("link");
style.rel = "stylesheet";
style.href = new URL("./task-timeline.css", import.meta.url).href;
document.head.append(style);

// View state only. Nothing here changes saved task records, dates or conversations.
const view = {open: null, x: 0, y: 0};
export default {
  __name: "full",
  async setup() {
    const nuxt = useNuxtApp();
    const {$folio: folio, $dato: dato, $resize: resize} = nuxt;
    let pending, restore;
    const {data} = ([pending, restore] = withAsyncContext(() => useAsyncData("projects", () => dato.projects())), pending = await pending, restore(), pending);
    useHead(() => ({title: "Index"}));
    const root = ref(null), panel = ref(null), horizontal = ref(null), body = ref(null);
    const projects = ref([]), records = ref([]), ready = ref(false), error = ref("");
    const authored = (data.value ?? []).filter(project => !project.preachermanTask).map(project => project.slug);
    const groups = computed(() => taskTimelineGroups(projects.value, records.value, authored));
    const open = ref(new Set(view.open ?? []));
    let disposed = false, observer, frame = 0, bounds = null, flying = null, navigating = false;
    const point = event => resize.mouse && folio.rail.point(event.clientX, event.clientY);
    const measure = () => {
      frame = 0;
      if (!body.value) return;
      const bodyRect = body.value.getBoundingClientRect();
      const viewportRect = horizontal.value.getBoundingClientRect();
      const clip = {left: Math.max(bodyRect.left, viewportRect.left), top: bodyRect.top, right: Math.min(bodyRect.right, viewportRect.right), bottom: bodyRect.bottom};
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      for (const name of body.value.querySelectorAll(".task-timeline__name")) {
        const rect = name.getBoundingClientRect();
        if (rect.right <= clip.left || rect.left >= clip.right || rect.bottom <= clip.top || rect.top >= clip.bottom) continue;
        left = Math.min(left, Math.max(clip.left, rect.left));
        top = Math.min(top, Math.max(clip.top, rect.top));
        right = Math.max(right, Math.min(clip.right, rect.right));
        bottom = Math.max(bottom, Math.min(clip.bottom, rect.bottom));
      }
      bounds = left < right ? {left, top, right, bottom} : null;
    };
    const scheduleMeasure = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const toggle = async day => {
      const next = new Set(open.value);
      next.has(day) ? next.delete(day) : next.add(day);
      open.value = next;
      view.open = [...next];
      await nextTick();
      scheduleMeasure();
    };
    const preview = (event, index) => {
      if (!ready.value || (!resize.mouse && event.type !== "focus")) return;
      const rect = event.currentTarget.getBoundingClientRect();
      folio.rail.point(event.clientX ?? rect.left + rect.width / 2, event.clientY ?? rect.top + rect.height / 2);
      folio.rail.pick(index);
    };
    const visit = async (event, project) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (navigating || !ready.value) return;
      navigating = true;
      // Rasterize only the clicked title for the original card-entry transition.
      const name = event.currentTarget;
      flying = await folio.text(name, {reveal: false});
      if (disposed) { folio.dropTexts(flying); return; }
      folio.selectTitle(flying, project.slug);
      await navigateTo(taskProjectRoute(project));
    };
    const rememberScroll = () => {
      view.x = horizontal.value?.scrollLeft ?? 0;
      view.y = body.value?.scrollTop ?? 0;
      scheduleMeasure();
    };
    usePrefetch(() => data.value?.length ? [`/projects/${data.value[0].slug}`] : [], {payloads: 0});
    onMounted(async () => {
      try {
        records.value = readTaskProjects();
        await loadTaskCovers(records.value.map(project => project.coverId));
        if (disposed) return;
        projects.value = taskIndexProjects(data.value ?? []);
        if (view.open === null) {
          const dated = groups.value.filter(group => group.day !== "undated");
          open.value = new Set((dated.length ? dated : groups.value).slice(-1).map(group => group.day));
        }
        await nextTick();
        folio.declare();
        await folio.booted;
        await Promise.all(projects.value.filter(project => project.preachermanTask).map(project => folio.texture(project.src)));
        if (disposed) return;
        folio.hideHome();
        folio.scan(root.value);
        folio.depart();
        folio.fadeLeaving();
        folio.rail.bind(panel.value, projects.value, () => bounds);
        window.addEventListener("pointermove", point, {passive: true});
        folio.staggerHud(.2, .03);
        folio.setScroll(0);
        ready.value = true;
        await nextTick();
        horizontal.value.scrollLeft = view.x;
        body.value.scrollTop = view.y;
        observer = new ResizeObserver(scheduleMeasure);
        observer.observe(body.value);
        scheduleMeasure();
      } catch {
        if (!disposed) error.value = "Unable to load tasks. Return to Featured and try again.";
      }
    });
    onUnmounted(() => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener("pointermove", point);
      cancelAnimationFrame(frame);
      folio.rail.bind(null);
      folio.dropTexts(flying);
    });
    const arrow = expanded => h("svg", {viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 1.25, "aria-hidden": "true", class: "task-timeline__arrow", style: {transform: expanded ? "rotate(180deg)" : ""}}, [h("path", {d: "m6 9 6 6 6-6"})]);
    return () => h("main", {
      ref: root, class: "task-timeline", "data-gl-shield": "", "aria-label": "Task timeline",
      "data-profile-open": !!nuxt.payload.state["$sprofile-open"],
    }, [
      h("div", {class: "task-timeline__viewport", ref: horizontal, onScroll: rememberScroll, onWheel: event => event.stopPropagation(), "data-lenis-prevent": ""},
        [h("div", {class: "task-timeline__track", style: {"--date-count": Math.max(1, groups.value.length)}}, [
          h("div", {class: "task-timeline__axis"}, groups.value.map(group => h("button", {
            key: group.day, type: "button", class: "task-timeline__date",
            "aria-expanded": open.value.has(group.day), "aria-controls": "task-day-" + group.day,
            onClick: () => toggle(group.day),
          }, [h("span", null, group.label), arrow(open.value.has(group.day))]))),
          h("div", {class: "task-timeline__body", ref: body, onScroll: rememberScroll, onAnimationend: scheduleMeasure, tabindex: 0, "aria-label": "Scroll tasks", "data-lenis-prevent": ""}, groups.value.map(group => h("section", {
            key: group.day, id: "task-day-" + group.day, class: "task-timeline__column", "aria-label": group.label,
          }, open.value.has(group.day) ? [h("ul", {class: "task-timeline__names"}, group.items.map(({project, index}, row) => h("li", {
            key: project.slug, style: {"--row-delay": Math.min(row * 32, 256) + "ms"},
          }, [h("a", {
            class: "task-timeline__name", href: taskProjectRoute(project),
            onPointerenter: event => preview(event, index), onFocus: event => preview(event, index),
            onClick: event => visit(event, project),
          }, taskDisplayTitle(project))])))] : []))),
        ])]),
      !ready.value ? h("p", {class: "task-timeline__status", role: error.value ? "alert" : "status"}, error.value || "Loading tasks…") : !groups.value.length ? h("p", {class: "task-timeline__status"}, "No tasks yet.") : null,
      h("div", {class: "pointer-events-none absolute inset-0"}, [h("div", {ref: panel, class: "h-200 w-0 rounded-20"})]),
    ]);
  },
};
