// Empty creation mode for the existing Profile lens. No task creation or navigation.
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
  disc.append(body);
  const profileCopy = disc.firstElementChild;
  let opened = false;
  let previousFocus = null;
  let copyWasInert = false;
  let copyAriaHidden = null;
  const close = () => { profileOpen.value = false; };
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
    queueMicrotask(() => { if (opened) closeButton.focus({preventScroll:true}); });
  };
  const guard = (event) => {
    if (!opened) return;
    if (event.type === "keydown") {
      if (event.key === "Tab") { event.preventDefault(); closeButton.focus(); }
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close(); }
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
      restore();
      folio.taskCreateDialogOpen = false;
      stopWatching();
      window.removeEventListener("preacherman:task-create-open", open);
      for (const type of types) window.removeEventListener(type, guard, true);
      body.remove();
    },
  };
}
