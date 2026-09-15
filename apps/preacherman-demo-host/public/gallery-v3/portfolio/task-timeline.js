import {a0 as useNuxtApp, a1 as withAsyncContext, a2 as useHead, a3 as onMounted, a4 as nextTick, a6 as onUnmounted, a8 as h, ac as useAsyncData, ad as ref, af as computed, aw as useNavigation} from "./_nuxt/D9b8F35K.js";
import {u as usePrefetch} from "./_nuxt/DXCfcV2M.js";
import {loadTaskCovers} from "./task-covers.js";
import {readTaskProjects, taskDisplayTitle, taskIndexProjects, taskProjectRoute} from "./task-metadata.js";
import {taskTimelineGroups, taskTickHeight, taskNameBounds} from "./task-timeline-data.js";

const style = document.createElement("link");
style.rel = "stylesheet";
style.href = new URL("./task-timeline.css", import.meta.url).href;
document.head.append(style);

// View state only. Nothing here changes saved task records, dates or conversations.
const view = {open: null, x: 0, columns: new Map()};
export default {
  __name: "full",
  async setup() {
    const nuxt = useNuxtApp();
    const {$folio: folio, $dato: dato, $resize: resize} = nuxt;
    const {to: navigate} = useNavigation();
    let pending, restore;
    const {data} = ([pending, restore] = withAsyncContext(() => useAsyncData("projects", () => dato.projects())), pending = await pending, restore(), pending);
    useHead(() => ({title: "Index"}));
    const root = ref(null), panel = ref(null), horizontal = ref(null), track = ref(null), ruler = ref(null);
    const projects = ref([]), records = ref([]), ready = ref(false), error = ref("");
    const authored = (data.value ?? []).filter(project => !project.preachermanTask).map(project => project.slug);
    const groups = computed(() => taskTimelineGroups(projects.value, records.value, authored));
    const open = ref(new Set(view.open ?? [])), markers = ref([]), rulerWidth = ref(0), rulerPointer = ref(null), dragging = ref(false);
    let disposed = false, observer, frame = 0, scrollFrame = 0, scrolling = null, flying = null, navigating = false;
    let activeName = null, pointer = null, keyboardPreview = false, drag = null;
    const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const clearPreview = () => { activeName = null; keyboardPreview = false; };
    const previewBounds = () => {
      if (!activeName?.isConnected || nuxt.payload.state["$sprofile-open"]) return null;
      const column = activeName.closest(".task-timeline__column");
      if (!column || !horizontal.value) return null;
      const bounds = taskNameBounds(activeName.getBoundingClientRect(), column.getBoundingClientRect(), horizontal.value.getBoundingClientRect());
      if (!bounds || (!keyboardPreview && (!pointer || pointer.x < bounds.left || pointer.x > bounds.right || pointer.y < bounds.top || pointer.y > bounds.bottom))) return null;
      // No union of rows and no activation padding. The rail keeps its original damping.
      return bounds;
    };
    const point = event => {
      if (!resize.mouse) return;
      pointer = {x: event.clientX, y: event.clientY};
      folio.rail.point(pointer.x, pointer.y);
      const name = event.target.closest?.(".task-timeline__name");
      if (ready.value && name && root.value?.contains(name)) {
        activeName = name;
        keyboardPreview = false;
        folio.rail.pick(Number(name.dataset.projectIndex));
      } else clearPreview();
    };
    const measure = () => {
      frame = 0;
      if (!track.value) return;
      rulerWidth.value = track.value.clientWidth;
      const start = track.value.getBoundingClientRect().left;
      markers.value = [...track.value.querySelectorAll(".task-timeline__date-label")].map(label => {
        const rect = label.getBoundingClientRect();
        return rect.left + rect.width / 2 - start;
      });
    };
    const scheduleMeasure = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const ticks = computed(() => Array.from({length: Math.ceil(rulerWidth.value / 10)}, (_, index) => index * 10)
      .filter(x => markers.value.every(marker => Math.abs(marker - x) > 4))
      .map(x => ({x, height: taskTickHeight(Math.min(...markers.value.map(marker => Math.abs(x - marker))), rulerPointer.value === null ? Infinity : Math.abs(x - rulerPointer.value))})));
    const toggle = async day => {
      stopScroll();
      const next = new Set(open.value);
      next.has(day) ? next.delete(day) : next.add(day);
      open.value = next;
      view.open = [...next];
      clearPreview();
      await nextTick();
      const column = root.value.querySelector('[data-day="' + day + '"]');
      if (column) column.scrollTop = view.columns.get(day) ?? 0;
    };
    const preview = (event, index) => {
      if (!ready.value || (!resize.mouse && event.type !== "focus")) return;
      activeName = event.currentTarget;
      keyboardPreview = event.type === "focus";
      const rect = activeName.getBoundingClientRect();
      pointer = {x: event.clientX ?? rect.left + rect.width / 2, y: event.clientY ?? rect.top + rect.height / 2};
      folio.rail.point(pointer.x, pointer.y);
      folio.rail.pick(index);
    };
    const visit = async (event, project) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (navigating || !ready.value) return;
      navigating = true;
      stopScroll();
      flying = await folio.text(event.currentTarget, {reveal: false});
      if (disposed) { folio.dropTexts(flying); return; }
      folio.selectTitle(flying, project.slug);
      // Use the authored navigation queue so a click immediately after All
      // waits for the current transition instead of being rejected by its guard.
      try { await navigate(taskProjectRoute(project)); }
      finally { navigating = false; }
    };
    const rememberColumn = event => {
      view.columns.set(event.currentTarget.dataset.day, event.currentTarget.scrollTop);
      clearPreview();
    };
    const rememberHorizontal = () => {
      view.x = horizontal.value?.scrollLeft ?? 0;
      clearPreview();
    };
    const stopScroll = () => { cancelAnimationFrame(scrollFrame); scrollFrame = 0; scrolling = null; };
    const moveScroll = (el, property, delta, smooth = true) => {
      if (!el) return;
      // Changing columns stops the previous column's inertia; no shared page scroll.
      if (scrolling?.el !== el || scrolling?.property !== property) stopScroll();
      const maximum = property === "scrollLeft" ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight;
      if (!scrolling) scrolling = {el, property, target: el[property], position: el[property]};
      if ((scrolling.target - scrolling.position) * delta < 0) scrolling.target = scrolling.position;
      scrolling.target = Math.max(0, Math.min(maximum, scrolling.target + delta));
      if (!smooth || reducedMotion()) { el[property] = scrolling.target; stopScroll(); return; }
      if (scrollFrame) return;
      let last = performance.now();
      const step = now => {
        const remaining = scrolling.target - scrolling.position;
        if (Math.abs(remaining) < .5) { el[property] = scrolling.target; stopScroll(); return; }
        // Keep the fractional position: DOM scroll offsets may be rounded by WebView2.
        scrolling.position += remaining * (1 - Math.exp(-Math.min(now - last, 50) / 190));
        el[property] = scrolling.position;
        last = now;
        scrollFrame = requestAnimationFrame(step);
      };
      scrollFrame = requestAnimationFrame(step);
    };
    const moveHorizontal = delta => moveScroll(horizontal.value, "scrollLeft", delta);
    const wheel = event => {
      event.stopPropagation();
      event.preventDefault();
      if (drag) return;
      const column = event.target.closest?.(".task-timeline__column");
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? horizontal.value.clientHeight : 1;
      if (ruler.value?.contains(event.target)) {
        moveHorizontal((Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * unit * .55);
      } else if (column?.dataset.expanded === "true") {
        moveScroll(column, "scrollTop", event.deltaY * unit * .55);
      } else stopScroll(); // Short/closed columns and dates never turn the wheel sideways.
    };
    const rulerMove = event => {
      rulerPointer.value = event.clientX - track.value.getBoundingClientRect().left;
      if (!drag || event.pointerId !== drag.id) return;
      stopScroll();
      horizontal.value.scrollLeft = drag.scroll + drag.x - event.clientX;
    };
    const rulerDown = event => {
      if (event.button !== 0 || !ready.value) return;
      event.preventDefault();
      clearPreview();
      stopScroll();
      drag = {id: event.pointerId, x: event.clientX, scroll: horizontal.value.scrollLeft};
      dragging.value = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    };
    const rulerUp = event => {
      if (!drag || event.pointerId !== drag.id) return;
      drag = null;
      dragging.value = false;
      if (ruler.value?.hasPointerCapture(event.pointerId)) ruler.value.releasePointerCapture(event.pointerId);
      rulerPointer.value = null;
    };
    const rulerKey = event => {
      const el = horizontal.value;
      const delta = {ArrowLeft: -el.clientWidth / 3, ArrowRight: el.clientWidth / 3, Home: -el.scrollWidth, End: el.scrollWidth}[event.key];
      if (delta === undefined) return;
      event.preventDefault();
      moveHorizontal(delta);
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
        if (disposed) return;
        folio.declare();
        await folio.booted;
        if (disposed) return;
        await Promise.all(projects.value.filter(project => project.preachermanTask).map(project => folio.texture(project.src)));
        if (disposed) return;
        folio.hideHome();
        folio.scan(root.value);
        folio.depart();
        folio.fadeLeaving();
        folio.rail.bind(panel.value, projects.value, previewBounds);
        window.addEventListener("pointermove", point, {passive: true});
        folio.staggerHud(.2, .03);
        folio.setScroll(0);
        ready.value = true;
        await nextTick();
        if (disposed) return;
        horizontal.value.scrollLeft = view.x;
        for (const column of root.value.querySelectorAll(".task-timeline__column")) column.scrollTop = view.columns.get(column.dataset.day) ?? 0;
        observer = new ResizeObserver(scheduleMeasure);
        observer.observe(track.value);
        document.fonts.ready.then(() => { if (!disposed) scheduleMeasure(); });
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
      stopScroll();
      folio.rail.bind(null);
      folio.dropTexts(flying);
    });
    const arrow = expanded => h("svg", {viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 1.25, "aria-hidden": "true", class: "task-timeline__arrow", style: {transform: expanded ? "rotate(180deg)" : ""}}, [h("path", {d: "m6 9 6 6 6-6"})]);
    return () => h("main", {
      ref: root, class: "task-timeline", "data-gl-shield": "", "aria-label": "Task timeline",
      "data-profile-open": !!nuxt.payload.state["$sprofile-open"],
    }, [
      h("div", {class: "task-timeline__viewport", ref: horizontal, onScroll: rememberHorizontal, onWheel: wheel, "data-lenis-prevent": ""},
        [h("div", {class: "task-timeline__track", ref: track, style: {"--date-count": Math.max(1, groups.value.length)}}, [
          h("div", {class: "task-timeline__ruler", ref: ruler, role: "group", tabindex: 0, "aria-label": "Timeline — drag or use arrow keys to scroll dates", "data-dragging": dragging.value,
            onPointerdown: rulerDown, onPointermove: rulerMove, onPointerup: rulerUp, onPointercancel: rulerUp, onLostpointercapture: rulerUp, onPointerleave: () => { if (!drag) rulerPointer.value = null; }, onKeydown: rulerKey,
          }, [
            ...ticks.value.map(tick => h("i", {key: tick.x, class: "task-timeline__tick", "aria-hidden": "true", style: {left: tick.x + "px", transform: "scaleY(" + tick.height / 22 + ")"}})),
            ...markers.value.map((x, index) => h("i", {key: "date-" + index, class: "task-timeline__tick task-timeline__tick--date", "aria-hidden": "true", style: {left: x + "px"}})),
          ]),
          h("div", {class: "task-timeline__axis"}, groups.value.map(group => h("button", {
            key: group.day, type: "button", class: "task-timeline__date",
            "aria-expanded": open.value.has(group.day), "aria-controls": "task-day-" + group.day,
            onClick: () => toggle(group.day),
          }, [h("span", {class: "task-timeline__date-label"}, group.label), arrow(open.value.has(group.day))]))),
          h("div", {class: "task-timeline__body"}, groups.value.map(group => h("section", {
            key: group.day, id: "task-day-" + group.day, class: "task-timeline__column", "aria-label": group.label + " tasks",
            "data-day": group.day, "data-expanded": open.value.has(group.day), tabindex: open.value.has(group.day) ? 0 : -1, onScroll: rememberColumn, "data-lenis-prevent": "",
          }, open.value.has(group.day) ? [h("ul", {class: "task-timeline__names"}, group.items.map(({project, index}, row) => h("li", {
            key: project.slug, style: {"--row-delay": Math.min(row * 32, 256) + "ms"},
          }, [h("a", {
            class: "task-timeline__name", href: taskProjectRoute(project), "data-project-index": index,
            onPointerenter: event => preview(event, index), onPointerleave: clearPreview, onFocus: event => preview(event, index), onBlur: clearPreview,
            onClick: event => visit(event, project),
          }, taskDisplayTitle(project))])))] : []))),
        ])]),
      !ready.value ? h("p", {class: "task-timeline__status", role: error.value ? "alert" : "status"}, error.value || "Loading tasks…") : !groups.value.length ? h("p", {class: "task-timeline__status"}, "No tasks yet.") : null,
      h("div", {class: "pointer-events-none absolute inset-0"}, [h("div", {ref: panel, class: "h-200 w-0 rounded-20"})]),
    ]);
  },
};
