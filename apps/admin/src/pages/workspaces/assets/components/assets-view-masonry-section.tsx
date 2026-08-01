import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteLoader } from "masonic";

import { Button } from "@arclayer/ui/button";

import {
  AdminMasonryGrid,
  getAdminMasonryDatasetKey,
} from "@/components/common/admin-masonry-grid";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
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
  canRequestAssetsMasonryNextPage,
  getAssetsMasonryVirtualTotalItems,
  MASONRY_NEXT_PAGE_PLACEHOLDER_COUNT,
  MASONRY_PREFETCH_THRESHOLD,
  shouldClearQueuedAssetsMasonryPage,
  shouldShowAssetsMasonryPlaceholders,
} from "./assets-view-masonry-loading";

interface AssetsViewMasonrySectionProps {
  controller: AssetsViewController;
}

const MASONRY_ITEM_HEIGHT_ESTIMATE = 320;
const INITIAL_MASONRY_SKELETON_COUNT = MASONRY_NEXT_PAGE_PLACEHOLDER_COUNT;

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
    openAssetDetails,
    openEditAssetDialog,
    openAssetDeleteDialog,
    openAssetEditAccessDialog,
  } = controller;
  const hasFolderNavigation =
    controller.assetLibraryHasContent && controller.folderEntries.length > 0;
  const orderedAssetIdsRef = useRef(orderedAssetIds);
  const nextPageRequestRef = useRef(false);
  const nextPageRequestBaseCountRef = useRef<number | null>(null);
  const [queuedNextPage, setQueuedNextPage] = useState(false);
  const isInitialLoading = assetsQuery.isLoading && !assetsQuery.data;
  orderedAssetIdsRef.current = orderedAssetIds;

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

  const handleTileMoreAction = useCallback(
    (key: Parameters<typeof runAssetMoreAction>[0]["key"], asset: AssetMasonryItem) => {
      void runAssetMoreAction({
        key,
        asset,
        publicUrl: asset.publicUrl || null,
        t,
        onOpenDetails: () => openAssetDetails(asset),
        onOpenEditAsset: () => openEditAssetDialog(asset),
        onOpenEditAccess: () => openAssetEditAccessDialog(asset),
        onOpenDelete: () => openAssetDeleteDialog(asset),
      });
    },
    [openAssetDeleteDialog, openAssetEditAccessDialog, openEditAssetDialog, openAssetDetails, t],
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
    if (isInitialLoading) {
      return Array.from({ length: INITIAL_MASONRY_SKELETON_COUNT }, (_, index) => ({
        key: `initial-loading:${index}`,
        kind: "placeholder" as const,
      }));
    }

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
      onOpenAsset: openAssetDetails,
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
    isInitialLoading,
    items,
    openAssetDeleteDialog,
    openAssetDetails,
    openEditAssetDialog,
    queuedNextPage,
    selectedIds,
    t,
  ]);
  const masonryDatasetKey = useMemo(() => {
    const baseKey = JSON.stringify(assetsListQueryKey);
    return getAdminMasonryDatasetKey(baseKey, orderedAssetIds);
  }, [assetsListQueryKey, orderedAssetIds]);

  useEffect(() => {
    nextPageRequestRef.current = false;
    nextPageRequestBaseCountRef.current = null;
    setQueuedNextPage(false);
  }, [masonryDatasetKey]);

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
  return (
    <ContentGuard
      loading={false}
      error={assetsQuery.isError ? assetsQuery.error : null}
      onRetry={() => void assetsQuery.refetch()}
      wrapperSpacing="flush"
      errorDescription={assetsQuery.isError ? t("assets:ASSET_LIST_LOAD_FAILED_DESC") : undefined}
      empty={items.length === 0 && !hasFolderNavigation && !isInitialLoading}
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
        aria-busy={isInitialLoading || undefined}
        aria-label={isInitialLoading ? t("common:LOADING") : undefined}
        aria-live={isInitialLoading ? "polite" : undefined}
        role={isInitialLoading ? "status" : undefined}
      >
        <AdminMasonryGrid
          items={masonryItems}
          datasetKey={masonryDatasetKey}
          render={AssetsViewMasonryRenderCell}
          itemHeightEstimate={MASONRY_ITEM_HEIGHT_ESTIMATE}
          containerClassName="min-w-0 w-full max-w-full overflow-x-hidden select-none px-1"
          onMouseDown={(event) => {
            if (event.button !== 0) return;
            const target = event.target as HTMLElement | null;
            if (!shouldClearMasonrySelectionOnMouseDown(target)) return;
            if (selectedIds.size === 0) return;
            setSelection((prev) => clearSelection(prev));
            setFocusedFolderId(null);
          }}
          onRender={maybeLoadMore}
        />
      </div>
    </ContentGuard>
  );
}
