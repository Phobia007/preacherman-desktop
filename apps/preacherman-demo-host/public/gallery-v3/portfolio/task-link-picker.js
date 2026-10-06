import {stageTaskSheet} from "./task-sheet-overlay.js";

export function openTaskLinkPicker({folio, task, anchor, candidates, linked, onSelect, onClose}) {
  const node = (tag, className, text) => {
    const result = document.createElement(tag);
    result.className = className;
    if (text !== undefined) result.textContent = text;
    return result;
  };
  const overlay = node("section", "task-link-picker");
  overlay.setAttribute("popover", "manual");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "选择关联任务");
  const header = node("header", "task-link-picker__header");
  const cancel = node("button", "task-link-picker__cancel", "取消");
  cancel.type = "button";
  header.append(node("h2", "", "选择关联任务"), cancel);
  const names = node("div", "task-link-picker__names");
  const strip = node("div", "task-link-picker__strip");
  const error = node("p", "task-link-picker__error");
  error.setAttribute("role", "alert");
  let current;
  let closing = false;
  let disposed = false;
  for (const item of candidates) {
    const disabled = item.id === task || linked.includes(item.id);
    const suffix = item.id === task ? "当前任务" : linked.includes(item.id) ? "已关联" : "";
    const name = node("button", "task-link-picker__name", item.title);
    name.type = "button";
    name.disabled = disabled;
    if (suffix) name.append(node("small", "", suffix));
    const card = node("button", "task-link-picker__card");
    card.type = "button";
    card.dataset.taskId = item.id;
    card.disabled = disabled;
    card.setAttribute("aria-label", suffix ? `${item.title} · ${suffix}` : `关联 ${item.title}`);
    const copy = node("div", "task-link-picker__copy");
    copy.append(node("strong", "", item.title), node("p", "", item.summary || "暂无任务摘要。"));
    const chat = node("div", "task-link-picker__chat");
    try {
      const messages = JSON.parse(localStorage.getItem(`preacherman.task.${item.id}.messages`) ?? "[]");
      if (Array.isArray(messages)) for (const message of messages.slice(-3)) {
        const bubble = node("span", "task-link-picker__bubble", String(message.text ?? ""));
        bubble.dataset.role = message.role;
        chat.append(bubble);
      }
    } catch {}
    chat.append(node("span", "task-link-picker__composer"));
    card.append(copy, chat);
    if (item.id === task) { current = card; card.dataset.current = "true"; }
    const select = () => {
      if (closing || disabled) return;
      try { onSelect(item.id); void close(); }
      catch { error.textContent = "关联未能保存，请重试。"; }
    };
    name.addEventListener("click", select);
    card.addEventListener("click", select);
    names.append(name);
    strip.append(card);
  }
  if (!candidates.some(item => item.id !== task && !linked.includes(item.id))) names.append(node("p", "task-link-picker__empty", "暂无其他可关联的任务"));
  overlay.append(header, names, error, strip);
  document.body.append(overlay);
  overlay.showPopover();
  current?.scrollIntoView({block:"nearest", inline:"nearest"});
  document.documentElement.setAttribute("data-task-linking", "");
  const stage = stageTaskSheet(folio);
  const shrink = () => { if (!closing && current) stage.shrink(current.getBoundingClientRect()); };
  shrink();
  cancel.focus({preventScroll:true});
  function dispose() {
    if (disposed) return;
    disposed = true;
    void stage.restore(false);
    window.removeEventListener("keydown", keys, true);
    window.removeEventListener("resize", shrink);
    strip.removeEventListener("scroll", shrink);
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
      const stops = [...overlay.querySelectorAll("button:not(:disabled)")];
      const at = stops.indexOf(document.activeElement);
      event.preventDefault();
      stops[(at + (event.shiftKey ? -1 : 1) + stops.length) % stops.length]?.focus();
    }
    event.stopPropagation();
  }
  cancel.addEventListener("click", close);
  for (const type of ["pointerdown", "wheel", "touchstart"]) overlay.addEventListener(type, event => event.stopPropagation());
  window.addEventListener("keydown", keys, true);
  window.addEventListener("resize", shrink);
  strip.addEventListener("scroll", shrink, {passive:true});
  return {dispose};
}
