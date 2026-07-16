export const screenIndexPath = "/__screens";
export const acceptedScreenId = "figma-281-538";

export interface DemoScreenRoute {
  readonly kind: "index" | "screen";
  readonly screenId?: string;
}

export function readDemoScreenRoute(pathname = window.location.pathname): DemoScreenRoute {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === screenIndexPath) {
    return { kind: "index" };
  }
  if (normalized.startsWith(`${screenIndexPath}/`)) {
    return { kind: "screen", screenId: decodeURIComponent(normalized.slice(screenIndexPath.length + 1)) };
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
