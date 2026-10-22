import type { LocalSurfaceType } from "../demo/screenRoute";

// Keep the persisted route identities while naming destinations for the current UI.
// workspace = Task, market = Gallery, ledger = Market.
export const brandNavigationItems = [
  { label: "Home", surfaceType: "home" },
  { label: "Asset", surfaceType: "asset" },
  { label: "Market", surfaceType: "ledger" },
  { label: "Extension", surfaceType: "extension" },
  { label: "Task", surfaceType: "workspace" },
  { label: "Gallery", surfaceType: "market" },
] as const satisfies readonly { label: string; surfaceType: LocalSurfaceType }[];
