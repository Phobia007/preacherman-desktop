import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { LiveCoordinator } from "./LiveCoordinator";

const LiveCoordinatorContext = createContext<LiveCoordinator | null>(null);
export type AvatarInteractionState = "idle" | "listening" | "thinking" | "speaking";
type AvatarStateListener = (state: AvatarInteractionState) => void;

export class AvatarInteractionController {
  private state: AvatarInteractionState = "idle";
  private readonly listeners = new Set<AvatarStateListener>();

  getState(): AvatarInteractionState {
    return this.state;
  }

  setState(state: AvatarInteractionState): void {
    if (state === this.state) return;
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }

  subscribe(listener: AvatarStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

const AvatarInteractionContext = createContext<AvatarInteractionController | null>(null);

export function LiveCoordinatorProvider({ children }: { readonly children: ReactNode }) {
  const [coordinator] = useState(() => new LiveCoordinator());
  const [avatarInteraction] = useState(() => new AvatarInteractionController());
  return <LiveCoordinatorContext.Provider value={coordinator}>
    <AvatarInteractionContext.Provider value={avatarInteraction}>{children}</AvatarInteractionContext.Provider>
  </LiveCoordinatorContext.Provider>;
}

export function useLiveCoordinator(): LiveCoordinator {
  const coordinator = useContext(LiveCoordinatorContext);
  if (!coordinator) throw new Error("useLiveCoordinator must be used inside LiveCoordinatorProvider");
  return coordinator;
}

export function useAvatarInteractionController(): AvatarInteractionController {
  const controller = useContext(AvatarInteractionContext);
  if (!controller) throw new Error("useAvatarInteractionController must be used inside LiveCoordinatorProvider");
  return controller;
}

export function useAvatarInteractionState(): AvatarInteractionState {
  const controller = useAvatarInteractionController();
  const [state, setState] = useState(() => controller.getState());
  useEffect(() => controller.subscribe(setState), [controller]);
  return state;
}
