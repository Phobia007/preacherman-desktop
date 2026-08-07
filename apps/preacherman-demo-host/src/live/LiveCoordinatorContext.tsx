import { createContext, useContext, useState, type ReactNode } from "react";
import { LiveCoordinator } from "./LiveCoordinator";

const LiveCoordinatorContext = createContext<LiveCoordinator | null>(null);

export function LiveCoordinatorProvider({ children }: { readonly children: ReactNode }) {
  const [coordinator] = useState(() => new LiveCoordinator());
  return <LiveCoordinatorContext.Provider value={coordinator}>{children}</LiveCoordinatorContext.Provider>;
}

export function useLiveCoordinator(): LiveCoordinator {
  const coordinator = useContext(LiveCoordinatorContext);
  if (!coordinator) throw new Error("useLiveCoordinator must be used inside LiveCoordinatorProvider");
  return coordinator;
}
