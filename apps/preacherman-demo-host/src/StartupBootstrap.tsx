import type { SurfaceHostBridge } from "@preacherman/surface-skin";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import { openLocalSurface } from "./demo/screenRoute";
import { IntroSplash } from "./intro/IntroSplash";
import { claimStartupIntro } from "./introSequence";
import { readPreferences } from "./preferences";
import { executeWindowCommand } from "./tauriClient";

interface DeferredAppProps {
  readonly enteringOnMount?: boolean;
}

const bootstrapOwnsStartupIntro = claimStartupIntro();
const startupPreferences = readPreferences();
const startupDispatch: SurfaceHostBridge["execute"] = (command) => executeWindowCommand(command);

export function StartupBootstrap() {
  const [DeferredApp, setDeferredApp] = useState<ComponentType<DeferredAppProps> | null>(null);
  const [introComplete, setIntroComplete] = useState(!bootstrapOwnsStartupIntro);

  useEffect(() => {
    let active = true;
    const firstPaint = window.requestAnimationFrame(() => {
      void import("./App").then(({ App }) => {
        if (active) setDeferredApp(() => App);
      });
    });
    return () => {
      active = false;
      window.cancelAnimationFrame(firstPaint);
    };
  }, []);

  const handleIntroComplete = useCallback(() => {
    openLocalSurface("home");
    setIntroComplete(true);
  }, []);

  if (introComplete && DeferredApp) {
    return <DeferredApp enteringOnMount={bootstrapOwnsStartupIntro} />;
  }

  return (
    <IntroSplash
      appearance={startupPreferences.appearance}
      dispatch={startupDispatch}
      locale={startupPreferences.locale}
      onComplete={handleIntroComplete}
    />
  );
}
