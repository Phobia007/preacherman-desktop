import {
  createSurfaceSkinAdapter,
  type SurfaceManifest,
  type SurfaceProjection,
} from "@preacherman/surface-skin";
import { useCallback, useEffect, useMemo, useState } from "react";
import "@preacherman/surface-skin/styles.css";
import { createDemoActionLog } from "./actionLog";
import { ABTaskConsole } from "./ab/ABTaskConsole";
import { AiriFeaturePanel } from "./airi/AiriFeaturePanel";
import { AiriEcosystemDiagnostics } from "./airi/AiriEcosystemDiagnostics";
import { airiServiceRequest } from "./airi/capabilityClient";
import { featuresForSurface, findAiriFeature } from "./airi/featurePlacement";
import { AppShell } from "./app-shell/AppShell";
import { DemoAvatarSlot } from "./avatar/DemoAvatarSlot";
import { figmaScreenRegistry, findFigmaScreen } from "./demo/figmaScreenRegistry";
import { ScreenIndex } from "./demo/ScreenIndex";
import {
  acceptedScreenId,
  openDemoScreen,
  openDemoScreenIndex,
  openLocalSurface,
  readDemoScreenRoute,
  type LocalSurfaceType,
} from "./demo/screenRoute";
import { createDemoHostBridge } from "./demoHostBridge";
import { CortanaGallery } from "./gallery/CortanaGallery";
import { CortanaModelStage } from "./gallery/CortanaModelStage";
import { IntroSplash } from "./intro/IntroSplash";
import { claimStartupIntro } from "./introSequence";
import { LiveCoordinatorProvider } from "./live/LiveCoordinatorContext";
import {
  applyPreferences,
  readPreferences,
  savePreferences,
  uiCopy,
  type Appearance,
  type Locale,
} from "./preferences";
import { VoiceSessionControl } from "./realtime/VoiceSessionControl";
import { SettingsScreen } from "./settings/SettingsScreen";
import { ConversationLedgerScreen } from "./conversation/ConversationLedgerScreen";

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
  const handleAiriFeatureActivate = useCallback((featureId: string): boolean => {
    const focusControl = (controlId: string): boolean => {
      const target = Array.from(document.querySelectorAll<HTMLElement>("[data-airi-control]"))
        .find((candidate) => candidate.dataset.airiControl?.split(" ").includes(controlId));
      if (!target || (target instanceof HTMLButtonElement && target.disabled)) return false;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      target.dataset.airiHighlight = "true";
      window.setTimeout(() => delete target.dataset.airiHighlight, 900);
      if (["presentation.stop", "task.cancel", "conversation.history", "task.events", "task.artifacts", "runtime.io-history", "plugin.activity"].includes(controlId) && target instanceof HTMLButtonElement) {
        target.click();
      }
      return true;
    };

    if (focusControl(featureId)) return true;
    const target = findAiriFeature(featureId)?.target;
    if (target) {
      openLocalSurface(target.surface);
      window.setTimeout(() => focusControl(target.control ?? featureId), 0);
      return true;
    }
    return false;
  }, []);

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
  const HomeSurface = adapter.resolve(manifest).component;
  const isCortanaActive = preferences.activeModelId === "cortana";
  const airiPanelSurface: LocalSurfaceType | null = route.kind === "surface"
    ? activeSurfaceType
    : route.kind === "screen" && (screen?.manifest?.surfaceId ?? manifest.surfaceId) === manifest.surfaceId
      ? "home"
      : null;
  const homeContent = (
    <main
      className="demo-host demo-host--home"
      data-model-active={isCortanaActive}
    >
      {isCortanaActive ? (
        <>
          <HomeSurface manifest={manifest} projection={projection} />
          <CortanaModelStage ariaLabel="Activated Cortana model" />
          <VoiceSessionControl locale={preferences.locale} />
        </>
      ) : null}
    </main>
  );
  const workspaceContent = (
    <main
      className="demo-host demo-host--workspace"
      data-airi-features={featuresForSurface("workspace").join(" ")}
    >
      {isCortanaActive ? <VoiceSessionControl locale={preferences.locale} /> : null}
      <ABTaskConsole locale={preferences.locale} />
    </main>
  );
  const labContent = (
    <main
      className="demo-host demo-host--lab"
      data-airi-features={featuresForSurface("lab").join(" ")}
    >
      <div className="demo-airi-lab__intro">
        <span>AIRI PRESENTATION RUNTIME</span>
        <h1>{preferences.locale === "zh-CN" ? "语音与角色实验室" : "Voice and avatar lab"}</h1>
        <p>{preferences.locale === "zh-CN" ? "在这里验证麦克风、语音合成、中断和角色状态。" : "Validate microphone, speech synthesis, interruption, and avatar state here."}</p>
      </div>
      {isCortanaActive ? <VoiceSessionControl locale={preferences.locale} /> : null}
    </main>
  );
  const testContent = (
    <main
      className="demo-host demo-host--test"
      data-airi-features={featuresForSurface("test").join(" ")}
    >
      <div className="demo-airi-test__intro">
        <span>AIRI INTEGRATION CHECKPOINT</span>
        <h1>{preferences.locale === "zh-CN" ? "全能力测试区" : "Complete capability test"}</h1>
        <p>{preferences.locale === "zh-CN"
          ? "从左侧逐项检查麦克风、模型、工具、插件和运行时入口；绿色入口已连接，空心入口等待对应服务。"
          : "Inspect microphone, model, tool, plugin, and runtime entries. Solid entries are connected; outlined entries require their service."}</p>
      </div>
      <AiriEcosystemDiagnostics locale={preferences.locale} serviceRequest={airiServiceRequest} />
    </main>
  );
  const mainContent = route.kind === "index"
    ? (
        <div className="demo-host">
          <ScreenIndex onOpenScreen={openDemoScreen} />
        </div>
      )
    : route.kind === "surface"
      ? activeSurfaceType === "home"
        ? homeContent
        : activeSurfaceType === "workspace"
          ? workspaceContent
          : activeSurfaceType === "lab"
            ? labContent
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
          : activeSurfaceType === "market"
            ? (
                <CortanaGallery
                  activeModelId={preferences.activeModelId}
                  onActiveModelChange={(activeModelId) => {
                    setPreferences((current) => ({ ...current, activeModelId }));
                  }}
              />
            )
          : activeSurfaceType === "ledger"
            ? <ConversationLedgerScreen locale={preferences.locale} />
          : activeSurfaceType === "test"
            ? testContent
          : (
            <main
              aria-label={`${uiCopy[preferences.locale].emptySurfaceLabels[activeSurfaceType]} screen`}
              className="demo-host demo-host--empty"
            />
          )
    : (() => {
        const selectedManifest = screen?.manifest ?? manifest;
        if (selectedManifest.surfaceId === manifest.surfaceId) {
          return homeContent;
        }
        const ScreenSurface = adapter.resolve(selectedManifest).component;
        return (
          <main className="demo-host">
            <ScreenSurface manifest={selectedManifest} projection={projection} />
          </main>
        );
      })();

  const app = showStartupIntro ? (
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
        {airiPanelSurface ? (
          <AiriFeaturePanel
            locale={preferences.locale}
            onActivate={handleAiriFeatureActivate}
            surface={airiPanelSurface}
          />
        ) : null}
      </div>
    </AppShell>
  );

  return <LiveCoordinatorProvider>{app}</LiveCoordinatorProvider>;
}
