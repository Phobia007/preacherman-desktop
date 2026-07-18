function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
export function localAvatarAssetBaseUrl(
  baseUrl = import.meta.env.BASE_URL,
): string {
  return `${withTrailingSlash(baseUrl)}local-avatar/`;
}
