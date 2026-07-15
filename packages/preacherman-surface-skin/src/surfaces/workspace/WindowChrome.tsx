import type { SurfaceViewProps } from "../../adapter/types";
import closeAsset from "../../assets/figma/281-538/window-close.svg";
import maximizeAsset from "../../assets/figma/281-538/window-maximize.svg";
import minimizeAsset from "../../assets/figma/281-538/window-minimize.svg";
import { windowCommand } from "./commands";

type WindowChromeProps = Pick<SurfaceViewProps, "dispatch">;

export function WindowChrome({ dispatch }: WindowChromeProps) {
  return (
    <div className="pm-workspace__window-controls" aria-label="Window controls" role="group">
      <button
        aria-label="Close window"
        className="pm-workspace__window-control pm-workspace__window-control--close"
        onClick={() => void dispatch(windowCommand("close"))}
        title="Close window"
        type="button"
      >
        <img alt="" aria-hidden="true" src={closeAsset} />
      </button>
      <button
        aria-label="Minimize window"
        className="pm-workspace__window-control pm-workspace__window-control--minimize"
        onClick={() => void dispatch(windowCommand("minimize"))}
        title="Minimize window"
        type="button"
      >
        <img alt="" aria-hidden="true" src={minimizeAsset} />
      </button>
      <button
        aria-label="Maximize or restore window"
        className="pm-workspace__window-control pm-workspace__window-control--maximize"
        onClick={() => void dispatch(windowCommand("toggle-maximize"))}
        title="Maximize or restore window"
        type="button"
      >
        <img alt="" aria-hidden="true" src={maximizeAsset} />
      </button>
    </div>
  );
}
