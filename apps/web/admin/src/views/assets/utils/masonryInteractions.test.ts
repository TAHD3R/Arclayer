import { describe, expect, test } from "vitest";

import { shouldClearMasonrySelectionOnMouseDown } from "./masonryInteractions";

describe("masonryInteractions", () => {
  test("shouldClearMasonrySelectionOnMouseDown returns false when clicking inside an asset tile", () => {
    const tile = document.createElement("div");
    tile.setAttribute("data-asset-tile", "true");
    const child = document.createElement("button");
    tile.appendChild(child);

    expect(shouldClearMasonrySelectionOnMouseDown(child)).toBe(false);
  });

  test("shouldClearMasonrySelectionOnMouseDown returns false when clicking inside a folder tile", () => {
    const tile = document.createElement("div");
    tile.setAttribute("data-folder-tile", "true");
    const child = document.createElement("span");
    tile.appendChild(child);

    expect(shouldClearMasonrySelectionOnMouseDown(child)).toBe(false);
  });

  test("shouldClearMasonrySelectionOnMouseDown returns false when clicking inside an antd dropdown menu (portal)", () => {
    const dropdown = document.createElement("div");
    dropdown.className = "ant-dropdown";
    const item = document.createElement("div");
    dropdown.appendChild(item);
    document.body.appendChild(dropdown);

    try {
      expect(shouldClearMasonrySelectionOnMouseDown(item)).toBe(false);
    } finally {
      dropdown.remove();
    }
  });

  test("shouldClearMasonrySelectionOnMouseDown returns true when clicking blank area", () => {
    const blank = document.createElement("div");
    expect(shouldClearMasonrySelectionOnMouseDown(blank)).toBe(true);
  });
});
