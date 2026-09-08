import { navigationCommand, type SurfaceHostBridge } from "@preacherman/surface-skin";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { type Appearance, type Locale } from "../preferences";
import { WindowControls } from "./WindowControls";
import { WindowResizeHandles } from "./WindowResizeHandles";

interface AppShellProps {
  readonly activeSurfaceType: string;
  readonly appearance: Appearance;
  readonly children: ReactNode;
  readonly dispatch: SurfaceHostBridge["execute"];
  readonly entering: boolean;
  readonly locale: Locale;
  readonly onNavigate: (surfaceType: typeof brandNavigationItems[number]["surfaceType"]) => void;
  readonly scene?: ReactNode;
  readonly sceneHidden?: boolean;
  readonly galleryDetailOpen?: boolean;
}

const brandNavigationItems = [
  { label: "Home", surfaceType: "home" },
  { label: "Task", surfaceType: "workspace" },
  { label: "Gallery", surfaceType: "market" },
  { label: "Market", surfaceType: "ledger" },
  { label: "Settings", surfaceType: "settings" },
  { label: "Account", surfaceType: "account" },
] as const;

export function AppShell({
  activeSurfaceType,
  appearance,
  children,
  dispatch,
  entering,
  locale,
  onNavigate,
  scene,
  sceneHidden = false,
  galleryDetailOpen = false,
}: AppShellProps) {
  const brandButtonRef = useRef<HTMLButtonElement>(null);
  const [brandNavigationOpen, setBrandNavigationOpen] = useState(false);
  const [scale, setScale] = useState(() => {
    if (typeof window === "undefined") return 1;
    return Math.min(window.innerWidth / 1800, window.innerHeight / 1000);
  });

  const closeBrandNavigation = () => {
    setBrandNavigationOpen(false);
    brandButtonRef.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    const updateScale = () => setScale(Math.min(window.innerWidth / 1800, window.innerHeight / 1000));
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  useEffect(() => {
    if (!brandNavigationOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeBrandNavigation();
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [brandNavigationOpen]);

  const selectBrandDestination = (surfaceType: typeof brandNavigationItems[number]["surfaceType"]) => {
    closeBrandNavigation();
    onNavigate(surfaceType);
    void dispatch(navigationCommand(surfaceType));
  };

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
      data-active-surface={activeSurfaceType}
      data-appearance={appearance}
      data-locale={locale}
      data-scene-hidden={sceneHidden ? "true" : "false"}
      data-gallery-detail={galleryDetailOpen ? "true" : "false"}
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
        <div
          className="demo-app-shell__brand-navigation"
          data-open={brandNavigationOpen ? "true" : "false"}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setBrandNavigationOpen(false);
            }
          }}
        >
          <button
            aria-hidden={!brandNavigationOpen}
            aria-label="Close navigation"
            className="demo-app-shell__brand-backdrop"
            onClick={closeBrandNavigation}
            tabIndex={-1}
            type="button"
          />
          <div aria-hidden="true" className="demo-app-shell__brand-drawer-clip">
            <div className="demo-app-shell__brand-drawer" />
          </div>
          <button
            aria-controls="preacherman-brand-navigation"
            aria-expanded={brandNavigationOpen}
            aria-label={brandNavigationOpen ? "Close Preacherman navigation" : "Open Preacherman navigation"}
            className="demo-app-shell__brand-trigger"
            onClick={() => setBrandNavigationOpen((open) => !open)}
            ref={brandButtonRef}
            type="button"
          >
            <svg aria-hidden="true" className="demo-app-shell__brand-icon" viewBox="0 0 80 80" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round">
              <path d="M18 24H62M18 40H62M18 56H62" />
            </svg>
          </button>
          <nav
            aria-hidden={!brandNavigationOpen}
            aria-label="Preacherman sections"
            className="demo-app-shell__brand-menu"
            id="preacherman-brand-navigation"
          >
            {brandNavigationItems.map((item, index) => (
              <div className="demo-app-shell__brand-menu-row" key={item.surfaceType} style={{ "--menu-order": index } as CSSProperties}>
                <button
                  aria-current={activeSurfaceType === item.surfaceType ? "page" : undefined}
                  className="demo-app-shell__brand-menu-item"
                  onClick={() => selectBrandDestination(item.surfaceType)}
                  tabIndex={brandNavigationOpen ? 0 : -1}
                  type="button"
                >
                  <span className="demo-app-shell__brand-menu-label">{item.label}</span>
                  <svg
                    aria-hidden="true"
                    className="demo-app-shell__brand-menu-charge-ring"
                    focusable="false"
                    preserveAspectRatio="none"
                    viewBox="0 0 100 40"
                  >
                    <path
                      className="demo-app-shell__brand-menu-charge-outline"
                      d="M18 1H82A17 17 0 0 1 99 18V22A17 17 0 0 1 82 39H18A17 17 0 0 1 1 22V18A17 17 0 0 1 18 1Z"
                      pathLength={100}
                      vectorEffect="non-scaling-stroke"
                    />
                    <path
                      className="demo-app-shell__brand-menu-charge-tracer"
                      d="M18 1H82A17 17 0 0 1 99 18V22A17 17 0 0 1 82 39H18A17 17 0 0 1 1 22V18A17 17 0 0 1 18 1Z"
                      pathLength={100}
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </nav>
        </div>
        <WindowControls dispatch={dispatch} locale={locale} />
      </header>
      <div aria-hidden={sceneHidden ? "true" : undefined} className="demo-app-shell__scene">
        {scene}
      </div>
      <div className="demo-app-shell__screen-content">{children}</div>
      <WindowResizeHandles dispatch={dispatch} />
    </div>
    </div>
  );
}
