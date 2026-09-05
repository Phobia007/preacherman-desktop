// Task detail, first template only. Keep the authored sheet, columns and close motion.
// Editable DOM text must not enter the portfolio's WebGL text rasterizer.
import { ad as ref, a8 as element, a6 as onUnmounted } from "./_nuxt/D9b8F35K.js";

export const isTaskTemplate = (project) => project?.slug === "nathan-riley";
export const titleStorageKey = (slug) => `preacherman.task.${slug}.title`;
export const normalizeTitle = (value) => String(value).replace(/\s+/g, " ").trim().slice(0, 120);

const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = new URL("./task-metadata.css", import.meta.url).href;
document.head.append(stylesheet);

function syncTheme() {
  const source = parent.document.querySelector(".demo-app-shell") ?? parent.document.documentElement;
  const styles = getComputedStyle(source);
  for (const name of ["--demo-theme-gallery-detail-action-rest-text", "--demo-theme-gallery-detail-action-rest-bg", "--demo-theme-gallery-detail-action-focus"]) {
    document.documentElement.style.setProperty(name, styles.getPropertyValue(name));
  }
}
syncTheme();
addEventListener("message", (event) => {
  if (event.source === parent && event.origin === location.origin && event.data?.type === "gallery-theme") syncTheme();
});

export const TaskMetadata = {
  props: { slug: { type: String, required: true } },
  setup(props) {
    const fallback = "未命名任务";
    let saved = fallback;
    try { saved = normalizeTitle(localStorage.getItem(titleStorageKey(props.slug)) ?? "") || fallback; } catch {}
    const title = ref(saved);
    const error = ref("");
    const commit = () => {
      title.value = normalizeTitle(title.value) || saved;
      try {
        localStorage.setItem(titleStorageKey(props.slug), title.value);
        saved = title.value;
        error.value = "";
      } catch { error.value = "名称未能保存，请重新编辑后重试。"; }
    };
    onUnmounted(commit);
    return () => element("div", { class: "task-metadata", "data-task-id": props.slug }, [
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
      error.value ? element("p", { class: "task-metadata__error", role: "alert" }, error.value) : null,
    ]);
  },
};

// Text selection must not trigger the original sheet's global swipe navigation.
document.addEventListener("pointerdown", (event) => {
  if (event.target.closest?.(".task-metadata")) event.stopPropagation();
});
