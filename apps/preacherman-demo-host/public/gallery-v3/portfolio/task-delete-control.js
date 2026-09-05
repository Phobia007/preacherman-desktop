// Extend the existing rail: mirrored circle, multi-card selection, protected confirmation.
// The authored cards and their material stay untouched; only a small selection marker is added.
import { ad as ref, a8 as element, a3 as onMounted, a4 as nextTick, a6 as onUnmounted } from "./_nuxt/D9b8F35K.js";

const icon = (check = false) => element("svg", {viewBox:"0 0 24 24", fill:"none", stroke:"currentColor", "stroke-width":1.5, "stroke-linecap":"round", "stroke-linejoin":"round", "aria-hidden":"true"}, [
  element("path", {d:check ? "m5 12 4 4 10-10" : "m6 6 12 12M6 18 18 6"}),
]);

export const TaskDeleteControl = {
  props: {folio: {type:Object, required:true}},
  setup(props) {
    const overlay = ref(null), button = ref(null), dialog = ref(null);
    const markers = new Map();
    const mounted = ref(false);
    const selecting = ref(false), selected = ref([]), busy = ref(false), error = ref(""), notice = ref("");
    const originalAttributes = new Map();
    let frame = 0, disposed = false, pointerStart = null, createOverlay = null;
    const clearSelection = () => {
      selecting.value = false;
      selected.value = [];
      markers.clear();
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
      for (const {id, el:card} of selected.value) {
        const marker = markers.get(id);
        if (!marker) continue;
        const rect = card._vrect ?? card.getBoundingClientRect();
        marker.style.transform = `translate3d(${rect.left + rect.width / 2}px,${rect.top + 24}px,0)`;
      }
      frame = requestAnimationFrame(positionMarker);
    };
    const start = () => {
      notice.value = "";
      if (selected.value.length) {
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
      const id = card.dataset.id;
      const wasSelected = selected.value.some(item => item.id === id);
      selected.value = wasSelected
        ? selected.value.filter(item => item.id !== id)
        : [...selected.value, {id, title:card.querySelector("[data-title]").textContent, el:card}];
      card.setAttribute("aria-pressed", String(!wasSelected));
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
      if (busy.value || !selected.value.length) return;
      busy.value = true; error.value = "";
      const count = selected.value.length;
      try {
        await props.folio.removeTaskCards(selected.value.map(card => card.id));
        if (disposed) return;
        dialog.value.close();
        clearSelection();
        notice.value = `已删除 ${count} 张卡片`;
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
      element("button", {ref:button, type:"button", class:"task-create__button task-delete__button", "aria-label":selected.value.length ? "确定删除所选卡片" : selecting.value ? "退出删除选择" : "删除卡片", "aria-pressed":selecting.value, onClick:start}, selected.value.length ? "确定" : [icon()]),
      element("div", {class:"task-delete__status", role:"status"}, selecting.value ? [
        element("p", {}, selected.value.length ? `已选择 ${selected.value.length} 张卡片，再次点击可取消选中` : "请选择要删除的卡片，可多选"),
        element("button", {type:"button", class:"task-delete__cancel-selection", onClick:reset}, "取消选择"),
      ] : notice.value),
      ...selected.value.map(card => element("div", {key:card.id, ref:el=>{el ? markers.set(card.id,el) : markers.delete(card.id);}, class:"task-delete__marker", "aria-hidden":"true"}, [icon(true), element("span", {}, "已选中")])),
      element("dialog", {ref:dialog, class:"task-delete-dialog", "aria-labelledby":"task-delete-title", "aria-describedby":"task-delete-description", onCancel:event=>{event.preventDefault();cancelDialog();}, onClick:event=>{if(event.target===dialog.value)cancelDialog();}}, [
        element("div", {class:"task-delete-dialog__content", "aria-busy":busy.value}, [
          element("h2", {id:"task-delete-title"}, `确定删除 ${selected.value.length} 张卡片？`),
          element("p", {class:"task-delete-dialog__name"}, selected.value.map(card => card.title).join("、")),
          element("p", {id:"task-delete-description"}, "所选卡片将从列表移除，不影响其他任务和原始图片。"),
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
