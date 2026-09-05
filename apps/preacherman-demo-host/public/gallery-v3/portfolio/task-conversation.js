// Local extension of the Nathan Riley sheet, not an embedded Codex session.
// THESIS: keep task identity left; compose and read messages right.
// FORM: user-pinned centered divider and screenshot-matched bottom composer.
// FINISH: review both appearances, keyboard send, persistence and sheet isolation.
import { ad as ref, a8 as element, a4 as nextTick } from "./_nuxt/D9b8F35K.js";

export const conversationStorageKey = (slug) => `preacherman.task.${slug}.messages`;
export function readMessages(slug) {
  const raw = localStorage.getItem(conversationStorageKey(slug));
  if (!raw) return [];
  const value = JSON.parse(raw);
  if (!Array.isArray(value) || value.some(m => typeof m?.text !== "string" || !Array.isArray(m.files) || m.files.some(f => typeof f !== "string"))) {
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
    paths[name].map(d => element("path", {d})));
}

export const TaskConversation = {
  props: {slug:{type:String, required:true}},
  setup(props) {
    const messages = ref([]);
    const draft = ref("");
    const files = ref([]);
    const error = ref("");
    const readFailed = ref(false);
    const list = ref(null);
    const input = ref(null);
    const picker = ref(null);
    try { messages.value = readMessages(props.slug); }
    catch { readFailed.value = true; error.value = "本机记录无法读取，暂不能发送，以免覆盖原记录。"; }
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
      try { localStorage.setItem(conversationStorageKey(props.slug), JSON.stringify(updated)); }
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
    return () => element("section", {class:"task-chat", "aria-label":"任务对话", "data-task-id":props.slug}, [
      element("div", {ref:list, class:"task-chat__messages", role:"log", "aria-label":"本机消息记录", "aria-live":"polite", tabindex:0,
        onVnodeMounted:scrollToLatest}, messages.value.map((message, index) => element("article", {
          key:index, class:"task-chat__message", "aria-label":"你的消息",
        }, [
          message.text ? element("p", null, message.text) : null,
          ...message.files.map((name, i) => element("span", {key:i, class:"task-chat__file"}, [icon("file"), name])),
        ]))),
      element("form", {class:"task-chat__composer", onSubmit:event => {event.preventDefault(); send();}}, [
        files.value.length ? element("div", {class:"task-chat__attachments"}, files.value.map((name, index) => element("button", {
          key:index, type:"button", class:"task-chat__attachment", title:"移除 " + name,
          "aria-label":"移除附件 " + name, onClick:() => { files.value = files.value.filter((_, i) => i !== index); },
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
          element("button", {type:"button", class:"task-chat__tool task-chat__model", disabled:true, title:"尚未连接模型；消息仅保存在本机"}, [element("span", null, "未连接模型"), icon("chevron")]),
          unavailable("", "mic", "语音尚未接入", "task-chat__icon"),
          element("button", {type:"submit", class:"task-chat__send", "aria-label":"发送消息", title:"发送到本机消息记录", disabled:readFailed.value || (!draft.value.trim() && !files.value.length)}, [icon("up")]),
        ]),
      ]),
      element("p", {class:"task-chat__status", role:error.value ? "alert" : "status"}, error.value || (files.value.length || messages.value.some(m => m.files.length) ? "仅保存在本机 · 附件仅记录文件名，未读取或上传" : "仅保存在本机 · 尚未发送至模型")),
    ]);
  },
};

// Protect editing, text selection and independent history scrolling from the
// authored sheet's global swipe/scroll handlers, without affecting other cards.
for (const type of ["pointerdown", "wheel", "touchstart"]) {
  document.addEventListener(type, event => {
    if (event.target.closest?.(".task-chat")) event.stopPropagation();
  });
}

