import { boundedChatContext } from "/gallery-v3/portfolio/task-chat-context.js";

// Keep the authored single-input ChatDOM. Settings owns the connection; no toolbar.
const historyKey = "preacherman.gallery.conversation.v1";
const origin = location.origin === "null" ? "*" : location.origin;
let disposed = false, cleanup = () => {}, timer;
const deadline = Date.now() + 30000;
function findChat() {
  const seen = new Set();
  function visit(component) {
    if (!component || seen.has(component)) return null;
    seen.add(component);
    if (component.constructor?.name === "ChatDOM" && component.input?.div) return component;
    for (const child of Object.values(component.classes || {})) { const match = visit(child); if (match) return match; }
    return null;
  }
  return typeof Stage !== "undefined" && document.querySelector("canvas") && typeof Container !== "undefined" && Container.instance ? visit(Container.instance()) : null;
}
function install(chat) {
  const wrapper = chat.wrapper.div, input = chat.input.div, log = chat.messages.div;
  const placeholder = input.placeholder;
  wrapper.dataset.preachermanChat = "true";
  input.maxLength = 20000;
  input.setAttribute("aria-label", "Gallery message");
  log.setAttribute("role", "log"); log.setAttribute("aria-label", "Gallery conversation"); log.setAttribute("aria-live", "polite");
  let messages = [], busy = false, readFailed = false, statusNode;
  const pending = new Map();
  const persist = () => localStorage.setItem(historyKey, JSON.stringify(messages));
  const update = () => {
    input.disabled = busy || readFailed;
    input.placeholder = busy ? "Thinking…" : placeholder;
    wrapper.setAttribute("aria-busy", String(busy));
  };
  async function render(entry) {
    const node = await chat.addMessage(entry.text, entry.role === "user" ? "var(--demo-theme-settings-loading)" : "var(--demo-theme-settings-text)", false);
    if (!disposed) { node.dataset.preachermanMessage = entry.role; log.scrollTop = 0; }
  }
  async function errorMessage(text) {
    statusNode?.remove();
    const node = await chat.addMessage(text, "var(--demo-theme-settings-error)", false);
    if (!disposed) { statusNode = node; node.dataset.preachermanMessage = "error"; node.setAttribute("role", "alert"); }
  }
  const callHost = payload => new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timeout = setTimeout(() => { pending.delete(requestId); reject(new Error("Request timed out. Check the connection and retry.")); }, 140000);
    pending.set(requestId, { resolve, reject, timeout });
    parent.postMessage({ type: "gallery-execution-request", requestId, ...payload }, origin);
  });
  async function send() {
    if (busy || readFailed || !input.value.trim()) return;
    const entry = { role: "user", text: input.value.trim() };
    busy = true; update(); statusNode?.remove();
    try {
      // Resolve active Settings at send time, never a stale hidden picker.
      const context = boundedChatContext([...messages, entry]);
      const result = await callHost({ action: "chat", useActive: true, messages: context.messages });
      if (disposed) return;
      if (typeof result?.text !== "string" || !result.text.trim()) throw new Error("The model returned no text.");
      const reply = { role: "assistant", text: result.text };
      messages.push(entry, reply); input.value = "";
      await render(entry); await render(reply);
      try { persist(); } catch { await errorMessage("Reply received, but local saving failed. Copy the reply to keep it."); }
    } catch (error) { if (!disposed) await errorMessage(error.message + " Your draft is kept; it will not be resent automatically."); }
    finally { busy = false; if (!disposed) { update(); input.focus(); } }
  }
  const receive = event => {
    if (event.source !== parent || (location.origin !== "null" && event.origin !== location.origin)) return;
    const data = event.data;
    if (data?.type === "gallery-conversation-theme") {
      for (const key of ["canvas", "text", "muted", "border", "surface", "hover", "focus", "loading", "error"]) {
        if (typeof data.theme?.[key] === "string") document.documentElement.style.setProperty("--demo-theme-settings-" + key, data.theme[key]);
      }
      document.documentElement.dataset.appearance = data.appearance;
    }
    if (data?.type === "gallery-execution-result") {
      const operation = pending.get(data.requestId);
      if (operation) { clearTimeout(operation.timeout); pending.delete(data.requestId); data.error ? operation.reject(new Error(data.error)) : operation.resolve(data.result); }
    }
  };
  const onKey = event => {
    if (event.target !== input) return;
    // Capture on the ancestor before the original assistant.once listener runs.
    event.stopImmediatePropagation();
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229 && !event.repeat) { event.preventDefault(); void send(); }
  };
  const onFocus = event => {
    if (event.target !== input) return;
    event.stopImmediatePropagation(); chat.set("isFocused", true);
  };
  wrapper.addEventListener("keydown", onKey, true); wrapper.addEventListener("focus", onFocus, true);
  window.addEventListener("message", receive);
  try {
    const saved = JSON.parse(localStorage.getItem(historyKey) || "[]");
    if (!Array.isArray(saved) || saved.some(entry => !["user", "assistant"].includes(entry?.role) || typeof entry.text !== "string")) throw new Error("Invalid history");
    messages = saved;
    for (const entry of messages) void render(entry);
  } catch { readFailed = true; void errorMessage("Local history could not be read. Sending is paused to protect your records."); }
  update(); parent.postMessage({ type: "gallery-provider-request" }, origin);
  cleanup = () => {
    wrapper.removeEventListener("keydown", onKey, true); wrapper.removeEventListener("focus", onFocus, true);
    window.removeEventListener("message", receive);
    for (const operation of pending.values()) { clearTimeout(operation.timeout); operation.reject(new Error("Conversation closed.")); }
    pending.clear();
  };
}
function start() {
  if (disposed) return;
  const chat = findChat();
  if (chat?.messages?.div && chat.wrapper?.div) install(chat);
  else if (Date.now() < deadline) timer = setTimeout(start, 100);
}
window.addEventListener("pagehide", () => { disposed = true; clearTimeout(timer); cleanup(); }, { once: true });
start();
