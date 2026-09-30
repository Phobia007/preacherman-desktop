export const MARKET_SEARCH_HISTORY_KEY = "preacherman.market.searchHistory";
export const MARKET_SEARCH_HISTORY_LIMIT = 12;
export type MarketSearchItem = { id: string; name: string; image: string; summary: string };

/** Read the authored Discover cards after its ready handshake, keeping one catalog. */
export function readMarketSearchModels(doc: Document): MarketSearchItem[] {
  return [...doc.querySelectorAll<HTMLElement>(".descriptive-card[data-character-id]")].flatMap(card => {
    const image = card.querySelector<HTMLImageElement>("img"), title = card.querySelector("h2"), summary = card.querySelector(".descriptive-card__description");
    if (!image || !title || !card.dataset.characterId) return [];
    return [{ id: card.dataset.characterId, name: image.alt || title.textContent?.trim() || "", image: image.getAttribute("src") || "", summary: summary?.textContent?.trim() || "" }];
  });
}

export const cleanSearchQuery = (query: string) => query.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").trim().replace(/\s+/g, " ").slice(0, 120);
const normalize = (query: string) => cleanSearchQuery(query).toLocaleLowerCase().replace(/[-_/]+/g, " ");

export function searchMarketModels<T extends MarketSearchItem>(items: readonly T[], query: string): T[] {
  const normalized = normalize(query);
  if (!normalized) return [];
  const words = normalized.split(/\s+/);
  return items.filter(item => {
    const haystack = normalize(`${item.name} ${item.id} ${item.summary}`);
    return words.every(word => haystack.includes(word));
  }).sort((a, b) => Number(normalize(b.name) === normalized) - Number(normalize(a.name) === normalized));
}

export function sanitizeSearchHistory(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap(item => {
    if (typeof item !== "string") return [];
    const query = cleanSearchQuery(item), key = normalize(query);
    if (!key || seen.has(key) || seen.size >= MARKET_SEARCH_HISTORY_LIMIT) return [];
    seen.add(key); return [query];
  });
}

export function readSearchHistory(storage: Pick<Storage, "getItem">): string[] {
  try { return sanitizeSearchHistory(JSON.parse(storage.getItem(MARKET_SEARCH_HISTORY_KEY) || "[]")); }
  catch { return []; }
}
export function rememberSearch(history: readonly string[], query: string) {
  return sanitizeSearchHistory([query, ...history]);
}
export function removeSearch(history: readonly string[], query: string) {
  return history.filter(item => normalize(item) !== normalize(query));
}
