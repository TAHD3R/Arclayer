import { useQueryClient } from "@tanstack/react-query";
import { Masonry } from "masonic";
import { ArrowRightIcon, ImageOff, Search, Sparkles, UploadCloud, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { Spinner } from "@arclayer/ui/spinner";
import { AssetUploadDialog } from "./asset-upload-dialog";
import {
  AssetsExplorerFolderTile,
  AssetsExplorerFolderUpTile,
} from "./explorer/assets-explorer-folder-tiles";
import { useAssetsExplorerController } from "./explorer/use-assets-explorer-controller";
import {
  clearSelection,
  orderSelectedIds,
  rangeSelect,
  selectOrClearOnPlainClick,
  toggleSelect,
  type AssetSelectionState,
} from "@/lib/assets/asset-selection";
import { AssetMasonryTile } from "./asset-masonry-card";
import type { AssetMasonryItem } from "@/types/assets-masonry";
import { AssetsFilterPopover, type AssetsFilters } from "./assets-filter-popover";
import type { AssetScopeRef } from "@/lib/assets/asset-scope";
import { DataPaginationControls } from "@/components/common/data-pagination-controls";
import { LazyAssetImage } from "./lazy-asset-image";
import { getMimeLabel, getPurposeLabel, getVisibilityLabel } from "./asset-masonry-tile";

export type AssetPickerDialogValue = {
  assetIds: string[];
};

type AssetPickerDialogMode = "single" | "multiple";

function PickerMetaRow(props: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-footnote">
      <span className="text-label-secondary">{props.label}</span>
      <span className="min-w-0 text-right text-label-primary">{props.value}</span>
    </div>
  );
}

export function AssetPickerDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  scope: AssetScopeRef;

  /**
   * Select behavior. Default: single.
   */
  mode?: AssetPickerDialogMode;

  /**
   * Controlled value. The dialog keeps a draft selection and only commits on confirm/double-click.
   */
  value?: AssetPickerDialogValue;
  onConfirm: (next: AssetPickerDialogValue) => void;

  /**
   * Allow clearing selection (provide "Clear" action in footer).
   * Default: false (callers can provide their own clear UX outside).
   */
  allowClear?: boolean;

  /**
   * Upload purpose: used by upload dialog for server-side policies.
   */
  uploadPurpose?: string;

  /**
   * Optional purpose filter for listing existing assets in the explorer.
   * When set, the picker will only show assets matching this purpose.
   *
   * Note: upload purpose and filter purpose can differ, but in most cases they should be the same.
   */
  filterPurpose?: string;

  /**
   * Default mime filter for the explorer (e.g. "image/").
   * Can still be adjusted via filter popover if enabled in that component.
   */
  mimePrefix?: string;

  /**
   * Show upload entry in toolbar. Default: true (as per current product decision).
   */
  allowUpload?: boolean;

  /**
   * Page size for the paged list. Default: 24.
   */
  pageSize?: number;

  title?: string;
  description?: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const mode: AssetPickerDialogMode = props.mode ?? "single";
  const allowUpload = props.allowUpload !== false;

  const explorer = useAssetsExplorerController({
    scope: props.scope,
    pagination: "paged",
    // In picker scenarios we should NOT force purpose=library; allow callers to explicitly filter
    // (e.g. org logo picker uses purpose=site_logo).
    purpose: props.filterPurpose,
    defaultVisibility: "public",
    defaultOrdering: "-created_at",
    initialPageSize: props.pageSize ?? 12,
    initialFilters: {
      mimePrefix: props.mimePrefix ?? "image/",
    },
  });

  const {
    searchInput,
    setSearchInput,
    searchQuery,
    setSearchQuery,
    currentFolderId,
    setCurrentFolderId,
    focusedFolderId,
    setFocusedFolderId,
    filters,
    setFilters,
    ordering,
    setOrdering,
    tagsQuery,
    assetsListQueryKey,
    pagedAssetsQuery,
    items,
    masonryEntries,
    folderById,
    folderPath,
    page,
    pageSize,
    setPage,
    setPageSize,
    total,
  } = explorer;

  const [uploadOpen, setUploadOpen] = useState(false);

  const [selection, setSelection] = useState<AssetSelectionState>(() => ({
    selectedIds: new Set(),
    lastActiveId: null,
  }));
  const selectedIds = selection.selectedIds;

  // Reset draft state on open.
  useEffect(() => {
    if (!props.open) return;
    const init = props.value?.assetIds ?? [];
    setSelection({
      selectedIds: new Set(init),
      lastActiveId: init.length ? init[init.length - 1] : null,
    });
    setSearchInput("");
    setSearchQuery("");
    setCurrentFolderId(null);
    setFocusedFolderId(null);
    setPage(1);
    // Ensure mime filter stays consistent with caller expectations when reopening.
    setFilters((prev: typeof filters) => ({
      ...prev,
      visibility: prev.visibility ?? "public",
      mimePrefix: props.mimePrefix ?? prev.mimePrefix ?? "image/",
    }));
  }, [
    props.mimePrefix,
    props.open,
    props.value?.assetIds,
    setCurrentFolderId,
    setFilters,
    setFocusedFolderId,
    setPage,
    setSearchInput,
    setSearchQuery,
  ]);

  // Filters changed => selection should not "stick" to stale items.
  useEffect(() => {
    if (!props.open) return;
    setSelection((prev) => clearSelection(prev));
  }, [
    props.open,
    currentFolderId,
    searchQuery,
    filters.mimePrefix,
    filters.visibility,
    filters.createdFrom,
    filters.createdTo,
    filters.tagIds,
    ordering,
  ]);

  const orderedAssetIds = useMemo(() => items.map((it) => it.id), [items]);
  const selectedAssetId = useMemo(
    () => orderSelectedIds(selectedIds, orderedAssetIds)[0],
    [orderedAssetIds, selectedIds],
  );
  const selectedAsset = useMemo(
    () => items.find((item) => item.id === selectedAssetId) ?? null,
    [items, selectedAssetId],
  );
  const selectedCountLabel = t("assets:ASSET_SELECTED_COUNT", { count: selectedIds.size });

  const confirmSelectionAndClose = (selectedOverride?: ReadonlySet<string>) => {
    const picked = selectedOverride ?? selectedIds;
    const ordered = orderSelectedIds(picked, orderedAssetIds);
    if (mode === "single") {
      const first = ordered[0];
      props.onConfirm({ assetIds: first ? [first] : [] });
      props.onOpenChange(false);
      return;
    }
    props.onConfirm({ assetIds: ordered });
    props.onOpenChange(false);
  };

  const handleAssetDoubleClick = (asset: AssetMasonryItem) => {
    if (mode === "single") {
      confirmSelectionAndClose(new Set([asset.id]));
      return;
    }

    if (selectedIds.size > 0) {
      confirmSelectionAndClose();
      return;
    }
    confirmSelectionAndClose(new Set([asset.id]));
  };

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!props.open) return;
    // Focus search input for faster workflows (especially in editor insertion).
    window.setTimeout(() => {
      searchInputRef.current?.focus?.();
    }, 50);
  }, [props.open]);

  const isLoading = pagedAssetsQuery.isLoading && !pagedAssetsQuery.data;
  const isFetching = pagedAssetsQuery.isFetching;

  type PickerMasonryEntry = (typeof masonryEntries)[number];

  const parentIdForUp = useMemo(() => {
    if (!currentFolderId) return null;
    return folderById.get(String(currentFolderId))?.parentId
      ? String(folderById.get(String(currentFolderId))?.parentId)
      : null;
  }, [currentFolderId, folderById]);

  return (
    <>
      <SettingDialog
        open={props.open}
        onOpenChange={props.onOpenChange}
        title={props.title || t("settings:SETTINGS_ASSET_PICKER_TITLE")}
        description={props.description || t("settings:SETTINGS_ASSET_PICKER_DESC")}
        contentClassName={cn(
          "!p-0 !flex !flex-col overflow-hidden",
          "max-h-[calc(100vh-2rem)]",
          "w-[min(1080px,calc(100vw-2rem))] sm:w-[min(1080px,calc(100vw-2rem))] sm:max-w-none",
        )}
        bodyClassName="!p-0"
        footer={
          <>
            {props.allowClear ? (
              <Button
                variant="destructive"
                onClick={() => {
                  props.onConfirm({ assetIds: [] });
                  props.onOpenChange(false);
                }}
              >
                {t("settings:SETTINGS_ASSET_PICKER_CLEAR")}
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => props.onOpenChange(false)}>
              {t("common:CANCEL")}
            </Button>
            <Button
              variant="default"
              disabled={selectedIds.size <= 0}
              onClick={() => confirmSelectionAndClose()}
            >
              {t("common:CONFIRM")}
            </Button>
          </>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col bg-muted/20">
          <div className="border-b border-border/70 bg-card/90 px-5 py-4 backdrop-blur">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-callout font-semibold text-label-primary">
                  <Sparkles className="size-4 text-label-secondary" />
                  {t("settings:SETTINGS_ASSET_PICKER_TITLE")}
                </div>
                <div className="text-footnote text-label-secondary">
                  {t("assets:ASSET_PICKER_FIELD_SEARCH_HELP")}
                </div>
              </div>

              <div className="rounded-full border border-border/70 bg-card px-3 py-1 text-caption text-label-secondary">
                {selectedCountLabel}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
              <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">
                <div className="grid min-w-[18rem] flex-1 gap-1.5">
                  <label className="text-callout font-semibold text-label-primary">
                    {t("assets:ASSET_PICKER_FIELD_SEARCH")}
                  </label>
                  <div className="relative w-full">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-label-secondary" />
                    <Input
                      className="w-full rounded-lg border-border/70 bg-card pl-9 pr-9"
                      ref={searchInputRef}
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      placeholder={t("settings:SETTINGS_ASSET_PICKER_SEARCH_PLACEHOLDER")}
                    />
                    {searchInput ? (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2"
                        onClick={() => setSearchInput("")}
                        aria-label={t("common:CLEAR")}
                      >
                        <X size={14} />
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <AssetsFilterPopover
                    value={filters}
                    onChange={(next: AssetsFilters) => {
                      setFilters(next);
                    }}
                    ordering={ordering}
                    onOrderingChange={(next) => {
                      setOrdering(next);
                      setPage(1);
                    }}
                    defaultOrdering="-created_at"
                    tags={tagsQuery.data?.items ?? []}
                    tagsLoading={tagsQuery.isLoading}
                  />
                </div>
              </div>

              {allowUpload ? (
                <Button variant="default" onClick={() => setUploadOpen(true)} disabled={isFetching}>
                  <UploadCloud size={16} />
                  {t("assets:ASSET_ACTION_UPLOAD")}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 flex flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex flex-wrap items-center gap-1.5 border-b border-border/70 bg-card/60 px-5 py-3 text-footnote">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-full px-3"
                  onClick={() => {
                    setCurrentFolderId(null);
                    setFocusedFolderId(null);
                  }}
                >
                  {t("assets:ASSET_BREADCRUMB_ROOT")}
                </Button>
                {folderPath.map((f) => (
                  <div key={String(f.id)} className="flex items-center gap-1.5">
                    <ArrowRightIcon className="size-3.5 text-label-secondary" />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-full px-3"
                      onClick={() => {
                        setCurrentFolderId(String(f.id));
                        setFocusedFolderId(null);
                      }}
                    >
                      {f.name}
                    </Button>
                  </div>
                ))}
              </div>

              <div
                className="min-h-0 flex-1 overflow-auto px-5 py-5 select-none"
                onMouseDown={(e) => {
                  const target = e.target as HTMLElement | null;
                  if (!target) return;
                  if (target.closest("[data-asset-tile='true']")) return;
                  if (target.closest("[data-folder-tile='true']")) return;
                  setSelection((prev) => clearSelection(prev));
                  setFocusedFolderId(null);
                }}
              >
                {isLoading ? (
                  <div className="grid min-h-48 place-items-center rounded-2xl border border-border/70 bg-card/70">
                    <Spinner className="size-5 text-label-secondary" />
                  </div>
                ) : masonryEntries.length === 0 ? (
                  <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-border/80 bg-card/70 px-6 text-center">
                    <div className="max-w-sm space-y-3">
                      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-label-secondary">
                        <ImageOff className="size-5" />
                      </div>
                      <div className="text-callout font-semibold text-label-primary">
                        {t("assets:ASSET_EMPTY_SEARCH_DESC")}
                      </div>
                      {allowUpload ? (
                        <Button variant="outline" onClick={() => setUploadOpen(true)}>
                          <UploadCloud className="size-4" />
                          {t("assets:ASSET_ACTION_UPLOAD")}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <Masonry
                    items={masonryEntries.map((it) => ({
                      key:
                        it.kind === "asset"
                          ? it.asset.id
                          : it.kind === "folder"
                            ? `folder:${it.folder.id}`
                            : "folder:__up__",
                      data: it,
                    }))}
                    itemKey={(item) => item.key}
                    columnWidth={220}
                    columnGutter={16}
                    rowGutter={16}
                    maxColumnCount={5}
                    itemHeightEstimate={320}
                    overscanBy={1}
                    render={({ data }) => {
                      const info = data;
                      const entry = info.data as PickerMasonryEntry;
                      if (entry.kind === "folderUp") {
                        return (
                          <AssetsExplorerFolderUpTile
                            label={t("assets:ASSET_FOLDER_UP")}
                            onClick={() => {
                              setFocusedFolderId("__up__");
                              setSelection((prev) => clearSelection(prev));
                            }}
                            onDoubleClick={() => {
                              setCurrentFolderId(parentIdForUp);
                              setFocusedFolderId(null);
                            }}
                          />
                        );
                      }

                      if (entry.kind === "folder") {
                        return (
                          <AssetsExplorerFolderTile
                            folder={entry.folder}
                            folderLabel={t("assets:ASSET_FOLDER")}
                            focused={focusedFolderId === entry.folder.id}
                            onClick={() => {
                              setFocusedFolderId(entry.folder.id);
                              setSelection((prev) => clearSelection(prev));
                            }}
                            onDoubleClick={() => {
                              setCurrentFolderId(String(entry.folder.id));
                              setFocusedFolderId(null);
                            }}
                          />
                        );
                      }

                      const asset = entry.asset as AssetMasonryItem;
                      const isSelected = selectedIds.has(asset.id);

                      return (
                        <AssetMasonryTile
                          asset={asset}
                          selected={isSelected}
                          onSelect={(e) => {
                            if (mode === "single") {
                              setSelection((prev) =>
                                selectOrClearOnPlainClick(prev, asset.id, e.detail),
                              );
                              setFocusedFolderId(null);
                              return;
                            }

                            setFocusedFolderId(null);
                            if (e.shiftKey) {
                              setSelection((prev) => rangeSelect(prev, asset.id, orderedAssetIds));
                              return;
                            }
                            if (e.metaKey || e.ctrlKey) {
                              setSelection((prev) => toggleSelect(prev, asset.id));
                              return;
                            }
                            setSelection((prev) =>
                              selectOrClearOnPlainClick(prev, asset.id, e.detail),
                            );
                          }}
                          onToggleSelected={() => {
                            setFocusedFolderId(null);
                            if (mode === "single") {
                              setSelection((prev) => selectOrClearOnPlainClick(prev, asset.id, 1));
                              return;
                            }
                            setSelection((prev) => toggleSelect(prev, asset.id));
                          }}
                          onOpen={handleAssetDoubleClick}
                        />
                      );
                    }}
                  />
                )}
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-border/70 bg-card/60 px-5 py-3">
                <div className="text-caption text-label-secondary">
                  {isFetching ? t("common:LOADING") : selectedCountLabel}
                </div>
                <DataPaginationControls
                  page={page}
                  size={pageSize}
                  total={total}
                  t={t}
                  pageSizeOptions={[12, 24, 48, 96]}
                  onChange={(nextPage, nextSize) => {
                    if (nextSize !== pageSize) {
                      setPageSize(nextSize);
                      setPage(1);
                      return;
                    }
                    setPage(nextPage);
                  }}
                />
              </div>
            </div>

            <aside className="hidden w-[18rem] shrink-0 border-l border-border/70 bg-card/75 lg:flex lg:flex-col">
              <div className="border-b border-border/70 px-4 py-3">
                <div className="text-callout font-semibold text-label-primary">
                  {t("settings:SETTINGS_ASSET_PICKER_CURRENT")}
                </div>
                <div className="mt-1 text-caption text-label-secondary">
                  {selectedAsset ? selectedAsset.name : selectedCountLabel}
                </div>
              </div>

              <div className="flex-1 overflow-auto px-4 py-4">
                {selectedAsset ? (
                  <div className="space-y-4">
                    <div className="overflow-hidden rounded-xl border border-border/70 bg-muted/30">
                      <div className="relative aspect-[4/3]">
                        {selectedAsset.previewUrl ? (
                          <LazyAssetImage
                            eager
                            src={selectedAsset.previewUrl}
                            alt={selectedAsset.name}
                            rootClassName="absolute inset-0"
                            className="object-cover"
                            showErrorOverlay
                          />
                        ) : (
                          <div className="absolute inset-0 grid place-items-center text-label-secondary">
                            <ImageOff className="size-5" />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 rounded-xl border border-border/70 bg-card px-3 py-3">
                      <div className="line-clamp-2 text-callout font-semibold text-label-primary">
                        {selectedAsset.name}
                      </div>
                      <PickerMetaRow
                        label={t("assets:ASSET_FILTER_FIELD_TYPE")}
                        value={getMimeLabel(selectedAsset.mimeType, t)}
                      />
                      <PickerMetaRow
                        label={t("assets:ASSET_FILTER_FIELD_VISIBILITY")}
                        value={getVisibilityLabel(selectedAsset.visibility, t)}
                      />
                      <PickerMetaRow
                        label={t("assets:ASSET_PURPOSE_LIBRARY")}
                        value={getPurposeLabel(selectedAsset.purpose, t)}
                      />
                      <PickerMetaRow
                        label={t("assets:ASSET_ACTION_UPLOAD")}
                        value={selectedAsset.sizeText || "-"}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/80 bg-card/60 px-4 text-center">
                    <div className="flex size-10 items-center justify-center rounded-full bg-muted text-label-secondary">
                      <Sparkles className="size-4" />
                    </div>
                    <div className="text-footnote text-label-secondary">
                      {t("settings:SETTINGS_ASSET_PICKER_DESC")}
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </SettingDialog>

      <AssetUploadDialog
        scope={props.scope}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        purpose={props.uploadPurpose}
        onUploaded={() => {
          void queryClient.invalidateQueries({ queryKey: ["assets", "folders"] });
          void queryClient.invalidateQueries({ queryKey: ["assets", "tags"] });
          void queryClient.invalidateQueries({ queryKey: ["assets", "paged"] });
          void queryClient.invalidateQueries({ queryKey: ["assets", "folderHasMatch"] });
          void queryClient.invalidateQueries({ queryKey: assetsListQueryKey });
          setUploadOpen(false);
        }}
      />
    </>
  );
}
