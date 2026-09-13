// The authored Hydra room remains the rear render. The host mirrors its one video
// above the companion; closing that mirror never owns or stops the decoder.
(() => {
  const listeners = new Set(), railListeners = new Set(), inputListeners = new Set();
  let railCards = [], contact = false, railSignature = null;
  const rail = () => state.phase === "closed" && !contact;
  const syncRail = () => {
    document.documentElement.dataset.galleryNativeRail = String(rail());
    if (warmed && window.World?.NUKE) window.World.NUKE.paused = rail();
    // Overview previews have bounded per-card decoders; the old decoder serves details only.
    const sharedVideo = video?.video?.video ?? work?.get?.("Work/video", true)?.video?.video;
    if (rail() && sharedVideo && !sharedVideo.paused) sharedVideo.pause();
  };
  let work, video, camera, foreground, savedScroll, exitTimer;
  let switching = false;
  let requestedActive = true, windowVisible = true, warmed = false, paused = false;
  const pausedMedia = new Set();
  function syncActivity() {
    // Let cold prewarming finish the authored entry reveal before suspending it.
    const visible = windowVisible && !document.hidden && (requestedActive || !warmed);
    if (!window.Render || paused === !visible) return;
    paused = !visible;
    document.documentElement.dataset.galleryRenderActive = String(visible);
    if (paused) {
      const seen = new Set();
      const visit = component => {
        if (!component || seen.has(component)) return;
        seen.add(component);
        const media = component.video instanceof HTMLVideoElement ? component.video : component.video?.video;
        if (media instanceof HTMLVideoElement && !media.paused && !media.ended) {
          pausedMedia.add(media);
          media.pause();
        }
        for (const child of Object.values(component.classes || {})) visit(child);
      };
      visit(window.Container?.instance());
      for (const media of document.querySelectorAll("video")) {
        if (!media.paused && !media.ended) { pausedMedia.add(media); media.pause(); }
      }
      Render.pause();
    } else {
      Render.resume();
      for (const media of pausedMedia) if (!media.ended) void media.play().catch(() => undefined);
      pausedMedia.clear();
    }
  }
  document.addEventListener("visibilitychange", syncActivity);
  const projects = () => window.CMS_DATA?.projects || [];
  const index = () => projects().findIndex(project => project.perma === state.project);
  let state = { phase: "closed", project: "", title: "", smallWindow: true };
  const notify = () => {
    window.document?.documentElement?.setAttribute("data-gallery-detail", state.phase);
    syncRail();
    listeners.forEach(listener => listener({ ...state, contact }));
  };
  const controller = () => work?.findParent("ViewController").scroll.renderManager.controller;
  const restoreRail = () => {
    if (Number.isFinite(savedScroll)) controller().scroll = savedScroll;
  };
  // WebView wheel gestures and route callbacks can outlive the input event.
  // Keep the rail pinned for the entire authored return transition, not once.
  const preventDetailWheel = event => {
    if (state.phase !== "closed" && !event.target?.closest?.("[data-preacherman-chat]")) event.preventDefault();
  };
  window.addEventListener("wheel", preventDetailWheel, { capture: true, passive: false });
  // Forward only the rail's input. The original chat and detail controls keep ownership.
  const input = event => {
    if (!requestedActive || !rail() || event.target?.closest?.('[data-preacherman-chat], input, textarea, button, a')) return;
    const type = event.type;
    if (type === "wheel") {
      event.preventDefault(); event.stopImmediatePropagation();
      const delta = (event.deltaY || event.deltaX) * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
      inputListeners.forEach(listener => listener({ type: "wheel", delta })); return;
    }
    if (type === "keydown") {
      if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "PageDown", "PageUp", "Home", "End", "Enter"].includes(event.key)) return;
      event.preventDefault(); event.stopImmediatePropagation(); inputListeners.forEach(listener => listener({ type: "key", key: event.key })); return;
    }
    const kind = { pointermove: "move", pointerdown: "down", pointerup: "up", pointercancel: "up", click: "click" }[type];
    inputListeners.forEach(listener => listener({ type: kind, x: event.clientX / innerWidth * 2 - 1, y: 1 - event.clientY / innerHeight * 2 }));
    event.stopImmediatePropagation();
  };
  const inputEvents = ["wheel", "keydown", "pointermove", "pointerdown", "pointerup", "pointercancel", "click"];
  inputEvents.forEach(type => window.addEventListener(type, input, { capture: true, passive: false }));
  const api = window.PreachermanGalleryDetail = {
    subscribeRail(listener) { railListeners.add(listener); listener(railCards); return () => railListeners.delete(listener); },
    subscribeInput(listener) { inputListeners.add(listener); return () => inputListeners.delete(listener); },
    setRailCursor(cursor) { if (document.body) document.body.style.cursor = cursor; },
    previewProject(id) { const project = projects().find(project => project.perma === id); if (project && rail() && work.get?.("WorkItems/videoURL", true) !== project.videoURL) work.set("WorkItems/videoURL", project.videoURL); },
    openProject(id) { const project = projects().find(project => project.perma === id); if (project && rail()) { work.set("Work/project", project); work.set("WorkItems/videoURL", project.videoURL); work.navigate?.("work/" + project.perma); } },
    showWork() { work.set("ViewController/contact", false); work.set("Work/project", null); work.fire("ViewController/goToWork"); },
    toggleContact() { work.set("ViewController/contact", !contact); },
    setActive(active, visible = true) { requestedActive = active; windowVisible = visible; syncActivity(); },
    subscribe(listener) {
      listeners.add(listener);
      listener({ ...state, contact });
      return () => listeners.delete(listener);
    },
    get video() { return video?.video?.video ?? work?.get?.("Work/video", true)?.video?.video ?? null; },
    get snapshot() { return { ...state }; },
    get isSwitching() { return switching || state.navigationEntry === true; },
    navigate(direction) {
      if (state.phase !== "open" || (direction !== -1 && direction !== 1)) return false;
      const currentIndex = index();
      const target = currentIndex >= 0 ? projects()[currentIndex + direction] : null;
      if (!target) return false;
      switching = true;
      try {
        work.set("Work/project", target);
        work.set("WorkItems/videoURL", target.videoURL);
        work.navigate?.("work/" + target.perma);
      } finally { switching = false; }
      return true;
    },
    closeWindow() {
      if (state.phase !== "open") return;
      state.smallWindow = false;
      notify();
    },
    back() {
      if (state.phase !== "open") return;
      work.set("Work/project", null);
    },
    geometry() {
      if (!camera || !foreground) return null;
      const top = new Vector3(-foreground.scale.x / 2, foreground.scale.y / 2, foreground.position.z).project(camera.camera);
      const bottom = new Vector3(foreground.scale.x / 2, -foreground.scale.y / 2, foreground.position.z).project(camera.camera);
      const input = document.querySelector('[data-preacherman-chat] textarea');
      const rect = input?.getBoundingClientRect();
      const left = (top.x + 1) * Stage.width / 2;
      const value = left + "px";
      const style = window.document.documentElement.style;
      if (style.getPropertyValue("--gallery-detail-video-left") !== value) style.setProperty("--gallery-detail-video-left", value);
      return {
        left,
        top: (1 - top.y) * Stage.height / 2,
        width: (bottom.x - top.x) * Stage.width / 2,
        height: (top.y - bottom.y) * Stage.height / 2,
        backBottom: rect ? Stage.height - rect.bottom : 48,
        backHeight: rect?.height || 48,
      };
    },
    attachContent(content, sharedVideo) {
      video = sharedVideo;
      foreground = Utils3D.cloneTransform(content.layers.video);
      camera = content.get("WorkDetail/camera");
      // Use the back wall, leaving the textured side walls in view. The existing
      // tPrevFrame feedback still receives this video and creates the reflections.
      const resize = () => {
        const height = (5 + 1.4 * Math.tan(Math.radians(camera.camera.fov / 2))) * .86;
        content.layers.video.position.set(0, 0, -.7);
        content.layers.video.scale.set(height * Stage.width / Stage.height, height, 1);
      };
      content.onResize(resize);
      resize();
      notify();
    },
    attach(instance) {
      work = instance;
      syncRail();
      work.bind("ViewController/contact", value => { contact = Boolean(value); notify(); });
      work.startRender(() => {
        const items = work.get?.("WorkItems/items", true) || projects();
        const signature = items.map(item => item.perma).join("|");
        if (signature !== railSignature) {
          railSignature = signature;
          railCards = items.map(item => ({ id: item.perma, title: item.title, client: item.clientName || "", thumbnail: new URL(window.PreachermanGalleryRailAssets?.[item.thumbnailURL] || item.thumbnailURL, document.baseURI).href, video: window.PreachermanGalleryRailMedia?.[item.videoURL], logo: window.PreachermanGalleryRailMedia?.[item.projectLogo?.url], color: "#" + (item.color || "ffffff") }));
          railListeners.forEach(listener => listener(railCards));
        }
        if (state.phase !== "closed") restoreRail();
        if (!warmed) {
          const view = work.findParent("ViewController");
          warmed = view.flag?.("__ready") && view.uniforms?.uVisible?.value >= 0.9999;
        }
        syncRail();
        syncActivity();
      });
      work.bind("Work/project", data => {
        clearTimeout(exitTimer);
        if (data) {
          if (state.phase === "closed") savedScroll = controller()?.scroll;
          state = { phase: "open", project: data.perma, title: data.title, poster: data.thumbnailURL || "", smallWindow: true, navigationEntry: switching || (state.phase === "open" && state.navigationEntry === true),
            hasPrevious: projects().findIndex(project => project.perma === data.perma) > 0,
            hasNext: projects().findIndex(project => project.perma === data.perma) >= 0 && projects().findIndex(project => project.perma === data.perma) < projects().length - 1 };
          notify();
        } else if (state.phase !== "closed") {
          state.phase = "closing";
          notify();
          // Restore the rail before the existing camera return transition runs.
          restoreRail();
          exitTimer = setTimeout(() => {
            restoreRail();
            state = { phase: "closed", project: "", title: "", smallWindow: true };
            notify();
          }, 820);
        }
      });
    },
  };
  window.addEventListener("pagehide", () => {
    clearTimeout(exitTimer);
    document.removeEventListener("visibilitychange", syncActivity);
    pausedMedia.clear();
    window.removeEventListener("wheel", preventDetailWheel, true);
    listeners.clear(); railListeners.clear(); inputListeners.clear();
    inputEvents.forEach(type => window.removeEventListener(type, input, true));
  });
})();
