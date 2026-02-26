import * as React from "react";
import { describe, expect, test, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { useCanvasPanZoom } from "@/pages/workspaces/editor/hooks/use-canvas-pan-zoom";
import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";

function WheelHarness() {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  useCanvasPanZoom(ref, { extraWheelTargets: [iframeRef] });

  return (
    <>
      <div
        ref={ref}
        data-testid="canvas"
        style={{ width: 200, height: 200, border: "1px solid black" }}
      />
      <iframe ref={iframeRef} data-testid="iframe" title="test-iframe" />
    </>
  );
}

describe("useCanvasPanZoom wheel behavior", () => {
  beforeEach(() => {
    useEditorStore.setState({
      activeTool: "select",
      zoomPercent: 100,
      canvasPanX: 0,
      canvasPanY: 0,
    });
  });

  test("default wheel pans the canvas (deltaY -> panY)", async () => {
    render(<WheelHarness />);
    const canvas = screen.getByTestId("canvas") as HTMLDivElement;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200 }) as DOMRect;

    // wait a tick to ensure the wheel listener is attached
    await waitFor(() => {
      expect(canvas).toBeTruthy();
    });

    fireEvent.wheel(canvas, { deltaX: 0, deltaY: 100, clientX: 10, clientY: 10 });

    const s = useEditorStore.getState();
    expect(s.canvasPanX).toBe(0);
    expect(s.canvasPanY).toBe(-100);
  });

  test("shift+wheel maps vertical wheel to horizontal pan when deltaX is near zero", async () => {
    render(<WheelHarness />);
    const canvas = screen.getByTestId("canvas") as HTMLDivElement;

    fireEvent.wheel(canvas, { deltaX: 0, deltaY: 80, shiftKey: true, clientX: 10, clientY: 10 });

    const s = useEditorStore.getState();
    expect(s.canvasPanX).toBe(-80);
    expect(s.canvasPanY).toBe(0);
  });

  test("ctrl/meta+wheel zooms and adjusts pan around the pointer", async () => {
    render(<WheelHarness />);
    const canvas = screen.getByTestId("canvas") as HTMLDivElement;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200 }) as DOMRect;

    fireEvent.wheel(canvas, {
      deltaX: 0,
      deltaY: -200,
      ctrlKey: true,
      clientX: 100,
      clientY: 100,
    });

    const s = useEditorStore.getState();
    expect(s.zoomPercent).toBeGreaterThan(100);
    // Keeping the pointer as the zoom center requires pan changes.
    expect(s.canvasPanX).not.toBe(0);
    expect(s.canvasPanY).not.toBe(0);
  });

  test("wheel on iframe element also pans the canvas (cross-iframe support)", async () => {
    render(<WheelHarness />);
    const iframe = screen.getByTestId("iframe") as HTMLIFrameElement;

    fireEvent.wheel(iframe, { deltaX: 0, deltaY: 60, clientX: 10, clientY: 10 });

    const s = useEditorStore.getState();
    expect(s.canvasPanY).toBe(-60);
  });
});
