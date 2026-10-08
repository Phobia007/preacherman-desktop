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
  // Profile copy comes from hydrated SSR markup: it can retain the authored
  // white CSS even though the host changed theme. Use the host's semantic ink.
  for (const text of folio.overlay) {
    if (!text.el?.isConnected) continue;
    text.setColor(ink || getComputedStyle(text.el).color);
  }
  for (const text of folio.hud) {
    if (!text.el?.isConnected) continue;
    text.setColor(getComputedStyle(text.el).color);
  }
}
