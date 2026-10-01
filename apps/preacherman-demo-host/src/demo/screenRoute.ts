export const screenIndexPath = "/__screens";
export const localSurfacePath = "/__surfaces";
export const acceptedScreenId = "figma-281-538";

export type LocalSurfaceType =
  | "home"
  | "workspace"
  | "lab"
  | "market"
  | "test"
  | "ledger"
  | "settings"
  | "account"
  | "asset"
  | "extension";

export interface DemoScreenRoute {
  readonly kind: "index" | "screen" | "surface";
  readonly screenId?: string;
  readonly surfaceType?: LocalSurfaceType;
}

export function readDemoScreenRoute(pathname = window.location.pathname): DemoScreenRoute {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === screenIndexPath) {
    return { kind: "index" };
  }
  if (normalized.startsWith(`${screenIndexPath}/`)) {
    return { kind: "screen", screenId: decodeURIComponent(normalized.slice(screenIndexPath.length + 1)) };
  }
  if (normalized.startsWith(`${localSurfacePath}/`)) {
    return {
      kind: "surface",
      surfaceType: decodeURIComponent(normalized.slice(localSurfacePath.length + 1)) as LocalSurfaceType,
    };
  }
  return { kind: "screen", screenId: acceptedScreenId };
}

function publishRoute(pathname: string) {
  history.pushState({}, "", pathname);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function openDemoScreen(screenId: string) {
  publishRoute(`${screenIndexPath}/${encodeURIComponent(screenId)}`);
}

export function openDemoScreenIndex() {
  publishRoute(screenIndexPath);
}

export function openLocalSurface(surfaceType: LocalSurfaceType) {
  if (surfaceType === "home") {
    openDemoScreen(acceptedScreenId);
    return;
  }
  publishRoute(`${localSurfacePath}/${encodeURIComponent(surfaceType)}`);
}
