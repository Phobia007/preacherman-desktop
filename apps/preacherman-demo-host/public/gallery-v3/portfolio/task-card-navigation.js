// The same registry/FLIP flight used by the neighboring sheet tabs, including
// query-backed custom tasks and destinations beyond the adjacent pair.
export function taskCardId(path) {
  const [pathname, query = ""] = String(path ?? "").split("?");
  const slug = pathname.match(/^\/projects\/([^/?#]+)/)?.[1];
  return slug ? new URLSearchParams(query).get("task") || slug : null;
}
export function prepareTaskCardNavigation(folio, from, to) {
  folio.taskJump = null;
  const source = taskCardId(from), target = taskCardId(to);
  if (!source || !target || source === target) return;
  const items = folio.taskOrder?.map(id => folio.items.get(id)).filter(Boolean) ?? [...folio.items.values()];
  const sourceIndex = items.findIndex(item => item.slug === source), targetIndex = items.findIndex(item => item.slug === target);
  if (sourceIndex < 0 || targetIndex < 0 || !items.length) return;
  const sheet = folio.hero?.el;
  if (!sheet?.isConnected) return;
  const main = sheet.closest("main");
  const neighbors = [...main.querySelectorAll('[data-gl="related"]')];
  if (neighbors.some(el => el.dataset.id === target)) return;
  const direction = targetIndex > sourceIndex ? 1 : -1;
  const slot = neighbors[direction > 0 ? 1 : 0];
  if (!slot) return;
  const ghost = slot.cloneNode(false);
  ghost.dataset.id = target;
  ghost.style.pointerEvents = "none";
  main.append(ghost);
  const previous = folio.reg.get(target);
  if (previous) folio.reg.retire(previous);
  const entry = folio.reg.ensure({id:target, el:ghost, make:() => folio.spawn(ghost, items[targetIndex])});
  entry.slug = target; entry.item = items[targetIndex];
  folio.settle(entry);
  folio.taskJump = {source, target, direction};
}

export function appendTaskOutgoingSlot(folio, main, target) {
  const jump = folio.taskJump;
  if (jump?.target !== target) return;
  const slot = document.createElement("div");
  slot.className = "invisible fixed inset-y-20 inset-x-50 rounded-20 opacity-30";
  slot.dataset.gl = "related"; slot.dataset.id = jump.source;
  slot.style.transform = `translateX(${jump.direction * -120}vw)`;
  slot.style.pointerEvents = "none";
  main.append(slot);
}
