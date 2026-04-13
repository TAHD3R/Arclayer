import { describe, expect, it } from "vitest";

import {
  resolveCellPinStyle,
  resolveHeaderPinStyle,
} from "../../../../packages/ui/src/data-table/data-table-presenter-utils";

function buildPinnedColumn(size: number) {
  return {
    getSize: () => size,
    getIsPinned: () => "right" as const,
    getAfter: () => 0,
    getStart: () => 0,
    getIsFirstColumn: () => true,
    getIsLastColumn: () => false,
    columnDef: {
      size,
      minSize: size,
      maxSize: size,
      meta: { kind: "actions" },
    },
  };
}

describe("data-table-presenter-utils", () => {
  it("keeps explicitly sized pinned headers fixed-width", () => {
    const header = {
      column: buildPinnedColumn(56),
    } as Parameters<typeof resolveHeaderPinStyle>[0];

    expect(resolveHeaderPinStyle(header).style).toMatchObject({
      width: 56,
      minWidth: 56,
      maxWidth: 56,
      position: "sticky",
      right: "0px",
    });
  });

  it("keeps explicitly sized pinned cells fixed-width", () => {
    const cell = {
      column: buildPinnedColumn(56),
    } as Parameters<typeof resolveCellPinStyle>[0];

    expect(resolveCellPinStyle(cell).style).toMatchObject({
      width: 56,
      minWidth: 56,
      maxWidth: 56,
      position: "sticky",
      right: "0px",
    });
  });
});
