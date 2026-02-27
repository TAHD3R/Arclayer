import type { InputRef } from "antd";
import { Button, Input, Masonry, Pagination } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { Search, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { LoaderOne } from "@/components/ui/loader";
import { SettingDialog } from "@/components/settings-primitives/setting-dialog";
import { AssetUploadDialog } from "@/components/assets/asset-upload-dialog";
import {
  AssetsExplorerFolderTile,
  AssetsExplorerFolderUpTile,
} from "@/components/assets/explorer/assets-explorer-folder-tiles";
import { useAssetsExplorerController } from "@/components/assets/explorer/use-assets-explorer-controller";
import {
  clearSelection,
  orderSelectedIds,
  rangeSelect,
  selectOrClearOnPlainClick,
  toggleSelect,
  type AssetSelectionState,
} from "@/lib/assets/asset-selection";
import { AssetMasonryTile, type AssetMasonryItem } from "@/components/assets/asset-masonry-card";
import { AssetsFilterPopover, type AssetsFilters } from "@/components/assets/assets-filter-popover";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export type AssetPickerDialogValue = {
  assetIds: string[];
};

type AssetPickerDialogMode = "single" | "multiple";

export function AssetPickerDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;

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
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const mode: AssetPickerDialogMode = props.mode ?? "single";
  const allowUpload = props.allowUpload !== false;

  const explorer = useAssetsExplorerController({
    workspaceId,
    pagination: "paged",
    // In picker scenarios we should NOT force purpose=library:
    // - logo/favicon upload may create purpose=site_logo/favicon assets
    // - other future pickers may select non-library assets
    purpose: undefined,
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
    setFilters((prev) => ({
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

  const searchInputRef = useRef<InputRef>(null);
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
                danger
                onClick={() => {
                  props.onConfirm({ assetIds: [] });
                  props.onOpenChange(false);
                }}
              >
                {t("settings:SETTINGS_ASSET_PICKER_CLEAR")}
              </Button>
            ) : null}
            <Button type="text" onClick={() => props.onOpenChange(false)}>
              {t("common:CANCEL")}
            </Button>
            <Button
              type="primary"
              disabled={selectedIds.size <= 0}
              onClick={() => confirmSelectionAndClose()}
            >
              {t("common:CONFIRM")}
            </Button>
          </>
        }
      >
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Toolbar: search + filters + upload */}
          <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid min-w-[280px] flex-1 gap-1.5">
                <label className="font-semibold text-foreground">
                  {t("assets:ASSET_PICKER_FIELD_SEARCH")}
                </label>
                <div className="text-label-secondary">
                  {t("assets:ASSET_PICKER_FIELD_SEARCH_HELP")}
                </div>
                <Input
                  className="w-full max-w-[320px]"
                  variant="borderless"
                  ref={searchInputRef}
                  allowClear
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={t("settings:SETTINGS_ASSET_PICKER_SEARCH_PLACEHOLDER")}
                  prefix={<Search size={16} className="text-label-secondary" />}
                />
              </div>

              <div className="flex items-center gap-2 self-end">
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

            <div className="flex items-center gap-2">
              {allowUpload ? (
                <Button
                  type="primary"
                  icon={<UploadCloud size={16} />}
                  onClick={() => setUploadOpen(true)}
                  disabled={isFetching}
                >
                  {t("assets:ASSET_ACTION_UPLOAD")}
                </Button>
              ) : null}
            </div>
          </div>

          {/* Breadcrumbs */}
          <div className="px-6 flex items-center gap-2 text-footnote">
            <Button
              type="text"
              onClick={() => {
                setCurrentFolderId(null);
                setFocusedFolderId(null);
              }}
            >
              {t("assets:ASSET_BREADCRUMB_ROOT")}
            </Button>
            {folderPath.map((f) => (
              <div key={String(f.id)} className="flex items-center gap-2">
                <span className="text-label-secondary">/</span>
                <Button
                  type="text"
                  size="small"
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

          {/* Content */}
          <div
            className="flex-1 min-h-0 overflow-auto px-6 py-5 select-none"
            onMouseDown={(e) => {
              const target = e.target as HTMLElement | null;
              if (!target) return;
              // Click blank area => clear selection & folder focus (file-manager-like UX).
              if (target.closest("[data-asset-tile='true']")) return;
              if (target.closest("[data-folder-tile='true']")) return;
              setSelection((prev) => clearSelection(prev));
              setFocusedFolderId(null);
            }}
          >
            {isLoading ? (
              <div className="py-10 flex justify-center">
                <LoaderOne />
              </div>
            ) : masonryEntries.length === 0 ? (
              <div className="py-10 text-footnote text-label-secondary">
                {t("assets:ASSET_EMPTY_SEARCH_DESC")}
              </div>
            ) : (
              <Masonry
                gutter={[16, 16]}
                columns={{ xs: 1, sm: 2, md: 3, xl: 4, xxl: 5 }}
                fresh
                items={masonryEntries.map((it) => ({
                  key:
                    it.kind === "asset"
                      ? it.asset.id
                      : it.kind === "folder"
                        ? `folder:${it.folder.id}`
                        : "folder:__up__",
                  data: it,
                }))}
                itemRender={(info) => {
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
                        setSelection((prev) => selectOrClearOnPlainClick(prev, asset.id, e.detail));
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

          {/* Pagination */}
          <div className="px-6 py-3 border-t flex items-center justify-between gap-3">
            <div className="text-caption text-label-secondary">
              {isFetching ? t("common:LOADING") : null}
            </div>
            <Pagination
              size="small"
              showSizeChanger
              current={page}
              pageSize={pageSize}
              total={total}
              onChange={(nextPage, nextSize) => {
                if (typeof nextSize === "number" && nextSize !== pageSize) {
                  setPageSize(nextSize);
                  setPage(1);
                  return;
                }
                setPage(nextPage);
              }}
            />
          </div>
        </div>
      </SettingDialog>

      <AssetUploadDialog
        workspaceId={workspaceId ? String(workspaceId) : ""}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        purpose={props.uploadPurpose}
        onUploaded={() => {
          if (workspaceId) {
            void queryClient.invalidateQueries({
              queryKey: ["assets", "folders", String(workspaceId)],
            });
            void queryClient.invalidateQueries({
              queryKey: ["assets", "paged", String(workspaceId)],
            });
            void queryClient.invalidateQueries({
              queryKey: ["assets", "folderHasMatch", String(workspaceId)],
            });
            void queryClient.invalidateQueries({ queryKey: assetsListQueryKey });
          }
          setUploadOpen(false);
        }}
      />
    </>
  );
}
