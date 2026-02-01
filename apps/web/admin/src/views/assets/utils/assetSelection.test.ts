import { describe, expect, test } from "vitest";

import {
  clearSelection,
  selectOrClearOnPlainClick,
  rangeSelect,
  selectOnly,
  toggleSelect,
  type AssetSelectionState,
} from "./assetSelection";

function state(selected: string[] = [], lastActiveId: string | null = null): AssetSelectionState {
  return {
    selectedIds: new Set(selected),
    lastActiveId,
  };
}

describe("assetSelection", () => {
  test("selectOnly replaces selection and sets lastActiveId", () => {
    const next = selectOnly(state(["a", "b"], "b"), "c");
    expect(Array.from(next.selectedIds)).toEqual(["c"]);
    expect(next.lastActiveId).toBe("c");
  });

  test("selectOrClearOnPlainClick clears selection when clicking the only selected item (single click)", () => {
    const next = selectOrClearOnPlainClick(state(["a"], "a"), "a", 1);
    expect(next.selectedIds.size).toBe(0);
    expect(next.lastActiveId).toBe(null);
  });

  test("selectOrClearOnPlainClick keeps selection on the second click of a double-click", () => {
    const next = selectOrClearOnPlainClick(state(["a"], "a"), "a", 2);
    expect(Array.from(next.selectedIds)).toEqual(["a"]);
    expect(next.lastActiveId).toBe("a");
  });

  test("toggleSelect adds when missing and updates lastActiveId", () => {
    const next = toggleSelect(state(["a"], "a"), "b");
    expect(next.selectedIds.has("a")).toBe(true);
    expect(next.selectedIds.has("b")).toBe(true);
    expect(next.lastActiveId).toBe("b");
  });

  test("toggleSelect removes when present", () => {
    const next = toggleSelect(state(["a", "b"], "b"), "b");
    expect(next.selectedIds.has("a")).toBe(true);
    expect(next.selectedIds.has("b")).toBe(false);
    expect(next.lastActiveId).toBe("b");
  });

  test("rangeSelect selects inclusive range based on orderedIds", () => {
    const ordered = ["a", "b", "c", "d", "e"];
    const next = rangeSelect(state(["a"], "b"), "d", ordered);
    expect(Array.from(next.selectedIds)).toEqual(["b", "c", "d"]);
    expect(next.lastActiveId).toBe("d");
  });

  test("clearSelection empties selection and lastActiveId", () => {
    const next = clearSelection(state(["a", "b"], "b"));
    expect(next.selectedIds.size).toBe(0);
    expect(next.lastActiveId).toBe(null);
  });
});
