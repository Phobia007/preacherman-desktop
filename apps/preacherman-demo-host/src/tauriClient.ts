import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { SurfaceCommand, SurfaceCommandResult } from "@preacherman/surface-skin";

const windowCommandTypes = new Set([
  "demo.window.close",
  "demo.window.minimize",
  "demo.window.toggle-maximize",
  "demo.window.start-dragging",
  "demo.window.start-resize-dragging",
]);

const resizeDirections = new Set([
  "East",
  "North",
  "NorthEast",
  "NorthWest",
  "South",
  "SouthEast",
  "SouthWest",
  "West",
] as const);

type ResizeDirection = "East" | "North" | "NorthEast" | "NorthWest" | "South" | "SouthEast" | "SouthWest" | "West";

export function isWindowCommand(command: SurfaceCommand): boolean {
  return windowCommandTypes.has(command.type);
}

export async function executeWindowCommand(command: SurfaceCommand): Promise<SurfaceCommandResult> {
  if (!isTauri()) {
    return {
      ok: false,
      errorCode: "TAURI_UNAVAILABLE",
      message: `${command.type} was recorded locally; no native window action ran in browser preview.`,
    };
  }

  try {
    const window = getCurrentWindow();
    if (command.type === "demo.window.close") {
      await window.close();
    } else if (command.type === "demo.window.minimize") {
      await window.minimize();
    } else if (command.type === "demo.window.toggle-maximize") {
      await window.toggleMaximize();
    } else if (command.type === "demo.window.start-dragging") {
      await window.startDragging();
    } else if (command.type === "demo.window.start-resize-dragging") {
      const direction = command.payload?.direction;
      if (typeof direction !== "string" || !resizeDirections.has(direction as ResizeDirection)) {
        return {
          ok: false,
          errorCode: "INVALID_RESIZE_DIRECTION",
          message: "A valid native window resize direction is required.",
        };
      }
      await window.startResizeDragging(direction as ResizeDirection);
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      errorCode: "TAURI_WINDOW_ACTION_FAILED",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
