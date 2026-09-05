// A three-row task form inside the existing Profile lens, followed by rail arrival.
export function installTaskCreateDialog({folio, profileOpen, disc, textGroups, watch}) {
  const body = document.createElement("section");
  body.id = "task-create-dialog";
  body.className = "task-create-dialog__body";
  body.setAttribute("role", "dialog");
  body.setAttribute("aria-modal", "true");
  body.setAttribute("aria-label", "创建新对话");
  body.hidden = true;
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "task-create-dialog__close";
  closeButton.setAttribute("aria-label", "关闭新建对话");
  // Two CSS strokes use the same control foreground as the existing UI.
  closeButton.append(document.createElement("span"), document.createElement("span"));
  body.append(closeButton);
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
  const close = () => { if (!busy) profileOpen.value = false; };
  const clearError = () => {
    error.textContent = "";
    fields.title.removeAttribute("aria-invalid");
    fields.title.removeAttribute("aria-describedby");
  };
  form.addEventListener("input", clearError);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    clearError();
    if (!fields.title.value.trim()) {
      error.textContent = "请填写任务名称。";
      fields.title.setAttribute("aria-invalid", "true");
      fields.title.setAttribute("aria-describedby", error.id);
      fields.title.focus();
      return;
    }
    busy = true;
    submit.disabled = true;
    form.setAttribute("aria-busy", "true");
    label.textContent = "Adding…";
    try {
      if (!folio.prepareTaskCreation) throw new Error("任务页面尚未就绪，请稍后重试。");
      const arrive = await folio.prepareTaskCreation(Object.fromEntries(
        Object.entries(fields).map(([name, input]) => [name, input.value]),
      ));
      if (disposed) return;
      form.reset();
      busy = false;
      close();
      arrive();
    } catch {
      if (!disposed) error.textContent = "任务未能添加，请保留填写内容后重试。";
    } finally {
      busy = false;
      submit.disabled = false;
      form.removeAttribute("aria-busy");
      label.textContent = "Add task";
    }
  });
  const restore = () => {
    if (!opened) return;
    opened = false;
    body.hidden = true;
    profileCopy.inert = copyWasInert;
    if (copyAriaHidden === null) profileCopy.removeAttribute("aria-hidden");
    else profileCopy.setAttribute("aria-hidden", copyAriaHidden);
    document.querySelector(".task-create__button")?.setAttribute("aria-expanded", "false");
    previousFocus?.isConnected && previousFocus.focus({preventScroll:true});
  };
  const open = () => {
    if (opened) return;
    opened = true;
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
    // The Profile watcher owns the original openHole lens and top Close control.
    profileOpen.value = true;
    queueMicrotask(() => { if (opened) fields.title.focus({preventScroll:true}); });
  };
  const guard = (event) => {
    if (!opened) return;
    if (event.type === "keydown") {
      if (event.key === "Tab") {
        const stops = [closeButton, ...Object.values(fields), ...(!submit.disabled ? [submit] : [])];
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
  closeButton.addEventListener("click", close);
  const stopWatching = watch(profileOpen, (value) => {
    if (!value) restore();
    // Keep the new-task closing lens empty; only normal Profile restores its decoration.
    else if (!opened) folio.taskCreateDialogOpen = false;
  });
  return {
    get opened() { return opened; },
    dispose() {
      disposed = true;
      restore();
      folio.taskCreateDialogOpen = false;
      stopWatching();
      window.removeEventListener("preacherman:task-create-open", open);
      for (const type of types) window.removeEventListener(type, guard, true);
      body.remove();
    },
  };
}
