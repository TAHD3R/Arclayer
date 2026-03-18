import { render, screen, waitFor } from "@testing-library/react";
import { createElement, useMemo } from "react";
import { describe, expect, it } from "vitest";

import {
  resolveAssetsMasonryScrollViewport,
  useAssetsMasonryScrollState,
} from "@/pages/workspaces/assets/components/assets-view-masonry-scroll";

function ScrollStateProbe(props: { node: HTMLElement | null; fallbackHeight?: number }) {
  const state = useAssetsMasonryScrollState(props.node, props.fallbackHeight ?? 500);
  const payload = useMemo(() => JSON.stringify(state), [state]);
  return createElement("output", { "data-testid": "scroll-state" }, payload);
}

function readScrollState() {
  return JSON.parse(screen.getByTestId("scroll-state").textContent ?? "{}") as {
    height: number;
    scrollTop: number;
    isScrolling: boolean;
  };
}

describe("resolveAssetsMasonryScrollViewport", () => {
  it("skips non-scrolling overflow ancestors and picks the first ancestor with real scroll range", () => {
    const realViewport = document.createElement("div");
    Object.defineProperty(realViewport, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(realViewport, "scrollHeight", { configurable: true, value: 1200 });
    realViewport.style.overflow = "auto";

    const falseViewport = document.createElement("div");
    Object.defineProperty(falseViewport, "clientHeight", { configurable: true, value: 1200 });
    Object.defineProperty(falseViewport, "scrollHeight", { configurable: true, value: 1200 });
    falseViewport.style.overflowY = "auto";
    falseViewport.style.overflowX = "hidden";

    const grid = document.createElement("div");

    falseViewport.appendChild(grid);
    realViewport.appendChild(falseViewport);
    document.body.appendChild(realViewport);

    const result = resolveAssetsMasonryScrollViewport(grid);

    expect(result.kind).toBe("element");
    if (result.kind === "element") expect(result.node).toBe(realViewport);
  });

  it("falls back to window when no ancestor can actually scroll", () => {
    const parent = document.createElement("div");
    Object.defineProperty(parent, "clientHeight", { configurable: true, value: 600 });
    Object.defineProperty(parent, "scrollHeight", { configurable: true, value: 600 });
    parent.style.overflow = "auto";

    const grid = document.createElement("div");
    parent.appendChild(grid);
    document.body.appendChild(parent);

    const result = resolveAssetsMasonryScrollViewport(grid);

    expect(result).toEqual({ kind: "window" });
  });

  it("rebinds scroll measurement when the masonry container remounts to a new node", async () => {
    const viewport = document.createElement("div");
    viewport.style.overflowY = "auto";
    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, value: 1400 });
    viewport.getBoundingClientRect = () =>
      ({ top: 100, left: 0, right: 400, bottom: 500, width: 400, height: 400 }) as DOMRect;

    const firstGrid = document.createElement("div");
    firstGrid.getBoundingClientRect = () =>
      ({
        top: 220 - viewport.scrollTop,
        left: 0,
        right: 400,
        bottom: 620 - viewport.scrollTop,
        width: 400,
        height: 400,
      }) as DOMRect;

    const secondGrid = document.createElement("div");
    secondGrid.getBoundingClientRect = () =>
      ({
        top: 340 - viewport.scrollTop,
        left: 0,
        right: 400,
        bottom: 740 - viewport.scrollTop,
        width: 400,
        height: 400,
      }) as DOMRect;

    viewport.appendChild(firstGrid);
    document.body.appendChild(viewport);

    const rendered = render(
      createElement(ScrollStateProbe, { node: firstGrid, fallbackHeight: 500 }),
    );

    viewport.scrollTop = 260;
    viewport.dispatchEvent(new Event("scroll"));

    await waitFor(() => {
      expect(readScrollState().scrollTop).toBe(140);
    });

    firstGrid.remove();
    viewport.appendChild(secondGrid);
    rendered.rerender(createElement(ScrollStateProbe, { node: secondGrid, fallbackHeight: 500 }));

    viewport.scrollTop = 520;
    viewport.dispatchEvent(new Event("scroll"));

    await waitFor(() => {
      expect(readScrollState().scrollTop).toBe(280);
    });
  });
});
