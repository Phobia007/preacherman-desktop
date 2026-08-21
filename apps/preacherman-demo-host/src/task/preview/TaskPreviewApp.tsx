import type { SurfaceHostBridge } from "@preacherman/surface-skin";
import { useCallback, useState } from "react";
import { AppShell } from "../../app-shell/AppShell";
import { CortanaModelStage } from "../../gallery/CortanaModelStage";
import { LiveCoordinatorProvider } from "../../live/LiveCoordinatorContext";
import type { DemoPreferences } from "../../preferences";
import { TaskSurface } from "../TaskSurface";

type PreviewSurface = "home" | "workspace" | "market" | "ledger" | "settings" | "account";

interface TaskPreviewAppProps {
  readonly preferences: DemoPreferences;
}

const previewDispatch: SurfaceHostBridge["execute"] = async () => ({ ok: true });

export function TaskPreviewApp({ preferences }: TaskPreviewAppProps) {
  const [activeSurfaceType, setActiveSurfaceType] = useState<PreviewSurface>("workspace");
  const navigate = useCallback((surfaceType: PreviewSurface) => {
    setActiveSurfaceType(surfaceType);
  }, []);

  return (
    <LiveCoordinatorProvider>
      <AppShell
        activeSurfaceType={activeSurfaceType}
        appearance={preferences.appearance}
        dispatch={previewDispatch}
        entering={false}
        locale={preferences.locale}
        onNavigate={navigate}
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
        <div className="demo-app-shell__screen-page" key={activeSurfaceType}>
          {activeSurfaceType === "workspace" ? (
            <TaskSurface />
          ) : (
            <main
              aria-label={`${activeSurfaceType} preview screen`}
              className="task-preview-switchboard"
            />
          )}
        </div>
      </AppShell>
    </LiveCoordinatorProvider>
  );
}
