import { navigationCommand, type SurfaceHostBridge } from "@preacherman/surface-skin";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { type Appearance, type Locale } from "../preferences";
import { accountAuth, accountProfile } from "../auth/accountAuth";
import type { LocalSurfaceType } from "../demo/screenRoute";
import { AccountBadge } from "./AccountBadge";
import { AudioDock } from "../audio/AudioDock";
import { WindowControls } from "./WindowControls";
import { WindowResizeHandles } from "./WindowResizeHandles";

interface AppShellProps {
  readonly activeSurfaceType: string;
  readonly navigationPhase?: "idle" | "exiting" | "returning";
  readonly navigationTarget?: string;
  readonly appearance: Appearance;
  readonly children: ReactNode;
  readonly dispatch: SurfaceHostBridge["execute"];
  readonly entering: boolean;
  readonly locale: Locale;
  readonly onNavigate: (surfaceType: LocalSurfaceType) => void;
  readonly scene?: ReactNode;
  readonly sceneHidden?: boolean;
  readonly galleryDetailOpen?: boolean;
}

const brandNavigationItems = [
  { label: "Home", surfaceType: "home" },
  { label: "Task", surfaceType: "workspace" },
  { label: "Gallery", surfaceType: "market" },
  { label: "Market", surfaceType: "ledger" },
  { label: "Asset", surfaceType: "asset" },
  { label: "Extension", surfaceType: "extension" },
] as const;

export function AppShell({
  activeSurfaceType,
  navigationPhase = "idle",
  navigationTarget = activeSurfaceType,
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
  const auth = useSyncExternalStore(accountAuth.subscribe, accountAuth.getSnapshot);
  const member = useSyncExternalStore(accountProfile.subscribe, accountProfile.getSnapshot);
  const brandButtonRef = useRef<HTMLButtonElement>(null);
  const [brandNavigationOpen, setBrandNavigationOpen] = useState(false);
  const accountDockHidden = brandNavigationOpen;
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

  const selectBrandDestination = (surfaceType: LocalSurfaceType) => {
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
      data-navigation-phase={navigationPhase}
      data-navigation-target={navigationTarget}
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
        <button
          aria-hidden={!brandNavigationOpen}
          aria-label="Close navigation"
          className="demo-app-shell__brand-backdrop"
          data-open={brandNavigationOpen ? "true" : "false"}
          onClick={closeBrandNavigation}
          tabIndex={-1}
          type="button"
        />
        <div
          className="demo-app-shell__brand-navigation"
          data-open={brandNavigationOpen ? "true" : "false"}
          onPointerLeave={(event) => {
            if (brandNavigationOpen && event.pointerType === "mouse") {
              closeBrandNavigation();
            }
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setBrandNavigationOpen(false);
            }
          }}
        >
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
          <div className="demo-app-shell__brand-settings-reveal" aria-hidden={!brandNavigationOpen}>
          <button
            aria-label="Settings"
            aria-current={navigationTarget === "settings" ? "page" : undefined}
            aria-hidden={!brandNavigationOpen}
            className="demo-app-shell__brand-settings"
            onClick={() => selectBrandDestination("settings")}
            tabIndex={brandNavigationOpen ? 0 : -1}
            type="button"
          >
            <svg aria-hidden="true" className="demo-app-shell__brand-icon" viewBox="0 0 80 80" fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin="round">
              <path d="M55.71,33.49L56.56,36.18L61.73,36.56L61.73,43.44L56.56,43.82L55.71,46.51L54.42,49.01L57.80,52.93L52.93,57.80L49.01,54.42L46.51,55.71L43.82,56.56L43.44,61.73L36.56,61.73L36.18,56.56L33.49,55.71L30.99,54.42L27.07,57.80L22.20,52.93L25.58,49.01L24.29,46.51L23.44,43.82L18.27,43.44L18.27,36.56L23.44,36.18L24.29,33.49L25.58,30.99L22.20,27.07L27.07,22.20L30.99,25.58L33.49,24.29L36.18,23.44L36.56,18.27L43.44,18.27L43.82,23.44L46.51,24.29L49.01,25.58L52.93,22.20L57.80,27.07L54.42,30.99Z" />
              <circle cx="40" cy="40" r="8" />
            </svg>
          </button>
          </div>
          <nav
            aria-hidden={!brandNavigationOpen}
            aria-label="Preacherman sections"
            className="demo-app-shell__brand-menu"
            id="preacherman-brand-navigation"
          >
            {brandNavigationItems.map((item, index) => (
              <div className="demo-app-shell__brand-menu-row" key={item.surfaceType} style={{ "--menu-order": index } as CSSProperties}>
                <button
                  aria-current={navigationTarget === item.surfaceType ? "page" : undefined}
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
      <div className="demo-app-shell__screen-content" ref={element => element?.toggleAttribute("inert", navigationPhase !== "idle")}>{children}</div>
      <button className="demo-account-dock" type="button" aria-label={auth.user ? "Open your account" : "Sign in to Preacherman"}
        data-menu-hidden={accountDockHidden} aria-hidden={accountDockHidden} tabIndex={accountDockHidden ? -1 : 0}
        onClick={() => { selectBrandDestination("account"); setBrandNavigationOpen(false); }}>
        <AccountBadge user={auth.user} member={member} />
      </button>
      <AudioDock />
      <WindowResizeHandles dispatch={dispatch} />
    </div>
    </div>
  );
}
