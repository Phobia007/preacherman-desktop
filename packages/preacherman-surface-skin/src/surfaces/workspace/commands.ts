import type { SurfaceCommand } from "../../adapter/types";

export type WindowAction = "close" | "minimize" | "toggle-maximize";

export function windowCommand(action: WindowAction): SurfaceCommand {
  return {
    type: `demo.window.${action}`,
  };
}

export function navigationCommand(surfaceType: string): SurfaceCommand {
  return {
    type: "demo.navigation.select",
    payload: { surfaceType },
  };
}

export const notificationCommand: SurfaceCommand = {
  type: "demo.notifications.open",
};

export const userCommand: SurfaceCommand = {
  type: "demo.user.open",
};
