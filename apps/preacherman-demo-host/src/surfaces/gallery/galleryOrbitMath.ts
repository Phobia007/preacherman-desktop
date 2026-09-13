// The camera and companion stay fixed. Scrolling lifts this helix around them.
export function galleryOrbitPose(index: number, scroll: number, entry: number, count = 0) {
  let offset = index - scroll;
  if (count > 0) offset -= Math.round(offset / count) * count;
  const remaining = 1 - entry;
  const angle = Math.PI - offset * 0.95 - remaining * Math.PI * 1.35;
  return {
    x: Math.sin(angle) * .78,
    y: 1.22 - offset * 0.19 - remaining * 1.65,
    z: Math.cos(angle) * 0.62,
    yaw: Math.sin(angle) * 0.42,
    scale: .76 * Math.min(1, Math.max(0, (3.7 - offset) / .6), Math.max(0, (offset + 1.8) / .5)),
    visible: offset > -1.8 && offset < 3.7,
  };
}

export function galleryEntryProgress(elapsed: number, reducedMotion: boolean) {
  if (reducedMotion) return 1;
  const t = Math.min(1, Math.max(0, elapsed / 1.85));
  return 1 - Math.pow(1 - t, 3);
}
