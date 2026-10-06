// Task creation stays inside the original Profile lens, followed by rail arrival.
import {prepareTaskCover, saveTaskCover, discardTaskCover, loadTaskCovers, taskCoverUrl} from "./task-covers.js";
import {pickTaskWorkspace} from "./task-workspace.js";
import {stageTaskSheet} from "./task-sheet-overlay.js";

// The visible rail can finish entering before the Profile's text textures.
// Preserve the first click until the existing lens is ready to receive it.
let activeDialog = null;
let pendingOpen = null;
const requestOpen = event => {
  if (activeDialog) void activeDialog(event);
  else pendingOpen = event;
};
window.addEventListener("preacherman:task-create-open", requestOpen);
window.addEventListener("preacherman:task-edit-open", requestOpen);
export function installTaskCreateDialog({folio, profileOpen, disc, textGroups, watch}) {
  const body = document.createElement("section");
  body.id = "task-create-dialog";
  body.className = "task-create-dialog__body";
  body.setAttribute("role", "dialog");
  body.setAttribute("aria-modal", "true");
  body.setAttribute("aria-label", "创建新对话");
  body.hidden = true;
  const form = document.createElement("form");
  form.className = "task-create-dialog__form";
  form.noValidate = true;
  const fields = {};
  for (const [name, label, multiline, limit] of [
    ["title", "名称", false, 120],
    ["summary", "任务简介", true, 2000],
    ["group", "任务分组", false, 80],
  ]) {
    const row = document.createElement("label");
    row.className = "task-create-dialog__field";
    const caption = document.createElement("span");
    caption.textContent = label;
    const input = document.createElement(multiline ? "textarea" : "input");
    input.name = name;
    input.maxLength = limit;
    input.placeholder = name === "title" ? "填写任务名称" : name === "summary" ? "描述这个任务要做什么" : "填写分组名称";
    input.autocomplete = "off";
    input.required = name === "title";
    if (multiline) input.rows = 3;
    else input.type = "text";
    row.append(caption, input);
    form.append(row);
    fields[name] = input;
  }
  const workspaceRow = document.createElement("div");
  workspaceRow.className = "task-create-dialog__field";
  const workspaceCaption = document.createElement("span");
  workspaceCaption.textContent = "工作区 · 可选";
  const workspaceControls = document.createElement("div");
  workspaceControls.className = "task-create-dialog__cover-controls";
  const workspaceButton = document.createElement("button");
  workspaceButton.type = "button";
  workspaceButton.className = "task-create-dialog__workspace";
  workspaceButton.setAttribute("aria-label", "选择工作文件夹");
  const clearWorkspace = document.createElement("button");
  clearWorkspace.type = "button";
  clearWorkspace.className = "task-create-dialog__cover-remove";
  clearWorkspace.textContent = "×";
  clearWorkspace.setAttribute("aria-label", "清除工作区");
  workspaceControls.append(workspaceButton, clearWorkspace);
  workspaceRow.append(workspaceCaption, workspaceControls);
  form.append(workspaceRow);
  const coverRow = document.createElement("div");
  coverRow.className = "task-create-dialog__field";
  const coverCaption = document.createElement("span");
  coverCaption.textContent = "卡片封面 · 可选";
  const coverControls = document.createElement("div");
  coverControls.className = "task-create-dialog__cover-controls";
  const coverPicker = document.createElement("input");
  coverPicker.type = "file";
  coverPicker.name = "cover";
  coverPicker.accept = "image/jpeg,image/png,image/webp";
  coverPicker.hidden = true;
  const coverButton = document.createElement("button");
  coverButton.type = "button";
  coverButton.className = "task-create-dialog__cover";
  coverButton.setAttribute("aria-label", "选择卡片封面");
  const preview = document.createElement("img");
  preview.className = "task-create-dialog__cover-preview";
  preview.alt = "封面预览";
  preview.hidden = true;
  const coverCopy = document.createElement("span");
  const coverName = document.createElement("span");
  coverName.className = "task-create-dialog__cover-name";
  coverName.textContent = "选择封面图片";
  const coverHint = document.createElement("small");
  coverHint.textContent = "JPG / PNG / WebP · 最大 12 MB";
  coverCopy.append(coverName, coverHint);
  coverButton.append(preview, coverCopy);
  const removeCover = document.createElement("button");
  removeCover.type = "button";
  removeCover.className = "task-create-dialog__cover-remove";
  removeCover.textContent = "移除";
  removeCover.setAttribute("aria-label", "移除卡片封面");
  removeCover.hidden = true;
  coverControls.append(coverButton, removeCover, coverPicker);
  coverRow.append(coverCaption, coverControls);
  form.append(coverRow);
  const error = document.createElement("p");
  error.id = "task-create-dialog-error";
  error.className = "task-create-dialog__error";
  error.setAttribute("role", "alert");
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "task-create-dialog__submit";
  const label = document.createElement("span");
  label.className = "task-create-dialog__submit-label";
  label.textContent = "Add task";
  submit.append(label);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 100 40");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  for (const kind of ["outline", "tracer"]) {
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("class", "task-create-dialog__charge-" + kind);
    path.setAttribute("d", "M18 1H82A17 17 0 0 1 99 18V22A17 17 0 0 1 82 39H18A17 17 0 0 1 1 22V18A17 17 0 0 1 18 1Z");
    path.setAttribute("pathLength", "100");
    path.setAttribute("vector-effect", "non-scaling-stroke");
    svg.append(path);
  }
  submit.append(svg);
  form.append(error, submit);
  body.append(form);
  disc.append(body);
  const profileCopy = disc.firstElementChild;
  let opened = false;
  let previousFocus = null;
  let copyWasInert = false;
  let copyAriaHidden = null;
  let busy = false;
  let disposed = false;
  let coverBlob = null;
  let coverPreviewUrl = null;
  let coverRevision = 0;
  let readingCover = false;
  let editingId = null;
  let savedCoverId = null;
  let workspacePath = "";
  let workspaceRequest = null;
  let sheetStage = null;
  let dialogRevision = 0;
  const showWorkspace = () => {
    workspaceButton.textContent = workspaceRequest ? "正在选择文件夹…" : workspacePath || "选择工作文件夹";
    workspaceButton.title = workspacePath;
    workspaceButton.disabled = busy || !!workspaceRequest;
    clearWorkspace.hidden = !workspacePath;
    clearWorkspace.disabled = busy || !!workspaceRequest;
    submit.disabled = busy || readingCover || !!workspaceRequest;
  };
  workspaceButton.addEventListener("click", async () => {
    if (busy || workspaceRequest) return;
    const request = new AbortController();
    workspaceRequest = request;
    clearError(); showWorkspace();
    try {
      const path = await pickTaskWorkspace(request.signal);
      if (!request.signal.aborted && opened && path) workspacePath = path;
    } catch (reason) { if (!request.signal.aborted && opened) error.textContent = reason.message; }
    finally { if (workspaceRequest === request) { workspaceRequest = null; showWorkspace(); } }
  });
  clearWorkspace.addEventListener("click", () => { workspacePath = ""; showWorkspace(); workspaceButton.focus(); });
  const close = () => { if (!busy) profileOpen.value = false; };
  const resetCover = () => {
    coverRevision++;
    coverBlob = null;
    savedCoverId = null;
    if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
    coverPreviewUrl = null;
    preview.removeAttribute("src");
    preview.hidden = removeCover.hidden = true;
    coverName.textContent = "选择封面图片";
    coverButton.setAttribute("aria-label", "选择卡片封面");
    coverPicker.value = "";
  };
  const clearError = () => {
    error.textContent = "";
    fields.title.removeAttribute("aria-invalid");
    fields.title.removeAttribute("aria-describedby");
  };
  form.addEventListener("input", clearError);
  coverButton.addEventListener("click", () => { if (!busy) coverPicker.click(); });
  removeCover.addEventListener("click", () => { if (!busy) { resetCover(); coverButton.focus(); } });
  coverPicker.addEventListener("change", async () => {
    const file = coverPicker.files?.[0];
    if (!file || busy) return;
    const revision = ++coverRevision;
    readingCover = true;
    submit.disabled = coverButton.disabled = removeCover.disabled = true;
    clearError();
    coverName.textContent = "正在处理图片…";
    try {
      const prepared = await prepareTaskCover(file);
      if (disposed || revision !== coverRevision) return;
      if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
      coverBlob = prepared;
      coverPreviewUrl = URL.createObjectURL(prepared);
      preview.src = coverPreviewUrl;
      preview.hidden = removeCover.hidden = false;
      coverName.textContent = "更换封面图片";
      coverButton.setAttribute("aria-label", "更换卡片封面");
    } catch (reason) {
      if (!disposed && revision === coverRevision) {
        error.textContent = reason.message;
        coverName.textContent = coverBlob ? "更换封面图片" : "选择封面图片";
      }
    } finally {
      readingCover = false;
      submit.disabled = coverButton.disabled = removeCover.disabled = false;
      coverPicker.value = "";
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || readingCover) return;
    if (workspaceRequest) return;
    clearError();
    if (!fields.title.value.trim()) {
      error.textContent = "请填写任务名称。";
      fields.title.setAttribute("aria-invalid", "true");
      fields.title.setAttribute("aria-describedby", error.id);
      fields.title.focus();
      return;
    }
    busy = true;
    submit.disabled = coverButton.disabled = removeCover.disabled = true;
    form.setAttribute("aria-busy", "true");
    showWorkspace();
    label.textContent = editingId ? "Saving…" : "Adding…";
    let newCoverId = null;
    try {
      const values = {
        ...Object.fromEntries(Object.entries(fields).map(([name, input]) => [name, input.value])),
        coverBlob, workspacePath,
      };
      let arrive = () => {};
      if (editingId) {
        const {updateTaskSettings} = await import("./task-metadata.js");
        if (coverBlob) newCoverId = await saveTaskCover(coverBlob);
        if (disposed) { if (newCoverId) await discardTaskCover(newCoverId); return; }
        updateTaskSettings(editingId, {...values, coverId:newCoverId ?? savedCoverId});
      } else {
        if (!folio.prepareTaskCreation) throw new Error("任务页面尚未就绪，请稍后重试。");
        arrive = await folio.prepareTaskCreation(values);
      }
      if (disposed) return;
      form.reset();
      resetCover();
      busy = false;
      close();
      arrive();
    } catch {
      if (newCoverId) await discardTaskCover(newCoverId).catch(() => {});
      if (!disposed) error.textContent = editingId ? "修改未能保存，请保留填写内容后重试。" : "任务未能添加，请保留填写内容后重试。";
    } finally {
      busy = false;
      submit.disabled = coverButton.disabled = removeCover.disabled = false;
      form.removeAttribute("aria-busy");
      label.textContent = editingId ? "Save task" : "Add task";
      showWorkspace();
    }
  });
  const restore = () => {
    if (!opened) return;
    opened = false;
    dialogRevision++;
    workspaceRequest?.abort();
    workspaceRequest = null;
    void sheetStage?.restore(false);
    sheetStage = null;
    body.hidden = true;
    document.documentElement.removeAttribute("data-task-creating");
    profileCopy.inert = copyWasInert;
    if (copyAriaHidden === null) profileCopy.removeAttribute("aria-hidden");
    else profileCopy.setAttribute("aria-hidden", copyAriaHidden);
    document.querySelector(".task-create__button")?.setAttribute("aria-expanded", "false");
    previousFocus?.isConnected && previousFocus.focus({preventScroll:true});
  };
  const open = async (event) => {
    if (opened) return;
    const editing = event?.type === "preacherman:task-edit-open" ? event.detail : null;
    let record;
    try { record = editing ? (await import("./task-metadata.js")).readTaskSettings(editing.id, {title:editing.title}) : null; }
    catch { return; }
    if (disposed || opened) return;
    resetCover();
    form.reset();
    clearError();
    editingId = record?.id ?? null;
    for (const [name, input] of Object.entries(fields)) input.value = record?.[name] ?? "";
    workspacePath = record?.workspacePath ?? "";
    savedCoverId = record?.coverId ?? null;
    label.textContent = editingId ? "Save task" : "Add task";
    body.setAttribute("aria-label", editingId ? "任务设置" : "创建新对话");
    showWorkspace();
    if (editingId) sheetStage = stageTaskSheet(folio, {hide:true});
    opened = true;
    const revision = ++dialogRevision;
    document.documentElement.setAttribute("data-task-creating", "");
    folio.taskCreateDialogOpen = true;
    previousFocus = document.activeElement;
    copyWasInert = profileCopy.inert;
    copyAriaHidden = profileCopy.getAttribute("aria-hidden");
    profileCopy.inert = true;
    profileCopy.setAttribute("aria-hidden", "true");
    folio.showTexts(textGroups, false);
    for (const plane of textGroups.flat().filter(Boolean)) {
      plane.progress = 0;
      plane.material.uniforms.u_alpha.value = 0;
    }
    body.hidden = false;
    document.querySelector(".task-create__button")?.setAttribute("aria-expanded", "true");
    // Keep the Profile lens motion; only creation hides its redundant Close label.
    profileOpen.value = true;
    queueMicrotask(() => { if (opened) fields.title.focus({preventScroll:true}); });
    if (savedCoverId) {
      await loadTaskCovers([savedCoverId]);
      if (opened && revision === dialogRevision && savedCoverId) {
        const url = taskCoverUrl(savedCoverId);
        if (url) { preview.src = url; preview.hidden = removeCover.hidden = false; coverName.textContent = "更换封面图片"; }
      }
    }
  };
  const guard = (event) => {
    if (!opened) return;
    if (event.type === "keydown") {
      if (event.key === "Tab") {
        const stops = [...Object.values(fields), ...[workspaceButton, clearWorkspace, coverButton, removeCover, submit].filter(control => !control.hidden && !control.disabled)];
        const index = stops.indexOf(document.activeElement);
        event.preventDefault();
        stops[(index + (event.shiftKey ? -1 : 1) + stops.length) % stops.length].focus();
      }
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      // Editing and IME must never reach the portfolio's global key navigation.
      if (body.contains(event.target)) event.stopPropagation();
      return;
    }
    if (event.target.closest?.('[data-od-id="profile-toggle"], .task-create__button')) return;
    if (body.contains(event.target)) return;
    // Outside clicks dismiss, but must not also open or drag a card underneath.
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "click") close();
  };
  const shield = (event) => event.stopPropagation();
  const types = ["click", "pointerdown", "wheel", "touchstart", "keydown"];
  for (const type of types) window.addEventListener(type, guard, {capture:true, passive:false});
  for (const type of ["pointerdown", "wheel", "touchstart"]) body.addEventListener(type, shield);
  activeDialog = open;
  if (pendingOpen) {
    const event = pendingOpen;
    pendingOpen = null;
    queueMicrotask(() => { if (!disposed) void open(event); });
  }
  const stopWatching = watch(profileOpen, (value) => {
    if (!value) restore();
    // Keep the new-task closing lens empty; only normal Profile restores its decoration.
    else if (!opened) folio.taskCreateDialogOpen = false;
  });
  return {
    get opened() { return opened; },
    dispose() {
      disposed = true;
      resetCover();
      restore();
      folio.taskCreateDialogOpen = false;
      stopWatching();
      if (activeDialog === open) activeDialog = null;
      pendingOpen = null;
      for (const type of types) window.removeEventListener(type, guard, true);
      body.remove();
    },
  };
}
