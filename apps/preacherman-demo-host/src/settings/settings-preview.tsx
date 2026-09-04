import { type SurfaceHostBridge } from "@preacherman/surface-skin";
import "@preacherman/avatar-renderer/styles.css";
import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "../app-shell/AppShell";
import { CortanaModelStage } from "../gallery/CortanaModelStage";
import { LiveCoordinatorProvider } from "../live/LiveCoordinatorContext";
import { applyPreferences, readPreferences, type Appearance } from "../preferences";
import "../styles.css";
import { SettingsScreen } from "./SettingsScreen";

const previewQuery = new URLSearchParams(window.location.search);
const requestedAppearance = previewQuery.get("appearance");
const appearance: Appearance = requestedAppearance === "light" ? "light" : "dark";
const locale = previewQuery.get("locale") === "zh-CN" ? "zh-CN" : "en";
const dispatch: SurfaceHostBridge["execute"] = async () => ({ ok: true });

function SettingsPreview() {
  useEffect(() => {
    applyPreferences({ ...readPreferences(), activeModelId: "cortana", appearance, locale });
  }, []);

  return (
    <LiveCoordinatorProvider>
      <AppShell
        activeSurfaceType="settings"
        appearance={appearance}
        dispatch={dispatch}
        entering={false}
        locale={locale}
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
          <SettingsScreen
            appearance={appearance}
            locale={locale}
            onAppearanceChange={() => undefined}
            onLocaleChange={() => undefined}
            requestedControl={previewQuery.get("control")}
          />
        </div>
      </AppShell>
    </LiveCoordinatorProvider>
  );
}

createRoot(document.getElementById("root")!).render(<SettingsPreview />);
