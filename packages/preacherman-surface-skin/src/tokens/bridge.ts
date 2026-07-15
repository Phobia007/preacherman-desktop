import type { CSSProperties } from "react";
import type { HostSurfaceTokens, SurfaceSkinTokens } from "../adapter/types";

export const defaultSurfaceSkinTokens: SurfaceSkinTokens = {
  color: {
    canvas: "#fbfaf7",
    surface: "#ffffff",
    text: "#151515",
    muted: "#6b6964",
    border: "#dedbd4",
    accent: "#151515",
    success: "#2f9e44",
    warning: "#b7791f",
    danger: "#c2413b",
  },
  typography: {
    sans: "Inter, ui-sans-serif, system-ui, sans-serif",
    serif: "Iowan Old Style, Baskerville, Times New Roman, serif",
  },
  motion: {
    durationFast: 140,
    durationNormal: 240,
    durationAmbient: 18000,
    reduceMotion: false,
  },
};

export function bridgeSurfaceTokens(host: HostSurfaceTokens = {}): SurfaceSkinTokens {
  return {
    color: { ...defaultSurfaceSkinTokens.color, ...host.color },
    typography: { ...defaultSurfaceSkinTokens.typography, ...host.typography },
    motion: { ...defaultSurfaceSkinTokens.motion, ...host.motion },
  };
}

export function surfaceTokenStyle(tokens: SurfaceSkinTokens): CSSProperties {
  return {
    "--pm-skin-canvas": tokens.color.canvas,
    "--pm-skin-surface": tokens.color.surface,
    "--pm-skin-text": tokens.color.text,
    "--pm-skin-muted": tokens.color.muted,
    "--pm-skin-border": tokens.color.border,
    "--pm-skin-accent": tokens.color.accent,
    "--pm-skin-success": tokens.color.success,
    "--pm-skin-warning": tokens.color.warning,
    "--pm-skin-danger": tokens.color.danger,
    "--pm-skin-font-sans": tokens.typography.sans,
    "--pm-skin-font-serif": tokens.typography.serif,
    "--pm-skin-duration-fast": `${tokens.motion.reduceMotion ? 0 : tokens.motion.durationFast}ms`,
    "--pm-skin-duration-normal": `${tokens.motion.reduceMotion ? 0 : tokens.motion.durationNormal}ms`,
    "--pm-skin-duration-ambient": `${tokens.motion.reduceMotion ? 0 : tokens.motion.durationAmbient}ms`,
  } as CSSProperties;
}
