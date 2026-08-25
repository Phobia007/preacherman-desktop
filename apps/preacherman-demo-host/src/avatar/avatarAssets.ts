import type { ModelId } from "../preferences";

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
export function localAvatarAssetBaseUrl(
  modelId: ModelId = "cortana",
  baseUrl = import.meta.env.BASE_URL,
): string {
  return `${withTrailingSlash(baseUrl)}assets/avatars/${modelId}/`;
}
