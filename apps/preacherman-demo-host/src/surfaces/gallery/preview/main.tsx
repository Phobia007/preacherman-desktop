import { StrictMode, useEffect, useLayoutEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "../../../app-shell/AppShell";
import { CortanaModelStage } from "../../../gallery/CortanaModelStage";
import { LiveCoordinatorProvider } from "../../../live/LiveCoordinatorContext";
import type { Appearance } from "../../../preferences";
import "../../../styles.css";
import { TaskExperienceSurface } from "../../task/TaskExperienceSurface";

function requestedAppearance(): Appearance {
  return new URLSearchParams(window.location.search).get("appearance") === "light"
    ? "light"
    : "dark";
}

function Preview() {
  const appearance = requestedAppearance();
  const [baseReady, setBaseReady] = useState(false);

  useLayoutEffect(() => {
    document.documentElement.dataset.appearance = appearance;
  }, [appearance]);

  useEffect(() => {
    const stage = document.querySelector(".cortana-model-stage--persistent");

    if (!stage) {
      return;
    }

    let firstFrame: number | null = null;
    let secondFrame: number | null = null;
    const settleBase = () => {
      if (stage.querySelector(".cortana-model-stage__loading")) {
        return;
      }

      observer.disconnect();
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => setBaseReady(true));
      });
    };
    const observer = new MutationObserver(settleBase);

    observer.observe(stage, { childList: true, subtree: true });
    settleBase();

    return () => {
      observer.disconnect();
      if (firstFrame !== null) window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
    };
  }, []);

  return (
    <AppShell
      activeSurfaceType="market"
      appearance={appearance}
      dispatch={async () => ({ ok: true }) as never}
      entering={false}
      locale="zh-CN"
      onNavigate={() => undefined}
      scene={(
        <CortanaModelStage
          ariaLabel="Persistent Cortana companion scene"
          environment="cinematic"
          modelId="cortana"
          renderActive
          variant="persistent"
        />
      )}
    >
      <div className="demo-app-shell__screen-page">
        {baseReady ? <TaskExperienceSurface /> : null}
      </div>
    </AppShell>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LiveCoordinatorProvider>
      <Preview />
    </LiveCoordinatorProvider>
  </StrictMode>,
);
