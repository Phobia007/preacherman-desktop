import type { HomeVisualTheme } from "./sceneTheme";

export type OpacityProfile =
  | "top-bright"
  | "bottom-bright"
  | "center-bright"
  | "center-dim";

export interface BinaryRainOptions {
  readonly baseColor: string;
  readonly accentColor: string;
  readonly glowColor: string;
  readonly centerSpacing: number;
  readonly edgeSpacing: number;
  readonly centerOpacity: number;
  readonly edgeOpacity: number;
  readonly centerBlur: number;
  readonly edgeBlur: number;
  readonly minLength: number;
  readonly maxLength: number;
  readonly fontSizeMin: number;
  readonly fontSizeMax: number;
  readonly glowChance: number;
}

export const DARK_BINARY_RAIN_OPTIONS: BinaryRainOptions = {
  baseColor: "rgb(151 174 190)",
  accentColor: "rgb(196 216 228)",
  glowColor: "rgb(206 229 239)",
  centerSpacing: 4,
  edgeSpacing: 14,
  centerOpacity: 0.32,
  edgeOpacity: 0.012,
  centerBlur: 0,
  edgeBlur: 9,
  minLength: 24,
  maxLength: 68,
  fontSizeMin: 7,
  fontSizeMax: 11,
  glowChance: 0.055,
};

export const LIGHT_BINARY_RAIN_OPTIONS: BinaryRainOptions = {
  baseColor: "rgb(78 75 72)",
  accentColor: "rgb(43 41 39)",
  glowColor: "rgb(110 105 99)",
  centerSpacing: 4,
  edgeSpacing: 12,
  centerOpacity: 0.34,
  edgeOpacity: 0.012,
  centerBlur: 0,
  edgeBlur: 10,
  minLength: 26,
  maxLength: 74,
  fontSizeMin: 7,
  fontSizeMax: 11,
  glowChance: 0.06,
};

export const BINARY_RAIN_OPTIONS: Readonly<
  Record<HomeVisualTheme, BinaryRainOptions>
> = {
  dark: DARK_BINARY_RAIN_OPTIONS,
  light: LIGHT_BINARY_RAIN_OPTIONS,
};

export const RAIN_RENDER_SCALE = 0.78;

export function smoothstep(
  edge0: number,
  edge1: number,
  value: number,
): number {
  const x = Math.min(
    1,
    Math.max(0, (value - edge0) / (edge1 - edge0)),
  );

  return x * x * (3 - 2 * x);
}

export function getHorizontalProfile(
  x: number,
  width: number,
  options: BinaryRainOptions,
) {
  const normalizedX = x / Math.max(1, width);
  const distanceFromCenter = Math.abs(normalizedX - 0.5) * 2;
  const centerStrength = 1 - smoothstep(0, 1, distanceFromCenter);

  return {
    centerStrength,
    spacing:
      options.edgeSpacing
      - (options.edgeSpacing - options.centerSpacing)
        * Math.pow(centerStrength, 0.78),
    opacity:
      options.edgeOpacity
      + (options.centerOpacity - options.edgeOpacity)
        * Math.pow(centerStrength, 0.8),
    blur:
      options.centerBlur
      + (options.edgeBlur - options.centerBlur)
        * (1 - Math.pow(centerStrength, 0.75)),
  };
}
