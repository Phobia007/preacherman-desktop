/** Rasterize the five imported image/text sections at their current DOM positions.
 * Canvas belongs to the iframe so it uses its already-loaded local fonts. No screen
 * capture permission, external renderer, screenshot asset or network service.
 */
export async function captureMarketFrame(frame: HTMLIFrameElement, signal: AbortSignal) {
  const doc = frame.contentDocument;
  const view = doc?.defaultView;
  if (!doc || !view || !doc.getElementById("main")) throw new Error("Market is not ready.");
  const images = [...doc.querySelectorAll<HTMLImageElement>("#main img")];
  const visibleImages = images.filter(image => {
    const box = image.getBoundingClientRect();
    return box.bottom > 0 && box.top < frame.clientHeight;
  });
  let deadline: number | undefined;
  let cancel: () => void = () => {};
  try {
    await Promise.race([
      Promise.all([doc.fonts.ready, ...visibleImages.map(image => image.decode())]),
      new Promise<never>((_, reject) => {
        cancel = () => reject(new DOMException("Capture cancelled", "AbortError"));
        signal.addEventListener("abort", cancel, { once: true });
        if (signal.aborted) cancel();
        deadline = window.setTimeout(() => reject(new Error("Market assets did not become ready.")), 5000);
      }),
    ]);
  } finally {
    window.clearTimeout(deadline);
    signal.removeEventListener("abort", cancel);
  }
  if (signal.aborted) throw new DOMException("Capture cancelled", "AbortError");

  const canvas = doc.createElement("canvas");
  const stage = frame.parentElement!;
  canvas.width = stage.clientWidth;
  canvas.height = stage.clientHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas rendering is unavailable.");
  const offsetX = frame.offsetLeft, offsetY = frame.offsetTop;
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.beginPath();
  ctx.rect(0, 0, frame.clientWidth, frame.clientHeight);
  ctx.clip();

  for (const image of visibleImages) {
    const box = image.getBoundingClientRect();
    const scale = Math.max(box.width / image.naturalWidth, box.height / image.naturalHeight);
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    ctx.save();
    ctx.beginPath(); ctx.rect(box.x, box.y, box.width, box.height); ctx.clip();
    ctx.drawImage(image, box.x + (box.width - width) / 2, box.y + (box.height - height) / 2, width, height);
    ctx.restore();
  }

  const paintText = (root: Element) => {
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const range = doc.createRange();
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      const text = node.textContent || "";
      if (!parent || !text.trim() || parent.closest(".sr-only,script,style")) continue;
      const style = view.getComputedStyle(parent);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue;
      const bounds = parent.getBoundingClientRect();
      if (bounds.bottom < 0 || bounds.top > frame.clientHeight) continue;
      ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      ctx.fillStyle = style.color;
      ctx.textBaseline = "alphabetic";
      const metrics = ctx.measureText("Mg");
      const ascent = metrics.fontBoundingBoxAscent;
      const descent = metrics.fontBoundingBoxDescent;
      for (let index = 0; index < text.length; index++) {
        if (/\s/.test(text[index])) continue;
        range.setStart(node, index); range.setEnd(node, index + 1);
        const box = range.getBoundingClientRect();
        if (box.bottom <= 0 || box.top >= frame.clientHeight || box.width <= 0) continue;
        const char = style.textTransform === "uppercase" ? text[index].toUpperCase() : style.textTransform === "lowercase" ? text[index].toLowerCase() : text[index];
        ctx.fillText(char, box.x, box.y + (box.height - ascent - descent) / 2 + ascent);
      }
    }
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  };
  paintText(doc.getElementById("main")!);

  // Link underlines move with the page; the host keeps its boundary fixed.
  for (const element of doc.querySelectorAll<HTMLElement>("#main .link")) {
    const box = element.getBoundingClientRect(), style = view.getComputedStyle(element);
    if (box.bottom < 0 || box.top > frame.clientHeight) continue;
    const border = parseFloat(style.borderBottomWidth);
    if (border > 0) { ctx.fillStyle = style.borderBottomColor; ctx.fillRect(box.left, box.bottom - border, box.width, border); }
    const after = view.getComputedStyle(element, "::after");
    const height = parseFloat(after.height);
    if (element.matches(".link") && after.content !== "none" && height > 0) {
      ctx.fillStyle = after.backgroundColor;
      ctx.fillRect(box.left, box.bottom - height, box.width, height);
    }
  }
  ctx.restore();
  // Include the same frosted header in the spatial logo snapshot.
  const source = doc.createElement("canvas");
  source.width = canvas.width; source.height = canvas.height;
  source.getContext("2d")!.drawImage(canvas, 0, 0);
  const header = getComputedStyle(stage, "::before");
  const height = parseFloat(header.height);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, canvas.width, height); ctx.clip();
  ctx.clearRect(0, 0, canvas.width, height);
  ctx.filter = header.backdropFilter; ctx.drawImage(source, 0, 0); ctx.filter = "none";
  ctx.fillStyle = header.backgroundColor; ctx.fillRect(0, 0, canvas.width, height);
  ctx.restore();
  return canvas;
}
