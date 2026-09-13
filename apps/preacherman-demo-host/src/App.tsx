import { avatarModelName } from "@preacherman/avatar-renderer";
import { adjacentGalleryModel } from "./surfaces/gallery/galleryModelBindings";
import { useWindowActivity } from "./app-shell/useWindowActivity";
import {
  createSurfaceSkinAdapter,
  type SurfaceManifest,
  type SurfaceProjection,
} from "@preacherman/surface-skin";
import { useCallback, useEffect, useMemo, useState } from "react";
import "@preacherman/surface-skin/styles.css";
import { createDemoActionLog } from "./actionLog";
import { PreachermanFeaturePanel } from "./preacherman/PreachermanFeaturePanel";
import { PreachermanEcosystemDiagnostics } from "./preacherman/PreachermanEcosystemDiagnostics";
import { PreachermanDomObservationBridge } from "./preacherman/PreachermanDomObservationBridge";
import { PreachermanObservabilityPanel } from "./preacherman/PreachermanObservabilityPanel";
import { PreachermanWidgetGallery } from "./preacherman/PreachermanWidgetGallery";
import { preachermanServiceRequest } from "./preacherman/capabilityClient";
import { featuresForSurface, findPreachermanFeature } from "./preacherman/featurePlacement";
import { AppShell } from "./app-shell/AppShell";
import { SurfaceToolbar, type SurfaceToolbarTab } from "./app-shell/SurfaceToolbar";
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
import { CortanaModelStage } from "./gallery/CortanaModelStage";
import { IntroSplash } from "./intro/IntroSplash";
import { claimStartupIntro } from "./introSequence";
import { LiveCoordinatorProvider } from "./live/LiveCoordinatorContext";
import { SettingsScreen } from "./settings/SettingsScreen";
import { GalleryOrbitCards } from "./surfaces/gallery/GalleryOrbitCards";
import type { GalleryDetailBridge } from "./surfaces/gallery/GalleryDetailOverlay";
import { ActiveTheoryGallerySurface } from "./surfaces/gallery/ActiveTheoryGallerySurface";
import { GallerySurface } from "./surfaces/gallery/GallerySurface";
import { MarketSurface } from "./surfaces/market/MarketSurface";
import {
  applyPreferences,
  readPreferences,
  savePreferences,
  uiCopy,
  type ModelId,
} from "./preferences";
import { VoiceSessionControl } from "./realtime/VoiceSessionControl";
import { PreachermanExecutionFusionPanel } from "./preacherman-execution/PreachermanExecutionFusionPanel";

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

interface AppProps {
  readonly enteringOnMount?: boolean;
}

function currentRoute() {
  return readDemoScreenRoute();
}

const surfaceCopy = {
  home: {
    title: { en: "Companion", "zh-CN": "伙伴" },
    description: { en: "Talk, listen, and hand work to your AI companion.", "zh-CN": "对话、倾听，并把工作交给你的 AI 伙伴。" },
  },
  workspace: {
    title: { en: "Work", "zh-CN": "工作" },
    description: { en: "Plan, approve, and follow a task from request to artifact.", "zh-CN": "从提出需求、审批执行到查看产物，完成整条任务链路。" },
  },
  lab: {
    title: { en: "Voice & avatar", "zh-CN": "语音与角色" },
    description: { en: "Tune speech, interruption, motion, and presentation state.", "zh-CN": "调试语音、中断、动作与角色呈现状态。" },
  },
  market: {
    title: { en: "Gallery", "zh-CN": "展廊" },
    description: { en: "Choose identities, widgets, and playable experiences.", "zh-CN": "选择角色身份、组件和可玩的体验。" },
  },
  ledger: {
    title: { en: "Market", "zh-CN": "市场" },
    description: { en: "Market", "zh-CN": "市场" },
  },
  settings: {
    title: { en: "Settings", "zh-CN": "设置" },
    description: { en: "Configure the local runtime, providers, tools, and connections.", "zh-CN": "配置本地运行时、模型服务、工具与外部连接。" },
  },
  account: {
    title: { en: "Account", "zh-CN": "账户" },
    description: { en: "Account controls will appear here when account services are connected.", "zh-CN": "账户服务接入后，相关控制将在这里显示。" },
  },
  test: {
    title: { en: "Test", "zh-CN": "测试" },
    description: { en: "Run one acceptance path, then inspect its real runtime trace.", "zh-CN": "运行一次验收链路，再检查真实运行轨迹。" },
  },
} as const;

const tabs = {
  home: [
    { id: "companion", label: { en: "Companion", "zh-CN": "伙伴" } },
    { id: "widgets", label: { en: "Widgets", "zh-CN": "组件" } },
  ],
  workspace: [
    { id: "agent", label: { en: "Agent", "zh-CN": "Agent" } },
    { id: "task", label: { en: "Tasks", "zh-CN": "任务" } },
    { id: "tools", label: { en: "Tools", "zh-CN": "工具" } },
    { id: "vision", label: { en: "Vision", "zh-CN": "视觉" } },
  ],
  lab: [
    { id: "voice", label: { en: "Voice & motion", "zh-CN": "语音与动作" } },
    { id: "widgets", label: { en: "Widgets", "zh-CN": "组件" } },
  ],
  market: [
    { id: "characters", label: { en: "Characters", "zh-CN": "角色" } },
    { id: "widgets", label: { en: "Widgets", "zh-CN": "组件" } },
    { id: "games", label: { en: "Gamelets", "zh-CN": "游戏组件" } },
  ],
  test: [
    { id: "diagnostics", label: { en: "Acceptance", "zh-CN": "验收" } },
    { id: "observability", label: { en: "Runtime trace", "zh-CN": "运行轨迹" } },
  ],
} satisfies Partial<Record<LocalSurfaceType, readonly SurfaceToolbarTab[]>>;

export function App({ enteringOnMount = false }: AppProps = {}) {
  const windowActive = useWindowActivity();
  const [route, setRoute] = useState(currentRoute);
  const activeSurfaceType = route.kind === "surface" && route.surfaceType
    ? route.surfaceType
    : "home";
  const [preferences, setPreferences] = useState(readPreferences);
  const [showStartupIntro, setShowStartupIntro] = useState(startupIntroEnabled);
  const [animateMainEntrance] = useState(showStartupIntro || enteringOnMount);
  const [homeView, setHomeView] = useState("companion");
  const [workView, setWorkView] = useState("task");
  const [labView, setLabView] = useState("voice");
  const [galleryView, setGalleryView] = useState("characters");
  const [galleryDetailOpen, setGalleryDetailOpen] = useState(false);
  const [galleryPreviewModelId, setGalleryPreviewModelId] = useState<ModelId | null>(null);
  const activateGalleryModel = useCallback((modelId: ModelId) => {
    setPreferences((current) => ({ ...current, activeModelId: current.activeModelId === modelId ? null : modelId }));
  }, []);
  const [testView, setTestView] = useState("diagnostics");
  const [requestedControl, setRequestedControl] = useState<string | null>(null);
  const handleSurfaceNavigate = useCallback((surfaceType: LocalSurfaceType) => {
    setRoute(surfaceType === "home"
      ? { kind: "screen", screenId: acceptedScreenId }
      : { kind: "surface", surfaceType });
  }, []);
  const handleIntroComplete = useCallback(() => {
    openLocalSurface("home");
    setShowStartupIntro(false);
  }, []);
  const handlePreachermanFeatureActivate = useCallback((featureId: string): boolean => {
    const focusControl = (controlId: string): boolean => {
      const target = Array.from(document.querySelectorAll<HTMLElement>("[data-preacherman-control]"))
        .find((candidate) => candidate.dataset.preachermanControl?.split(" ").includes(controlId));
      if (!target || (target instanceof HTMLButtonElement && target.disabled)) return false;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      target.dataset.preachermanHighlight = "true";
      window.setTimeout(() => delete target.dataset.preachermanHighlight, 900);
      if (["presentation.stop", "task.cancel", "conversation.history", "task.events", "task.artifacts", "runtime.io-history", "plugin.activity"].includes(controlId) && target instanceof HTMLButtonElement) {
        target.click();
      }
      return true;
    };

    const revealLocalModule = (controlId: string): boolean => {
      let revealed = true;
      if (activeSurfaceType === "settings" && (controlId.startsWith("provider.") || controlId.startsWith("connection.") || controlId.startsWith("mcp.") || controlId.startsWith("voice.") || controlId.startsWith("vision.") || controlId.startsWith("audio.") || controlId.startsWith("plugin.") || controlId === "agent.plugin-tools" || controlId === "runtime.plugin-inspector" || controlId === "runtime.mcp-test" || controlId === "appearance.select" || controlId === "locale.select")) {
        window.dispatchEvent(new CustomEvent("preacherman:reveal-control", { detail: { controlId } }));
      }
      else if (activeSurfaceType === "ledger" && (controlId.startsWith("conversation.") || controlId.startsWith("memory.") || controlId === "task.events" || controlId === "task.artifacts" || controlId === "runtime.io-history" || controlId === "plugin.activity")) {
        window.dispatchEvent(new CustomEvent("preacherman:reveal-control", { detail: { controlId } }));
      }
      else if (controlId.startsWith("game.")) {
        setGalleryView("games");
        openLocalSurface("market");
      }
      else if (controlId.startsWith("vision.") || controlId.startsWith("computer-use.")) setWorkView("vision");
      else if (controlId.startsWith("agent.") || controlId.startsWith("plugin.widgets")) setWorkView("tools");
      else if (controlId.startsWith("task.") || controlId.startsWith("companion.")) setWorkView("task");
      else if (controlId.startsWith("plugin.gamelets")) setGalleryView("games");
      else if (controlId.startsWith("avatar.") || controlId.startsWith("persona.") || controlId.startsWith("motion.") || controlId.startsWith("scene.") || controlId.startsWith("voice.select")) setGalleryView("characters");
      else if (controlId.startsWith("runtime.io") || controlId.startsWith("runtime.reasoning") || controlId.startsWith("runtime.plugin")) setTestView("observability");
      else if (controlId.startsWith("voice.") || controlId.startsWith("presentation.") || controlId.startsWith("stage.")) setLabView("voice");
      else revealed = false;
      if (revealed) window.setTimeout(() => focusControl(controlId), 0);
      return revealed;
    };

    if (focusControl(featureId)) return true;
    if (revealLocalModule(featureId)) return true;
    const target = findPreachermanFeature(featureId)?.target;
    if (target) {
      const targetControl = target.control ?? featureId;
      setRequestedControl(targetControl);
      openLocalSurface(target.surface);
      const controlId = target.control ?? featureId;
      revealLocalModule(controlId);
      window.setTimeout(() => focusControl(controlId), 0);
      return true;
    }
    return false;
  }, [activeSurfaceType]);

  useEffect(() => {
    applyPreferences(preferences);
    savePreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    if (!requestedControl) return;
    const clearRequest = window.setTimeout(() => setRequestedControl(null), 0);
    return () => window.clearTimeout(clearRequest);
  }, [activeSurfaceType, requestedControl]);

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

  const contentKey = route.kind === "index"
    ? "screen-index"
    : route.kind === "surface"
      ? `surface-${activeSurfaceType}`
      : `screen-${route.screenId ?? acceptedScreenId}`;
  const HomeSurface = adapter.resolve(manifest).component;
  const [galleryBridge, setGalleryBridge] = useState<GalleryDetailBridge>();
  const activeModelId = preferences.activeModelId;
  const isCompanionActive = activeModelId !== null;
  // Only an open card previews its own character; the overview uses the equipped companion.
  const galleryModelId = galleryDetailOpen ? galleryPreviewModelId : activeModelId;
  const sceneModelId = activeSurfaceType === "market" ? galleryModelId : activeModelId;
  const preachermanPanelSurface: LocalSurfaceType | null = route.kind === "surface"
    ? activeSurfaceType
    : route.kind === "screen" && (screen?.manifest?.surfaceId ?? manifest.surfaceId) === manifest.surfaceId
      ? "home"
      : null;
  const visiblePanelSurface =
    preachermanPanelSurface === "home" || preachermanPanelSurface === "market" || preachermanPanelSurface === "ledger"
      ? null
      : preachermanPanelSurface;
  const homeContent = (
    <main
      aria-label={`${surfaceCopy.home.title[preferences.locale]} screen`}
      className="demo-host demo-host--home"
      data-model-active={isCompanionActive}
      data-view={homeView}
    >
      {isCompanionActive ? <VoiceSessionControl headless locale={preferences.locale} /> : null}
    </main>
  );
  const labContent = (
    <main
      className="demo-host demo-host--lab"
      data-preacherman-features={featuresForSurface("lab").join(" ")}
    >
      {labView === "voice" && isCompanionActive ? <>
        <VoiceSessionControl locale={preferences.locale} />
      </> : null}
      {labView === "widgets" ? <div className="demo-surface-module"><PreachermanWidgetGallery placement="lab" locale={preferences.locale} serviceRequest={preachermanServiceRequest} /></div> : null}
    </main>
  );
  const testContent = (
    <main
      className="demo-host demo-host--test"
      data-preacherman-features={featuresForSurface("test").join(" ")}
    >
      <div className="demo-preacherman-test-runtime" data-view={testView}>
        {testView === "diagnostics" ? <><PreachermanExecutionFusionPanel locale={preferences.locale} serviceRequest={preachermanServiceRequest} /><PreachermanEcosystemDiagnostics locale={preferences.locale} serviceRequest={preachermanServiceRequest} /></> : null}
        {testView === "observability" ? <><PreachermanExecutionFusionPanel locale={preferences.locale} serviceRequest={preachermanServiceRequest} view="trace" /><PreachermanObservabilityPanel locale={preferences.locale} serviceRequest={preachermanServiceRequest} /></> : null}
      </div>
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
          ? null
          : activeSurfaceType === "lab"
            ? labContent
        : activeSurfaceType === "market"
          ? null
        : activeSurfaceType === "settings"
          ? <SettingsScreen
              appearance={preferences.appearance}
              locale={preferences.locale}
              onAppearanceChange={(appearance) => setPreferences((current) => ({ ...current, appearance }))}
              onLocaleChange={(locale) => setPreferences((current) => ({ ...current, locale }))}
              requestedControl={requestedControl}
            />
          : activeSurfaceType === "ledger"
            ? null
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

  const activeSurfaceTab = preachermanPanelSurface === "home"
    ? homeView
    : preachermanPanelSurface === "workspace"
      ? workView
      : preachermanPanelSurface === "lab"
        ? labView
        : preachermanPanelSurface === "market"
          ? galleryView
          : preachermanPanelSurface === "test"
            ? testView
            : undefined;
  const changeSurfaceTab = (tabId: string) => {
    if (preachermanPanelSurface === "home") setHomeView(tabId);
    if (preachermanPanelSurface === "workspace") setWorkView(tabId);
    if (preachermanPanelSurface === "lab") setLabView(tabId);
    if (preachermanPanelSurface === "market") setGalleryView(tabId);
    if (preachermanPanelSurface === "test") setTestView(tabId);
  };
  const surfaceTabs = preachermanPanelSurface && preachermanPanelSurface in tabs
    ? tabs[preachermanPanelSurface as keyof typeof tabs]
    : [];

  const appShell = (
    <AppShell
      activeSurfaceType={activeSurfaceType}
      galleryDetailOpen={activeSurfaceType === "market" && galleryDetailOpen}
      appearance={preferences.appearance}
      dispatch={adapter.dispatch}
      entering={animateMainEntrance && !showStartupIntro}
      locale={preferences.locale}
      onNavigate={handleSurfaceNavigate}
      scene={sceneModelId || activeSurfaceType === "market" ? (
        <CortanaModelStage
          ariaLabel={`Persistent ${avatarModelName(sceneModelId ?? "cortana")} companion scene`}
          environment="cinematic"
          isolateCompanion={activeSurfaceType === "market" && galleryDetailOpen}
          cameraFraming={activeSurfaceType === "market" || activeSurfaceType === "settings" ? "portrait" : "full-body"}
          modelId={sceneModelId ?? "cortana"}
          companionVisible={sceneModelId !== null}
          sceneContent={galleryBridge ? <GalleryOrbitCards bridge={galleryBridge} active={activeSurfaceType === "market"} renderActive={windowActive} /> : null}
          prefetchModelId={activeSurfaceType === "market" && sceneModelId ? adjacentGalleryModel(sceneModelId) : undefined}
          variant="persistent"
          wakeEnabled={activeSurfaceType === "home"}
          renderActive={windowActive}
        />
      ) : null}
    >
      {activeSurfaceType !== "account" ? (
        <PreachermanDomObservationBridge currentSurface={activeSurfaceType} serviceRequest={preachermanServiceRequest} />
      ) : null}
      <div
        aria-hidden={activeSurfaceType !== "workspace"}
        className="demo-app-shell__prewarmed-surface"
        data-active={activeSurfaceType === "workspace"}
        data-surface="workspace"
      >
        <span aria-hidden="true" className="demo-app-shell__surface-reveal-line" />
        <div className="demo-app-shell__surface-reveal-mask">
          <GallerySurface />
        </div>
      </div>
      <div
        aria-hidden={activeSurfaceType !== "market"}
        className="demo-app-shell__prewarmed-surface"
        data-active={activeSurfaceType === "market"}
        data-surface="market"
      >
        <ActiveTheoryGallerySurface
          active={activeSurfaceType === "market"}
          onBridgeChange={setGalleryBridge}
          renderActive={windowActive}
          activeModelId={activeModelId}
          onActivate={activateGalleryModel}
          onDetailChange={setGalleryDetailOpen}
          onPreviewModelChange={setGalleryPreviewModelId}
        />
      </div>
      {activeSurfaceType === "ledger" ? <MarketSurface /> : null}
      {activeSurfaceType !== "ledger" ? (
        <div className="demo-app-shell__screen-page" key={contentKey}>
          {mainContent}
          {visiblePanelSurface && visiblePanelSurface !== "workspace" && visiblePanelSurface !== "settings" ? (
            <SurfaceToolbar
              activeTab={activeSurfaceTab}
              description={surfaceCopy[visiblePanelSurface].description}
              locale={preferences.locale}
              onTabChange={changeSurfaceTab}
              surface={visiblePanelSurface}
              tabs={surfaceTabs}
              title={surfaceCopy[visiblePanelSurface].title}
            />
          ) : null}
          {visiblePanelSurface && visiblePanelSurface !== "account" && visiblePanelSurface !== "workspace" && visiblePanelSurface !== "settings" ? (
            <PreachermanFeaturePanel
              locale={preferences.locale}
              onActivate={handlePreachermanFeatureActivate}
              surface={visiblePanelSurface}
            />
          ) : null}
        </div>
      ) : null}
    </AppShell>
  );
  const app = (
    <>
      {appShell}
      {showStartupIntro ? (
        <IntroSplash
          appearance={preferences.appearance}
          dispatch={adapter.dispatch}
          locale={preferences.locale}
          onComplete={handleIntroComplete}
        />
      ) : null}
    </>
  );

  return <LiveCoordinatorProvider>{app}</LiveCoordinatorProvider>;
}
