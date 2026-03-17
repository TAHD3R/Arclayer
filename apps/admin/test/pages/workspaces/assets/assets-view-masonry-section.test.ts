import { describe, expect, it } from "vitest";

import {
  getAssetsMasonryDatasetKey,
  getAssetsMasonryMaxColumnCount,
  getAssetsMasonryItemKey,
} from "@/pages/workspaces/assets/components/assets-view-masonry-keys";

describe("AssetsViewMasonrySection", () => {
  it("returns a stable fallback key when masonic asks for a missing item", () => {
    expect(getAssetsMasonryItemKey(undefined, 7)).toBe("missing:7");
  });

  it("returns the real key when the masonry item exists", () => {
    expect(getAssetsMasonryItemKey({ key: "asset-1" }, 0)).toBe("asset-1");
  });

  it("includes the ordered asset ids in the masonry dataset key", () => {
    expect(getAssetsMasonryDatasetKey("query-key", ["a", "b", "c"])).toBe("query-key:a|b|c");
  });

  it("caps masonry columns based on the available width", () => {
    expect(getAssetsMasonryMaxColumnCount(0)).toBe(5);
    expect(getAssetsMasonryMaxColumnCount(900)).toBe(3);
    expect(getAssetsMasonryMaxColumnCount(3200)).toBe(8);
  });
});
