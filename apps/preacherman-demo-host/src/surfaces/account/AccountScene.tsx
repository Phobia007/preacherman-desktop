import { useEffect, useRef } from "react";
import { addAfterEffect, useFrame, useThree } from "@react-three/fiber";
import type { Appearance } from "../../preferences";

const CAPTURE_EVENT = "preacherman:account-scene-frame";
type FrameRequest = CustomEvent<(canvas: HTMLCanvasElement) => void>;
const frameSubscribers = new Set<(canvas: HTMLCanvasElement) => void>();

/** Capture only the shared 3D scene, never the login form or other desktop UI. */
export function AccountSceneCapture() {
  const { gl, scene, camera } = useThree();
  const rendered = useRef(false);
  useFrame(() => { rendered.current = true; });
  useEffect(() => addAfterEffect(() => {
    if (!rendered.current) return;
    rendered.current = false;
    // Copy immediately after the existing render, before WebGL clears its buffer.
    // Never advance the skeleton twice or render a second companion for the lens.
    if (!document.hidden) frameSubscribers.forEach(copy => copy(gl.domElement));
  }), [gl]);
  useEffect(() => {
    const capture = (event: Event) => {
      // Render and copy synchronously: the WebGL back buffer is not preserved.
      gl.render(scene, camera);
      (event as FrameRequest).detail(gl.domElement);
    };
    window.addEventListener(CAPTURE_EVENT, capture);
    return () => window.removeEventListener(CAPTURE_EVENT, capture);
  }, [gl, scene, camera]);
  return null;
}

export function paintFrost(ctx: CanvasRenderingContext2D, width: number, height: number, style: CSSStyleDeclaration) {
  ctx.fillStyle = style.getPropertyValue("--demo-theme-account-glass").trim();
  ctx.fillRect(0, 0, width, height);
  for (const [x, y, radius, token] of [
    [.12, .12, .85, "--demo-theme-account-frost"],
    [.88, .4, .7, "--demo-theme-account-frost-soft"],
  ] as const) {
    const glow = ctx.createRadialGradient(width * x, height * y, 0, width * x, height * y, width * radius);
    glow.addColorStop(0, style.getPropertyValue(token).trim());
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }
  // Subtle static grain gives the soft light a ground-glass surface, without a pattern.
  const grain = document.createElement("canvas"); grain.width = grain.height = 160;
  const grainCtx = grain.getContext("2d")!;
  const pixels = grainCtx.createImageData(160, 160);
  let seed = 73;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = seed % 256;
    pixels.data[i + 3] = 10;
  }
  grainCtx.putImageData(pixels, 0, 0);
  ctx.fillStyle = ctx.createPattern(grain, "repeat")!;
  ctx.fillRect(0, 0, width, height);
}

export function AccountFrost({ appearance }: { appearance: Appearance }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const draw = () => {
      canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight;
      paintFrost(canvas.getContext("2d")!, canvas.width, canvas.height, getComputedStyle(canvas));
    };
    const resize = new ResizeObserver(draw); resize.observe(canvas); draw();
    return () => resize.disconnect();
  }, [appearance]);
  return <canvas ref={ref} className="account-frost" aria-hidden="true" />;
}

export function captureAccountFrame(panel: HTMLElement) {
  const rect = panel.getBoundingClientRect();
  const canvas = document.createElement("canvas");
  // Use layout pixels; the desktop stage can itself be scaled on small windows.
  canvas.width = panel.clientWidth; canvas.height = panel.clientHeight;
  const ctx = canvas.getContext("2d")!;
  const style = getComputedStyle(panel);
  // Paint static layers once; only companion pixels change during the effect.
  const frost = document.createElement("canvas");
  const overlay = document.createElement("canvas");
  frost.width = overlay.width = canvas.width;
  frost.height = overlay.height = canvas.height;
  paintFrost(frost.getContext("2d")!, canvas.width, canvas.height, style);
  const top = overlay.getContext("2d")!;
  const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
  const fade = top.createLinearGradient(0, 0, 0, canvas.height);
  fade.addColorStop(0, "transparent");
  fade.addColorStop(.44, style.getPropertyValue("--demo-theme-account-fade-mid").trim());
  fade.addColorStop(1, style.getPropertyValue("--demo-theme-account-fade-end").trim());
  top.fillStyle = fade; top.fillRect(0, 0, canvas.width, canvas.height);
  const logo = panel.querySelector<HTMLImageElement>(".account__mark");
  if (logo?.complete && logo.naturalWidth) {
    const bounds = logo.getBoundingClientRect();
    top.shadowColor = style.getPropertyValue("--demo-theme-account-brand-shadow").trim();
    top.shadowBlur = 5; top.shadowOffsetY = 2;
    top.drawImage(logo, (bounds.left - rect.left) * sx, (bounds.top - rect.top) * sy, bounds.width * sx, bounds.height * sy);
  }
  let placement: [number, number, number, number] | undefined;
  const paint = (frame?: HTMLCanvasElement) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(frost, 0, 0);
    if (frame) {
      if (!placement) {
        const bounds = frame.getBoundingClientRect();
        placement = [(bounds.left - rect.left) * sx, (bounds.top - rect.top) * sy, bounds.width * sx, bounds.height * sy];
      }
      ctx.drawImage(frame, ...placement);
    }
    ctx.drawImage(overlay, 0, 0);
  };
  paint();
  window.dispatchEvent(new CustomEvent(CAPTURE_EVENT, { detail: paint }));
  return {
    canvas,
    subscribe(onUpdate: () => void) {
      const copy = (frame: HTMLCanvasElement) => { paint(frame); onUpdate(); };
      frameSubscribers.add(copy);
      return () => { frameSubscribers.delete(copy); };
    },
  };
}
