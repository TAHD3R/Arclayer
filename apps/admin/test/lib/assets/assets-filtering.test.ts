import { describe, expect, test } from "vitest";

import { isExplicitAssetsFilterActive } from "@/lib/assets/assets-filtering";

describe("assets-filtering", () => {
  test("isExplicitAssetsFilterActive returns false for default state (no search, no extra filters)", () => {
    expect(
      isExplicitAssetsFilterActive({
        searchQuery: "",
        visibility: "public",
      }),
    ).toBe(false);
  });

  test("isExplicitAssetsFilterActive returns true when searchQuery is present", () => {
    expect(isExplicitAssetsFilterActive({ searchQuery: "cat", visibility: "public" })).toBe(true);
  });

  test("isExplicitAssetsFilterActive returns true when visibility is not default public", () => {
    expect(isExplicitAssetsFilterActive({ searchQuery: "", visibility: "private" })).toBe(true);
  });

  test("isExplicitAssetsFilterActive returns true when mimePrefix/tagIds/date filters are set", () => {
    expect(
      isExplicitAssetsFilterActive({ searchQuery: "", mimePrefix: "image/", visibility: "public" }),
    ).toBe(true);
    expect(
      isExplicitAssetsFilterActive({ searchQuery: "", tagIds: ["t1"], visibility: "public" }),
    ).toBe(true);
    expect(
      isExplicitAssetsFilterActive({
        searchQuery: "",
        createdFrom: "2026-01-01",
        visibility: "public",
      }),
    ).toBe(true);
  });
});
