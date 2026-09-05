// Extend the existing rail: mirrored circle, single-card selection, protected confirmation.
// The authored cards and their material stay untouched; only a small selection marker is added.
import { ad as ref, a8 as element, a3 as onMounted, a4 as nextTick, a6 as onUnmounted } from "./_nuxt/D9b8F35K.js";

const icon = (check = false) => element("svg", {viewBox:"0 0 24 24", fill:"none", stroke:"currentColor", "stroke-width":1.5, "stroke-linecap":"round", "stroke-linejoin":"round", "aria-hidden":"true"}, [
  element("path", {d:check ? "m5 12 4 4 10-10" : "m6 6 12 12M6 18 18 6"}),
]);

export const TaskDeleteControl = {
  props: {folio: {type:Object, required:true}},
  setup(props) {
    const overlay = ref(null), button = ref(null), dialog = ref(null), marker = ref(null);
    const mounted = ref(false);
    const selecting = ref(false), selected = ref(null), busy = ref(false), error = ref(""), notice = ref("");
    const originalAttributes = new Map();
    let frame = 0, disposed = false, pointerStart = null, createOverlay = null;
    const clearSelection = () => {
      selecting.value = false;
      selected.value = null;
      cancelAnimationFrame(frame);
      for (const [card, attrs] of originalAttributes) {
        for (const [key, value] of Object.entries(attrs)) value === null ? card.removeAttribute(key) : card.setAttribute(key, value);
      }
      originalAttributes.clear();
    };
    const cancelDialog = () => {
      if (busy.value) return;
      dialog.value?.close();
      error.value = "";
      button.value?.focus({preventScroll:true});
    };
    const reset = () => {
      if (busy.value) return;
      cancelDialog();
      clearSelection();
    };
    const positionMarker = () => {
      if (!selecting.value || disposed) return;
      const card = selected.value?.el;
      if (card && marker.value) {
        const rect = card._vrect ?? card.getBoundingClientRect();
        marker.value.style.transform = `translate3d(${rect.left + rect.width / 2}px,${rect.top + 24}px,0)`;
      }
      frame = requestAnimationFrame(positionMarker);
    };
    const start = () => {
      notice.value = "";
      if (selected.value) {
        error.value = "";
        dialog.value.showModal();
        dialog.value.querySelector('[data-cancel]').focus();
        return;
      }
      if (selecting.value) { clearSelection(); return; }
      if (!props.folio.cards.length) { notice.value = "暂无可删除卡片"; return; }
      selecting.value = true;
      for (const card of props.folio.cards) {
        const el = card.el;
        originalAttributes.set(el, Object.fromEntries(["tabindex", "role", "aria-label", "aria-pressed", "data-task-delete-selectable"].map(key => [key, el.getAttribute(key)])));
        el.setAttribute("data-task-delete-selectable", "");
        el.setAttribute("tabindex", "0"); el.setAttribute("role", "button");
        el.setAttribute("aria-label", "选择删除：" + el.querySelector("[data-title]").textContent);
        el.setAttribute("aria-pressed", "false");
      }
      frame = requestAnimationFrame(positionMarker);
    };
    const choose = (card) => {
      for (const el of originalAttributes.keys()) el.setAttribute("aria-pressed", String(el === card));
      selected.value = {id:card.dataset.id, title:card.querySelector("[data-title]").textContent, el:card};
    };
    const guard = (event) => {
      if (!selecting.value) return;
      if (event.type === "keydown" && event.key === "Escape") {
        event.preventDefault(); event.stopImmediatePropagation();
        dialog.value.open ? cancelDialog() : reset();
        return;
      }
      if (dialog.value?.open) {
        // Native modal owns focus; no keys or pointer gestures may reach the rail.
        if (event.type === "keydown") event.stopPropagation();
        return;
      }
      if (event.target.closest?.('.task-create > .task-create__button, [data-od-id="profile-toggle"]')) { reset(); return; }
      const card = event.target.closest?.('[data-gl="card"]');
      if (!card || !originalAttributes.has(card)) return;
      if (event.type === "pointerdown") { pointerStart = {x:event.clientX,y:event.clientY}; return; }
      if (event.type === "click" || (event.type === "keydown" && ["Enter"," "].includes(event.key))) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (event.type === "click" && pointerStart && Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>8) return;
        choose(card);
      }
    };
    const confirm = async () => {
      if (busy.value || !selected.value) return;
      busy.value = true; error.value = "";
      try {
        await props.folio.removeTaskCard(selected.value.id);
        if (disposed) return;
        dialog.value.close();
        clearSelection();
        notice.value = "卡片已删除";
        button.value.focus({preventScroll:true});
      } catch {
        if (!disposed) error.value = "未能完成删除，请重试或取消。";
      } finally { busy.value = false; }
    };
    const leave = event => { if (event.newState === "closed") { reset(); overlay.value?.hidePopover(); } };
    onMounted(async () => {
      mounted.value = true;
      await nextTick();
      if (disposed) return;
      overlay.value.showPopover();
      for (const type of ["click","pointerdown","keydown"]) window.addEventListener(type, guard, true);
      createOverlay = document.querySelector(".task-create");
      createOverlay?.addEventListener("toggle", leave);
    });
    onUnmounted(() => {
      disposed = true;
      clearSelection(); dialog.value?.close(); overlay.value?.hidePopover();
      for (const type of ["click","pointerdown","keydown"]) window.removeEventListener(type, guard, true);
      createOverlay?.removeEventListener("toggle", leave);
    });
    const shield = event => event.stopPropagation();
    return () => mounted.value ? element("div", {ref:overlay, class:"task-delete", popover:"manual", onPointerdown:shield, onWheel:shield, onTouchstart:shield}, [
      element("button", {ref:button, type:"button", class:"task-create__button task-delete__button", "aria-label":selected.value ? "确定删除所选卡片" : selecting.value ? "退出删除选择" : "删除卡片", "aria-pressed":selecting.value, onClick:start}, selected.value ? "确定" : [icon()]),
      element("div", {class:"task-delete__status", role:"status"}, selecting.value ? [
        element("p", {}, selected.value ? `已选择：${selected.value.title}` : "请选择要删除的卡片"),
        element("button", {type:"button", class:"task-delete__cancel-selection", onClick:reset}, "取消选择"),
      ] : notice.value),
      selecting.value && selected.value ? element("div", {ref:marker, class:"task-delete__marker", "aria-hidden":"true"}, [icon(true), element("span", {}, "已选中")]) : null,
      element("dialog", {ref:dialog, class:"task-delete-dialog", "aria-labelledby":"task-delete-title", "aria-describedby":"task-delete-description", onCancel:event=>{event.preventDefault();cancelDialog();}, onClick:event=>{if(event.target===dialog.value)cancelDialog();}}, [
        element("div", {class:"task-delete-dialog__content", "aria-busy":busy.value}, [
          element("h2", {id:"task-delete-title"}, "确定删除？"),
          element("p", {class:"task-delete-dialog__name"}, selected.value?.title ?? ""),
          element("p", {id:"task-delete-description"}, "此卡片将从列表移除，不影响其他任务和原始图片。"),
          error.value ? element("p", {class:"task-delete-dialog__error", role:"alert"}, error.value) : null,
          element("div", {class:"task-delete-dialog__actions"}, [
            element("button", {type:"button", "data-cancel":"", disabled:busy.value, onClick:cancelDialog}, "取消"),
            element("button", {type:"button", disabled:busy.value, onClick:confirm}, busy.value ? "删除中…" : "确定"),
          ]),
        ]),
      ]),
    ]) : null;
  },
};
