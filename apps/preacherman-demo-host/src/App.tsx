import {
  createSurfaceSkinAdapter,
  type SurfaceManifest,
  type SurfaceProjection,
} from "@preacherman/surface-skin";
import { useEffect, useMemo, useState } from "react";
import "@preacherman/surface-skin/styles.css";
import { createDemoActionLog } from "./actionLog";
import { figmaScreenRegistry, findFigmaScreen } from "./demo/figmaScreenRegistry";
import { ScreenIndex } from "./demo/ScreenIndex";
import {
  acceptedScreenId,
  openDemoScreen,
  openDemoScreenIndex,
  readDemoScreenRoute,
} from "./demo/screenRoute";
import { createDemoHostBridge } from "./demoHostBridge";
import { StartupIntro } from "./StartupIntro";
import { claimStartupIntro, STARTUP_INTRO_TOTAL_MS } from "./introSequence";

const manifest: SurfaceManifest = {
  surfaceType: "workspace",
  schemaVersion: 1,
  surfaceId: "figma-281-538",
  title: "Page 6 工作区 / conversation workspace",
};

const projection: SurfaceProjection = {
  status: "ready",
};

const actionLog = createDemoActionLog();
const adapter = createSurfaceSkinAdapter({
  host: createDemoHostBridge(actionLog),
});

function currentRoute() {
  return readDemoScreenRoute();
}

export function App() {
  const [route, setRoute] = useState(currentRoute);
  const [showStartupIntro, setShowStartupIntro] = useState(() => claimStartupIntro());
  const [animateMainEntrance] = useState(showStartupIntro);

  useEffect(() => {
    if (!showStartupIntro) {
      return undefined;
    }
    const timeoutId = window.setTimeout(
      () => setShowStartupIntro(false),
      STARTUP_INTRO_TOTAL_MS,
    );
    return () => window.clearTimeout(timeoutId);
  }, [showStartupIntro]);

  useEffect(() => {
    const refreshRoute = () => setRoute(currentRoute());
    const openIndexWithKeyboard = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        openDemoScreenIndex();
      }
    };
    window.addEventListener("popstate", refreshRoute);
    window.addEventListener("keydown", openIndexWithKeyboard);
    return () => {
      window.removeEventListener("popstate", refreshRoute);
      window.removeEventListener("keydown", openIndexWithKeyboard);
    };
  }, []);

  const screen = useMemo(() => {
    if (route.kind !== "screen") {
      return undefined;
    }
    const candidate = findFigmaScreen(route.screenId ?? acceptedScreenId);
    return candidate?.implementationStatus === "implemented"
      ? candidate
      : figmaScreenRegistry[0];
  }, [route]);

  const entranceClassName = animateMainEntrance ? " demo-host--entering" : "";
  const mainContent = route.kind === "index"
    ? (
        <div className={`demo-host${entranceClassName}`}>
          <ScreenIndex onOpenScreen={openDemoScreen} />
        </div>
      )
    : (() => {
        const selectedManifest = screen?.manifest ?? manifest;
        const ScreenSurface = adapter.resolve(selectedManifest).component;
        return (
          <main className={`demo-host${entranceClassName}`}>
            <ScreenSurface manifest={selectedManifest} projection={projection} />
          </main>
        );
      })();

  return showStartupIntro ? <StartupIntro /> : mainContent;
}
