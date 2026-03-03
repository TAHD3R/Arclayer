import { describe, expect, test } from "vitest";

import { resolveDesignNodeAtBreakpointV1 } from "@celestial/renderer";
import type { DesignNodeV1 } from "@celestial/block-protocol";

describe("DesignDocument v1 responsive overrides (deep merge rules)", () => {
  test("deep merges nested layout/style fields (no shallow overwrite regression)", () => {
    const base: DesignNodeV1 = {
      id: "a",
      type: "frame",
      children: [],
      layout: {
        self: {
          rect: { x: 10, y: 20, width: 300, height: 200 },
          constraints: { horizontal: "leftRight", vertical: "top" },
          alignX: "start",
          alignY: "start",
        },
        children: {
          mode: "auto",
          direction: "row",
          gap: 8,
          padding: 12,
          alignItems: "center",
          justifyContent: "space-between",
          wrap: "nowrap",
        },
      },
      style: {
        backgroundColor: "#ffffff",
        typography: { fontSize: 12, lineHeight: 16, fontWeight: 400 },
      },
      responsive: {
        mobile: {
          layout: {
            // Only override a nested leaf field; merge must keep mode/direction/padding/etc.
            children: { gap: 20 },
            self: { rect: { width: 200 } },
          },
          style: {
            typography: { lineHeight: 18 },
          },
        },
      },
    };

    const resolved = resolveDesignNodeAtBreakpointV1({ node: base, breakpoint: "mobile" });

    expect(resolved.layout?.children).toMatchObject({
      mode: "auto",
      direction: "row",
      gap: 20,
      padding: 12,
      alignItems: "center",
      justifyContent: "space-between",
      wrap: "nowrap",
    });

    // self.rect should merge width only, keeping x/y/height.
    expect(resolved.layout?.self?.rect).toMatchObject({ x: 10, y: 20, width: 200, height: 200 });

    // typography should deep-merge: keep fontSize/fontWeight, override lineHeight.
    expect(resolved.style?.typography).toMatchObject({
      fontSize: 12,
      lineHeight: 18,
      fontWeight: 400,
    });
  });
});
