import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  SurfaceCommand,
  SurfaceCommandResult,
  SurfaceHostBridge,
} from "@preacherman/surface-skin";
import type { DemoActionLog } from "./actionLog";
import { acceptedScreenId, openDemoScreen } from "./demo/screenRoute";

const windowCommands = new Set([
  "demo.window.close",
  "demo.window.minimize",
  "demo.window.toggle-maximize",
]);

function browserWindowResult(command: SurfaceCommand): SurfaceCommandResult {
  return {
    ok: false,
    errorCode: "TAURI_UNAVAILABLE",
    message: `${command.type} was recorded locally; no native window action ran in browser preview.`,
  };
}

async function executeNativeWindowAction(command: SurfaceCommand): Promise<SurfaceCommandResult> {
  try {
    if (command.type === "demo.window.close") {
      await getCurrentWindow().close();
    } else if (command.type === "demo.window.minimize") {
      await getCurrentWindow().minimize();
    } else if (command.type === "demo.window.toggle-maximize") {
      await getCurrentWindow().toggleMaximize();
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

export function createDemoHostBridge(actionLog: DemoActionLog): SurfaceHostBridge {
  return {
    async execute(command) {
      let result: SurfaceCommandResult;
      if (windowCommands.has(command.type)) {
        result = isTauri() ? await executeNativeWindowAction(command) : browserWindowResult(command);
      } else if (command.type === "demo.screen.open" && typeof command.payload?.screenId === "string") {
        openDemoScreen(command.payload.screenId);
        result = { ok: true, data: { screenId: command.payload.screenId, recordedLocally: true } };
      } else if (command.type === "demo.navigation.select" && command.payload?.surfaceType === "home") {
        openDemoScreen(acceptedScreenId);
        result = { ok: true, data: { screenId: acceptedScreenId, recordedLocally: true } };
      } else {
        result = { ok: true, data: { recordedLocally: true } };
      }
      actionLog.record(command, result);
      return result;
    },
  };
}
