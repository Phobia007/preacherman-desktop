import { heldTrack } from "../../app-shell/surfaceMotion";

/** Reverse the visible page, including an interrupted category/entrance pose. */
export function createMarketRouteMotion(root: HTMLElement) {
  const frame = root.querySelector<HTMLIFrameElement>(".market-surface__frame");
  const doc = frame?.contentDocument;
  const frozen = [...root.getAnimations({ subtree: true }), ...(doc?.getAnimations() ?? [])]
    .filter(animation => animation.playState === "running" && animation.effect?.getTiming().iterations !== Infinity);
  frozen.forEach(animation => animation.pause());
  const duration = 1180, hold = 420 / duration;
  const animations = [heldTrack(root, [{ opacity: 0 }, { opacity: 1, offset: hold }, { opacity: getComputedStyle(root).opacity }], duration)];
  const frost = root.querySelector<HTMLElement>(".market-surface__frost");
  if (frost) {
    const empty = "polygon(0% 0%, 0% 100%, 0% 100%, 0% 0%, 100% 0%, 100% 100%, 100% 100%, 100% 0%)";
    const full = "polygon(0% 0%, 0% 100%, 50% 100%, 50% 0%, 50% 0%, 50% 100%, 100% 100%, 100% 0%)";
    const clip = getComputedStyle(frost).clipPath;
    animations.push(heldTrack(frost, [{ clipPath: empty }, { clipPath: empty, offset: hold, easing: "cubic-bezier(.16,1,.3,1)" }, { clipPath: clip === "none" ? full : clip }], duration));
  }
  if (doc && frame && !frame.hidden && root.dataset.page === "intro") {
    for (const panel of doc.querySelectorAll<HTMLElement>(".descriptive-card > .row > .col-12")) {
      const bounds = panel.getBoundingClientRect();
      if (bounds.bottom <= 0 || bounds.top >= doc.defaultView!.innerHeight) continue;
      const outside = `translate3d(${bounds.left < doc.defaultView!.innerWidth / 2 ? "-100%" : "100%"},0,0)`;
      animations.push(heldTrack(panel, [{ transform: outside }, { transform: outside, offset: hold, easing: "cubic-bezier(.16,1,.3,1)" }, { transform: doc.defaultView!.getComputedStyle(panel).transform }], duration));
    }
  }
  for (const element of root.querySelectorAll<HTMLElement>(".market-search, .market-details, .market-surface__categories")) {
    animations.push(heldTrack(element, [{ opacity: 0 }, { opacity: 0, offset: 1 - 340 / duration }, { opacity: getComputedStyle(element).opacity }], duration));
  }
  return { animations, dispose() { frozen.forEach(animation => { if (root.isConnected) animation.play(); else animation.cancel(); }); } };
}
