export const MASONRY_NEXT_PAGE_PLACEHOLDER_COUNT = 24;
export const MASONRY_PREFETCH_THRESHOLD = 8;

export function canRequestAssetsMasonryNextPage(params: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  requestInFlight: boolean;
}) {
  return params.hasNextPage && !params.isFetchingNextPage && !params.requestInFlight;
}

export function getAssetsMasonryVirtualTotalItems(params: {
  loadedItemCount: number;
  hasNextPage: boolean;
}) {
  return params.loadedItemCount + (params.hasNextPage ? MASONRY_NEXT_PAGE_PLACEHOLDER_COUNT : 0);
}

export function shouldShowAssetsMasonryPlaceholders(params: {
  queuedNextPage: boolean;
  isFetchingNextPage: boolean;
}) {
  return params.queuedNextPage || params.isFetchingNextPage;
}

export function shouldClearQueuedAssetsMasonryPage(params: {
  queuedNextPage: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  loadedItemCount: number;
  requestBaseCount: number | null;
}) {
  if (!params.queuedNextPage) return false;
  if (params.isFetchingNextPage) return false;
  if (!params.hasNextPage) return true;
  if (params.requestBaseCount === null) return true;
  return params.loadedItemCount > params.requestBaseCount;
}
