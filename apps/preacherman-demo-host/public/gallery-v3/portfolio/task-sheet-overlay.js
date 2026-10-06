// Temporarily stage the existing sheet without unmounting its conversation/draft.
export function stageTaskSheet(folio, {hide = false} = {}) {
  const sheet = document.querySelector('[data-gl="sheet"]');
  const main = sheet?.closest("main");
  const inert = main?.inert;
  const saved = sheet?.getAttribute("style");
  const hidden = [];
  for (const entry of [...(folio.reg?.all?.() ?? []), ...(folio.pills ?? [])]) {
    if (!entry.mesh || !main?.contains(entry.el) || entry.el === sheet) continue;
    hidden.push([entry.mesh, entry.mesh.visible]);
    entry.mesh.visible = false;
  }
  if (main) main.inert = true;
  const opacity = main?.style.opacity;
  const paper = folio.reg?.all?.().find(entry => entry.el === sheet)?.mesh.material.uniforms.u_white;
  const paperValue = paper?.value;
  if (main && hide) {
    main.style.opacity = "0";
    // The existing lens needs its image source: fold the sheet's cover back
    // into the center instead of leaving a blank scene or a full white page.
    if (paper) paper.value = 0;
    sheet.style.transform = "scale(.38, .3)";
    sheet.style.transformOrigin = "50% 50%";
  }
  let animation;
  const origin = sheet?.getBoundingClientRect();
  let shrunk = false;
  let disposed = false;
  return {
    shrink(rect) {
      if (!sheet || disposed) return;
      const target = `translate(${rect.left - origin.left}px, ${rect.top - origin.top}px) scale(${rect.width / origin.width}, ${rect.height / origin.height})`;
      const from = getComputedStyle(sheet).transform;
      animation?.cancel();
      sheet.style.transformOrigin = "0 0";
      sheet.style.transform = target;
      if (!shrunk) animation = sheet.animate([{transform:from}, {transform:target}], {duration:matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 520, easing:"cubic-bezier(.22,1,.36,1)"});
      shrunk = true;
    },
    async restore(animate = true) {
      if (disposed) return;
      disposed = true;
      const from = sheet && getComputedStyle(sheet).transform;
      animation?.cancel();
      if (animate && shrunk && sheet) {
        const original = sheet.style.transform;
        if (saved === null) sheet.removeAttribute("style"); else sheet.setAttribute("style", saved);
        const to = getComputedStyle(sheet).transform;
        sheet.style.transformOrigin = "0 0";
        sheet.style.transform = original;
        animation = sheet.animate([{transform:from}, {transform:to}], {duration:matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 520, easing:"cubic-bezier(.22,1,.36,1)"});
        await animation.finished.catch(() => {});
      }
      animation?.cancel();
      if (sheet) { if (saved === null) sheet.removeAttribute("style"); else sheet.setAttribute("style", saved); }
      if (main) { main.inert = inert; main.style.opacity = opacity; }
      if (paper && hide) paper.value = paperValue;
      for (const [mesh, visible] of hidden) mesh.visible = visible;
    },
  };
}
