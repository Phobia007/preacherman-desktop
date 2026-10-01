import type {
  SurfaceCommandResult,
  SurfaceHostBridge,
} from "@preacherman/surface-skin";
import type { DemoActionLog } from "./actionLog";
import {
  acceptedScreenId,
  openDemoScreen,
  openLocalSurface,
  type LocalSurfaceType,
} from "./demo/screenRoute";
import { executeWindowCommand, isWindowCommand } from "./tauriClient";

const localSurfaceTypes = new Set<LocalSurfaceType>([
  "home",
  "workspace",
  "lab",
  "market",
  "test",
  "ledger",
  "settings",
  "account",
  "asset",
  "extension",
]);

export function createDemoHostBridge(actionLog: DemoActionLog): SurfaceHostBridge {
  return {
    async execute(command) {
      let result: SurfaceCommandResult;
      if (isWindowCommand(command)) {
        result = await executeWindowCommand(command);
      } else if (command.type === "demo.screen.open" && typeof command.payload?.screenId === "string") {
        openDemoScreen(command.payload.screenId);
        result = { ok: true, data: { screenId: command.payload.screenId, recordedLocally: true } };
      } else if (
        command.type === "demo.navigation.select"
        && typeof command.payload?.surfaceType === "string"
        && localSurfaceTypes.has(command.payload.surfaceType as LocalSurfaceType)
      ) {
        const surfaceType = command.payload.surfaceType as LocalSurfaceType;
        openLocalSurface(surfaceType);
        result = {
          ok: true,
          data: {
            screenId: surfaceType === "home" ? acceptedScreenId : undefined,
            surfaceType,
            recordedLocally: true,
          },
        };
      } else {
        result = { ok: true, data: { recordedLocally: true } };
      }
      actionLog.record(command, result);
      return result;
    },
  };
}
