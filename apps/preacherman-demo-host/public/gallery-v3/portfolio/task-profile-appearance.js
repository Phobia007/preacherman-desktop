// The lens retains the authored motion; only its compositing and ink follow the room.
// Refresh existing GPU text on a theme switch without rasterizing every frame.
export function syncTaskProfileAppearance(folio) {
  const root = document.documentElement;
  const appearance = root.dataset.galleryAppearance === "light" ? "light" : "dark";
  const ink = root.style.getPropertyValue("--gallery-host-text");
  const key = `${appearance}:${ink}:${folio.overlay.length}:${folio.hud.length}`;
  if (folio.taskProfileAppearanceKey === key) return;
  folio.taskProfileAppearanceKey = key;
  folio.core.post.u.u_daylight.value = appearance === "light" ? 1 : 0;
  for (const text of [...folio.overlay, ...folio.hud]) {
    if (!text.el?.isConnected) continue;
    text.setColor(getComputedStyle(text.el).color);
  }
}
