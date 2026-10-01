import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { DemoScreenRoute } from "../demo/screenRoute";
import { createSurfaceNavigator, routeKey, type NavigationPhase } from "./surfaceNavigation";
import { createSurfaceMotion } from "./surfaceMotion";

export function useSurfaceNavigation(requested: DemoScreenRoute) {
  const [state, setState] = useState({ route: requested, phase: "idle" as NavigationPhase, target: requested });
  const committed = useRef(requested);
  const navigator = useRef<ReturnType<typeof createSurfaceNavigator> | null>(null);
  useLayoutEffect(() => {
    const controller = createSurfaceNavigator(committed.current, createSurfaceMotion, (route, phase, target) => {
      const next = { route, phase, target };
      if (phase === "idle") {
        committed.current = route;
        flushSync(() => setState(next));
      } else setState(next);
    });
    navigator.current = controller;
    return () => { controller.dispose(); navigator.current = null; };
  }, []);
  useLayoutEffect(() => navigator.current?.request(requested), [routeKey(requested)]);
  return state;
}
