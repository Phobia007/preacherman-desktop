(() => {
  const diagnostics = window.__PREACHERMAN_INTERACTION_BRIDGE__ = {
    clicks: 0,
    installed: false,
    lastCard: "",
    lastPointer: null,
    matches: 0,
    moves: 0,
  };
  let hoveredMesh = null;
  let lastClickAt = 0;
  let queuedPointer = null;
  let pointerFrame = 0;

  const findWorkItems = () => {
    if (
      typeof Container === "undefined"
      || !Container.instance
      || typeof Stage === "undefined"
      || !document.querySelector("canvas")
    ) return null;
    const seen = new Set();
    let workItems = null;
    const visit = (component) => {
      if (!component || seen.has(component) || workItems) return;
      seen.add(component);
      if (component.constructor?.name === "WorkItems") {
        workItems = component;
        return;
      }
      for (const child of Object.values(component.classes || {})) visit(child);
    };
    visit(Container.instance());
    return workItems;
  };

  const findCardHit = (x, y) => {
    if (
      typeof Interaction3D === "undefined"
      || typeof Mouse === "undefined"
      || typeof Stage === "undefined"
    ) return null;
    const workItems = findWorkItems();
    const camera = workItems?.get("Work/camera");
    const views = workItems?.viewState?.views;
    if (!camera || !views?.length) return null;
    const interaction = Interaction3D.find(camera);
    const pointer = { x, y };
    let closest = null;
    for (const view of views) {
      const mesh = view.group?.children?.[0];
      if (!mesh?.determineVisible?.()) continue;
      const hit = interaction.checkObjectHit(mesh, pointer, Stage);
      if (hit && (!closest || hit.distance < closest.hit.distance)) {
        closest = { hit, mesh, view };
      }
    }
    return closest;
  };

  const updateHover = () => {
    pointerFrame = 0;
    if (!queuedPointer) return;
    const match = findCardHit(queuedPointer.x, queuedPointer.y);
    const nextMesh = match?.mesh ?? null;
    if (nextMesh === hoveredMesh) return;
    hoveredMesh?.__hoverCallback?.({ action: "out", mesh: hoveredMesh, hit: null });
    hoveredMesh = nextMesh;
    hoveredMesh?.__hoverCallback?.({
      action: "over",
      mesh: hoveredMesh,
      hit: match.hit,
    });
  };

  const queueHover = (x, y) => {
    diagnostics.moves += 1;
    queuedPointer = { x, y };
    diagnostics.lastPointer = queuedPointer;
    if (!pointerFrame) pointerFrame = requestAnimationFrame(updateHover);
  };

  const activateCard = (x, y) => {
    const now = Date.now();
    if (now - lastClickAt < 120) return;
    lastClickAt = now;
    diagnostics.clicks += 1;
    diagnostics.lastPointer = { x, y };
    const match = findCardHit(x, y);
    if (!match?.mesh?.__clickCallback) return;
    diagnostics.matches += 1;
    diagnostics.lastCard = match.view.data?.perma || "";
    const routeBefore = AppState.get("Router/state");
    const projectBefore = AppState.get("Work/project");
    match.mesh.__clickCallback({
      action: "click",
      mesh: match.mesh,
      hit: match.hit,
    });
    setTimeout(() => {
      if (
        AppState.get("Router/state") !== routeBefore
        || AppState.get("Work/project") !== projectBefore
      ) return;
      match.view.navigate?.(`work/${match.view.data.perma}`);
    }, 160);
  };

  const install = () => {
    const workItems = findWorkItems();
    if (!workItems?.viewState?.views?.length) {
      setTimeout(install, 100);
      return;
    }

    diagnostics.installed = true;

    workItems.events?.sub?.(Mouse.input, Interaction.MOVE, (event) => {
      queueHover(event?.x ?? Mouse.x, event?.y ?? Mouse.y);
    });
    workItems.events?.sub?.(Mouse.input, Interaction.CLICK, (event) => {
      activateCard(event?.x ?? Mouse.x, event?.y ?? Mouse.y);
    });

    window.addEventListener("mousemove", (event) => {
      queueHover(event.clientX, event.clientY);
    }, true);

    window.addEventListener("mouseleave", () => {
      queuedPointer = null;
      if (pointerFrame) cancelAnimationFrame(pointerFrame);
      pointerFrame = 0;
      hoveredMesh?.__hoverCallback?.({ action: "out", mesh: hoveredMesh, hit: null });
      hoveredMesh = null;
    }, true);

    window.addEventListener("click", (event) => {
      activateCard(event.clientX, event.clientY);
    }, true);
  };

  install();
})();
