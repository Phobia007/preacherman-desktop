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

export function BottomNavigation({ dispatch }: BottomNavigationProps) {
  return (
    <nav aria-label="Primary" className="pm-workspace__bottom-navigation">
      <span className="pm-workspace__bottom-divider" aria-hidden="true" />
      {navigationItems.map((item) => (
        <button
          aria-current={item.surfaceType === "home" ? "page" : undefined}
          className={`pm-workspace__nav-item ${item.className}`}
          data-navigation-item={item.surfaceType}
          key={item.surfaceType}
          onClick={() => void dispatch(navigationCommand(item.surfaceType))}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
