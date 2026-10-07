/** Wheel units vary across mice and trackpads. Keep zoom within the authored frames. */
export function zoomCompanion(current: number, delta: number, mode = 0) {
  const pixels = delta * (mode === 1 ? 16 : mode === 2 ? 600 : 1);
  return Math.max(0, Math.min(1, current - pixels / 700));
}

export function rotateCompanion(current: number, horizontalPixels: number, viewportWidth: number) {
  return current + horizontalPixels / Math.max(1, viewportWidth) * Math.PI * 3;
}
