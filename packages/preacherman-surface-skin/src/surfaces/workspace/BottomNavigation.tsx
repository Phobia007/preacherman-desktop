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
  { label: "Gallery", surfaceType: "market", className: "pm-workspace__nav-item--gallery" },
  { label: "Lab", surfaceType: "lab", className: "pm-workspace__nav-item--lab" },
  { label: "Ledger", surfaceType: "ledger", className: "pm-workspace__nav-item--ledger" },
  { label: "Settings", surfaceType: "settings", className: "pm-workspace__nav-item--settings" },
  { label: "Test", surfaceType: "test", className: "pm-workspace__nav-item--test" },
] as const;

export function BottomNavigation({
  activeSurfaceType,
  ariaLabel = "Primary",
  dispatch,
  labels,
}: BottomNavigationProps) {
  return (
    <div className="pm-workspace__bottom-navigation-zone is-visible">
      <nav
        aria-label={ariaLabel}
        className="pm-workspace__bottom-navigation"
      >
        {navigationItems.map((item) => {
          const isActive = item.surfaceType === activeSurfaceType;
          return (
            <button
              aria-current={isActive ? "page" : undefined}
              className={`pm-workspace__nav-item ${item.className}${isActive ? " is-active" : ""}`}
              data-navigation-item={item.surfaceType}
              key={item.surfaceType}
              onClick={() => void dispatch(navigationCommand(item.surfaceType))}
              tabIndex={0}
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
