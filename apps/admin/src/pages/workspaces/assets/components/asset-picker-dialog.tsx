import { useQueryClient } from "@tanstack/react-query";
import { Masonry } from "masonic";
import { ArrowRightIcon, ImageOff, Search, UploadCloud, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@arclayer/ui/chrome-tabs";
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

export type AssetPickerDialogValue = {
  assetIds: string[];
};

type AssetPickerDialogMode = "single" | "multiple";

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
    pagination: "infinite",
    // In picker scenarios we should NOT force purpose=library; allow callers to explicitly filter
    // (e.g. org logo picker uses purpose=site_logo).
    purpose: props.filterPurpose,
    defaultVisibility: "public",
    defaultOrdering: "-created_at",
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
    infiniteAssetsQuery,
    items,
    masonryEntries,
    folderById,
    folderPath,
  } = explorer;

  const [activeTab, setActiveTab] = useState<"library" | "upload">("library");
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
    setActiveTab("library");
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
  const libraryViewportRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!props.open || activeTab !== "library") return;
    // Focus search input for faster workflows (especially in editor insertion).
    window.setTimeout(() => {
      searchInputRef.current?.focus?.();
    }, 50);
  }, [activeTab, props.open]);

  useEffect(() => {
    const node = sentinelRef.current;
    const root = libraryViewportRef.current;
    if (!node || !root || activeTab !== "library" || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (infiniteAssetsQuery.isFetchingNextPage || !infiniteAssetsQuery.hasNextPage) return;
        infiniteAssetsQuery.fetchNextPage().catch(() => undefined);
      },
      { root, rootMargin: "120px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [activeTab, infiniteAssetsQuery]);

  const isLoading = infiniteAssetsQuery.isLoading && items.length === 0;
  const isFetching = infiniteAssetsQuery.isFetching;

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
          <ChromeTabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as "library" | "upload")}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="border-b border-border/70 bg-card/90 px-5 py-4 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <ChromeTabsList className="w-auto">
                  <ChromeTabsTrigger value="library">
                    {t("assets:ASSET_PURPOSE_LIBRARY")}
                  </ChromeTabsTrigger>
                  {allowUpload ? (
                    <ChromeTabsTrigger value="upload">
                      {t("assets:ASSET_ACTION_UPLOAD")}
                    </ChromeTabsTrigger>
                  ) : null}
                </ChromeTabsList>
                <div className="text-caption text-label-secondary">{selectedCountLabel}</div>
              </div>
            </div>

            <ChromeTabsContent value="library" className="mt-0 flex min-h-0 flex-1 flex-col">
              <div className="border-b border-border/70 bg-card/60 px-5 py-3">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">
                    <div className="min-w-[18rem] flex-1">
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

                    <AssetsFilterPopover
                      value={filters}
                      onChange={(next: AssetsFilters) => {
                        setFilters(next);
                      }}
                      ordering={ordering}
                      onOrderingChange={(next) => {
                        setOrdering(next);
                      }}
                      defaultOrdering="-created_at"
                      tags={tagsQuery.data?.items ?? []}
                      tagsLoading={tagsQuery.isLoading}
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-footnote">
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
              </div>

              <div
                ref={libraryViewportRef}
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
                        <Button variant="outline" onClick={() => setActiveTab("upload")}>
                          <UploadCloud className="size-4" />
                          {t("assets:ASSET_ACTION_UPLOAD")}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <>
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
                                setSelection((prev) =>
                                  rangeSelect(prev, asset.id, orderedAssetIds),
                                );
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
                                setSelection((prev) =>
                                  selectOrClearOnPlainClick(prev, asset.id, 1),
                                );
                                return;
                              }
                              setSelection((prev) => toggleSelect(prev, asset.id));
                            }}
                            onOpen={handleAssetDoubleClick}
                          />
                        );
                      }}
                    />
                    <div ref={sentinelRef} className="flex h-12 items-center justify-center">
                      {infiniteAssetsQuery.isFetchingNextPage ? (
                        <Spinner className="size-4 text-label-secondary" />
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            </ChromeTabsContent>

            {allowUpload ? (
              <ChromeTabsContent value="upload" className="mt-0 flex min-h-0 flex-1 flex-col">
                <div className="flex flex-1 items-center justify-center px-6 py-8">
                  <div className="w-full max-w-lg rounded-3xl border border-dashed border-border/80 bg-card/80 p-8 text-center">
                    <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-label-secondary">
                      <UploadCloud className="size-5" />
                    </div>
                    <div className="mt-4 text-callout font-semibold text-label-primary">
                      {t("assets:ASSET_ACTION_UPLOAD")}
                    </div>
                    <div className="mt-2 text-footnote text-label-secondary">
                      {t("assets:ASSET_PICKER_FIELD_SEARCH_HELP")}
                    </div>
                    <Button
                      className="mt-6"
                      onClick={() => setUploadOpen(true)}
                      disabled={isFetching}
                    >
                      <UploadCloud className="size-4" />
                      {t("assets:ASSET_ACTION_UPLOAD")}
                    </Button>
                  </div>
                </div>
              </ChromeTabsContent>
            ) : null}
          </ChromeTabs>
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
          void queryClient.invalidateQueries({ queryKey: ["assets", "list"] });
          void queryClient.invalidateQueries({ queryKey: ["assets", "folderHasMatch"] });
          void queryClient.invalidateQueries({ queryKey: assetsListQueryKey });
          setActiveTab("library");
          setUploadOpen(false);
        }}
      />
    </>
  );
}
