/** A card owns its muted preview only while it is visible in the active Gallery. */
export function manageGalleryCardMedia(video: HTMLVideoElement, src: string) {
  let active = false, disposed = false;
  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "none";
  video.crossOrigin = "anonymous";
  return {
    setActive(next: boolean) {
      if (disposed || next === active) return;
      active = next;
      if (!next) { video.pause(); return; }
      if (!video.getAttribute("src")) video.src = src;
      void video.play().catch(() => { /* Keep the authored cover if decoding fails. */ });
    },
    dispose() {
      disposed = true;
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
    },
  };
}
