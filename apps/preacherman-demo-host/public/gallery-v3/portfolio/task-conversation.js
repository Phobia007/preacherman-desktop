// Local task conversation. Model selection is connected to the host provider
// catalog, while message sending remains local until execution is authorized.
import { ad as ref, a8 as element, a4 as nextTick, a3 as onMounted, a6 as onUnmounted } from "./_nuxt/D9b8F35K.js";
import { resolveTaskId } from "./task-metadata.js";

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
    return models.length ? [{id:provider.id, label:provider.label, models}] : [];
  });
}

function selectionKey(providerId, modelId) {
  return `${providerId}::${modelId}`;
}

export const TaskConversation = {
  props: {slug:{type:String, required:true}},
  setup(props) {
    const task = resolveTaskId(props.slug);
    const messages = ref([]);
    const draft = ref("");
    const files = ref([]);
    const error = ref("");
    const readFailed = ref(false);
    const list = ref(null);
    const input = ref(null);
    const picker = ref(null);
    const providers = ref([]);
    const providerState = ref("loading");
    const modelOpen = ref(false);
    const selected = ref("");
    try {
      messages.value = readMessages(task);
      selected.value = localStorage.getItem(modelStorageKey(task)) ?? "";
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
    const send = () => {
      if (readFailed.value || (!draft.value.trim() && !files.value.length)) return;
      const entry = {text:draft.value.trim(), files:[...files.value]};
      const updated = [...messages.value, entry];
      try { localStorage.setItem(conversationStorageKey(task), JSON.stringify(updated)); }
      catch { error.value = "消息未能保存，内容仍在输入框中，请重试。"; return; }
      messages.value = updated;
      draft.value = "";
      files.value = [];
      error.value = "";
      scrollToLatest();
      input.value?.focus();
    };
    const unavailable = (label, name, explanation, className = "") => element("button", {
      type:"button", class:"task-chat__tool " + className, disabled:true, title:explanation, "aria-label":label + "，" + explanation,
    }, [name ? icon(name) : null, label ? element("span", null, label) : null]);

    const requestProviders = () => {
      providerState.value = providers.value.length ? "ready" : "loading";
      const targetOrigin = location.origin === "null" ? "*" : location.origin;
      parent.postMessage({type:"gallery-provider-request"}, targetOrigin);
    };
    const receiveProviders = event => {
      if (event.source !== parent || (location.origin !== "null" && event.origin !== location.origin) || event.data?.type !== "gallery-provider-catalog") return;
      if (event.data.error) {
        providerState.value = "error";
        providers.value = [];
        modelOpen.value = false;
        return;
      }
      providers.value = validProviders(event.data.providers);
      providerState.value = "ready";
      if (selected.value && !providers.value.some(provider => provider.models.some(model => selectionKey(provider.id, model.id) === selected.value))) selected.value = "";
    };
    const closeOutside = event => {
      if (!event.target.closest?.(".task-chat__model-select")) modelOpen.value = false;
    };
    onMounted(() => {
      addEventListener("message", receiveProviders);
      document.addEventListener("pointerdown", closeOutside);
      requestProviders();
    });
    onUnmounted(() => {
      removeEventListener("message", receiveProviders);
      document.removeEventListener("pointerdown", closeOutside);
    });

    const chooseModel = (provider, model) => {
      const value = selectionKey(provider.id, model.id);
      try {
        localStorage.setItem(modelStorageKey(task), value);
        selected.value = value;
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
      return providers.value.length ? "选择模型" : "未连接模型";
    };
    const modelSelector = () => {
      const available = providers.value.length > 0;
      return element("div", {class:"task-chat__model-select", onKeydown:event => {
        if (event.key === "Escape") { event.preventDefault(); modelOpen.value = false; }
      }}, [
        element("button", {
          type:"button", class:"task-chat__tool task-chat__model", disabled:!available,
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
          key:index, class:"task-chat__message", "aria-label":"你的消息",
        }, [
          message.text ? element("p", null, message.text) : null,
          ...message.files.map((name, index) => element("span", {key:index, class:"task-chat__file"}, [icon("file"), name])),
        ]))),
      element("form", {class:"task-chat__composer", onSubmit:event => {event.preventDefault(); send();}}, [
        files.value.length ? element("div", {class:"task-chat__attachments"}, files.value.map((name, index) => element("button", {
          key:index, type:"button", class:"task-chat__attachment", title:"移除 " + name,
          "aria-label":"移除附件 " + name, onClick:() => { files.value = files.value.filter((_, candidate) => candidate !== index); },
        }, [icon("file"), element("span", null, name), icon("close")]))) : null,
        element("textarea", {
          ref:input, class:"task-chat__input", rows:2, maxlength:20000, placeholder:"发送消息…",
          "aria-label":"消息内容", value:draft.value,
          onInput:event => {draft.value = event.target.value; resize();},
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
          unavailable("帮我批准", "approval", "执行权限尚未接入"),
          element("span", {class:"task-chat__spacer"}),
          modelSelector(),
          unavailable("", "mic", "语音尚未接入", "task-chat__icon"),
          element("button", {type:"submit", class:"task-chat__send", "aria-label":"发送消息", title:"发送到本机消息记录", disabled:readFailed.value || (!draft.value.trim() && !files.value.length)}, [icon("up")]),
        ]),
      ]),
      element("p", {class:"task-chat__status", role:error.value ? "alert" : "status"}, error.value || (files.value.length || messages.value.some(message => message.files.length) ? "仅保存在本机 · 附件仅记录文件名，未读取或上传" : "仅保存在本机 · 尚未发送至模型")),
    ]);
  },
};

// Protect editing, selection and right-pane scrolling from global sheet handlers.
for (const type of ["pointerdown", "wheel", "touchstart"]) {
  document.addEventListener(type, event => {
    if (event.target.closest?.(".task-chat")) event.stopPropagation();
  });
}
