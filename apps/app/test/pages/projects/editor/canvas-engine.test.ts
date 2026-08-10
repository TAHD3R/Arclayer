import { describe, expect, it } from "vitest";

import {
  fitCanvasViewport,
  panCanvasViewport,
  screenToCanvasWorld,
  worldToCanvasScreen,
  zoomCanvasViewport,
} from "@/pages/projects/editor/canvas/canvas-engine";

describe("canvas engine viewport math", () => {
  it("keeps the zoom anchor stable in world coordinates", () => {
    const viewport = { x: 40, y: 24, zoom: 1 };
    const anchor = { x: 220, y: 140 };
    const worldBefore = screenToCanvasWorld(anchor, viewport);
    const zoomed = zoomCanvasViewport(viewport, 1.5, anchor, 0.45, 1.65);

    expect(screenToCanvasWorld(anchor, zoomed)).toEqual(worldBefore);
  });

  it("clamps zoom and preserves pan deltas", () => {
    const viewport = { x: 4, y: 8, zoom: 1 };
    expect(zoomCanvasViewport(viewport, 4, { x: 0, y: 0 }, 0.5, 2).zoom).toBe(2);
    expect(panCanvasViewport(viewport, { x: -12, y: 16 })).toEqual({ x: -8, y: 24, zoom: 1 });
  });

  it("fits content inside the available surface with a safe area", () => {
    const viewport = fitCanvasViewport({
      bounds: { x: 0, y: 0, width: 800, height: 400 },
      surfaceWidth: 1000,
      surfaceHeight: 700,
      minZoom: 0.45,
      maxZoom: 1.65,
      fitMaxZoom: 1,
      padding: 50,
      bottomSafeArea: 50,
    });

    expect(viewport).toEqual({ x: 100, y: 125, zoom: 1 });
    if (!viewport) return;
    expect(worldToCanvasScreen({ x: 800, y: 400 }, viewport)).toEqual({ x: 900, y: 525 });
  });
});
