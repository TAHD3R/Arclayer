import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type MouseEventHandler,
  type ReactNode,
} from "react";
import { useMasonry, usePositioner, useResizeObserver, type RenderComponentProps } from "masonic";

export type AdminMasonryGridItem = {
  key: string;
};

type ScrollViewport = { kind: "element"; node: HTMLElement } | { kind: "window" };

type MasonryScrollState = {
  height: number;
  scrollTop: number;
  isScrolling: boolean;
};

const MASONRY_COLUMN_WIDTH = 260;
const MASONRY_GUTTER = 16;
const MASONRY_ITEM_HEIGHT_ESTIMATE = 320;
const MASONRY_MIN_COLUMN_COUNT = 2;
const MASONRY_MAX_COLUMN_COUNT = 8;
const MASONRY_COLUMN_SWITCH_BUFFER_PX = 24;
const MASONRY_OVERSCAN_BY = 2;
const SCROLL_STOP_DELAY_MS = 120;
const SCROLL_FPS = 12;
const SCROLL_THROTTLE_MS = 1000 / SCROLL_FPS;

function getNearestAvailableWidth(element: HTMLElement | null) {
  let current = element;

  for (let guard = 0; guard < 6 && current; guard += 1) {
    const width = Math.round(current.getBoundingClientRect().width || current.offsetWidth || 0);
    if (width > 0) return width;
    current = current.parentElement;
  }

  return 0;
}

function useViewportHeight() {
  const [height, setHeight] = useState(() =>
    typeof window === "undefined"
      ? 0
      : window.innerHeight || document.documentElement.clientHeight || 0,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateHeight = () => {
      const nextHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      setHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    };
    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, []);

  return height;
}

function canScroll(style: CSSStyleDeclaration) {
  return /(auto|scroll|overlay)/.test(`${style.overflow} ${style.overflowY} ${style.overflowX}`);
}

function hasVerticalScrollRange(node: HTMLElement) {
  return node.scrollHeight - node.clientHeight > 1;
}

export function resolveAdminMasonryScrollViewport(node: HTMLElement | null): ScrollViewport {
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
): Omit<MasonryScrollState, "isScrolling"> {
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

export function useAdminMasonryScrollState(
  gridNode: HTMLElement | null,
  fallbackHeight: number,
): MasonryScrollState {
  const [state, setState] = useState<MasonryScrollState>({
    height: fallbackHeight,
    scrollTop: 0,
    isScrolling: false,
  });

  useLayoutEffect(() => {
    const node = gridNode;
    if (!node) return;
    const viewport = resolveAdminMasonryScrollViewport(node);
    let frameId = 0;
    let stopTimer = 0;
    let throttleTimer = 0;
    let lastScrollSync = 0;

    const setScrollingState = (isScrolling: boolean) => {
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

    const syncIdleState = () => {
      setScrollingState(false);
    };

    const flushScrollSync = () => {
      throttleTimer = 0;
      lastScrollSync = performance.now();
      setScrollingState(true);
      window.clearTimeout(stopTimer);
      stopTimer = window.setTimeout(syncIdleState, SCROLL_STOP_DELAY_MS);
    };

    const scheduleSync = () => {
      const now = performance.now();
      if (now - lastScrollSync >= SCROLL_THROTTLE_MS) {
        flushScrollSync();
        return;
      }
      window.clearTimeout(throttleTimer);
      throttleTimer = window.setTimeout(flushScrollSync, SCROLL_THROTTLE_MS);
    };

    const onResize = () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(syncIdleState);
    };

    syncIdleState();

    const scrollTarget = viewport.kind === "element" ? viewport.node : window;

    scrollTarget.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", onResize);

    const observer = new ResizeObserver(onResize);
    if (viewport.kind === "element") observer.observe(viewport.node);
    observer.observe(node);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      window.clearTimeout(stopTimer);
      window.clearTimeout(throttleTimer);
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

function clampColumnCount(count: number) {
  return Math.max(MASONRY_MIN_COLUMN_COUNT, Math.min(MASONRY_MAX_COLUMN_COUNT, count));
}

function getMinimumWidthForColumnCount(count: number, columnWidth: number) {
  return count * (columnWidth + MASONRY_GUTTER) - MASONRY_GUTTER;
}

export function getAdminMasonryMaxColumnCount(
  width: number,
  previousCount?: number | null,
  columnWidth = MASONRY_COLUMN_WIDTH,
): number {
  if (!Number.isFinite(width) || width <= 0) {
    return clampColumnCount(previousCount ?? 5);
  }

  const rawCount = clampColumnCount(
    Math.floor((width + MASONRY_GUTTER) / (columnWidth + MASONRY_GUTTER)),
  );
  const stablePrevious =
    typeof previousCount === "number" ? clampColumnCount(previousCount) : undefined;

  if (!stablePrevious || rawCount === stablePrevious) return rawCount;

  if (rawCount > stablePrevious) {
    let nextCount = stablePrevious;
    for (let candidate = stablePrevious + 1; candidate <= rawCount; candidate += 1) {
      if (
        width <
        getMinimumWidthForColumnCount(candidate, columnWidth) + MASONRY_COLUMN_SWITCH_BUFFER_PX
      ) {
        return nextCount;
      }
      nextCount = candidate;
    }
    return nextCount;
  }

  let nextCount = stablePrevious;
  for (let candidate = stablePrevious; candidate > rawCount; candidate -= 1) {
    if (
      width >=
      getMinimumWidthForColumnCount(candidate, columnWidth) - MASONRY_COLUMN_SWITCH_BUFFER_PX
    ) {
      return nextCount;
    }
    nextCount = candidate - 1;
  }
  return clampColumnCount(nextCount);
}

export function getAdminMasonryItemKey(
  item: AdminMasonryGridItem | undefined,
  index: number,
): string {
  return item?.key ?? `missing:${index}`;
}

export function getAdminMasonryDatasetKey(baseKey: string, orderedItemIds: readonly string[]) {
  return `${baseKey}:${orderedItemIds.join("|")}`;
}

export function AdminMasonryGrid<TItem extends AdminMasonryGridItem>(props: {
  items: TItem[];
  datasetKey: string;
  render: ComponentType<RenderComponentProps<TItem>>;
  containerClassName?: string;
  gridClassName?: string;
  childrenBefore?: ReactNode;
  itemKey?: (item: TItem | undefined, index: number) => string;
  itemHeightEstimate?: number;
  columnCount?: number;
  columnWidth?: number;
  overscanBy?: number;
  onRender?: (startIndex: number, stopIndex: number, items: TItem[]) => unknown;
  onMouseDown?: MouseEventHandler<HTMLDivElement>;
}) {
  const masonryGridRef = useRef<HTMLElement | null>(null);
  const [masonryGridNode, setMasonryGridNode] = useState<HTMLElement | null>(null);
  const [observedShellWidth, setObservedShellWidth] = useState(0);
  const masonryColumnCountRef = useRef<number | null>(null);
  const viewportHeight = useViewportHeight();
  const columnWidth = props.columnWidth ?? MASONRY_COLUMN_WIDTH;

  const setMasonryGridRef = useCallback((node: HTMLElement | null) => {
    if (!(node instanceof HTMLElement)) return;
    masonryGridRef.current = node;
    setMasonryGridNode((prev) => (prev === node ? prev : node));
  }, []);

  const measureShellWidth = useCallback((node: HTMLElement | null) => {
    const nextWidth = getNearestAvailableWidth(node);
    if (!nextWidth) return;
    setObservedShellWidth((prev) => (prev === nextWidth ? prev : nextWidth));
  }, []);

  const masonryMaxColumnCount = useMemo(() => {
    return getAdminMasonryMaxColumnCount(
      observedShellWidth,
      masonryColumnCountRef.current,
      columnWidth,
    );
  }, [columnWidth, observedShellWidth]);
  useLayoutEffect(() => {
    masonryColumnCountRef.current = masonryMaxColumnCount;
  }, [masonryMaxColumnCount]);
  const masonryScrollState = useAdminMasonryScrollState(masonryGridNode, viewportHeight);
  const resolvedColumnCount = observedShellWidth > 0 ? props.columnCount : undefined;
  const positioner = usePositioner(
    {
      width: observedShellWidth,
      columnWidth,
      columnGutter: MASONRY_GUTTER,
      rowGutter: MASONRY_GUTTER,
      columnCount: resolvedColumnCount,
      maxColumnCount: masonryMaxColumnCount,
    },
    [props.datasetKey, resolvedColumnCount, observedShellWidth, masonryMaxColumnCount, columnWidth],
  );
  const resizeObserver = useResizeObserver(positioner);
  const masonry = useMasonry({
    items: props.items,
    positioner,
    resizeObserver,
    scrollTop: masonryScrollState.scrollTop,
    isScrolling: masonryScrollState.isScrolling,
    height: masonryScrollState.height || viewportHeight,
    containerRef: setMasonryGridRef,
    className: props.gridClassName ?? "min-w-0 w-full max-w-full",
    itemKey: props.itemKey ?? getAdminMasonryItemKey,
    itemHeightEstimate: props.itemHeightEstimate ?? MASONRY_ITEM_HEIGHT_ESTIMATE,
    overscanBy: props.overscanBy ?? MASONRY_OVERSCAN_BY,
    render: props.render,
    onRender: props.onRender,
  });

  useLayoutEffect(() => {
    const shell = masonryGridNode;
    if (!shell) return;

    let frameId = 0;
    let cancelled = false;

    const measureUntilReady = (attempt = 0) => {
      if (cancelled) return;
      measureShellWidth(shell);
      if (getNearestAvailableWidth(shell) > 0) return;
      if (attempt >= 8) return;
      frameId = window.requestAnimationFrame(() => measureUntilReady(attempt + 1));
    };

    measureUntilReady();

    const observer = new ResizeObserver(() => {
      measureUntilReady();
    });
    const handleResize = () => {
      measureUntilReady();
    };
    observer.observe(shell);
    window.addEventListener("resize", handleResize);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [props.items.length, masonryGridNode, measureShellWidth]);

  return (
    <div className={props.containerClassName} onMouseDown={props.onMouseDown}>
      {props.childrenBefore}
      {masonry}
    </div>
  );
}
