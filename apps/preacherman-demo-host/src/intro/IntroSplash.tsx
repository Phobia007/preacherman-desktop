import type { SurfaceHostBridge } from "@preacherman/surface-skin";
import { useEffect, useState, type CSSProperties, type MouseEvent } from "react";
import preachermanMarkDark from "../assets/preacherman-mark-dark.png";
import preachermanMarkLight from "../assets/preacherman-mark-light.png";
import { WindowControls } from "../app-shell/WindowControls";
import { WindowResizeHandles } from "../app-shell/WindowResizeHandles";
import { STARTUP_INTRO_TIMING } from "../introSequence";
import { uiCopy, type Appearance, type Locale } from "../preferences";
import "./animated-preacherman-logo.css";

interface IntroSplashProps {
  readonly appearance: Appearance;
  readonly dispatch: SurfaceHostBridge["execute"];
  readonly locale: Locale;
  readonly onComplete: () => void;
}

export function IntroSplash({ appearance, dispatch, locale, onComplete }: IntroSplashProps) {
  const [visualReady, setVisualReady] = useState(false);
  const [scale, setScale] = useState(() => {
    if (typeof window === "undefined") return 1;
    return Math.min(window.innerWidth / 1800, window.innerHeight / 1000);
  });

  useEffect(() => {
    const updateScale = () => setScale(Math.min(window.innerWidth / 1800, window.innerHeight / 1000));
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  useEffect(() => {
    if (!visualReady) return;
    const completeTimer = window.setTimeout(onComplete, STARTUP_INTRO_TIMING.totalDurationMs);
    return () => window.clearTimeout(completeTimer);
  }, [onComplete, visualReady]);

  const startDragging = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    void dispatch({ type: "demo.window.start-dragging" });
  };

  return (
    <section
      aria-busy="true"
      aria-label={uiCopy[locale].introLabel}
      className="demo-intro-splash"
      data-appearance={appearance}
      data-ready={visualReady}
    >
      <div
        className="demo-intro-splash__stage"
        style={{ "--demo-intro-scale": scale } as CSSProperties}
      >
        <div aria-hidden="true" className="demo-intro-splash__snow" />
        <div aria-hidden="true" className="demo-intro-splash__scanlines" />
        <div aria-hidden="true" className="demo-intro-splash__sync-line" />

        <div className="demo-intro-splash__drag-region" onMouseDown={startDragging} />
        <WindowControls dispatch={dispatch} locale={locale} />

        <div className="demo-intro-splash__logo" role="img" aria-label="Preacherman">
          <img
            alt=""
            className="demo-intro-splash__mark"
            decoding="sync"
            draggable="false"
            onError={() => setVisualReady(true)}
            onLoad={() => setVisualReady(true)}
            src={appearance === "dark" ? preachermanMarkDark : preachermanMarkLight}
          />
        </div>

        <WindowResizeHandles dispatch={dispatch} />
      </div>
    </section>
  );
}
