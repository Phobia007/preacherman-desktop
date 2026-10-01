import type { DemoScreenRoute } from "../demo/screenRoute";

export type NavigationPhase = "idle" | "exiting" | "returning";
export interface SurfaceMotion {
  play(direction: "in" | "out"): Promise<unknown>;
  dispose(): void;
}
export const routeKey = (route: DemoScreenRoute) => `${route.kind}:${route.surfaceType ?? route.screenId ?? ""}`;
export const routeSurface = (route: DemoScreenRoute) => route.kind === "surface" ? route.surfaceType ?? "home" : "home";

/** Keep one outgoing page alive; requests replace the destination, never queue. */
export function createSurfaceNavigator(initial: DemoScreenRoute, createMotion: (route: DemoScreenRoute) => SurfaceMotion,
  publish: (route: DemoScreenRoute, phase: NavigationPhase, target: DemoScreenRoute) => void) {
  let current = initial, target = initial, motion: SurfaceMotion | undefined;
  let direction: "in" | "out" | undefined, generation = 0, disposed = false;
  const request = (next: DemoScreenRoute) => {
    if (disposed) return;
    target = next;
    const same = routeKey(current) === routeKey(target);
    if (same && !motion) return;
    motion ??= createMotion(current);
    const nextDirection = same ? "in" : "out";
    publish(current, same ? "returning" : "exiting", target);
    if (direction === nextDirection) return;
    direction = nextDirection;
    const token = ++generation, playing = motion;
    void playing.play(nextDirection).then(() => {
      if (disposed || token !== generation) return;
      if (nextDirection === "out") current = target;
      motion = undefined; direction = undefined;
      // The host commits the replacement before releasing the outgoing frame.
      publish(current, "idle", target);
      playing.dispose();
    }).catch(() => { /* Reversing or unmounting invalidates the previous completion. */ });
  };
  return { request, dispose() { disposed = true; generation++; motion?.dispose(); } };
}
