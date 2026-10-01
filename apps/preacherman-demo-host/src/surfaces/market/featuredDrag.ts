/** Add pointer movement to the ribbon's clock without pausing its automatic travel. */
export function bindFeaturedDrag(host: HTMLElement, move: (stagePixels: number) => void, active: () => boolean) {
  let pointer: { id: number; start: number; last: number; moved: boolean; button: HTMLButtonElement | null } | null = null;
  const cancel = () => {
    const previous = pointer; pointer = null; delete host.dataset.dragging;
    if (previous && host.hasPointerCapture(previous.id)) host.releasePointerCapture(previous.id);
  };
  const down = (event: PointerEvent) => {
    if (!active() || !event.isPrimary || event.button !== 0 || pointer) return;
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>(".market-search-promos__card") : null;
    pointer = { id: event.pointerId, start: event.clientX, last: event.clientX, moved: false, button };
    // Pointer focus must not trigger the keyboard-only pause or select text while dragging.
    event.preventDefault();
    if (document.activeElement instanceof HTMLElement && host.contains(document.activeElement)) document.activeElement.blur();
    host.setPointerCapture(event.pointerId);
  };
  const drag = (event: PointerEvent) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    if (!active()) { cancel(); return; }
    if (!pointer.moved && Math.abs(event.clientX - pointer.start) < 4) return;
    pointer.moved = true; host.dataset.dragging = "true";
    const delta = event.clientX - pointer.last; pointer.last = event.clientX;
    const width = host.getBoundingClientRect().width;
    if (width > 0) move(delta * host.clientWidth / width);
    event.preventDefault();
  };
  const up = (event: PointerEvent) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const clicked = !pointer.moved && active() ? pointer.button : null;
    cancel();
    // Capturing on the strip keeps drags stable across moving cards; a tap still selects its card.
    clicked?.click();
  };
  const interrupted = (event: PointerEvent) => { if (pointer?.id === event.pointerId) cancel(); };
  const click = (event: MouseEvent) => {
    // Pointer taps are dispatched above. Block the native follow-up click after every drag.
    if (event.detail > 0) { event.preventDefault(); event.stopPropagation(); }
  };
  host.addEventListener("pointerdown", down);
  host.addEventListener("pointermove", drag);
  host.addEventListener("pointerup", up);
  host.addEventListener("pointercancel", interrupted);
  host.addEventListener("lostpointercapture", interrupted);
  host.addEventListener("click", click, true);
  window.addEventListener("blur", cancel);
  return { cancel, dispose() {
    cancel();
    host.removeEventListener("pointerdown", down);
    host.removeEventListener("pointermove", drag);
    host.removeEventListener("pointerup", up);
    host.removeEventListener("pointercancel", interrupted);
    host.removeEventListener("lostpointercapture", interrupted);
    host.removeEventListener("click", click, true);
    window.removeEventListener("blur", cancel);
  } };
}
