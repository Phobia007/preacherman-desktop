import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SurfaceViewProps } from "../../adapter/types";
import { navigationCommand } from "./commands";

type BottomNavigationProps = Pick<SurfaceViewProps, "dispatch"> & {
  readonly activeSurfaceType: string;
  readonly ariaLabel?: string;
  readonly labels?: Partial<Record<NavigationSurfaceType, string>>;
};

type NavigationSurfaceType = "home" | "workspace" | "lab" | "market" | "test" | "ledger" | "settings";

const navigationItems = [
  { label: "Home", surfaceType: "home", className: "pm-workspace__nav-item--home" },
  { label: "Work", surfaceType: "workspace", className: "pm-workspace__nav-item--workspace" },
  { label: "Lab", surfaceType: "lab", className: "pm-workspace__nav-item--lab" },
  { label: "Gallery", surfaceType: "market", className: "pm-workspace__nav-item--gallery" },
  { label: "Test", surfaceType: "test", className: "pm-workspace__nav-item--test" },
  { label: "Ledger", surfaceType: "ledger", className: "pm-workspace__nav-item--ledger" },
  { label: "Settings", surfaceType: "settings", className: "pm-workspace__nav-item--settings" },
] as const;

const NAVIGATION_HIDE_DELAY_MS = 360;
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function BottomNavigation({
  activeSurfaceType,
  ariaLabel = "Primary",
  dispatch,
  labels,
}: BottomNavigationProps) {
  const [isVisible, setIsVisible] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const navigationRef = useRef<HTMLElement | null>(null);
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());

  const cancelScheduledHide = () => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const showNavigation = () => {
    cancelScheduledHide();
    setIsVisible(true);
  };

  const scheduleNavigationHide = () => {
    cancelScheduledHide();
    hideTimer.current = window.setTimeout(() => {
      setIsVisible(false);
      hideTimer.current = null;
    }, NAVIGATION_HIDE_DELAY_MS);
  };

  useEffect(() => () => cancelScheduledHide(), []);

  useBrowserLayoutEffect(() => {
    const navigation = navigationRef.current;
    const indicator = indicatorRef.current;
    const activeButton = itemRefs.current.get(activeSurfaceType);
    const label = activeButton?.querySelector<HTMLElement>("[data-navigation-label]");
    if (!navigation || !indicator || !label) {
      return;
    }

    const navigationBounds = navigation.getBoundingClientRect();
    const labelBounds = label.getBoundingClientRect();
    const indicatorX = labelBounds.left - navigationBounds.left - 10;
    const indicatorWidth = labelBounds.width + 20;

    if (indicator.dataset.positioned !== "true") {
      indicator.style.transition = "none";
      indicator.dataset.positioned = "true";
    }
    indicator.style.width = `${indicatorWidth}px`;
    indicator.style.transform = `translateX(${indicatorX}px)`;
    indicator.getBoundingClientRect();
    indicator.style.removeProperty("transition");
  }, [activeSurfaceType]);

  return (
    <div
      className={`pm-workspace__bottom-navigation-zone${isVisible ? " is-visible" : ""}`}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          scheduleNavigationHide();
        }
      }}
      onFocusCapture={showNavigation}
      onMouseEnter={showNavigation}
      onMouseLeave={scheduleNavigationHide}
    >
      <div aria-hidden="true" className="pm-workspace__navigation-dots">
        <span className="pm-workspace__navigation-dot" />
        <span className="pm-workspace__navigation-dot" />
        <span className="pm-workspace__navigation-dot" />
      </div>
      <nav
        aria-hidden={!isVisible}
        aria-label={ariaLabel}
        className="pm-workspace__bottom-navigation"
        ref={navigationRef}
      >
        <div aria-hidden="true" className="pm-workspace__nav-indicator" ref={indicatorRef}>
          <span className="pm-workspace__nav-indicator-line" />
          <span className="pm-workspace__nav-indicator-line" />
        </div>
        {navigationItems.map((item) => {
          const isActive = item.surfaceType === activeSurfaceType;
          return (
            <button
              aria-current={isActive ? "page" : undefined}
              className={`pm-workspace__nav-item ${item.className}${isActive ? " is-active" : ""}`}
              data-navigation-item={item.surfaceType}
              key={item.surfaceType}
              onClick={() => void dispatch(navigationCommand(item.surfaceType))}
              ref={(node) => {
                if (node) {
                  itemRefs.current.set(item.surfaceType, node);
                } else {
                  itemRefs.current.delete(item.surfaceType);
                }
              }}
              tabIndex={isVisible ? 0 : -1}
              type="button"
            >
              <span data-navigation-label>{labels?.[item.surfaceType] ?? item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
