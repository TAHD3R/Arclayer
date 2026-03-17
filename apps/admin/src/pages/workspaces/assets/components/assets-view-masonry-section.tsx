import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  useContainerPosition,
  useMasonry,
  usePositioner,
  useResizeObserver,
  useScroller,
} from "masonic";

import { Button } from "@arclayer/ui/button";

import { ContentGuard } from "@/components/common/content-guard";
import {
  clearSelection,
  rangeSelect,
  selectOrClearOnPlainClick,
  toggleSelect,
} from "@/lib/assets/asset-selection";
import { shouldClearMasonrySelectionOnMouseDown } from "@/lib/assets/masonry-interactions";
import type { AssetMasonryItem } from "@/types/assets-masonry";

import type { AssetsViewController } from "../hooks/use-assets-view-controller";
import {
  AssetsViewMasonryRenderCell,
  type AssetMasonryRenderItem,
} from "./assets-view-masonry-render-cell";
import {
  getAssetsMasonryDatasetKey,
  getAssetsMasonryItemKey,
  getAssetsMasonryMaxColumnCount,
} from "./assets-view-masonry-keys";

interface AssetsViewMasonrySectionProps {
  controller: AssetsViewController;
}

const MASONRY_COLUMN_WIDTH = 260;
const MASONRY_GUTTER = 16;
const MASONRY_ITEM_HEIGHT_ESTIMATE = 320;
const MASONRY_SCROLL_FPS = 12;

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

export function AssetsViewMasonrySection(props: AssetsViewMasonrySectionProps) {
  const { controller } = props;
  const {
    t,
    assetsQuery,
    assetsListQueryKey,
    items,
    explicitFilterActive,
    setSearchInput,
    setSearchQuery,
    setFilters,
    setMoreOpen,
    setFocusedFolderId,
    setSelection,
    selectedIds,
    orderedAssetIds,
    aspectRatioRef,
    forceLayoutTick,
    setActive,
  } = controller;
  const orderedAssetIdsRef = useRef(orderedAssetIds);
  const masonryGridRef = useRef<HTMLElement | null>(null);
  const [observedShellWidth, setObservedShellWidth] = useState(0);
  const viewportHeight = useViewportHeight();
  orderedAssetIdsRef.current = orderedAssetIds;

  const setMasonryGridRef = useCallback((node: HTMLElement | null) => {
    masonryGridRef.current = node;
    const nextWidth = getNearestAvailableWidth(node);
    if (!nextWidth) return;
    setObservedShellWidth((prev) => (prev === nextWidth ? prev : nextWidth));
  }, []);

  const handleAssetSelect = useCallback(
    (asset: AssetMasonryItem, event: React.MouseEvent<HTMLDivElement>) => {
      setFocusedFolderId(null);
      const assetId = asset.id;
      if (event.shiftKey) {
        setSelection((prev) => rangeSelect(prev, assetId, orderedAssetIdsRef.current));
        return;
      }
      if (event.metaKey || event.ctrlKey) {
        setSelection((prev) => toggleSelect(prev, assetId));
        return;
      }
      setSelection((prev) => selectOrClearOnPlainClick(prev, assetId, event.detail));
    },
    [setFocusedFolderId, setSelection],
  );

  const handleAssetToggleSelected = useCallback(
    (assetId: string) => {
      setFocusedFolderId(null);
      setSelection((prev) => toggleSelect(prev, assetId));
    },
    [setFocusedFolderId, setSelection],
  );

  const handleAssetAspectRatio = useCallback(
    (assetId: string, aspectRatio: number) => {
      const safeAspectRatio =
        Number.isFinite(aspectRatio) && aspectRatio > 0.05 ? aspectRatio : 4 / 3;
      const previousAspectRatio = aspectRatioRef.current.get(assetId);
      if (previousAspectRatio && Math.abs(previousAspectRatio - safeAspectRatio) < 0.02) {
        return;
      }
      aspectRatioRef.current.set(assetId, safeAspectRatio);
      forceLayoutTick((value) => value + 1);
    },
    [aspectRatioRef, forceLayoutTick],
  );

  const measureShellWidth = useCallback(() => {
    const nextWidth = getNearestAvailableWidth(masonryGridRef.current);
    if (!nextWidth) return;
    setObservedShellWidth((prev) => (prev === nextWidth ? prev : nextWidth));
  }, []);
  const masonryItems = useMemo<AssetMasonryRenderItem[]>(
    () =>
      items.map((asset) => ({
        key: asset.id,
        asset,
        selected: selectedIds.has(asset.id),
        onOpenAsset: setActive,
        onSelectAsset: handleAssetSelect,
        onToggleSelected: handleAssetToggleSelected,
        onAspectRatio: handleAssetAspectRatio,
      })),
    [
      handleAssetAspectRatio,
      handleAssetSelect,
      handleAssetToggleSelected,
      items,
      selectedIds,
      setActive,
    ],
  );
  const masonryDatasetKey = useMemo(() => {
    const baseKey = JSON.stringify(assetsListQueryKey);
    return getAssetsMasonryDatasetKey(baseKey, orderedAssetIds);
  }, [assetsListQueryKey, orderedAssetIds]);
  const masonryContainerPosition = useContainerPosition(masonryGridRef, [
    observedShellWidth,
    viewportHeight,
    items.length,
  ]);
  const masonryWidth = masonryContainerPosition.width || observedShellWidth;
  const masonryMaxColumnCount = useMemo(
    () => getAssetsMasonryMaxColumnCount(masonryWidth),
    [masonryWidth],
  );
  const positioner = usePositioner(
    {
      width: masonryWidth,
      columnWidth: MASONRY_COLUMN_WIDTH,
      columnGutter: MASONRY_GUTTER,
      rowGutter: MASONRY_GUTTER,
      maxColumnCount: masonryMaxColumnCount,
    },
    [masonryDatasetKey, masonryWidth, masonryMaxColumnCount],
  );
  const resizeObserver = useResizeObserver(positioner);
  const { scrollTop, isScrolling } = useScroller(
    masonryContainerPosition.offset,
    MASONRY_SCROLL_FPS,
  );
  const masonry = useMasonry({
    items: masonryItems,
    positioner,
    resizeObserver,
    scrollTop,
    isScrolling,
    height: viewportHeight,
    containerRef: setMasonryGridRef,
    className: "min-w-0 w-full max-w-full",
    itemKey: getAssetsMasonryItemKey,
    itemHeightEstimate: MASONRY_ITEM_HEIGHT_ESTIMATE,
    overscanBy: 1.5,
    render: AssetsViewMasonryRenderCell,
  });

  useLayoutEffect(() => {
    const shell = masonryGridRef.current;
    if (!shell) return;

    let frameId = 0;
    let cancelled = false;

    const measureUntilReady = (attempt = 0) => {
      if (cancelled) return;
      measureShellWidth();
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
  }, [items.length, measureShellWidth]);

  return (
    <ContentGuard
      loading={assetsQuery.isLoading && !assetsQuery.data}
      loadingVariant="masonry"
      error={assetsQuery.isError ? assetsQuery.error : null}
      onRetry={() => void assetsQuery.refetch()}
      errorDescription={assetsQuery.isError ? t("assets:ASSET_LIST_LOAD_FAILED_DESC") : undefined}
      empty={items.length === 0}
      emptyTitle={
        explicitFilterActive ? t("assets:ASSET_EMPTY_SEARCH_TITLE") : t("assets:ASSET_EMPTY")
      }
      emptyDescription={
        explicitFilterActive ? t("assets:ASSET_EMPTY_SEARCH_DESC") : t("assets:ASSET_EMPTY_DESC")
      }
      emptyExtra={
        explicitFilterActive ? (
          <Button
            variant="default"
            onClick={() => {
              setSearchInput("");
              setSearchQuery("");
              setFilters({ visibility: "public" });
              setMoreOpen(false);
            }}
          >
            {t("assets:ASSET_FILTER_RESET")}
          </Button>
        ) : null
      }
    >
      <div
        className="min-w-0 w-full max-w-full overflow-x-hidden select-none"
        onMouseDown={(event) => {
          if (event.button !== 0) return;
          const target = event.target as HTMLElement | null;
          if (!shouldClearMasonrySelectionOnMouseDown(target)) return;
          if (selectedIds.size === 0) return;
          setSelection((prev) => clearSelection(prev));
          setFocusedFolderId(null);
        }}
      >
        {masonry}
      </div>
    </ContentGuard>
  );
}
