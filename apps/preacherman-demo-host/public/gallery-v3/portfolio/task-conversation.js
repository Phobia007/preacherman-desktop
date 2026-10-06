// Host-owned model requests; secrets never enter the authored Gallery frame.
import { ad as ref, a8 as element, a4 as nextTick, a3 as onMounted, a6 as onUnmounted } from "./_nuxt/D9b8F35K.js";
import { resolveTaskId } from "./task-metadata.js";
import { boundedChatContext } from "./task-chat-context.js";

export const conversationStorageKey = (slug) => `preacherman.task.${slug}.messages`;
export const modelStorageKey = (slug) => `preacherman.task.${slug}.model`;

export function readMessages(slug) {
  const raw = localStorage.getItem(conversationStorageKey(slug));
  if (!raw) return [];
  const value = JSON.parse(raw);
  if (!Array.isArray(value) || value.some(message => typeof message?.text !== "string" || !Array.isArray(message.files) || message.files.some(file => typeof file !== "string"))) {
    throw new Error("Invalid local conversation");
  }
  return value;
}

const paths = {
  plus: ["M12 5v14M5 12h14"],
  up: ["M12 19V5m-6 6 6-6 6 6"],
  mic: ["M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5Z", "M5 10v2a7 7 0 0 0 14 0v-2M12 19v3"],
  chevron: ["m7 10 5 5 5-5"],
  approval: ["M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z", "m8 12 3 3 5-6"],
  file: ["M14 2H6v20h12V6l-4-4ZM14 2v5h4"],
  close: ["m6 6 12 12M6 18 18 6"],
};

function icon(name) {
  return element("svg", {viewBox:"0 0 24 24", fill:"none", stroke:"currentColor", "stroke-width":1.5, "stroke-linecap":"round", "stroke-linejoin":"round", "aria-hidden":"true"},
    paths[name].map(path => element("path", {d:path})));
}

function validProviders(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap(provider => {
    if (!provider || typeof provider.id !== "string" || typeof provider.label !== "string" || !Array.isArray(provider.models)) return [];
    const models = provider.models.filter(model => model && typeof model.id === "string" && typeof model.label === "string");
    return models.length ? [{id:provider.id, label:provider.label, kind:provider.kind, models}] : [];
  });
}

function selectionKey(providerId, modelId) {
  return `${providerId}::${modelId}`;
}

let previewCatalog = {providers:[], active:null};
export const TaskConversation = {
  props: {slug:{type:String, required:true}, preview:{type:Boolean, default:false}},
  setup(props) {
    const task = props.preview ? props.slug : resolveTaskId(props.slug);
    const messages = ref([]);
    const draft = ref("");
    const files = ref([]);
    const error = ref("");
    const voiceNotice = ref(false);
    const readFailed = ref(false);
    const list = ref(null);
    const input = ref(null);
    const picker = ref(null);
    const providers = ref(props.preview ? previewCatalog.providers : []);
    const providerState = ref(props.preview ? "ready" : "loading");
    const modelOpen = ref(false);
    const selected = ref("");
    let selectionPinned = false;
    const busy = ref(false);
    const contextTrimmed = ref(false);
    const selectionAvailable = () => providers.value.some(provider => provider.models.some(model => selectionKey(provider.id, model.id) === selected.value));
    const pending = new Map();
    const callHost = payload => new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error("请求超时，请检查连接后重试。")); }, 140000);
      pending.set(requestId, { resolve, reject, timer });
      parent.postMessage({ type: "gallery-execution-request", requestId, ...payload }, location.origin === "null" ? "*" : location.origin);
    });
    const persist = updated => {
      localStorage.setItem(conversationStorageKey(task), JSON.stringify(updated));
      messages.value = updated;
    };
    try {
      messages.value = readMessages(task);
      selected.value = localStorage.getItem(modelStorageKey(task)) ?? "";
      selectionPinned = Boolean(selected.value);
    } catch {
      readFailed.value = true;
      error.value = "本机记录无法读取，暂不能发送，以免覆盖原记录。";
    }

    const resize = () => {
      if (!input.value) return;
      input.value.style.height = "auto";
      input.value.style.height = Math.min(input.value.scrollHeight, 200) + "px";
    };
    const scrollToLatest = () => nextTick(() => {
      if (list.value) list.value.scrollTop = list.value.scrollHeight;
      resize();
    });
    const send = async () => {
      if (busy.value || readFailed.value || !draft.value.trim()) return;
      if (!selected.value) { error.value = "请先在 Execution Mode 接入模型，并选择当前任务的模型。"; return; }
      if (!selectionAvailable()) { error.value = "已选模型当前不可用，请明确选择其他模型后再发送。"; return; }
      if (files.value.length) { error.value = "附件目前只记录文件名，尚不支持上传。请先移除附件再发送文本。"; return; }
      const [providerId, modelId] = selected.value.split("::");
      const text = draft.value.trim();
      const entry = {text, files:[], role:"user"};
      const updated = [...messages.value, entry];
      try { localStorage.setItem(modelStorageKey(task), selected.value); persist(updated); }
      catch { error.value = "消息未能保存，内容仍在输入框中，请重试。"; return; }
      selectionPinned = true;
      draft.value = "";
      files.value = [];
      error.value = "";
      busy.value = true;
      scrollToLatest();
      try {
        const context = boundedChatContext(updated);
        contextTrimmed.value = context.trimmed;
        const result = await callHost({ action: "chat", selection: {providerId, modelId}, messages: context.messages });
        if (typeof result?.text !== "string" || !result.text.trim()) throw new Error("模型未返回有效文本。");
        const reply = {role:"assistant", text:result.text, files:[]};
        try { persist([...messages.value, reply]); }
        catch { messages.value = [...messages.value, reply]; error.value = "回复已收到，但本机保存失败，请复制保留。"; }
      } catch (reason) { error.value = reason.message + " 消息已保留，不会自动重发。"; }
      finally { busy.value = false; scrollToLatest(); input.value?.focus(); }
    };
    const taskAction = async (index, action) => {
      if (busy.value) return;
      busy.value = true; error.value = "";
      const current = messages.value[index].task;
      try {
        const result = await callHost({ action, taskId:current.taskId, approvalId:current.pendingApproval?.approvalId });
        const updated = messages.value.map((message, at) => at === index ? {...message, task:result.task, text:result.task.localAgentSummary || result.task.error?.message || "本机任务 · " + result.task.status} : message);
        try { persist(updated); } catch { messages.value = updated; error.value = "任务状态已更新，但本机记录未能保存。"; }
      } catch (reason) { error.value = reason.message; }
      finally { busy.value = false; scrollToLatest(); }
    };

    const requestProviders = () => {
      if (props.preview) return;
      providerState.value = providers.value.length ? "ready" : "loading";
      const targetOrigin = location.origin === "null" ? "*" : location.origin;
      parent.postMessage({type:"gallery-provider-request"}, targetOrigin);
    };
    const receiveProviders = event => {
      if (event.source !== parent || (location.origin !== "null" && event.origin !== location.origin)) return;
      if (event.data?.type === "gallery-execution-result") {
        const operation = pending.get(event.data.requestId);
        if (operation) { clearTimeout(operation.timer); pending.delete(event.data.requestId); event.data.error ? operation.reject(new Error(event.data.error)) : operation.resolve(event.data.result); }
        return;
      }
      if (event.data?.type !== "gallery-provider-catalog") return;
      if (event.data.error) {
        providerState.value = "error";
        providers.value = [];
        modelOpen.value = false;
        return;
      }
      providers.value = validProviders(event.data.providers);
      previewCatalog = {providers:providers.value, active:event.data.active};
      providerState.value = "ready";
      const active = event.data.active;
      const defaultKey = active ? selectionKey(active.mode === "cli" ? active.agentId : active.connectionId, active.model) : "";
      if (!selectionPinned) selected.value = providers.value.some(provider => provider.models.some(model => selectionKey(provider.id, model.id) === defaultKey)) ? defaultKey : "";
    };
    const closeOutside = event => {
      if (!event.target.closest?.(".task-chat__model-select")) modelOpen.value = false;
    };
    onMounted(() => {
      if (props.preview) {
        const active = previewCatalog.active;
        if (!selected.value && active) selected.value = selectionKey(active.mode === "cli" ? active.agentId : active.connectionId, active.model);
        scrollToLatest(); return;
      }
      addEventListener("message", receiveProviders);
      document.addEventListener("pointerdown", closeOutside);
      requestProviders();
    });
    onUnmounted(() => {
      removeEventListener("message", receiveProviders);
      document.removeEventListener("pointerdown", closeOutside);
      for (const operation of pending.values()) { clearTimeout(operation.timer); operation.reject(new Error("对话已关闭。")); }
      pending.clear();
    });

    const chooseModel = (provider, model) => {
      const value = selectionKey(provider.id, model.id);
      try {
        localStorage.setItem(modelStorageKey(task), value);
        selected.value = value;
        selectionPinned = true;
        error.value = "";
        modelOpen.value = false;
      } catch {
        error.value = "模型选择未能保存，请重试。";
      }
    };
    const selectedLabel = () => {
      for (const provider of providers.value) {
        const model = provider.models.find(candidate => selectionKey(provider.id, candidate.id) === selected.value);
        if (model) return model.label;
      }
      if (providerState.value === "loading") return "正在识别模型";
      if (providerState.value === "error") return "模型服务不可用";
      if (selected.value) return "已选模型不可用 · 重新选择";
      return providers.value.length ? "选择模型" : "未连接模型";
    };
    const modelSelector = () => {
      const available = providers.value.length > 0;
      return element("div", {class:"task-chat__model-select", onKeydown:event => {
        if (event.key === "Escape") { event.preventDefault(); modelOpen.value = false; }
      }}, [
        element("button", {
          type:"button", class:"task-chat__tool task-chat__model", disabled:!available || busy.value,
          title:available ? "选择当前任务使用的模型" : selectedLabel(),
          "aria-haspopup":"listbox", "aria-expanded":modelOpen.value,
          onClick:() => { requestProviders(); modelOpen.value = !modelOpen.value; },
        }, [element("span", null, selectedLabel()), icon("chevron")]),
        modelOpen.value ? element("div", {class:"task-chat__model-menu", role:"listbox", "aria-label":"可用模型"}, providers.value.map(provider =>
          element("section", {key:provider.id, class:"task-chat__model-group", "aria-label":provider.label}, [
            element("h3", {class:"task-chat__model-provider"}, provider.label),
            ...provider.models.map(model => {
              const value = selectionKey(provider.id, model.id);
              return element("button", {key:value, type:"button", role:"option", class:"task-chat__model-option",
                "aria-selected":selected.value === value, onClick:() => chooseModel(provider, model)}, model.label);
            }),
          ]))) : null,
      ]);
    };

    return () => element("section", {class:"task-chat", "aria-label":"任务对话", "data-task-id":task,
      onWheel:event => {
        event.stopPropagation();
        if (!event.ctrlKey && !event.target.closest?.(".task-chat__messages") && list.value) {
          event.preventDefault();
          list.value.scrollTop += event.deltaY;
        }
      }}, [
      element("div", {ref:list, class:"task-chat__messages", role:"log", "aria-label":"本机消息记录", "aria-live":"polite", tabindex:0,
        onVnodeMounted:scrollToLatest}, messages.value.map((message, index) => element("article", {
          key:index, class:"task-chat__message", "data-role":message.role === "assistant" ? "assistant" : "user", "aria-label":message.role === "assistant" ? "模型回复" : "你的消息",
        }, [
          element("small", {class:"task-chat__author"}, message.role === "assistant" ? "Preacherman" : "You"),
          message.text ? element("p", null, message.text) : null,
          message.task ? element("div", {class:"task-chat__execution"}, [
            element("p", null, "状态：" + message.task.status),
            element("p", null, "执行器：" + (message.task.executionSnapshot?.agentId || "Codex CLI") + " · 工作区：" + (message.task.executionSnapshot?.workspaceId || "") + " · workspace-write"),
            ...(message.task.pendingApproval ? [
              element("button", {type:"button", disabled:busy.value, onClick:() => taskAction(index, "approve")}, "批准执行"),
              element("button", {type:"button", disabled:busy.value, onClick:() => taskAction(index, "reject")}, "拒绝"),
            ] : []),
            element("button", {type:"button", disabled:busy.value, onClick:() => taskAction(index, "status")}, "刷新状态"),
            ...(["running", "queued", "submitting"].includes(message.task.status) ? [element("button", {type:"button", disabled:busy.value, onClick:() => taskAction(index, "cancel")}, "取消任务")] : []),
          ]) : null,
          ...message.files.map((name, index) => element("span", {key:index, class:"task-chat__file"}, [icon("file"), name])),
        ]))),
      error.value || busy.value || contextTrimmed.value ? element("p", {class:"task-chat__status", role:error.value ? "alert" : "status"}, error.value || (busy.value ? "正在请求，请稍候…" : "本次仅发送限额内的近期上下文；完整记录仍保留在本机。")) : null,
      voiceNotice.value ? element("p", {id:`task-voice-status-${task}`, class:"task-chat__status", role:"status"}, "语音识别尚未配置，请先接入识别服务。") : null,
      element("form", {class:"task-chat__composer", onSubmit:event => {event.preventDefault(); send();}}, [
        files.value.length ? element("div", {class:"task-chat__attachments"}, files.value.map((name, index) => element("button", {
          key:index, type:"button", class:"task-chat__attachment", title:"移除 " + name,
          "aria-label":"移除附件 " + name, onClick:() => { files.value = files.value.filter((_, candidate) => candidate !== index); },
        }, [icon("file"), element("span", null, name), icon("close")]))) : null,
        element("textarea", {
          ref:input, class:"task-chat__input", rows:2, maxlength:20000, placeholder:"发送消息…",
          "aria-label":"消息内容", value:draft.value,
          onInput:event => {draft.value = event.target.value; voiceNotice.value = false; resize();},
          onKeydown:event => {
            event.stopPropagation();
            if (event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
              event.preventDefault(); send();
            }
          },
        }),
        element("div", {class:"task-chat__toolbar"}, [
          element("input", {ref:picker, type:"file", multiple:true, hidden:true, "aria-label":"选择附件（仅记录文件名）",
            onChange:event => {
              files.value = [...files.value, ...Array.from(event.target.files ?? [], file => file.name)];
              event.target.value = "";
            }}),
          element("button", {type:"button", class:"task-chat__tool task-chat__icon", title:"添加附件（此版本仅记录文件名，不读取或上传）", "aria-label":"添加附件", onClick:() => picker.value?.click()}, [icon("plus")]),
          element("span", {class:"task-chat__spacer"}),
          modelSelector(),
          element("button", {
            type:"button", class:"task-chat__tool task-chat__icon", title:"语音输入（待配置识别服务）", "aria-label":"语音输入",
            "aria-describedby":voiceNotice.value ? `task-voice-status-${task}` : undefined,
            onClick:() => { voiceNotice.value = true; },
          }, [icon("mic")]),
          element("button", {type:"submit", class:"task-chat__send", "aria-label":"发送消息", title:"发送到所选模型", disabled:busy.value || readFailed.value || !draft.value.trim()}, [icon("up")]),
        ]),
      ]),
    ]);
  },
};

// Protect editing, selection and right-pane scrolling from global sheet handlers.
for (const type of ["pointerdown", "wheel", "touchstart"]) {
  document.addEventListener(type, event => {
    if (event.target.closest?.(".task-chat")) event.stopPropagation();
  });
}
