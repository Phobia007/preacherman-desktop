import { useEffect, useRef, useState } from "react";
import type { SurfaceViewProps } from "../../adapter/types";
import { navigationCommand } from "./commands";

type BottomNavigationProps = Pick<SurfaceViewProps, "dispatch">;

const navigationItems = [
  { label: "Home", surfaceType: "home", className: "pm-workspace__nav-item--home" },
  { label: "Workspace", surfaceType: "workspace", className: "pm-workspace__nav-item--workspace" },
  { label: "Lab", surfaceType: "lab", className: "pm-workspace__nav-item--lab" },
  { label: "State Gallery", surfaceType: "market", className: "pm-workspace__nav-item--gallery" },
  { label: "Test Zone", surfaceType: "test", className: "pm-workspace__nav-item--test" },
  { label: "State Ledger", surfaceType: "ledger", className: "pm-workspace__nav-item--ledger" },
  { label: "Settings", surfaceType: "settings", className: "pm-workspace__nav-item--settings" },
] as const;

const NAVIGATION_HIDE_DELAY_MS = 360;

export function BottomNavigation({ dispatch }: BottomNavigationProps) {
  const [isVisible, setIsVisible] = useState(false);
  const hideTimer = useRef<number | null>(null);

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
      <nav aria-hidden={!isVisible} aria-label="Primary" className="pm-workspace__bottom-navigation">
        {navigationItems.map((item) => (
          <button
            aria-current={item.surfaceType === "home" ? "page" : undefined}
            className={`pm-workspace__nav-item ${item.className}`}
            data-navigation-item={item.surfaceType}
            key={item.surfaceType}
            onClick={() => void dispatch(navigationCommand(item.surfaceType))}
            tabIndex={isVisible ? 0 : -1}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
