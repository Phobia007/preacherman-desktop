import type { LocalSurfaceType } from "../demo/screenRoute";

export type TaskActionId =
  | "task.create"
  | "task.confirm"
  | "task.steer"
  | "task.resume"
  | "task.approve"
  | "task.reject"
  | "task.cancel"
  | "task.retry"
  | "task.events"
  | "task.artifacts"
  | "execution.preacherman-execution"
  | "execution.acceptance"
  | "execution.trace"
  ;

export interface ActionPlacement {
  readonly owner: LocalSurfaceType;
  readonly shortcuts: readonly LocalSurfaceType[];
  readonly intent: "configure" | "execute" | "inspect" | "start";
}

/**
 * Product-level action ownership. An action may be linked from another surface,
 * but its interactive control is rendered only by the owner surface.
 */
export const actionPlacement: Readonly<Record<TaskActionId, ActionPlacement>> = Object.freeze({
  "task.create": { owner: "home", shortcuts: ["workspace"], intent: "start" },
  "task.confirm": { owner: "workspace", shortcuts: ["home"], intent: "execute" },
  "task.steer": { owner: "workspace", shortcuts: ["home", "ledger"], intent: "execute" },
  "task.resume": { owner: "workspace", shortcuts: ["home", "ledger"], intent: "execute" },
  "task.approve": { owner: "workspace", shortcuts: ["home", "ledger"], intent: "execute" },
  "task.reject": { owner: "workspace", shortcuts: ["home", "ledger"], intent: "execute" },
  "task.cancel": { owner: "workspace", shortcuts: ["home", "ledger"], intent: "execute" },
  "task.retry": { owner: "workspace", shortcuts: ["home", "ledger"], intent: "execute" },
  "task.events": { owner: "ledger", shortcuts: ["workspace", "test"], intent: "inspect" },
  "task.artifacts": { owner: "ledger", shortcuts: ["workspace", "test"], intent: "inspect" },
  "execution.preacherman-execution": { owner: "settings", shortcuts: ["workspace", "test"], intent: "configure" },
  "execution.acceptance": { owner: "test", shortcuts: ["settings"], intent: "execute" },
  "execution.trace": { owner: "test", shortcuts: ["workspace", "ledger"], intent: "inspect" },
});

export function placementForAction(actionId: TaskActionId): ActionPlacement {
  return actionPlacement[actionId];
}

export function isActionOwner(actionId: TaskActionId, surface: LocalSurfaceType): boolean {
  return placementForAction(actionId).owner === surface;
}
