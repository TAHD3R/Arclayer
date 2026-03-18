import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useInfiniteLoader, useMasonry, usePositioner, useResizeObserver } from "masonic";

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
  buildAssetMoreMenuItems,
  handleAssetMoreAction as runAssetMoreAction,
} from "./asset-more-actions";
import {
  getAssetsMasonryDatasetKey,
  getAssetsMasonryItemKey,
  getAssetsMasonryMaxColumnCount,
} from "./assets-view-masonry-keys";
import {
  canRequestAssetsMasonryNextPage,
  getAssetsMasonryVirtualTotalItems,
  MASONRY_NEXT_PAGE_PLACEHOLDER_COUNT,
  MASONRY_PREFETCH_THRESHOLD,
  shouldClearQueuedAssetsMasonryPage,
  shouldShowAssetsMasonryPlaceholders,
} from "./assets-view-masonry-loading";
import { useAssetsMasonryScrollState } from "./assets-view-masonry-scroll";

interface AssetsViewMasonrySectionProps {
  controller: AssetsViewController;
}

const MASONRY_COLUMN_WIDTH = 260;
const MASONRY_GUTTER = 16;
const MASONRY_ITEM_HEIGHT_ESTIMATE = 320;
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
    openEditAssetDialog,
    openAssetDeleteDialog,
    openAssetEditAccessDialog,
  } = controller;
  const orderedAssetIdsRef = useRef(orderedAssetIds);
  const masonryGridRef = useRef<HTMLElement | null>(null);
  const [masonryGridNode, setMasonryGridNode] = useState<HTMLElement | null>(null);
  const nextPageRequestRef = useRef(false);
  const nextPageRequestBaseCountRef = useRef<number | null>(null);
  const [observedShellWidth, setObservedShellWidth] = useState(0);
  const [queuedNextPage, setQueuedNextPage] = useState(false);
  const viewportHeight = useViewportHeight();
  orderedAssetIdsRef.current = orderedAssetIds;

  const setMasonryGridRef = useCallback((node: HTMLElement | null) => {
    masonryGridRef.current = node;
  }, []);

  useLayoutEffect(() => {
    const nextNode = masonryGridRef.current;
    setMasonryGridNode((prev) => (prev === nextNode ? prev : nextNode));
  });

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

  const measureShellWidth = useCallback((node: HTMLElement | null) => {
    const nextWidth = getNearestAvailableWidth(node);
    if (!nextWidth) return;
    setObservedShellWidth((prev) => (prev === nextWidth ? prev : nextWidth));
  }, []);
  const handleTileMoreAction = useCallback(
    (key: Parameters<typeof runAssetMoreAction>[0]["key"], asset: AssetMasonryItem) => {
      void runAssetMoreAction({
        key,
        asset,
        publicUrl: asset.publicUrl || null,
        t,
        onOpenEditAsset: () => openEditAssetDialog(asset),
        onOpenEditAccess: () => openAssetEditAccessDialog(asset),
        onOpenDelete: () => openAssetDeleteDialog(asset),
      });
    },
    [openAssetDeleteDialog, openAssetEditAccessDialog, openEditAssetDialog, t],
  );
  useEffect(() => {
    if (
      !shouldClearQueuedAssetsMasonryPage({
        queuedNextPage,
        isFetchingNextPage: assetsQuery.isFetchingNextPage,
        hasNextPage: assetsQuery.hasNextPage === true,
        loadedItemCount: items.length,
        requestBaseCount: nextPageRequestBaseCountRef.current,
      })
    ) {
      return;
    }
    nextPageRequestRef.current = false;
    nextPageRequestBaseCountRef.current = null;
    setQueuedNextPage(false);
  }, [assetsQuery.hasNextPage, assetsQuery.isFetchingNextPage, items.length, queuedNextPage]);

  const requestNextPage = useCallback(async () => {
    if (
      !canRequestAssetsMasonryNextPage({
        hasNextPage: assetsQuery.hasNextPage === true,
        isFetchingNextPage: assetsQuery.isFetchingNextPage,
        requestInFlight: nextPageRequestRef.current,
      })
    ) {
      return;
    }
    nextPageRequestRef.current = true;
    nextPageRequestBaseCountRef.current = items.length;
    setQueuedNextPage(true);
    try {
      await assetsQuery.fetchNextPage();
    } catch (error) {
      nextPageRequestRef.current = false;
      nextPageRequestBaseCountRef.current = null;
      setQueuedNextPage(false);
      throw error;
    }
  }, [assetsQuery, items.length]);
  const masonryItems = useMemo<AssetMasonryRenderItem[]>(() => {
    const rows: AssetMasonryRenderItem[] = items.map((asset) => ({
      key: asset.id,
      kind: "asset",
      asset,
      selected: selectedIds.has(asset.id),
      moreMenuItems: buildAssetMoreMenuItems({
        t,
        asset,
        publicUrl: asset.publicUrl || null,
      }),
      onOpenAsset: setActive,
      onSelectAsset: handleAssetSelect,
      onToggleSelected: handleAssetToggleSelected,
      onAspectRatio: handleAssetAspectRatio,
      onMoreAction: handleTileMoreAction,
      onEditAsset: openEditAssetDialog,
      onDeleteAsset: openAssetDeleteDialog,
    }));

    if (
      !shouldShowAssetsMasonryPlaceholders({
        queuedNextPage,
        isFetchingNextPage: assetsQuery.isFetchingNextPage,
      })
    ) {
      return rows;
    }

    return [
      ...rows,
      ...Array.from({ length: MASONRY_NEXT_PAGE_PLACEHOLDER_COUNT }, (_, index) => ({
        key: `loading:${items.length}:${index}`,
        kind: "placeholder" as const,
      })),
    ];
  }, [
    assetsQuery.isFetchingNextPage,
    handleAssetAspectRatio,
    handleAssetSelect,
    handleAssetToggleSelected,
    handleTileMoreAction,
    items,
    openAssetDeleteDialog,
    openEditAssetDialog,
    queuedNextPage,
    selectedIds,
    setActive,
    t,
  ]);
  const masonryWidth = observedShellWidth;
  const masonryDatasetKey = useMemo(() => {
    const baseKey = JSON.stringify(assetsListQueryKey);
    return getAssetsMasonryDatasetKey(baseKey, orderedAssetIds, masonryItems.length);
  }, [assetsListQueryKey, masonryItems.length, orderedAssetIds]);

  useEffect(() => {
    nextPageRequestRef.current = false;
    nextPageRequestBaseCountRef.current = null;
    setQueuedNextPage(false);
  }, [masonryDatasetKey]);

  const masonryMaxColumnCount = useMemo(
    () => getAssetsMasonryMaxColumnCount(masonryWidth),
    [masonryWidth],
  );
  const masonryScrollState = useAssetsMasonryScrollState(masonryGridNode, viewportHeight);
  const maybeLoadMore = useInfiniteLoader(
    () => {
      void requestNextPage();
    },
    {
      minimumBatchSize: MASONRY_NEXT_PAGE_PLACEHOLDER_COUNT,
      threshold: MASONRY_PREFETCH_THRESHOLD,
      totalItems: getAssetsMasonryVirtualTotalItems({
        loadedItemCount: items.length,
        hasNextPage: assetsQuery.hasNextPage === true,
      }),
    },
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
  const masonry = useMasonry({
    items: masonryItems,
    positioner,
    resizeObserver,
    scrollTop: masonryScrollState.scrollTop,
    isScrolling: masonryScrollState.isScrolling,
    height: masonryScrollState.height || viewportHeight,
    containerRef: setMasonryGridRef,
    className: "min-w-0 w-full max-w-full",
    itemKey: getAssetsMasonryItemKey,
    itemHeightEstimate: MASONRY_ITEM_HEIGHT_ESTIMATE,
    overscanBy: 1.5,
    render: AssetsViewMasonryRenderCell,
    onRender: maybeLoadMore,
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
  }, [items.length, masonryGridNode, measureShellWidth]);

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
