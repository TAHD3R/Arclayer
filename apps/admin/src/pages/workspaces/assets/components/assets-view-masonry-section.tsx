import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Masonry } from "masonic";

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
import { AssetsViewAssetRow } from "./assets-view-asset-row";
import { getAssetsMasonryDatasetKey, getAssetsMasonryItemKey } from "./assets-view-masonry-keys";

interface AssetsViewMasonrySectionProps {
  controller: AssetsViewController;
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
  const masonryShellRef = useRef<HTMLDivElement | null>(null);
  const [masonryWidth, setMasonryWidth] = useState(0);
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

  const masonryItems = useMemo(
    () => items.map((asset) => ({ key: asset.id, data: asset })),
    [items],
  );
  const masonryDatasetKey = useMemo(() => {
    const baseKey = JSON.stringify(assetsListQueryKey);
    return getAssetsMasonryDatasetKey(baseKey, orderedAssetIds);
  }, [assetsListQueryKey, orderedAssetIds]);

  useEffect(() => {
    const shell = masonryShellRef.current;
    if (!shell) return;
    const updateWidth = () => {
      const nextWidth = Math.round(shell.getBoundingClientRect().width);
      setMasonryWidth((prev) => (prev === nextWidth ? prev : nextWidth));
    };
    updateWidth();
    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

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
        ref={masonryShellRef}
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
        <Masonry
          key={`${masonryWidth || "initial"}:${masonryDatasetKey}`}
          className="min-w-0 w-full max-w-full"
          items={masonryItems}
          itemKey={getAssetsMasonryItemKey}
          columnWidth={260}
          columnGutter={16}
          rowGutter={16}
          maxColumnCount={5}
          itemHeightEstimate={320}
          overscanBy={1.5}
          render={({ data }) => {
            const asset = data.data as AssetMasonryItem;
            return (
              <AssetsViewAssetRow
                asset={asset}
                selected={selectedIds.has(asset.id)}
                onSelect={handleAssetSelect}
                onToggleSelected={handleAssetToggleSelected}
                onAspectRatio={handleAssetAspectRatio}
                onOpen={setActive}
              />
            );
          }}
        />
      </div>
    </ContentGuard>
  );
}
