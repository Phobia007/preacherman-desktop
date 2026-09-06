import { boundedChatContext } from "/gallery-v3/portfolio/task-chat-context.js";

// Retain the authored ChatDOM, typography and filters, but replace its proprietary AI transport.
const historyKey = "preacherman.gallery.conversation.v1";
const modelKey = "preacherman.gallery.model";
const origin = location.origin === "null" ? "*" : location.origin;
let disposed = false;
let cleanup = () => {};
let timer;
const deadline = Date.now() + 30000;
function findChat() {
  const seen = new Set();
  function visit(component) {
    if (!component || seen.has(component)) return null;
    seen.add(component);
    if (component.constructor?.name === "ChatDOM" && component.input?.div) return component;
    for (const child of Object.values(component.classes || {})) {
      const match = visit(child);
      if (match) return match;
    }
    return null;
  }
  return typeof Stage !== "undefined" && document.querySelector("canvas") && typeof Container !== "undefined" && Container.instance ? visit(Container.instance()) : null;
}

function install(chat) {
  const wrapper = chat.wrapper.div, input = chat.input.div, log = chat.messages.div;
  wrapper.dataset.preachermanChat = "true";
  input.maxLength = 20000;
  input.setAttribute("aria-label", "Gallery message");
  log.setAttribute("role", "log");
  log.setAttribute("aria-label", "Gallery conversation");
  log.setAttribute("aria-live", "polite");
  const controls = document.createElement("div");
  controls.className = "preacherman-chat-controls";
  const picker = document.createElement("select");
  picker.setAttribute("aria-label", "Gallery model");
  const button = (text, action) => {
    const node = document.createElement("button");
    node.type = "button"; node.textContent = text; node.addEventListener("click", action);
    return node;
  };
  const refresh = button("↻", () => requestCatalog());
  refresh.setAttribute("aria-label", "Refresh connected models");
  const sendButton = button("Send", () => void send());
  const status = document.createElement("p");
  status.className = "preacherman-chat-status";
  status.setAttribute("role", "status");
  controls.append(picker, refresh, sendButton);
  wrapper.append(controls, status);
  let messages = [], providers = [], selected = "", pinned = false, busy = false, readFailed = false;
  const pending = new Map();
  const rendered = new Map();
  const setStatus = (text, error = false) => {
    status.textContent = text; status.dataset.error = String(error);
  };
  const selectedProvider = () => providers.find(provider => provider.models.some(model => provider.id + "::" + model.id === selected));
  const updateControls = () => {
    input.disabled = busy || readFailed;
    picker.disabled = busy || readFailed;
    sendButton.disabled = busy || readFailed || !selectedProvider() || !input.value.trim();
    sendButton.textContent = busy ? "Sending…" : "Send";
    wrapper.setAttribute("aria-busy", String(busy));
    for (const node of log.querySelectorAll("[data-task-action]")) node.disabled = busy || readFailed;
  };
  const persist = () => localStorage.setItem(historyKey, JSON.stringify(messages));
  const callHost = payload => new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timeout = setTimeout(() => {
      pending.delete(requestId); reject(new Error("Request timed out. Check the connection before retrying."));
    }, 75000);
    pending.set(requestId, { resolve, reject, timeout });
    parent.postMessage({ type: "gallery-execution-request", requestId, ...payload }, origin);
  });
  function requestCatalog() {
    parent.postMessage({ type: "gallery-provider-request" }, origin);
  }
  function drawTask(entry, node) {
    node.replaceChildren(document.createTextNode(entry.text));
    if (!entry.task) return;
    const task = entry.task;
    const details = document.createElement("span");
    details.className = "preacherman-chat-task";
    const snapshot = task.executionSnapshot || {};
    const summary = document.createElement("span");
    summary.textContent = [task.status, snapshot.agentId, snapshot.workspaceId, "workspace-write"].filter(Boolean).join(" · ");
    details.append(summary);
    const action = (label, kind) => {
      const control = button(label, () => void taskAction(entry, kind));
      control.dataset.taskAction = kind; control.disabled = busy || readFailed; details.append(control);
    };
    if (task.pendingApproval) { action("Approve execution", "approve"); action("Reject", "reject"); }
    action("Refresh status", "status");
    if (["running", "queued", "submitting"].includes(task.status)) action("Cancel task", "cancel");
    node.append(details);
  }
  async function renderEntry(entry) {
    const node = await chat.addMessage(entry.text, entry.role === "user" ? "var(--demo-theme-settings-loading)" : "var(--demo-theme-settings-text)", false);
    if (disposed) return;
    node.dataset.preachermanMessage = entry.role;
    rendered.set(entry, node);
    drawTask(entry, node);
    log.scrollTop = 0;
  }
  async function taskAction(entry, action) {
    if (busy || readFailed) return;
    busy = true; updateControls(); setStatus("Updating local task…");
    try {
      const result = await callHost({ action, taskId: entry.task.taskId, approvalId: entry.task.pendingApproval?.approvalId });
      if (disposed) return;
      if (!result?.task) throw new Error("The service returned an invalid task.");
      entry.task = result.task;
      entry.text = result.task.localAgentSummary || result.task.error?.message || "Local task · " + result.task.status;
      drawTask(entry, rendered.get(entry));
      try { persist(); setStatus("Task updated."); }
      catch { setStatus("Task updated, but could not save locally. Copy the result to keep it.", true); }
    } catch (error) { if (!disposed) setStatus(error.message, true); }
    finally { busy = false; if (!disposed) updateControls(); }
  }
  async function send() {
    if (busy || readFailed || !input.value.trim()) return;
    const provider = selectedProvider();
    if (!provider) { setStatus("Choose a connected model in Execution Mode.", true); return; }
    const text = input.value.trim();
    if (provider.kind === "cli" && text.length > 2000) { setStatus("Local task descriptions are limited to 2,000 characters.", true); return; }
    const entry = { role: "user", text };
    messages.push(entry);
    try { persist(); localStorage.setItem(modelKey, selected); }
    catch { messages.pop(); setStatus("Could not save this message. Your draft is still here.", true); return; }
    pinned = true; input.value = ""; busy = true; updateControls();
    setStatus(provider.kind === "cli" ? "Preparing a local task for approval…" : "Waiting for your model…");
    try {
      await renderEntry(entry);
      const context = boundedChatContext(messages);
      const result = await callHost({ action: "chat", selection: { providerId: provider.id, modelId: selected.slice(provider.id.length + 2) }, messages: context.messages });
      if (disposed) return;
      if (!result?.task && typeof result?.text !== "string") throw new Error("The model returned an invalid reply.");
      const reply = { role: "assistant", text: result.task ? "Local task ready. Review the workspace before approving execution." : result.text, ...(result.task ? { task: result.task } : {}) };
      messages.push(reply); await renderEntry(reply);
      try { persist(); setStatus(result.task ? "Execution requires your approval." : context.trimmed ? "Reply received. Only the recent conversation was sent; full history stays here." : "Connected through Execution Mode."); }
      catch { setStatus("Reply received, but local saving failed. Copy the reply to keep it.", true); }
    } catch (error) {
      if (!disposed) setStatus(error.message + " Your message is kept; it will not be resent automatically.", true);
    } finally { busy = false; if (!disposed) { updateControls(); input.focus(); } }
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
      if (operation) {
        clearTimeout(operation.timeout); pending.delete(data.requestId);
        data.error ? operation.reject(new Error(data.error)) : operation.resolve(data.result);
      }
    }
    if (data?.type !== "gallery-provider-catalog") return;
    providers = !data.error && Array.isArray(data.providers) ? data.providers.filter(provider =>
      typeof provider?.id === "string" && typeof provider.label === "string" && Array.isArray(provider.models)
      && provider.models.every(model => typeof model?.id === "string" && typeof model.label === "string")) : [];
    const active = data.active;
    if (!pinned) selected = active ? (active.mode === "cli" ? active.agentId : active.connectionId) + "::" + active.model : "";
    picker.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = data.error ? "Connection unavailable" : selected && !selectedProvider() ? "Selected model unavailable" : providers.length ? "Choose a model" : "Connect in Execution Mode";
    picker.append(placeholder);
    for (const provider of providers) for (const model of provider.models) {
      const option = document.createElement("option");
      option.value = provider.id + "::" + model.id;
      option.textContent = model.label.startsWith(provider.label) ? model.label : provider.label + " · " + model.label;
      picker.append(option);
    }
    picker.value = selectedProvider() ? selected : "";
    if (!busy && !readFailed) setStatus(data.error ? "Could not load connections. Use ↻ to retry." : selectedProvider() ? "Execution Mode · Local tasks require approval." : "Connect an API or local Agent in Settings.", Boolean(data.error));
    updateControls();
  };
  const onKey = event => {
    if (event.target !== input) return;
    // Stop the original assistant.once handler (including its 400-character truncation).
    event.stopImmediatePropagation();
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229 && !event.repeat) {
      event.preventDefault(); void send();
    }
  };
  const onFocus = event => {
    if (event.target !== input) return;
    // The copied site's recording/privacy notice does not describe this local client.
    event.stopImmediatePropagation(); chat.set("isFocused", true);
  };
  const onChange = () => {
    try { localStorage.setItem(modelKey, picker.value); selected = picker.value; pinned = true; setStatus("Model selected for this conversation."); }
    catch { picker.value = selected; setStatus("Could not save the model selection.", true); }
    updateControls();
  };
  wrapper.addEventListener("keydown", onKey, true);
  wrapper.addEventListener("focus", onFocus, true);
  input.addEventListener("input", updateControls);
  picker.addEventListener("change", onChange);
  window.addEventListener("message", receive);
  try {
    const saved = JSON.parse(localStorage.getItem(historyKey) || "[]");
    if (!Array.isArray(saved) || saved.some(entry => !["user", "assistant"].includes(entry?.role) || typeof entry.text !== "string")) throw new Error("Invalid history");
    messages = saved; selected = localStorage.getItem(modelKey) || ""; pinned = Boolean(selected);
    for (const entry of messages) void renderEntry(entry);
  } catch { readFailed = true; setStatus("Local history could not be read. Sending is paused to protect your records.", true); }
  updateControls(); requestCatalog();
  cleanup = () => {
    wrapper.removeEventListener("keydown", onKey, true); wrapper.removeEventListener("focus", onFocus, true);
    input.removeEventListener("input", updateControls); picker.removeEventListener("change", onChange);
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
