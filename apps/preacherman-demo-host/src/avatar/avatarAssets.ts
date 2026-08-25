import type { ModelId } from "../preferences";
import { runtimeAssetUrl } from "../runtimeAssets";

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
export function localAvatarAssetBaseUrl(
  modelId: ModelId = "cortana",
  baseUrl = import.meta.env.BASE_URL,
): string {
  const resolvedBaseUrl = baseUrl === import.meta.env.BASE_URL
    ? runtimeAssetUrl("/")
    : baseUrl;
  return `${withTrailingSlash(resolvedBaseUrl)}assets/avatars/${modelId}/`;
}
