/** Supply the existing profile lens with the live Search layout, including its input. */
export async function captureMarketSearch(panel: HTMLElement, signal: AbortSignal) {
  const stage = panel.parentElement!, bounds = stage.getBoundingClientRect();
  const sx = stage.clientWidth / bounds.width, sy = stage.clientHeight / bounds.height;
  const images = [...panel.querySelectorAll<HTMLImageElement>("img")].filter(image => {
    const box = image.getBoundingClientRect();
    return box.width > 0 && box.bottom > bounds.top && box.top < bounds.bottom && getComputedStyle(image).visibility !== "hidden" && !image.closest('[data-visible="false"]');
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([Promise.all(images.map(image => image.decode().catch(() => {}))), new Promise(resolve => { timer = setTimeout(resolve, 1500); })]); }
  finally { clearTimeout(timer); }
  if (signal.aborted) throw new DOMException("Capture cancelled", "AbortError");
  const canvas = document.createElement("canvas");
  canvas.width = stage.clientWidth; canvas.height = stage.clientHeight;
  const ctx = canvas.getContext("2d")!;
  const view = panel.getBoundingClientRect();
  ctx.beginPath(); ctx.rect(0, (view.top - bounds.top) * sy, canvas.width, view.height * sy); ctx.clip();
  for (const image of images) {
    if (!image.complete || !image.naturalWidth) continue;
    const box = image.getBoundingClientRect();
    const scale = Math.max(box.width / image.naturalWidth, box.height / image.naturalHeight);
    const sourceWidth = box.width / scale, sourceHeight = box.height / scale;
    ctx.save(); ctx.beginPath();
    ctx.roundRect((box.left - bounds.left) * sx, (box.top - bounds.top) * sy, box.width * sx, box.height * sy, image.closest(".market-search-promos__card") ? 14 : 0); ctx.clip();
    ctx.drawImage(image, (image.naturalWidth - sourceWidth) / 2, (image.naturalHeight - sourceHeight) / 2, sourceWidth, sourceHeight,
      (box.left - bounds.left) * sx, (box.top - bounds.top) * sy, box.width * sx, box.height * sy);
    ctx.restore();
  }
  const form = panel.querySelector<HTMLFormElement>("form")!, field = panel.querySelector<HTMLInputElement>("input")!;
  const box = form.getBoundingClientRect(), style = getComputedStyle(form);
  ctx.beginPath(); ctx.roundRect((box.left - bounds.left) * sx, (box.top - bounds.top) * sy, box.width * sx, box.height * sy, box.height * sy / 2);
  ctx.fillStyle = style.backgroundColor; ctx.fill(); ctx.strokeStyle = style.borderColor; ctx.lineWidth = 1; ctx.stroke();
  const fieldBox = field.getBoundingClientRect(), ink = getComputedStyle(field);
  ctx.font = `${ink.fontWeight} ${parseFloat(ink.fontSize)}px ${ink.fontFamily}`;
  ctx.fillStyle = field.value ? ink.color : getComputedStyle(field, "::placeholder").color; ctx.textBaseline = "middle";
  ctx.fillText(field.value || field.placeholder, (fieldBox.left - bounds.left) * sx, (fieldBox.top + fieldBox.height / 2 - bounds.top) * sy, fieldBox.width * sx);
  const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT), range = document.createRange();
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement, text = node.textContent || "";
    if (!parent || !text.trim() || parent.closest("svg, .market-search__announcement, .market-search__image-error")) continue;
    const ink = getComputedStyle(parent), box = parent.getBoundingClientRect();
    if (!box.width || box.bottom <= view.top || box.top >= view.bottom || ink.visibility === "hidden" || parent.closest('[data-visible="false"], [aria-hidden="true"]')) continue;
    ctx.font = `${ink.fontWeight} ${parseFloat(ink.fontSize)}px ${ink.fontFamily}`; ctx.fillStyle = ink.color; ctx.textBaseline = "alphabetic";
    const { fontBoundingBoxAscent: ascent, fontBoundingBoxDescent: descent } = ctx.measureText("Mg");
    for (let i = 0; i < text.length; i++) {
      if (/\s/.test(text[i])) continue;
      range.setStart(node, i); range.setEnd(node, i + 1);
      const rect = range.getBoundingClientRect();
      if (!rect.width) continue;
      ctx.fillText(ink.textTransform === "uppercase" ? text[i].toUpperCase() : text[i], (rect.left - bounds.left) * sx, (rect.top - bounds.top) * sy + (rect.height * sy - ascent - descent) / 2 + ascent);
    }
  }
  return canvas;
}
