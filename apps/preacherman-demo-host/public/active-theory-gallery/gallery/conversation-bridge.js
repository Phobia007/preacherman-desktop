import { findGalleryCharacter } from "./character-search.js";

// Retain the authored input and biography typography, but give input ownership
// to local character search before the legacy assistant listeners can run.
const origin = location.origin === "null" ? "*" : location.origin;
let disposed = false, cleanup = () => {}, timer;
const deadline = Date.now() + 30000;
function findChat() {
  const seen = new Set();
  function visit(component) {
    if (!component || seen.has(component)) return null;
    seen.add(component);
    if (component.constructor?.name === "ChatDOM" && component.flag?.("__ready")) return component;
    for (const child of Object.values(component.classes || {})) { const match = visit(child); if (match) return match; }
    return null;
  }
  return typeof Stage !== "undefined" && document.querySelector("canvas") && typeof Container !== "undefined" && Container.instance ? visit(Container.instance()) : null;
}
export function installCharacterSearch(chat, bridge) {
  const wrapper = chat.wrapper.div, input = chat.input.div, log = chat.messages.div;
  wrapper.dataset.preachermanChat = "true";
  wrapper.dataset.gallerySearch = "true";
  input.maxLength = 120;
  input.setAttribute("aria-label", "Search characters");
  input.setAttribute("role", "searchbox");
  input.setAttribute("autocomplete", "off");
  input.setAttribute("spellcheck", "false");
  log.setAttribute("role", "log");
  log.setAttribute("aria-label", "Character information");
  let cards = [], searchTimer, composing = false, catalogReady = false;
  const search = () => {
    clearTimeout(searchTimer);
    if (composing) return;
    const query = input.value.trim();
    delete wrapper.dataset.searchMatch;
    if (!query) return;
    // Search all characters even when a category currently shows only a subset.
    const catalog = window.CMS_DATA?.projects?.map(project => ({ id: project.perma, title: project.title })) || cards;
    const match = findGalleryCharacter(catalog, query);
    wrapper.dataset.searchState = match ? "matched" : cards.length ? "empty" : "loading";
    if (match) {
      if (!cards.some(card => card.id === match.id)) { chat.active = null; chat.fire("clickFilter"); }
      wrapper.dataset.searchMatch = match.id; bridge.focusProject(match.id);
    }
  };
  const schedule = event => {
    clearTimeout(searchTimer);
    if (!composing && !event.isComposing) searchTimer = setTimeout(search, 180);
  };
  const onKey = event => {
    if (event.target !== input) return;
    event.stopImmediatePropagation();
    if (event.key === "Enter" && !event.isComposing && !composing && event.keyCode !== 229) { event.preventDefault(); if (!event.repeat) search(); }
    if (event.key === "Escape") { event.preventDefault(); input.value = ""; input.classList.remove("extended"); search(); }
  };
  const onFocus = event => {
    if (event.target !== input) return;
    event.stopImmediatePropagation(); chat.set("isFocused", true);
  };
  const compositionStart = () => { composing = true; clearTimeout(searchTimer); };
  const compositionEnd = () => { composing = false; search(); };
  const receive = event => {
    if (event.source !== parent || (location.origin !== "null" && event.origin !== location.origin)) return;
    const data = event.data;
    if (data?.type !== "gallery-conversation-theme") return;
    for (const key of ["canvas", "text", "muted", "border", "surface", "hover", "focus", "loading", "error"]) {
      if (typeof data.theme?.[key] === "string") document.documentElement.style.setProperty("--demo-theme-settings-" + key, data.theme[key]);
    }
    document.documentElement.dataset.appearance = data.appearance;
  };
  const unsubscribe = bridge.subscribeRail(value => {
    cards = value;
    if (!catalogReady && cards.length) { catalogReady = true; if (input.value.trim()) search(); }
  });
  const categoryClick = event => {
    if (event.target?.closest?.("a.home")) clearTimeout(searchTimer);
  };
  wrapper.addEventListener("click", categoryClick, true);
  input.addEventListener("input", schedule);
  input.addEventListener("compositionstart", compositionStart);
  input.addEventListener("compositionend", compositionEnd);
  wrapper.addEventListener("keydown", onKey, true);
  wrapper.addEventListener("focus", onFocus, true);
  window.addEventListener("message", receive);
  parent.postMessage({ type: "gallery-theme-request" }, origin);
  return () => {
    clearTimeout(searchTimer); unsubscribe();
    wrapper.removeEventListener("click", categoryClick, true);
    input.removeEventListener("input", schedule);
    input.removeEventListener("compositionstart", compositionStart);
    input.removeEventListener("compositionend", compositionEnd);
    wrapper.removeEventListener("keydown", onKey, true);
    wrapper.removeEventListener("focus", onFocus, true);
    window.removeEventListener("message", receive);
  };
}
function start() {
  if (disposed) return;
  const chat = findChat(), bridge = window.PreachermanGalleryDetail;
  if (chat?.messages?.div && chat.wrapper?.div && bridge) cleanup = installCharacterSearch(chat, bridge);
  else if (Date.now() < deadline) timer = setTimeout(start, 100);
}
window.addEventListener("pagehide", () => { disposed = true; clearTimeout(timer); cleanup(); }, { once: true });
start();
