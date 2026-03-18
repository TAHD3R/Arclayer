import { describe, expect, it } from "vitest";

import {
  getAssetsMasonryDatasetKey,
  getAssetsMasonryMaxColumnCount,
  getAssetsMasonryItemKey,
} from "@/pages/workspaces/assets/components/assets-view-masonry-keys";
import {
  canRequestAssetsMasonryNextPage,
  getAssetsMasonryVirtualTotalItems,
  MASONRY_NEXT_PAGE_PLACEHOLDER_COUNT,
  shouldClearQueuedAssetsMasonryPage,
  shouldShowAssetsMasonryPlaceholders,
} from "@/pages/workspaces/assets/components/assets-view-masonry-loading";

describe("AssetsViewMasonrySection", () => {
  it("returns a stable fallback key when masonic asks for a missing item", () => {
    expect(getAssetsMasonryItemKey(undefined, 7)).toBe("missing:7");
  });

  it("returns the real key when the masonry item exists", () => {
    expect(getAssetsMasonryItemKey({ key: "asset-1" }, 0)).toBe("asset-1");
  });

  it("includes the ordered asset ids in the masonry dataset key", () => {
    expect(getAssetsMasonryDatasetKey("query-key", ["a", "b", "c"], 5)).toBe(
      "query-key:a|b|c:render:5",
    );
  });

  it("caps masonry columns based on the available width", () => {
    expect(getAssetsMasonryMaxColumnCount(0)).toBe(5);
    expect(getAssetsMasonryMaxColumnCount(900)).toBe(3);
    expect(getAssetsMasonryMaxColumnCount(3200)).toBe(8);
  });

  it("reserves one placeholder batch in virtual total when another page exists", () => {
    expect(
      getAssetsMasonryVirtualTotalItems({
        loadedItemCount: 24,
        hasNextPage: true,
      }),
    ).toBe(24 + MASONRY_NEXT_PAGE_PLACEHOLDER_COUNT);
    expect(
      getAssetsMasonryVirtualTotalItems({
        loadedItemCount: 24,
        hasNextPage: false,
      }),
    ).toBe(24);
  });

  it("deduplicates next-page requests while a request is already in flight", () => {
    expect(
      canRequestAssetsMasonryNextPage({
        hasNextPage: true,
        isFetchingNextPage: false,
        requestInFlight: false,
      }),
    ).toBe(true);
    expect(
      canRequestAssetsMasonryNextPage({
        hasNextPage: true,
        isFetchingNextPage: false,
        requestInFlight: true,
      }),
    ).toBe(false);
  });

  it("keeps placeholders visible until the next page actually lands", () => {
    expect(
      shouldShowAssetsMasonryPlaceholders({
        queuedNextPage: true,
        isFetchingNextPage: false,
      }),
    ).toBe(true);
    expect(
      shouldClearQueuedAssetsMasonryPage({
        queuedNextPage: true,
        isFetchingNextPage: false,
        hasNextPage: true,
        loadedItemCount: 48,
        requestBaseCount: 24,
      }),
    ).toBe(true);
    expect(
      shouldClearQueuedAssetsMasonryPage({
        queuedNextPage: true,
        isFetchingNextPage: false,
        hasNextPage: true,
        loadedItemCount: 24,
        requestBaseCount: 24,
      }),
    ).toBe(false);
  });
});
