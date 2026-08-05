const FAVORITE_OVERLAY_MODE_PARAM = "arclayer_favorite_overlay";
const FAVORITE_OVERLAY_CONTENT_ONLY_MODE = "content-only";
const FAVORITE_OVERLAY_BASE_URL = "https://arclayer.local";

function normalizeSearchString(searchStr: string | null | undefined): string {
  if (!searchStr) return "";
  return searchStr.startsWith("?") ? searchStr.slice(1) : searchStr;
}

export function isFavoriteOverlayContentOnly(searchStr: string | null | undefined): boolean {
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

export function buildFavoriteOverlaySearchUpdater(searchStr: string | null | undefined) {
  if (!isFavoriteOverlayContentOnly(searchStr)) {
    return undefined;
  }

  return (prev: Record<string, unknown>) => ({
    ...prev,
    [FAVORITE_OVERLAY_MODE_PARAM]: FAVORITE_OVERLAY_CONTENT_ONLY_MODE,
  });
}
