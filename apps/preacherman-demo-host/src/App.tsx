import {
  createSurfaceSkinAdapter,
  type SurfaceManifest,
  type SurfaceProjection,
} from "@preacherman/surface-skin";
import { useCallback, useEffect, useMemo, useState } from "react";
import "@preacherman/surface-skin/styles.css";
import { createDemoActionLog } from "./actionLog";
import { AppShell } from "./app-shell/AppShell";
import { DemoAvatarSlot } from "./avatar/DemoAvatarSlot";
import { figmaScreenRegistry, findFigmaScreen } from "./demo/figmaScreenRegistry";
import { ScreenIndex } from "./demo/ScreenIndex";
import {
  acceptedScreenId,
  openDemoScreen,
  openDemoScreenIndex,
  readDemoScreenRoute,
  type LocalSurfaceType,
} from "./demo/screenRoute";
import { createDemoHostBridge } from "./demoHostBridge";
import { IntroSplash } from "./intro/IntroSplash";
import { claimStartupIntro } from "./introSequence";
import {
  applyPreferences,
  readPreferences,
  savePreferences,
  uiCopy,
  type Appearance,
  type Locale,
} from "./preferences";
import { SettingsScreen } from "./settings/SettingsScreen";

const manifest: SurfaceManifest = {
  surfaceType: "workspace",
  schemaVersion: 1,
  surfaceId: "figma-281-538",
  title: "Page 6 工作区 / conversation workspace",
};

const projection: SurfaceProjection = {
  status: "ready",
  data: {
    identity: {
      identityNumber: "01",
    },
  },
};

const actionLog = createDemoActionLog();
const adapter = createSurfaceSkinAdapter({
  avatarSlot: DemoAvatarSlot,
  host: createDemoHostBridge(actionLog),
});
const startupIntroEnabled = claimStartupIntro();

function currentRoute() {
  return readDemoScreenRoute();
}

export function App() {
  const [route, setRoute] = useState(currentRoute);
  const [preferences, setPreferences] = useState(readPreferences);
  const [showStartupIntro, setShowStartupIntro] = useState(startupIntroEnabled);
  const [animateMainEntrance] = useState(showStartupIntro);
  const handleIntroComplete = useCallback(() => setShowStartupIntro(false), []);

  useEffect(() => {
    applyPreferences(preferences);
    savePreferences(preferences);
  }, [preferences]);

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

  const activeSurfaceType = route.kind === "surface" && route.surfaceType
    ? route.surfaceType
    : "home";
  const contentKey = route.kind === "index"
    ? "screen-index"
    : route.kind === "surface"
      ? `surface-${activeSurfaceType}`
      : `screen-${route.screenId ?? acceptedScreenId}`;
  const mainContent = route.kind === "index"
    ? (
        <div className="demo-host">
          <ScreenIndex onOpenScreen={openDemoScreen} />
        </div>
      )
    : route.kind === "surface"
      ? activeSurfaceType === "home"
        ? (() => {
            const ScreenSurface = adapter.resolve(manifest).component;
            return (
              <main className="demo-host">
                <ScreenSurface manifest={manifest} projection={projection} />
              </main>
            );
          })()
        : activeSurfaceType === "settings"
          ? (
              <SettingsScreen
                appearance={preferences.appearance}
                locale={preferences.locale}
                onAppearanceChange={(appearance: Appearance) => {
                  setPreferences((current) => ({ ...current, appearance }));
                }}
                onLocaleChange={(locale: Locale) => {
                  setPreferences((current) => ({ ...current, locale }));
                }}
              />
            )
          : (
            <main
              aria-label={`${uiCopy[preferences.locale].emptySurfaceLabels[activeSurfaceType]} screen`}
              className="demo-host demo-host--empty"
            />
          )
    : (() => {
        const selectedManifest = screen?.manifest ?? manifest;
        const ScreenSurface = adapter.resolve(selectedManifest).component;
        return (
          <main className="demo-host">
            <ScreenSurface manifest={selectedManifest} projection={projection} />
          </main>
        );
      })();

  return showStartupIntro ? (
    <IntroSplash
      appearance={preferences.appearance}
      locale={preferences.locale}
      onComplete={handleIntroComplete}
    />
  ) : (
    <AppShell
      activeSurfaceType={activeSurfaceType}
      appearance={preferences.appearance}
      dispatch={adapter.dispatch}
      entering={animateMainEntrance}
      locale={preferences.locale}
    >
      <div className="demo-app-shell__screen-page" key={contentKey}>
        {mainContent}
      </div>
    </AppShell>
  );
}
