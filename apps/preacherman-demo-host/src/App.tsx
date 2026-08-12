import {
  createSurfaceSkinAdapter,
  type SurfaceManifest,
  type SurfaceProjection,
} from "@preacherman/surface-skin";
import { useCallback, useEffect, useMemo, useState } from "react";
import "@preacherman/surface-skin/styles.css";
import { createDemoActionLog } from "./actionLog";
import { ABTaskConsole, TaskWorkspaceProvider } from "./ab/ABTaskConsole";
import { AiriFeaturePanel } from "./airi/AiriFeaturePanel";
import { AiriEcosystemDiagnostics } from "./airi/AiriEcosystemDiagnostics";
import { AiriComputerVisionPanel } from "./airi/AiriComputerVisionPanel";
import { AiriDomObservationBridge } from "./airi/AiriDomObservationBridge";
import { AiriGameletPanel } from "./airi/AiriGameletPanel";
import { AiriObservabilityPanel } from "./airi/AiriObservabilityPanel";
import { AiriWidgetGallery } from "./airi/AiriWidgetGallery";
import { airiServiceRequest } from "./airi/capabilityClient";
import { featuresForSurface, findAiriFeature } from "./airi/featurePlacement";
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
import { HomeRailFusionPanel } from "./homerail/HomeRailFusionPanel";

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
    title: { en: "Ledger", "zh-CN": "记录" },
    description: { en: "Review conversations, task runs, artifacts, and memory.", "zh-CN": "查看对话、任务执行、产物与记忆。" },
  },
  settings: {
    title: { en: "Settings", "zh-CN": "设置" },
    description: { en: "Configure the local runtime, providers, tools, and connections.", "zh-CN": "配置本地运行时、模型服务、工具与外部连接。" },
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
    { id: "task", label: { en: "Task", "zh-CN": "任务" } },
    { id: "tools", label: { en: "Tools", "zh-CN": "工具" } },
    { id: "games", label: { en: "Games", "zh-CN": "游戏" } },
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

export function App() {
  const [route, setRoute] = useState(currentRoute);
  const activeSurfaceType = route.kind === "surface" && route.surfaceType
    ? route.surfaceType
    : "home";
  const [preferences, setPreferences] = useState(readPreferences);
  const [showStartupIntro, setShowStartupIntro] = useState(startupIntroEnabled);
  const [animateMainEntrance] = useState(showStartupIntro);
  const [homeView, setHomeView] = useState("companion");
  const [workView, setWorkView] = useState("task");
  const [labView, setLabView] = useState("voice");
  const [galleryView, setGalleryView] = useState("characters");
  const [testView, setTestView] = useState("diagnostics");
  const [requestedControl, setRequestedControl] = useState<string | null>(null);
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

    const revealLocalModule = (controlId: string): boolean => {
      let revealed = true;
      if (activeSurfaceType === "settings" && (controlId.startsWith("provider.") || controlId.startsWith("connection.") || controlId.startsWith("mcp.") || controlId.startsWith("voice.") || controlId.startsWith("vision.") || controlId.startsWith("audio.") || controlId.startsWith("plugin.") || controlId === "agent.plugin-tools" || controlId === "runtime.plugin-inspector" || controlId === "runtime.mcp-test" || controlId === "appearance.select" || controlId === "locale.select")) {
        window.dispatchEvent(new CustomEvent("preacherman:reveal-control", { detail: { controlId } }));
      }
      else if (activeSurfaceType === "ledger" && (controlId.startsWith("conversation.") || controlId.startsWith("memory.") || controlId === "task.events" || controlId === "task.artifacts" || controlId === "runtime.io-history" || controlId === "plugin.activity")) {
        window.dispatchEvent(new CustomEvent("preacherman:reveal-control", { detail: { controlId } }));
      }
      else if (controlId.startsWith("game.")) setWorkView("games");
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
    const target = findAiriFeature(featureId)?.target;
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
      data-view={homeView}
    >
      {homeView === "companion" && isCortanaActive ? (
        <>
          <VoiceSessionControl locale={preferences.locale} />
          <ABTaskConsole locale={preferences.locale} mode="home" />
        </>
      ) : null}
      {homeView === "widgets" ? <div className="demo-surface-module"><AiriWidgetGallery placement="home" locale={preferences.locale} serviceRequest={airiServiceRequest} /></div> : null}
    </main>
  );
  const workspaceContent = (
    <main
      className="demo-host demo-host--workspace"
      data-airi-features={featuresForSurface("workspace").join(" ")}
      data-view={workView}
    >
      {workView === "task" ? <>
        {isCortanaActive ? <VoiceSessionControl locale={preferences.locale} /> : null}
        <ABTaskConsole locale={preferences.locale} mode="work" />
      </> : null}
      {workView !== "task" ? <div className="demo-airi-work-runtime" data-view={workView}>
        {workView === "tools" ? <div data-airi-control="plugin.widgets agent.mcp-tools agent.plugin-tools agent.kits-api agent.bindings-api"><AiriWidgetGallery placement="work" locale={preferences.locale} serviceRequest={airiServiceRequest} /></div> : null}
        {workView === "games" ? <div data-airi-control="plugin.gamelets game.tic-tac-toe"><AiriGameletPanel locale={preferences.locale} serviceRequest={airiServiceRequest} /></div> : null}
        {workView === "vision" ? <div data-airi-control="computer-use.session computer-use.dom computer-use.transcript vision.screen vision.camera"><AiriComputerVisionPanel locale={preferences.locale} serviceRequest={airiServiceRequest} /></div> : null}
      </div> : null}
    </main>
  );
  const labContent = (
    <main
      className="demo-host demo-host--lab"
      data-airi-features={featuresForSurface("lab").join(" ")}
    >
      {labView === "voice" && isCortanaActive ? <>
        <VoiceSessionControl locale={preferences.locale} />
      </> : null}
      {labView === "widgets" ? <div className="demo-surface-module"><AiriWidgetGallery placement="lab" locale={preferences.locale} serviceRequest={airiServiceRequest} /></div> : null}
    </main>
  );
  const testContent = (
    <main
      className="demo-host demo-host--test"
      data-airi-features={featuresForSurface("test").join(" ")}
    >
      <div className="demo-airi-test-runtime" data-view={testView}>
        {testView === "diagnostics" ? <><HomeRailFusionPanel locale={preferences.locale} serviceRequest={airiServiceRequest} /><AiriEcosystemDiagnostics locale={preferences.locale} serviceRequest={airiServiceRequest} /></> : null}
        {testView === "observability" ? <><HomeRailFusionPanel locale={preferences.locale} serviceRequest={airiServiceRequest} view="trace" /><AiriObservabilityPanel locale={preferences.locale} serviceRequest={airiServiceRequest} /></> : null}
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
          ? workspaceContent
          : activeSurfaceType === "lab"
            ? labContent
        : activeSurfaceType === "settings"
          ? <SettingsScreen
              appearance={preferences.appearance}
              locale={preferences.locale}
              onAppearanceChange={(appearance: Appearance) => {
                setPreferences((current) => ({ ...current, appearance }));
              }}
              onLocaleChange={(locale: Locale) => {
                setPreferences((current) => ({ ...current, locale }));
              }}
              requestedControl={requestedControl}
              widgets={<AiriWidgetGallery placement="settings" locale={preferences.locale} serviceRequest={airiServiceRequest} />}
            />
          : activeSurfaceType === "market"
            ? galleryView === "characters"
              ? <CortanaGallery
                  activeModelId={preferences.activeModelId}
                  onActiveModelChange={(activeModelId) => {
                    setPreferences((current) => ({ ...current, activeModelId }));
                  }}
                />
              : <main className="demo-host demo-host--gallery-runtime">
                <div className="demo-surface-module">
                  {galleryView === "widgets" ? <AiriWidgetGallery placement="gallery" locale={preferences.locale} serviceRequest={airiServiceRequest} /> : null}
                  {galleryView === "games" ? <AiriGameletPanel locale={preferences.locale} serviceRequest={airiServiceRequest} /> : null}
                </div>
              </main>
          : activeSurfaceType === "ledger"
            ? <ConversationLedgerScreen
                locale={preferences.locale}
                requestedControl={requestedControl}
                serviceRequest={airiServiceRequest}
                widgets={<AiriWidgetGallery placement="ledger" locale={preferences.locale} serviceRequest={airiServiceRequest} />}
              />
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

  const activeSurfaceTab = airiPanelSurface === "home"
    ? homeView
    : airiPanelSurface === "workspace"
      ? workView
      : airiPanelSurface === "lab"
        ? labView
        : airiPanelSurface === "market"
          ? galleryView
          : airiPanelSurface === "test"
            ? testView
            : undefined;
  const changeSurfaceTab = (tabId: string) => {
    if (airiPanelSurface === "home") setHomeView(tabId);
    if (airiPanelSurface === "workspace") setWorkView(tabId);
    if (airiPanelSurface === "lab") setLabView(tabId);
    if (airiPanelSurface === "market") setGalleryView(tabId);
    if (airiPanelSurface === "test") setTestView(tabId);
  };
  const surfaceTabs = airiPanelSurface && airiPanelSurface in tabs
    ? tabs[airiPanelSurface as keyof typeof tabs]
    : [];

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
      scene={isCortanaActive ? (
        <CortanaModelStage
          ariaLabel="Persistent Cortana companion scene"
          environment="cinematic"
          variant="persistent"
        />
      ) : null}
      sceneHidden={activeSurfaceType === "market"}
    >
      <AiriDomObservationBridge currentSurface={activeSurfaceType} serviceRequest={airiServiceRequest} />
      <div className="demo-app-shell__screen-page" key={contentKey}>
        {mainContent}
        {airiPanelSurface ? (
          <SurfaceToolbar
            activeTab={activeSurfaceTab}
            description={surfaceCopy[airiPanelSurface].description}
            locale={preferences.locale}
            onTabChange={changeSurfaceTab}
            surface={airiPanelSurface}
            tabs={surfaceTabs}
            title={surfaceCopy[airiPanelSurface].title}
          />
        ) : null}
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

  return <LiveCoordinatorProvider><TaskWorkspaceProvider locale={preferences.locale}>{app}</TaskWorkspaceProvider></LiveCoordinatorProvider>;
}
