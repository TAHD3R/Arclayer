import * as React from "react";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { useCanvasPanZoom } from "@/pages/workspaces/editor/hooks/use-canvas-pan-zoom";
import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";

function Harness(props: { onMenuClick: () => void }) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const { startPanHandlers, isPanning } = useCanvasPanZoom(ref);

  return (
    <div>
      <button type="button" onClick={props.onMenuClick}>
        menu
      </button>
      <div
        ref={ref}
        data-testid="canvas"
        style={{ width: 200, height: 200, border: "1px solid black" }}
        {...startPanHandlers}
      />
      <div data-testid="panning">{String(isPanning)}</div>
    </div>
  );
}

describe("useCanvasPanZoom", () => {
  beforeEach(() => {
    // 重置与测试相关的 store 状态，避免用例之间互相污染。
    useEditorStore.setState({
      activeTool: "select",
      zoomPercent: 100,
      canvasPanX: 0,
      canvasPanY: 0,
    });
  });

  test("未进入平移时不影响外部按钮点击", async () => {
    const onMenuClick = vi.fn();
    render(<Harness onMenuClick={onMenuClick} />);

    fireEvent.click(screen.getByRole("button", { name: "menu" }));
    expect(onMenuClick).toHaveBeenCalledTimes(1);

    expect(screen.getByTestId("panning")).toHaveTextContent("false");
  });

  test("平移结束后不影响外部按钮点击（避免交互被锁死）", async () => {
    if (typeof window.PointerEvent === "undefined") return;

    useEditorStore.setState({ activeTool: "hand" });

    const onMenuClick = vi.fn();
    render(<Harness onMenuClick={onMenuClick} />);

    const canvas = screen.getByTestId("canvas");

    fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 20, clientY: 0 });

    await waitFor(() => {
      expect(screen.getByTestId("panning")).toHaveTextContent("true");
    });

    fireEvent.pointerUp(window, { pointerId: 1, button: 0, clientX: 20, clientY: 0 });

    await waitFor(() => {
      expect(screen.getByTestId("panning")).toHaveTextContent("false");
    });

    fireEvent.click(screen.getByRole("button", { name: "menu" }));
    expect(onMenuClick).toHaveBeenCalledTimes(1);
  });

  test("未超过阈值时不进入平移（避免误触发）", async () => {
    if (typeof window.PointerEvent === "undefined") return;

    useEditorStore.setState({ activeTool: "hand" });

    const onMenuClick = vi.fn();
    render(<Harness onMenuClick={onMenuClick} />);

    const canvas = screen.getByTestId("canvas");
    fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    // 小幅移动（小于阈值），不应进入 panning
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 1, clientY: 1 });
    fireEvent.pointerUp(window, { pointerId: 1, button: 0, clientX: 1, clientY: 1 });

    await waitFor(() => {
      expect(screen.getByTestId("panning")).toHaveTextContent("false");
    });

    fireEvent.click(screen.getByRole("button", { name: "menu" }));
    expect(onMenuClick).toHaveBeenCalledTimes(1);
  });
});
