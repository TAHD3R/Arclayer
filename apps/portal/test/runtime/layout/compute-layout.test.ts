import { describe, expect, test } from "vitest";

import { computeLayoutBoxes } from "@celestial/renderer";
import type { LayoutNode } from "@celestial/renderer";

describe("layout engine (computeLayoutBoxes)", () => {
  test("absolute constraints: right/center/leftRight/scale", () => {
    const nodesById: Record<string, LayoutNode> = {
      root: {
        id: "root",
        type: "page",
        childrenLayout: { mode: "absolute" },
        children: ["right", "center", "stretch", "scale"],
      },
      right: {
        id: "right",
        type: "frame",
        positioning: {
          kind: "absolute",
          rect: { x: 1240, y: 40, width: 200, height: 100 },
          constraints: { horizontal: "right", vertical: "top" },
        },
      },
      center: {
        id: "center",
        type: "frame",
        positioning: {
          kind: "absolute",
          rect: { x: 620, y: 0, width: 200, height: 50 },
          constraints: { horizontal: "center", vertical: "top" },
        },
      },
      stretch: {
        id: "stretch",
        type: "frame",
        positioning: {
          kind: "absolute",
          rect: { x: 100, y: 0, width: 1000, height: 20 },
          constraints: { horizontal: "leftRight", vertical: "top" },
        },
      },
      scale: {
        id: "scale",
        type: "frame",
        positioning: {
          kind: "absolute",
          rect: { x: 100, y: 10, width: 200, height: 40 },
          constraints: { horizontal: "scale", vertical: "scale" },
        },
      },
    };

    const out = computeLayoutBoxes({
      rootId: "root",
      nodesById,
      viewport: { width: 1024, height: 800, baseWidth: 1440, baseHeight: 800 },
    });

    expect(out.warnings).toHaveLength(0);

    // Parent width delta: 1024 - 1440 = -416
    expect(out.boxesById.right).toMatchObject({ x: 824, y: 40, width: 200, height: 100 });
    // center shifts by delta/2: -208
    expect(out.boxesById.center).toMatchObject({ x: 412, y: 0, width: 200, height: 50 });
    // leftRight stretches width by delta: 1000 - 416 = 584
    expect(out.boxesById.stretch).toMatchObject({ x: 100, y: 0, width: 584, height: 20 });

    const scaleX = 1024 / 1440;
    const scaleY = 800 / 800;
    expect(out.boxesById.scale?.x).toBeCloseTo(100 * scaleX, 6);
    expect(out.boxesById.scale?.y).toBeCloseTo(10 * scaleY, 6);
    expect(out.boxesById.scale?.width).toBeCloseTo(200 * scaleX, 6);
    expect(out.boxesById.scale?.height).toBeCloseTo(40 * scaleY, 6);
  });

  test("auto layout: column + padding/gap + align center + justify center", () => {
    const nodesById: Record<string, LayoutNode> = {
      root: {
        id: "root",
        type: "page",
        childrenLayout: {
          mode: "auto",
          direction: "column",
          padding: 10,
          gap: 5,
          alignItems: "center",
          justifyContent: "center",
        },
        children: ["a", "b"],
      },
      a: {
        id: "a",
        type: "frame",
        positioning: { kind: "absolute", rect: { x: 0, y: 0, width: 100, height: 20 } },
      },
      b: {
        id: "b",
        type: "frame",
        positioning: { kind: "absolute", rect: { x: 0, y: 0, width: 80, height: 30 } },
      },
    };

    const out = computeLayoutBoxes({
      rootId: "root",
      nodesById,
      viewport: { width: 400, height: 400, baseWidth: 400, baseHeight: 400 },
    });

    // inner box: 380 x 380 (padding 10)
    // total main: 20 + 30 + 5 = 55
    // extra: 380 - 55 = 325, start offset: 162.5
    // a: x = 10 + (380 - 100)/2 = 150
    // a: y = 10 + 162.5 = 172.5
    expect(out.boxesById.a).toMatchObject({ x: 150, y: 172.5, width: 100, height: 20 });

    // b: x = 10 + (380 - 80)/2 = 160
    // b: y = 172.5 + 20 + 5 = 197.5
    expect(out.boxesById.b).toMatchObject({ x: 160, y: 197.5, width: 80, height: 30 });
  });

  test("viewport switch: 1440/1024/768/375 produces predictable constraint results", () => {
    const nodesById: Record<string, LayoutNode> = {
      root: {
        id: "root",
        type: "page",
        childrenLayout: { mode: "absolute" },
        children: ["right", "center", "stretch"],
      },
      right: {
        id: "right",
        type: "frame",
        positioning: {
          kind: "absolute",
          rect: { x: 1240, y: 40, width: 200, height: 100 },
          constraints: { horizontal: "right", vertical: "top" },
        },
      },
      center: {
        id: "center",
        type: "frame",
        positioning: {
          kind: "absolute",
          rect: { x: 620, y: 0, width: 200, height: 50 },
          constraints: { horizontal: "center", vertical: "top" },
        },
      },
      stretch: {
        id: "stretch",
        type: "frame",
        positioning: {
          kind: "absolute",
          rect: { x: 100, y: 0, width: 1000, height: 20 },
          constraints: { horizontal: "leftRight", vertical: "top" },
        },
      },
    };

    const widths = [1440, 1024, 768, 375] as const;
    for (const width of widths) {
      const out = computeLayoutBoxes({
        rootId: "root",
        nodesById,
        viewport: { width, height: 800, baseWidth: 1440, baseHeight: 800 },
      });

      expect(out.warnings).toHaveLength(0);

      // right-anchored: keep right offset constant (base right offset is 0).
      expect(out.boxesById.right).toMatchObject({ x: width - 200, y: 40, width: 200, height: 100 });

      // center: shift by delta/2.
      expect(out.boxesById.center).toMatchObject({
        x: 620 + (width - 1440) / 2,
        y: 0,
        width: 200,
        height: 50,
      });

      // leftRight: width changes by deltaW and is clamped to >= 0.
      const stretchWidth = Math.max(0, 1000 + (width - 1440));
      expect(out.boxesById.stretch).toMatchObject({
        x: 100,
        y: 0,
        width: stretchWidth,
        height: 20,
      });
    }
  });
});
