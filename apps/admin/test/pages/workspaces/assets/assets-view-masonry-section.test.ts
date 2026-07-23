import { describe, expect, it } from "vitest";

import {
  getAdminMasonryDatasetKey,
  getAdminMasonryItemKey,
  getAdminMasonryMaxColumnCount,
} from "@/components/common/admin-masonry-grid";
import {
  canRequestAssetsMasonryNextPage,
  getAssetsMasonryVirtualTotalItems,
  MASONRY_NEXT_PAGE_PLACEHOLDER_COUNT,
  shouldClearQueuedAssetsMasonryPage,
  shouldShowAssetsMasonryPlaceholders,
} from "@/pages/workspaces/assets/components/assets-view-masonry-loading";

describe("AssetsViewMasonrySection", () => {
  it("returns a stable fallback key when masonic asks for a missing item", () => {
    expect(getAdminMasonryItemKey(undefined, 7)).toBe("missing:7");
  });

  it("returns the real key when the masonry item exists", () => {
    expect(getAdminMasonryItemKey({ key: "asset-1" }, 0)).toBe("asset-1");
  });

  it("uses query identity and ordered asset ids for the masonry dataset key", () => {
    expect(getAdminMasonryDatasetKey("query-key", ["a", "b", "c"])).toBe("query-key:a|b|c");
  });

  it("caps masonry columns based on the available width", () => {
    expect(getAdminMasonryMaxColumnCount(0)).toBe(5);
    expect(getAdminMasonryMaxColumnCount(900)).toBe(3);
    expect(getAdminMasonryMaxColumnCount(3200)).toBe(8);
    expect(getAdminMasonryMaxColumnCount(900, null, 210)).toBe(4);
  });

  it("keeps the previous column count while width is still inside the resize buffer", () => {
    expect(getAdminMasonryMaxColumnCount(1080, 4)).toBe(4);
    expect(getAdminMasonryMaxColumnCount(1060, 4)).toBe(3);
    expect(getAdminMasonryMaxColumnCount(1096, 3)).toBe(3);
    expect(getAdminMasonryMaxColumnCount(1116, 3)).toBe(4);
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
