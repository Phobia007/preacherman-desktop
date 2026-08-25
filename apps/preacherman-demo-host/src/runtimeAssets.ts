const PRODUCTION_UI_ORIGIN = "http://127.0.0.1:8788";

export function runtimeAssetUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return import.meta.env.DEV ? normalized : `${PRODUCTION_UI_ORIGIN}/ui${normalized}`;
}
