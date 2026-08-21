import type { SurfaceCommand, SurfaceHostBridge } from "@preacherman/surface-skin";
import closeIcon from "../assets/window-controls/window-close.svg";
import maximizeIcon from "../assets/window-controls/window-maximize.svg";
import minimizeIcon from "../assets/window-controls/window-minimize.svg";
import { uiCopy, type Locale } from "../preferences";

interface WindowControlsProps {
  readonly dispatch: SurfaceHostBridge["execute"];
  readonly locale: Locale;
}

const controls = [
  { action: "minimize", labelKey: "minimize", icon: minimizeIcon },
  { action: "toggle-maximize", labelKey: "maximize", icon: maximizeIcon },
  { action: "close", labelKey: "close", icon: closeIcon },
] as const;

function windowCommand(action: (typeof controls)[number]["action"]): SurfaceCommand {
  return { type: `demo.window.${action}` };
}

export function WindowControls({ dispatch, locale }: WindowControlsProps) {
  const labels = uiCopy[locale].windowControls;
  return (
    <div className="demo-window-controls">
      {controls.map((control) => (
        <button
          aria-label={labels[control.labelKey]}
          className="demo-window-controls__button"
          key={control.action}
          onClick={() => void dispatch(windowCommand(control.action))}
          type="button"
        >
          <img alt="" aria-hidden="true" draggable="false" src={control.icon} />
        </button>
      ))}
    </div>
  );
}
