import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const clientPlatform = vi.hoisted(() => ({
  value: "mac" as "mac" | "windows" | "other",
}));

vi.mock("@arclayer/hooks/use-client-platform", () => ({
  useClientPlatform: () => clientPlatform.value,
}));

import {
  EditorCanvasSurface,
  EditorCanvasZoomControls,
  useEditorCanvasViewport,
} from "@/pages/projects/editor/canvas/editor-canvas";

function CanvasHarness() {
  const canvas = useEditorCanvasViewport();
  return (
    <EditorCanvasSurface
      surfaceRef={canvas.surfaceRef}
      viewport={canvas.viewport}
      handlers={canvas.handlers}
      ariaLabel="Canvas"
    >
      <div />
    </EditorCanvasSurface>
  );
}

function renderCanvas() {
  const view = render(<CanvasHarness />);
  const surface = screen.getByRole("application", { name: "Canvas" });
  Object.defineProperties(surface, {
    clientWidth: { configurable: true, value: 800 },
    clientHeight: { configurable: true, value: 600 },
    getBoundingClientRect: {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 800,
        bottom: 600,
        width: 800,
        height: 600,
        toJSON: () => ({}),
      }),
    },
  });
  return {
    ...view,
    surface,
    world: view.container.querySelector("[data-canvas-world]") as HTMLElement,
  };
}

describe("editor canvas viewport interactions", () => {
  it("uses wheel for vertical pan and Shift+wheel for horizontal pan", () => {
    const { surface, world } = renderCanvas();

    fireEvent.wheel(surface, { deltaX: 24, deltaY: 30 });
    expect(world.style.transform).toBe("translate3d(0px, -30px, 0) scale(1)");

    fireEvent.wheel(surface, { deltaY: 20, shiftKey: true });
    expect(world.style.transform).toBe("translate3d(-20px, -30px, 0) scale(1)");
  });

  it("uses Ctrl+wheel for anchored zoom without panning", () => {
    const { surface, world } = renderCanvas();

    fireEvent.wheel(surface, {
      deltaY: -1,
      ctrlKey: true,
      clientX: 100,
      clientY: 80,
    });

    expect(world.style.transform).toBe("translate3d(-8px, -6.400000000000006px, 0) scale(1.08)");
  });
});

describe("EditorCanvasZoomControls", () => {
  beforeEach(() => {
    clientPlatform.value = "mac";
  });

  it("opens a bottom-right zoom menu with actions and presets", async () => {
    const user = userEvent.setup();
    const onZoomChange = vi.fn();
    const onFit = vi.fn();
    const view = render(
      <EditorCanvasZoomControls
        zoom={1}
        onZoomChange={onZoomChange}
        onFit={onFit}
        labels={{ zoom: "Zoom", zoomOut: "Zoom out", zoomIn: "Zoom in", fit: "Fit canvas" }}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Zoom: 100%" });
    expect(trigger.parentElement).toHaveClass("right-4", "bottom-4");

    await user.click(trigger);
    const zoomIn = screen.getByRole("menuitem", { name: /Zoom in/ });
    expect(zoomIn).toHaveTextContent("⌘+");
    expect(zoomIn.querySelectorAll('[data-slot="kbd"]')).toHaveLength(2);
    expect(zoomIn.parentElement).toHaveClass("space-y-1");
    await user.click(zoomIn);
    expect(onZoomChange).toHaveBeenCalledWith(1.1);

    await user.click(trigger);
    expect(screen.getByRole("menuitemradio", { name: "200%" })).toBeInTheDocument();
    const selectedPreset = screen.getByRole("menuitemradio", { name: /100%/ });
    expect(selectedPreset).toHaveAttribute("aria-checked", "true");
    expect(selectedPreset).toHaveTextContent("⌘0");
    expect(selectedPreset.parentElement).toHaveClass("space-y-1");
    const preset = screen.getByRole("menuitemradio", { name: "50%" });
    expect(preset).not.toHaveTextContent("•");
    await user.click(preset);
    expect(onZoomChange).toHaveBeenCalledWith(0.5);

    view.unmount();
  });

  it("renders Windows shortcut labels with Ctrl", async () => {
    clientPlatform.value = "windows";
    const user = userEvent.setup();
    render(
      <EditorCanvasZoomControls
        zoom={1}
        onZoomChange={vi.fn()}
        onFit={vi.fn()}
        labels={{ zoom: "Zoom", zoomOut: "Zoom out", zoomIn: "Zoom in", fit: "Fit canvas" }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Zoom: 100%" }));
    expect(screen.getByRole("menuitem", { name: /Zoom in/ })).toHaveTextContent("Ctrl+");
    expect(screen.getByRole("menuitemradio", { name: /100%/ })).toHaveTextContent("Ctrl0");
  });

  it("executes zoom shortcuts and ignores editable targets", () => {
    const onZoomChange = vi.fn();
    const onFit = vi.fn();
    render(
      <EditorCanvasZoomControls
        zoom={1}
        onZoomChange={onZoomChange}
        onFit={onFit}
        labels={{ zoom: "Zoom", zoomOut: "Zoom out", zoomIn: "Zoom in", fit: "Fit canvas" }}
      />,
    );

    const dispatchShortcut = (init: KeyboardEventInit) => {
      const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
      window.dispatchEvent(event);
      return event;
    };

    expect(dispatchShortcut({ key: "=", code: "Equal", metaKey: true }).defaultPrevented).toBe(
      true,
    );
    expect(dispatchShortcut({ key: "-", code: "Minus", ctrlKey: true }).defaultPrevented).toBe(
      true,
    );
    expect(dispatchShortcut({ key: "0", code: "Digit0", metaKey: true }).defaultPrevented).toBe(
      true,
    );
    expect(dispatchShortcut({ key: "!", code: "Digit1", shiftKey: true }).defaultPrevented).toBe(
      true,
    );
    expect(onZoomChange.mock.calls).toEqual([[1.1], [0.9], [1]]);
    expect(onFit).toHaveBeenCalledOnce();

    const input = document.createElement("input");
    document.body.append(input);
    const inputEvent = new KeyboardEvent("keydown", {
      key: "+",
      code: "Equal",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(inputEvent);
    expect(inputEvent.defaultPrevented).toBe(false);
    expect(onZoomChange).toHaveBeenCalledTimes(3);
    input.remove();
  });
});
