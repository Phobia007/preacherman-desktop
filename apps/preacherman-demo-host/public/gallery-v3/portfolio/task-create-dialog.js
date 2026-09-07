// Task creation stays inside the original Profile lens, followed by rail arrival.
import {prepareTaskCover} from "./task-covers.js";
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
  const close = () => { if (!busy) profileOpen.value = false; };
  const resetCover = () => {
    coverRevision++;
    coverBlob = null;
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
    label.textContent = "Adding…";
    try {
      if (!folio.prepareTaskCreation) throw new Error("任务页面尚未就绪，请稍后重试。");
      const arrive = await folio.prepareTaskCreation({
        ...Object.fromEntries(Object.entries(fields).map(([name, input]) => [name, input.value])),
        coverBlob,
      });
      if (disposed) return;
      form.reset();
      resetCover();
      busy = false;
      close();
      arrive();
    } catch {
      if (!disposed) error.textContent = "任务未能添加，请保留填写内容后重试。";
    } finally {
      busy = false;
      submit.disabled = coverButton.disabled = removeCover.disabled = false;
      form.removeAttribute("aria-busy");
      label.textContent = "Add task";
    }
  });
  const restore = () => {
    if (!opened) return;
    opened = false;
    body.hidden = true;
    document.documentElement.removeAttribute("data-task-creating");
    profileCopy.inert = copyWasInert;
    if (copyAriaHidden === null) profileCopy.removeAttribute("aria-hidden");
    else profileCopy.setAttribute("aria-hidden", copyAriaHidden);
    document.querySelector(".task-create__button")?.setAttribute("aria-expanded", "false");
    previousFocus?.isConnected && previousFocus.focus({preventScroll:true});
  };
  const open = () => {
    if (opened) return;
    opened = true;
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
  };
  const guard = (event) => {
    if (!opened) return;
    if (event.type === "keydown") {
      if (event.key === "Tab") {
        const stops = [...Object.values(fields), ...[coverButton, removeCover, submit].filter(control => !control.hidden && !control.disabled)];
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
  window.addEventListener("preacherman:task-create-open", open);
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
      window.removeEventListener("preacherman:task-create-open", open);
      for (const type of types) window.removeEventListener(type, guard, true);
      body.remove();
    },
  };
}
