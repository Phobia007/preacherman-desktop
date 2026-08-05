import { useMemo, useRef } from "react";
import type { HomeVisualTheme } from "../config/sceneTheme";
import { useBinaryRain } from "../hooks/useBinaryRain";

interface BinaryRainProps {
  readonly theme: HomeVisualTheme;
}

export function BinaryRain({ theme }: BinaryRainProps) {
  const edge = useRef<HTMLCanvasElement>(null);
  const glow = useRef<HTMLCanvasElement>(null);
  const sharp = useRef<HTMLCanvasElement>(null);
  const refs = useMemo(() => ({ edge, glow, sharp }), []);

  useBinaryRain(refs, theme);

  return (
    <div aria-hidden="true" className="binary-rain">
      <canvas className="binary-rain__canvas binary-rain__canvas--edge" ref={edge} />
      <canvas className="binary-rain__canvas binary-rain__canvas--glow" ref={glow} />
      <canvas className="binary-rain__canvas binary-rain__canvas--sharp" ref={sharp} />
    </div>
  );
}
