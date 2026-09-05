import {createTaskProject, augmentTaskProjects, projectRecord} from "./task-metadata.js";

// Extend the mounted rail; never reload the route or replay its entrance.
export function installTaskCreateRail({folio, projects, root, track, resize, nextTick, measureX, measureY, centerX, centerY, motion}) {
  let disposed = false;
  let arrival = null;
  const prepare = async (values) => {
    await folio.texture(projectRecord({}).src);
    if (disposed || !root.value?.isConnected) throw new Error("任务页面已关闭，请重新打开后添加。");
    const vertical = resize.small;
    const viewport = vertical ? resize.wh : resize.ww;
    const midpoint = card => {
      const rect = card._vrect ?? card.getBoundingClientRect();
      return vertical ? rect.top + rect.height / 2 : rect.left + rect.width / 2;
    };
    const anchor = [...track.value.children].reduce((best, card) =>
      !best || Math.abs(midpoint(card) - viewport / 2) < Math.abs(midpoint(best) - viewport / 2) ? card : best, null);
    const offset = anchor ? midpoint(anchor) - viewport / 2 : 0;
    const project = createTaskProject(values);
    projects.value = augmentTaskProjects(projects.value);
    await nextTick();
    if (disposed) return () => {};
    measureX(); measureY();
    const center = vertical ? centerY : centerX;
    const anchorIndex = projects.value.findIndex(item => item.slug === anchor?.dataset.id);
    if (anchorIndex >= 0) center(anchorIndex, false, offset);
    folio.cards = folio.scan(root.value, projects.value).filter(card => card.el.dataset.gl === "card");
    // scan creates the authored material at alpha 0; the normal Home entrance reveals it.
    // Live insertion skips that page entrance, so initialize only the added card.
    const added = folio.cards.find(card => card.slug === project.id);
    added.ox = added.oz = 0;
    added.mesh.material.uniforms.u_alpha.value = 1;
    const card = [...track.value.children].find(card => card.dataset.id === project.id);
    await folio.showTitles([{card, el:card.querySelector("[data-title]"), slug:project.id}], true);
    return () => {
      arrival?.kill();
      arrival = motion.delayedCall(0.65, () => {
        if (disposed) return;
        const index = projects.value.findIndex(item => item.slug === project.id);
        const animate = !matchMedia("(prefers-reduced-motion: reduce)").matches;
        centerX(index, animate); centerY(index, animate);
        card.focus({preventScroll:true});
      });
    };
  };
  folio.prepareTaskCreation = prepare;
  return () => {
    disposed = true;
    arrival?.kill();
    if (folio.prepareTaskCreation === prepare) delete folio.prepareTaskCreation;
  };
}
