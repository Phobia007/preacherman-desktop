import { useCallback, useEffect, useRef, useState } from "react";
import type { GalleryDetailBridge } from "./GalleryDetailOverlay";

function waitForScene(shell: Element, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    let observer: MutationObserver;
    const finish = (error?: Error) => {
      observer.disconnect();
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      error ? reject(error) : resolve();
    };
    const abort = () => finish(new DOMException("Navigation cancelled", "AbortError"));
    const check = () => {
      const viewport = shell.querySelector(".demo-app-shell__scene [data-avatar-load-state]");
      if (!viewport || viewport.getAttribute("data-avatar-load-state") === "ready") finish();
      else if (viewport.getAttribute("data-avatar-load-state") === "error") finish(new Error("Character could not be loaded"));
    };
    observer = new MutationObserver(check);
    const timeout = window.setTimeout(() => finish(new Error("Character could not be loaded")), 15000);
    observer.observe(shell, { attributes: true, childList: true, subtree: true });
    signal.addEventListener("abort", abort, { once: true });
    signal.aborted ? abort() : check();
  });
}

export function useGalleryCardNavigation(bridge: GalleryDetailBridge | undefined, shell: Element | null, active: boolean) {
  const current = useRef<AbortController>();
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");
  const cancel = useCallback(() => current.current?.abort(), []);
  useEffect(() => cancel, [active, cancel]);

  const navigate = useCallback(async (direction: -1 | 1) => {
    if (!bridge || !shell || current.current) return;
    const controller = new AbortController();
    current.current = controller;
    const animations: Animation[] = [];
    const layers = [
      shell.querySelector(".active-theory-gallery-surface"),
      shell.querySelector(".demo-app-shell__scene"),
      shell.querySelector(".gallery-detail__content"),
    ].filter((element): element is HTMLElement => element instanceof HTMLElement);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animate = (from: number, to: number, duration: number, easing: string) => {
      const batch = layers.map(element => element.animate([
        { transform: `translate3d(${from}%, 0, 0)` },
        { transform: `translate3d(${to}%, 0, 0)` },
      ], { duration: reducedMotion ? 0 : duration, easing, fill: "forwards" }));
      animations.push(...batch);
      return Promise.all(batch.map(animation => animation.finished));
    };
    const abort = () => animations.forEach(animation => animation.cancel());
    controller.signal.addEventListener("abort", abort, { once: true });
    setSwitching(true);
    setError("");
    try {
      // Previous travels right; next travels left. The arrows stay at the edges.
      await animate(0, -direction * 100, 280, "cubic-bezier(.55, 0, 1, .45)");
      if (controller.signal.aborted || !bridge.navigate(direction)) return;
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (controller.signal.aborted) return;
      await waitForScene(shell, controller.signal);
      await animate(direction * 100, 0, 440, "cubic-bezier(.16, 1, .3, 1)");
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Character could not be loaded");
    } finally {
      animations.forEach(animation => animation.cancel());
      controller.signal.removeEventListener("abort", abort);
      if (current.current === controller) {
        current.current = undefined;
        setSwitching(false);
      }
    }
  }, [bridge, shell]);

  return { navigate, switching, error, cancel };
}
