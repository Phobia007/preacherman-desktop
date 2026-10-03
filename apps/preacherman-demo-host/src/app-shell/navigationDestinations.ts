import type { LocalSurfaceType } from "../demo/screenRoute";

// Keep the persisted route identities while naming destinations for the current UI.
// workspace = Task, market = Gallery, ledger = Market.
export const brandNavigationItems = [
  { label: "Home", surfaceType: "home" },
  { label: "Task", surfaceType: "workspace" },
  { label: "Gallery", surfaceType: "market" },
  { label: "Market", surfaceType: "ledger" },
  { label: "Asset", surfaceType: "asset" },
  { label: "Extension", surfaceType: "extension" },
] as const satisfies readonly { label: string; surfaceType: LocalSurfaceType }[];
