import {createTaskProject, deleteTaskProjects, augmentTaskProjects, projectRecord} from "./task-metadata.js";

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
  const remove = async (ids) => {
    if (disposed || !root.value?.isConnected) throw new Error("任务页面已关闭。");
    const selected = new Set(ids);
    if (!selected.size) return;
    const indices = [...selected].map(id => projects.value.findIndex(project => project.slug === id));
    if (indices.some(index => index < 0)) throw new Error("所选卡片已不存在，请重新选择。");
    const index = Math.min(...indices);
    // Persist first: a failed write must leave every visible card intact.
    deleteTaskProjects([...selected]);
    arrival?.kill();
    const removed = folio.cards.filter(card => selected.has(card.slug));
    for (const title of folio.texts.filter(title => selected.has(title.slug))) {
      motion.killTweensOf([title, ...Object.values(title.material.uniforms)]);
      title.dispose();
    }
    folio.texts = folio.texts.filter(title => !selected.has(title.slug));
    folio.pills = folio.pills.filter(pill => {
      if (!removed.some(card => card.el.contains(pill.el))) return true;
      motion.killTweensOf(pill);
      folio.disposeMesh(pill.mesh);
      return false;
    });
    for (const card of removed) { motion.killTweensOf(card); folio.reg.retire(card); }
    projects.value = augmentTaskProjects(projects.value);
    await nextTick();
    if (disposed) return;
    measureX(); measureY();
    folio.cards = folio.scan(root.value, projects.value).filter(card => card.el.dataset.gl === "card");
    const next = Math.min(index, projects.value.length - 1);
    if (next >= 0) { centerX(next, false); centerY(next, false); }
  };
  const removeOne = id => remove([id]);
  folio.prepareTaskCreation = prepare;
  folio.removeTaskCards = remove;
  folio.removeTaskCard = removeOne;
  return () => {
    disposed = true;
    arrival?.kill();
    if (folio.prepareTaskCreation === prepare) delete folio.prepareTaskCreation;
    if (folio.removeTaskCards === remove) delete folio.removeTaskCards;
    if (folio.removeTaskCard === removeOne) delete folio.removeTaskCard;
  };
}
