type Box = { x: number; y: number; width: number; height: number };
type Mapping = { x: number; y: number; sx: number; sy: number };
const intersect = (a: Box, b: Box): Box => ({
  x: Math.max(a.x, b.x), y: Math.max(a.y, b.y),
  width: Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
  height: Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
});

/** Capture only visible foreground elements, including local imported iframe content.
 * No cloned document, CSS serialization, screen permission or background/model capture.
 * Offscreen subtrees are pruned before collecting text or decoding icons.
 */
export async function captureSurfaceContent(stage: HTMLElement, signal: AbortSignal): Promise<HTMLCanvasElement> {
  const cancelled = () => { if (signal.aborted) throw new DOMException("Capture cancelled", "AbortError"); };
  cancelled();
  const canvas = document.createElement("canvas"), bounds = stage.getBoundingClientRect();
  canvas.width = stage.clientWidth; canvas.height = stage.clientHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx || !bounds.width || !bounds.height) throw new Error("Surface capture is unavailable.");
  const headerHeight = stage.querySelector(".demo-surface-header")?.getBoundingClientRect().height || 100;
  const sx = canvas.width / bounds.width, sy = canvas.height / bounds.height;
  const viewport: Box = { x: 0, y: headerHeight * sy, width: canvas.width, height: canvas.height - headerHeight * sy };
  const commands: (() => void)[] = [], icons: Promise<void>[] = [];
  const rectangle = (rect: DOMRect, map: Mapping): Box => ({
    x: (rect.left * map.sx + map.x - bounds.left) * sx,
    y: (rect.top * map.sy + map.y - bounds.top) * sy,
    width: rect.width * map.sx * sx, height: rect.height * map.sy * sy,
  });
  const paint = (clip: Box, alpha: number, render: () => void) => commands.push(() => {
    ctx.save(); ctx.beginPath(); ctx.rect(clip.x, clip.y, clip.width, clip.height); ctx.clip();
    ctx.globalAlpha = alpha; render(); ctx.restore();
  });
  const walk = (element: Element, clip: Box, map: Mapping, opacity: number) => {
    cancelled();
    if (element.matches("script, style, link, noscript, [hidden], .market-profile, .demo-surface-header")) return;
    const doc = element.ownerDocument, view = doc.defaultView!;
    const style = view.getComputedStyle(element), rect = rectangle(element.getBoundingClientRect(), map);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return;
    const visible = intersect(clip, rect);
    if (rect.width > 0 && rect.height > 0 && (visible.width <= 0 || visible.height <= 0)) return;
    const alpha = opacity * Number(style.opacity || 1), scale = sx * map.sx;
    const radius = Math.min(parseFloat(style.borderRadius) * scale || 0, rect.width / 2, rect.height / 2);
    paint(clip, alpha, () => {
      ctx.beginPath(); ctx.roundRect(rect.x, rect.y, Math.max(0, rect.width), Math.max(0, rect.height), radius);
      ctx.fillStyle = style.backgroundColor; ctx.fill();
      const border = parseFloat(style.borderTopWidth) * scale;
      if (border > 0 && style.borderTopStyle !== "none") {
        ctx.lineWidth = border; ctx.strokeStyle = style.borderTopColor; ctx.stroke();
      }
    });
    if (style.overflowX !== "visible" || style.overflowY !== "visible") clip = intersect(clip, rect);
    if (clip.width <= 0 || clip.height <= 0) return;
    if (element.tagName === "IFRAME") {
      const frame = element as HTMLIFrameElement;
      let body: HTMLElement | null = null;
      try { body = frame.contentDocument?.body ?? null; } catch { return; }
      if (body && frame.clientWidth && frame.clientHeight) {
        const box = frame.getBoundingClientRect();
        walk(body, intersect(clip, rect), {
          x: map.x + box.left * map.sx, y: map.y + box.top * map.sy,
          sx: map.sx * box.width / frame.clientWidth, sy: map.sy * box.height / frame.clientHeight,
        }, alpha);
      }
      return;
    }
    if (element.tagName === "IMG") {
      const image = element as HTMLImageElement;
      if (image.complete && image.naturalWidth) paint(intersect(clip, rect), alpha, () => {
        const fit = style.objectFit;
        const ratio = (fit === "cover" ? Math.max : Math.min)(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
        const width = fit === "fill" ? rect.width : image.naturalWidth * ratio;
        const height = fit === "fill" ? rect.height : image.naturalHeight * ratio;
        const [horizontal = "50%", vertical = "50%"] = style.objectPosition.split(" ");
        const position = (value: string) => value.endsWith("%") ? parseFloat(value) / 100 : value === "bottom" || value === "right" ? 1 : value === "top" || value === "left" ? 0 : .5;
        ctx.filter = style.filter;
        ctx.drawImage(image, rect.x + (rect.width - width) * position(horizontal), rect.y + (rect.height - height) * position(vertical), width, height);
      });
      return;
    }
    if (element.tagName.toLowerCase() === "svg") {
      const svg = element.cloneNode(true) as SVGElement;
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      svg.setAttribute("width", String(rect.width)); svg.setAttribute("height", String(rect.height));
      svg.style.color = style.color; svg.style.fill = style.fill; svg.style.stroke = style.stroke;
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
      icons.push(image.decode().catch(() => {}));
      paint(clip, alpha, () => { if (image.complete && image.naturalWidth) ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height); });
      return;
    }
    const font = `${style.fontStyle} ${style.fontWeight} ${parseFloat(style.fontSize) * scale}px ${style.fontFamily}`;
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      const field = element as HTMLInputElement;
      paint(clip, alpha, () => {
        ctx.font = font; ctx.textBaseline = "middle";
        ctx.fillStyle = field.value ? style.color : view.getComputedStyle(element, "::placeholder").color;
        ctx.fillText(field.value || field.placeholder, rect.x + parseFloat(style.paddingLeft) * scale, rect.y + rect.height / 2, rect.width);
      });
    }
    for (const node of element.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
      const text = node.textContent, range = doc.createRange();
      // Range per word keeps authored wrapping without thousands of per-letter reads.
      for (const match of text.matchAll(/\S+/g)) {
        range.setStart(node, match.index!); range.setEnd(node, match.index! + match[0].length);
        const box = rectangle(range.getBoundingClientRect(), map);
        if (intersect(clip, box).height <= 0 || !box.width) continue;
        paint(clip, alpha, () => {
          ctx.font = font; ctx.fillStyle = style.color; ctx.textBaseline = "alphabetic";
          const metrics = ctx.measureText("Mg"), ascent = metrics.fontBoundingBoxAscent, descent = metrics.fontBoundingBoxDescent;
          const word = style.textTransform === "uppercase" ? match[0].toUpperCase() : style.textTransform === "lowercase" ? match[0].toLowerCase() : match[0];
          ctx.fillText(word, box.x, box.y + (box.height - ascent - descent) / 2 + ascent);
        });
      }
    }
    const children = Array.from(element.children);
    children.sort((a, b) => (parseInt(view.getComputedStyle(a).zIndex) || 0) - (parseInt(view.getComputedStyle(b).zIndex) || 0));
    for (const child of children) walk(child, clip, map, alpha);
  };
  const content = stage.querySelector(".demo-frosted-surface__content");
  if (!content) throw new Error("Surface content is not ready.");
  walk(content, viewport, { x: 0, y: 0, sx: 1, sy: 1 }, 1);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([Promise.all(icons), new Promise(resolve => { timer = setTimeout(resolve, 350); })]); }
  finally { clearTimeout(timer); }
  cancelled();
  for (const command of commands) command();
  return canvas;
}
