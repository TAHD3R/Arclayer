const FAVORITE_OVERLAY_MODE_PARAM = "arclayer_favorite_overlay";
const FAVORITE_OVERLAY_CONTENT_ONLY_MODE = "content-only";
const FAVORITE_OVERLAY_BASE_URL = "https://arclayer.local";

function normalizeSearchString(searchStr: string): string {
  return searchStr.startsWith("?") ? searchStr.slice(1) : searchStr;
}

export function isFavoriteOverlayContentOnly(searchStr: string): boolean {
  return (
    new URLSearchParams(normalizeSearchString(searchStr)).get(FAVORITE_OVERLAY_MODE_PARAM) ===
    FAVORITE_OVERLAY_CONTENT_ONLY_MODE
  );
}

export function buildFavoriteOverlayEmbedHref(path: string): string {
  const url = new URL(path, FAVORITE_OVERLAY_BASE_URL);
  url.searchParams.set(FAVORITE_OVERLAY_MODE_PARAM, FAVORITE_OVERLAY_CONTENT_ONLY_MODE);
  return `${url.pathname}${url.search}${url.hash}`;
}
