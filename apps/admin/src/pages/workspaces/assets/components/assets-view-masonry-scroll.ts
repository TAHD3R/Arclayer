import { useEffect, useLayoutEffect, useState } from "react";

type AssetsMasonryScrollState = {
  height: number;
  scrollTop: number;
  isScrolling: boolean;
};

const SCROLL_STOP_DELAY_MS = 120;

function canScroll(style: CSSStyleDeclaration) {
  return /(auto|scroll|overlay)/.test(`${style.overflow} ${style.overflowY} ${style.overflowX}`);
}

function hasVerticalScrollRange(node: HTMLElement) {
  return node.scrollHeight - node.clientHeight > 1;
}

type ScrollViewport = { kind: "element"; node: HTMLElement } | { kind: "window" };

export function resolveAssetsMasonryScrollViewport(node: HTMLElement | null): ScrollViewport {
  let current = node?.parentElement ?? null;

  while (current) {
    if (canScroll(window.getComputedStyle(current)) && hasVerticalScrollRange(current)) {
      return {
        kind: "element",
        node: current,
      };
    }
    current = current.parentElement;
  }

  return { kind: "window" };
}

function measureScrollState(
  node: HTMLElement | null,
  viewport: ScrollViewport,
  fallbackHeight: number,
): Omit<AssetsMasonryScrollState, "isScrolling"> {
  if (!node) {
    return {
      height: fallbackHeight,
      scrollTop: 0,
    };
  }

  if (viewport.kind === "window") {
    const scrollTop =
      window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    const nodeRect = node.getBoundingClientRect();
    const offsetTop = nodeRect.top + scrollTop;

    return {
      height: window.innerHeight || document.documentElement.clientHeight || fallbackHeight,
      scrollTop: Math.max(0, scrollTop - offsetTop),
    };
  }

  const viewportRect = viewport.node.getBoundingClientRect();
  const nodeRect = node.getBoundingClientRect();
  const offsetTop = nodeRect.top - viewportRect.top + viewport.node.scrollTop;

  return {
    height: viewport.node.clientHeight || fallbackHeight,
    scrollTop: Math.max(0, viewport.node.scrollTop - offsetTop),
  };
}

export function useAssetsMasonryScrollState(
  gridNode: HTMLElement | null,
  fallbackHeight: number,
): AssetsMasonryScrollState {
  const [state, setState] = useState<AssetsMasonryScrollState>({
    height: fallbackHeight,
    scrollTop: 0,
    isScrolling: false,
  });

  useLayoutEffect(() => {
    const node = gridNode;
    if (!node) return;
    const viewport = resolveAssetsMasonryScrollViewport(node);
    let frameId = 0;
    let stopTimer = 0;

    const syncState = (isScrolling: boolean) => {
      const next = measureScrollState(node, viewport, fallbackHeight);
      setState((prev) => {
        if (
          prev.height === next.height &&
          prev.scrollTop === next.scrollTop &&
          prev.isScrolling === isScrolling
        ) {
          return prev;
        }
        return {
          height: next.height,
          scrollTop: next.scrollTop,
          isScrolling,
        };
      });
    };

    const scheduleSync = () => {
      window.clearTimeout(stopTimer);
      syncState(true);
      stopTimer = window.setTimeout(() => syncState(false), SCROLL_STOP_DELAY_MS);
    };

    const onResize = () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => syncState(false));
    };

    syncState(false);

    const scrollTarget = viewport.kind === "element" ? viewport.node : window;

    scrollTarget.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", onResize);

    const observer = new ResizeObserver(onResize);
    if (viewport.kind === "element") observer.observe(viewport.node);
    if (node) observer.observe(node);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      window.clearTimeout(stopTimer);
      scrollTarget.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", onResize);
      observer.disconnect();
    };
  }, [fallbackHeight, gridNode]);

  useEffect(() => {
    setState((prev) =>
      prev.height === fallbackHeight ? prev : { ...prev, height: fallbackHeight },
    );
  }, [fallbackHeight]);

  return state;
}
