import {
  BottomNavigation,
  type SurfaceHostBridge,
} from "@preacherman/surface-skin";
import { useEffect, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import preachermanMarkDark from "../assets/preacherman-mark-dark.png";
import preachermanMarkLight from "../assets/preacherman-mark-light.png";
import { uiCopy, type Appearance, type Locale } from "../preferences";
import { WindowControls } from "./WindowControls";
import { WindowResizeHandles } from "./WindowResizeHandles";

interface AppShellProps {
  readonly activeSurfaceType: string;
  readonly appearance: Appearance;
  readonly children: ReactNode;
  readonly dispatch: SurfaceHostBridge["execute"];
  readonly entering: boolean;
  readonly locale: Locale;
}

export function AppShell({
  activeSurfaceType,
  appearance,
  children,
  dispatch,
  entering,
  locale,
}: AppShellProps) {
  const copy = uiCopy[locale];
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
  const startDragging = (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    void dispatch({ type: "demo.window.start-dragging" });
  };

  return (
    <div className="demo-app-viewport">
    <div
      className={`demo-app-shell${entering ? " demo-host--entering" : ""}`}
      data-appearance={appearance}
      data-locale={locale}
      style={{ "--demo-app-scale": scale } as CSSProperties}
    >
      <header className="demo-app-shell__chrome">
        <div
          className="demo-app-shell__drag-region demo-app-shell__drag-region--left"
          onMouseDown={startDragging}
        />
        <div
          className="demo-app-shell__drag-region demo-app-shell__drag-region--right"
          onMouseDown={startDragging}
        />
        <img
          alt="Preacherman"
          className="demo-app-shell__brand-mark"
          draggable="false"
          src={appearance === "dark" ? preachermanMarkDark : preachermanMarkLight}
        />
        <WindowControls dispatch={dispatch} locale={locale} />
      </header>
      <div className="demo-app-shell__screen-content">{children}</div>
      <BottomNavigation
        activeSurfaceType={activeSurfaceType}
        ariaLabel={copy.navigationAriaLabel}
        dispatch={dispatch}
        labels={copy.navigationLabels}
      />
      <WindowResizeHandles dispatch={dispatch} />
    </div>
    </div>
  );
}
