import {
  type RefObject,
  useEffect,
} from "react";
import {
  BINARY_RAIN_OPTIONS,
  RAIN_RENDER_SCALE,
  getHorizontalProfile,
  type BinaryRainOptions,
  type OpacityProfile,
} from "../config/binaryRainConfig";
import type { HomeVisualTheme } from "../config/sceneTheme";

type RainLayer = "edge" | "glow" | "sharp";

export interface BinaryRainCanvasRefs {
  readonly edge: RefObject<HTMLCanvasElement | null>;
  readonly glow: RefObject<HTMLCanvasElement | null>;
  readonly sharp: RefObject<HTMLCanvasElement | null>;
}

interface RainGlyph {
  value: "0" | "1";
  glow: boolean;
}

interface RainColumn {
  x: number;
  y: number;
  length: number;
  fontSize: number;
  opacity: number;
  blur: number;
  profile: OpacityProfile;
  glyphs: RainGlyph[];
}

const OPACITY_PROFILES: readonly OpacityProfile[] = [
  "top-bright",
  "bottom-bright",
  "center-bright",
  "center-dim",
];

function randomBetween(minimum: number, maximum: number): number {
  return minimum + Math.random() * (maximum - minimum);
}

function makeGlyphs(length: number, glowChance: number): RainGlyph[] {
  return Array.from({ length }, () => ({
    value: Math.random() > 0.5 ? "1" : "0",
    glow: Math.random() < glowChance,
  }));
}

function createColumns(
  width: number,
  height: number,
  options: BinaryRainOptions,
): RainColumn[] {
  const columns: RainColumn[] = [];
  let x = 0;

  while (x <= width + options.edgeSpacing) {
    const horizontal = getHorizontalProfile(x, width, options);
    const length = Math.round(
      randomBetween(options.minLength, options.maxLength),
    );

    columns.push({
      x,
      y: randomBetween(0, height),
      length,
      fontSize: randomBetween(options.fontSizeMin, options.fontSizeMax),
      opacity: horizontal.opacity * randomBetween(0.72, 1),
      blur: horizontal.blur,
      profile:
        OPACITY_PROFILES[
          Math.floor(Math.random() * OPACITY_PROFILES.length)
        ] ?? "center-bright",
      glyphs: makeGlyphs(length, options.glowChance),
    });

    x += Math.max(
      options.centerSpacing * 0.72,
      horizontal.spacing * randomBetween(0.84, 1.16),
    );
  }

  return columns;
}

function verticalOpacity(
  profile: OpacityProfile,
  index: number,
  length: number,
): number {
  const progress = length <= 1 ? 1 : index / (length - 1);

  switch (profile) {
    case "top-bright":
      return 1 - progress * 0.78;
    case "bottom-bright":
      return 0.22 + progress * 0.78;
    case "center-dim":
      return 0.38 + Math.abs(progress - 0.5) * 0.8;
    case "center-bright":
    default:
      return 0.28 + (1 - Math.abs(progress - 0.5) * 2) * 0.72;
  }
}

function prepareCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): CanvasRenderingContext2D | null {
  canvas.width = Math.max(1, Math.round(width * RAIN_RENDER_SCALE));
  canvas.height = Math.max(
    1,
    Math.round(height * 2 * RAIN_RENDER_SCALE),
  );
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height * 2}px`;

  const context = canvas.getContext("2d");
  context?.setTransform(
    RAIN_RENDER_SCALE,
    0,
    0,
    RAIN_RENDER_SCALE,
    0,
    0,
  );
  return context;
}

function drawTrail(
  context: CanvasRenderingContext2D,
  layer: RainLayer,
  column: RainColumn,
  height: number,
  options: BinaryRainOptions,
): void {
  const trailLength = (column.length - 1) * column.fontSize * 1.14;

  for (const offset of [-height, 0, height, height * 2]) {
    const trailBottom = column.y + column.fontSize + offset;
    const trailTop = trailBottom - trailLength;
    if (trailBottom < 0 || trailTop > height * 2) continue;

    const trail = context.createLinearGradient(
      column.x,
      trailTop,
      column.x,
      trailBottom,
    );
    trail.addColorStop(0, "transparent");
    trail.addColorStop(0.44, options.baseColor);
    trail.addColorStop(1, options.accentColor);
    context.globalAlpha =
      column.opacity * (layer === "edge" ? 0.56 : 0.2);
    context.filter =
      layer === "edge"
        ? `blur(${Math.max(0.8, column.blur * 0.54)}px)`
        : "none";
    context.fillStyle = trail;
    context.fillRect(
      column.x - (layer === "edge" ? 0.65 : 0.35),
      trailTop,
      layer === "edge" ? 1.3 : 0.7,
      trailBottom - trailTop,
    );
  }
}

function drawLayer(
  context: CanvasRenderingContext2D,
  layer: RainLayer,
  columns: readonly RainColumn[],
  width: number,
  height: number,
  options: BinaryRainOptions,
): void {
  context.clearRect(0, 0, width, height * 2);
  context.textAlign = "center";
  context.textBaseline = "top";

  for (const column of columns) {
    context.font = `${column.fontSize}px ui-monospace, SFMono-Regular, Consolas, monospace`;

    if (layer === "edge" || layer === "sharp") {
      drawTrail(context, layer, column, height, options);
    }
    if (layer === "edge") continue;

    for (let index = 0; index < column.glyphs.length; index += 1) {
      const glyph = column.glyphs[index];
      if (!glyph || (layer === "glow" && !glyph.glow)) continue;

      const step = column.fontSize * 1.14;
      const rawY = column.y - index * step;
      const glyphY = ((rawY % height) + height) % height;
      const opacity =
        column.opacity
        * verticalOpacity(column.profile, index, column.glyphs.length);

      if (layer === "glow") {
        context.globalAlpha = Math.min(1, opacity * 1.35);
        context.filter = "blur(2px)";
        context.fillStyle = options.glowColor;
      } else {
        context.globalAlpha = opacity;
        context.filter = "none";
        context.fillStyle = glyph.glow
          ? options.accentColor
          : options.baseColor;
      }

      context.fillText(glyph.value, column.x, glyphY);
      context.fillText(glyph.value, column.x, glyphY + height);
    }
  }

  context.globalAlpha = 1;
  context.filter = "none";
}

export function useBinaryRain(
  refs: BinaryRainCanvasRefs,
  theme: HomeVisualTheme,
): void {
  useEffect(() => {
    const canvases = {
      edge: refs.edge.current,
      glow: refs.glow.current,
      sharp: refs.sharp.current,
    };
    const scene = canvases.sharp?.parentElement;

    if (!canvases.edge || !canvases.glow || !canvases.sharp || !scene) {
      return undefined;
    }

    const renderCanvases: Record<RainLayer, HTMLCanvasElement> = {
      edge: canvases.edge,
      glow: canvases.glow,
      sharp: canvases.sharp,
    };
    const options = BINARY_RAIN_OPTIONS[theme];
    let renderedWidth = 0;
    let renderedHeight = 0;

    const render = () => {
      const bounds = scene.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds.width));
      const height = Math.max(1, Math.round(bounds.height));
      if (width === renderedWidth && height === renderedHeight) return;

      renderedWidth = width;
      renderedHeight = height;
      const columns = createColumns(width, height, options);

      (Object.keys(renderCanvases) as RainLayer[]).forEach((layer) => {
        const context = prepareCanvas(renderCanvases[layer], width, height);
        if (context) {
          drawLayer(context, layer, columns, width, height, options);
        }
      });
    };

    const observer = new ResizeObserver(render);
    observer.observe(scene);
    render();

    return () => observer.disconnect();
  }, [refs.edge, refs.glow, refs.sharp, theme]);
}
