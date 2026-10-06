import {an as h, mountTaskFragment} from "./_nuxt/D9b8F35K.js";
import {TaskMetadata} from "./task-metadata.js";
import {TaskConversation} from "./task-conversation.js";
import TaskTimeline from "./task-timeline.js";
import {stageTaskSheet} from "./task-sheet-overlay.js";

export function openTaskLinkPicker({folio, appContext, task, anchor, candidates, linked, onSelect, onClose}) {
  const node = (tag, className) => Object.assign(document.createElement(tag), {className});
  const overlay = node("section", "task-link-picker");
  overlay.setAttribute("popover", "manual");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "选择关联任务");
  const cancel = node("button", "task-link-picker__cancel");
  cancel.type = "button";
  cancel.setAttribute("aria-label", "返回任务");
  cancel.title = "返回任务";
  cancel.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7"/></svg>';
  const timeline = node("div", "task-link-picker__timeline");
  const strip = node("div", "task-link-picker__strip");
  strip.setAttribute("aria-label", "已打开的任务卡片，可滚动或拖动");
  strip.tabIndex = 0;
  const error = node("p", "task-link-picker__error");
  error.setAttribute("role", "alert");
  const sheet = document.querySelector('[data-gl="sheet"]');
  const sheetRect = sheet.getBoundingClientRect();
  const originalClass = sheet.className;
  const copyClass = sheet.children[0].className;
  const chatClass = sheet.children[1].className;
  const unmount = [];
  let current, closing = false, disposed = false, drag = null, moved = false;
  const disabled = id => id === task || linked.includes(id);
  const select = id => {
    if (closing || disabled(id)) return;
    try { onSelect(id); void close(); }
    catch { error.textContent = "关联未能保存，请重试。"; }
  };
  for (const item of candidates) {
    const card = node("button", "task-link-picker__card");
    card.type = "button";
    card.dataset.taskId = item.id;
    card.setAttribute("aria-disabled", String(disabled(item.id)));
    card.setAttribute("aria-label", item.title + (item.id === task ? " · 当前任务" : linked.includes(item.id) ? " · 已关联" : ""));
    card.style.aspectRatio = `${sheetRect.width} / ${sheetRect.height}`;
    card.style.setProperty("--sheet-width", sheetRect.width + "px");
    card.style.setProperty("--sheet-height", sheetRect.height + "px");
    strip.append(card);
    if (item.id === task) { current = card; card.dataset.current = "true"; }
    else {
      const host = node("div", "task-link-picker__preview");
      host.inert = true;
      host.setAttribute("aria-hidden", "true");
      card.append(host);
      // Use the real full-size components and the original sheet columns; only
      // their container is scaled. No shortened text or alternate card layout.
      const Preview = {setup:() => () => h("div", {class:originalClass + " task-link-picker__sheet"}, [
        h("div", {class:copyClass}, [h(TaskMetadata, {slug:item.id, title:item.title, preview:true})]),
        h("div", {class:chatClass}, [h(TaskConversation, {slug:item.id, preview:true})]),
        h("span", {class:"task-link-picker__close", "aria-hidden":"true"}, "×"),
      ])};
      unmount.push(mountTaskFragment(Preview, {}, host, appContext));
    }
    card.addEventListener("click", event => { if (moved && event.detail) {event.preventDefault(); return;} select(item.id); });
  }
  overlay.append(timeline, cancel, error, strip);
  document.body.append(overlay);
  overlay.showPopover();
  current?.scrollIntoView({block:"nearest", inline:"nearest"});
  document.documentElement.setAttribute("data-task-linking", "");
  const stage = stageTaskSheet(folio);
  const shrink = () => {
    if (closing) return;
    for (const card of strip.children) card.style.setProperty("--preview-scale", card.clientWidth / sheetRect.width);
    if (current) stage.shrink(current.getBoundingClientRect());
  };
  shrink();
  unmount.push(mountTaskFragment(TaskTimeline, {picker:{select, disabled}}, timeline, appContext));
  cancel.focus({preventScroll:true});
  function dispose() {
    if (disposed) return;
    disposed = true;
    void stage.restore(false);
    window.removeEventListener("keydown", keys, true);
    window.removeEventListener("resize", shrink);
    for (const release of unmount) release();
    document.documentElement.removeAttribute("data-task-linking");
    overlay.remove();
    if (anchor.isConnected) anchor.focus({preventScroll:true});
    onClose();
  }
  async function close() {
    if (closing) return;
    closing = true;
    overlay.dataset.closing = "true";
    await stage.restore();
    dispose();
  }
  function keys(event) {
    if (event.key === "Escape") { event.preventDefault(); void close(); }
    if (event.key === "Tab") {
      const stops = [...overlay.querySelectorAll('button:not(:disabled),a,[tabindex="0"]')].filter(el => !el.closest('[inert]'));
      const at = stops.indexOf(document.activeElement);
      event.preventDefault();
      stops[(at + (event.shiftKey ? -1 : 1) + stops.length) % stops.length]?.focus({preventScroll:true});
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") event.stopPropagation();
  }
  cancel.addEventListener("click", close);
  strip.addEventListener("wheel", event => {
    if (event.ctrlKey) return;
    event.preventDefault(); event.stopPropagation();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? strip.clientWidth : 1;
    strip.scrollBy({left:(Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * unit, behavior:"smooth"});
  }, {passive:false});
  strip.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    drag = {id:event.pointerId, x:event.clientX, scroll:strip.scrollLeft}; moved = false;
  });
  strip.addEventListener("pointermove", event => {
    if (!drag || drag.id !== event.pointerId) return;
    if (Math.abs(event.clientX - drag.x) > 5) {
      moved = true; strip.dataset.dragging = "true"; strip.setPointerCapture(event.pointerId);
    }
    if (moved) { event.preventDefault(); strip.scrollLeft = drag.scroll + drag.x - event.clientX; }
  });
  const release = event => {
    if (!drag || drag.id !== event.pointerId) return;
    drag = null; delete strip.dataset.dragging;
    if (strip.hasPointerCapture(event.pointerId)) strip.releasePointerCapture(event.pointerId);
  };
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) strip.addEventListener(type, release);
  strip.addEventListener("dragstart", event => event.preventDefault());
  strip.addEventListener("keydown", event => {
    if (["ArrowLeft","ArrowRight","Home","End"].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      const left = {ArrowLeft:-strip.clientWidth / 3, ArrowRight:strip.clientWidth / 3, Home:-strip.scrollWidth, End:strip.scrollWidth}[event.key];
      strip.scrollBy({left,behavior:"smooth"});
    }
  });
  for (const type of ["pointerdown", "wheel", "touchstart", "keydown"]) overlay.addEventListener(type, event => event.stopPropagation());
  window.addEventListener("keydown", keys, true);
  window.addEventListener("resize", shrink);
  strip.addEventListener("scroll", shrink, {passive:true});
  return {dispose};
}
