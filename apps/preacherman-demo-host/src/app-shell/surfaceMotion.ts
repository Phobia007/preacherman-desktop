import type { DemoScreenRoute, LocalSurfaceType } from "../demo/screenRoute";
import { routeSurface, type SurfaceMotion } from "./surfaceNavigation";

type MotionParts = { animations: Animation[]; dispose?: () => void };
const providers = new Map<LocalSurfaceType, Set<() => MotionParts>>();
export function registerSurfaceMotion(surface: LocalSurfaceType, create: () => MotionParts) {
  const entries = providers.get(surface) ?? new Set();
  providers.set(surface, entries); entries.add(create);
  return () => { entries.delete(create); };
}

/** A generated track has the same forward timeline as an entrance, held at its end. */
export function heldTrack(element: Element, frames: Keyframe[], duration: number, easing = "linear") {
  const animation = element.animate(frames, { duration, easing, fill: "both" });
  animation.pause(); animation.currentTime = duration;
  return animation;
}

const entranceNames: Partial<Record<LocalSurfaceType, string[]>> = {
  workspace: ["demo-surface-unfold", "demo-surface-line-sweep"],
  settings: ["settings-menu-arrive", "execution-mode-arrive"],
  account: ["account-scene-left", "account-light", "account-brand", "account-vignette", "account-right", "account-profile"],
  asset: ["demo-frost-enter"], extension: ["demo-frost-enter"],
};

export function createSurfaceMotion(route: DemoScreenRoute): SurfaceMotion {
  const surface = routeSurface(route);
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return { play: () => Promise.resolve(), dispose() {} };
  const names = entranceNames[surface] ?? (surface === "market" || surface === "ledger" ? [] : ["demo-screen-enter"]);
  const css = document.getAnimations().filter(animation =>
    animation instanceof CSSAnimation && names.includes(animation.animationName));
  // Finished CSS clocks keep advancing: clamp first, then reverse one common
  // timestamp so staggered rows and Account's delayed panel retrace their order.
  const time = Math.max(0, ...css.map(animation => Math.min(Number(animation.currentTime ?? 0), Number(animation.effect?.getComputedTiming().endTime ?? 0))));
  css.forEach(animation => { animation.pause(); animation.currentTime = time; });
  const parts = [...(providers.get(surface) ?? [])].map(create => create());
  const generated = parts.flatMap(part => part.animations);
  if (surface === "settings") {
    for (const element of document.querySelectorAll('.settings-menu__frost, .settings-menu__focused-item')) {
      generated.push(heldTrack(element, [{ opacity: 0 }, { opacity: getComputedStyle(element).opacity }], 260, "ease"));
    }
    if (document.querySelector('.settings-menu[data-settings-focused="true"]')) {
      for (const element of document.querySelectorAll('.demo-app-shell__scene, .settings-menu__list')) {
        generated.push(heldTrack(element, [{ filter: "blur(0px)" }, { filter: getComputedStyle(element).filter }], 260, "ease"));
      }
    }
  }
  const animations = [...css, ...generated];
  let lastDirection: "in" | "out" = "out";
  return {
    play(direction) {
      lastDirection = direction;
      const pending: Promise<unknown>[] = [];
      for (const animation of animations) {
        if (direction === "out" && Number(animation.currentTime) <= 0) { animation.pause(); continue; }
        animation.updatePlaybackRate(direction === "out" ? -1 : 1);
        animation.play();
        pending.push(animation.finished);
      }
      return Promise.allSettled(pending);
    },
    dispose() {
      // A prewarmed page's CSS entrance is recreated by data-active on re-entry.
      generated.forEach(animation => animation.cancel());
      if (lastDirection === "out") css.forEach(animation => animation.cancel());
      parts.forEach(part => part.dispose?.());
    },
  };
}
