import { useEffect, useRef } from "react";
import { Plus } from "@arclayer/ui/icons/lucide-animated";

import { ColumnsPage } from "@/components/common/columns-page";
import { Button } from "@arclayer/ui/button";
import { Spinner } from "@arclayer/ui/spinner";
import type { AdminAssetFolder, AdminAssetTag } from "@/types/api";

import { clearSelection } from "@/lib/assets/asset-selection";
import { useAssetsViewController } from "../hooks/use-assets-view-controller";
import { AssetsFolderRail } from "./assets-folder-rail";
import { AssetsViewDndSurface } from "./assets-view-dnd-surface";
import { AssetsViewHeader } from "./assets-view-header";
import { AssetsViewMasonrySection } from "./assets-view-masonry-section";
import { AssetsViewOverlays } from "./assets-view-overlays";

export function AssetsPageView(props: { initialSearchQuery?: string; initialAssetId?: string }) {
  const controller = useAssetsViewController();
  const {
    t,
    queryClient,
    scope,
    scopeKey,
    active,
    setActive,
    setSelection,
    selectedIds,
    uploadOpen,
    setUploadOpen,
    moveModalOpen,
    setMoveModalOpen,
    bulkDeleteOpen,
    setBulkDeleteOpen,
    createFolderOpen,
    setCreateFolderOpen,
    createFolderParentId,
    setCreateFolderParentId,
    editFolderOpen,
    setEditFolderOpen,
    editFolderTarget,
    setEditFolderTarget,
    moveFolderOpen,
    setMoveFolderOpen,
    moveFolderTarget,
    setMoveFolderTarget,
    editAccessOpen,
    setEditAccessOpen,
    editAccessMode,
    editAccessCurrent,
    folderNotEmptyInfo,
    setFolderNotEmptyInfo,
    searchInput,
    setSearchInput,
    currentFolderId,
    setCurrentFolderId,
    focusedFolderId,
    setFocusedFolderId,
    filters,
    setFilters,
    ordering,
    setOrdering,
    foldersQuery,
    tagsQuery,
    assetsQuery,
    assetsListQueryKey,
    moreOpen,
    setMoreOpen,
    moreHovered,
    setMoreHovered,
    typeTabValue,
    moreTabLabel,
    moreMenuItems,
    sentinelRef,
    bulkMoveMutation,
    bulkDeleteMutation,
    bulkUpdateMutation,
    createFolderMutation,
    updateFolderMutation,
    reorderFoldersMutation,
    openEditAccessDialog,
    createParentLabel,
    openBulkDeleteDialog,
  } = controller;
  const hydratedSearchRef = useRef<string | null>(null);
  const hydratedAssetIdRef = useRef<string | null>(null);

  useEffect(() => {
    const nextQuery = String(props.initialSearchQuery || "").trim();
    if (!nextQuery || hydratedSearchRef.current === nextQuery) return;
    hydratedSearchRef.current = nextQuery;
    setSearchInput(nextQuery);
  }, [props.initialSearchQuery, setSearchInput]);

  useEffect(() => {
    const nextAssetId = String(props.initialAssetId || "").trim();
    if (!nextAssetId || hydratedAssetIdRef.current === nextAssetId) return;
    const matched = controller.items.find((item) => String(item.id) === nextAssetId) ?? null;
    if (!matched) return;
    hydratedAssetIdRef.current = nextAssetId;
    setActive(matched);
  }, [controller.items, props.initialAssetId, setActive]);

  const currentFolderPathLabel = currentFolderId
    ? [
        t("assets:ASSET_BREADCRUMB_ROOT"),
        ...controller.folderPath.map((folder) => folder.name),
      ].join(" / ")
    : t("assets:ASSET_BREADCRUMB_ROOT");

  return (
    <AssetsViewDndSurface controller={controller}>
      <ColumnsPage
        title={t("nav:NAV_ASSETS")}
        action={
          <Button onClick={() => setUploadOpen(true)}>
            <Plus size={16} />
            {t("assets:ASSET_ACTION_UPLOAD")}
          </Button>
        }
        extra={
          <AssetsViewHeader
            t={t}
            typeTabValue={typeTabValue}
            setFilters={setFilters}
            setMoreOpen={setMoreOpen}
            moreOpen={moreOpen}
            moreMenuItems={moreMenuItems}
            moreTabLabel={moreTabLabel}
            moreHovered={moreHovered}
            setMoreHovered={setMoreHovered}
            searchInput={searchInput}
            setSearchInput={setSearchInput}
            filters={filters}
            ordering={ordering}
            setOrdering={setOrdering}
            tags={(tagsQuery.data?.items ?? []) as AdminAssetTag[]}
            tagsLoading={tagsQuery.isLoading}
          />
        }
        sideSlots={{
          right: {
            title: t("assets:ASSET_FOLDER_PANEL_TITLE"),
            mobileLabel: t("assets:ASSET_FOLDER_PANEL_TITLE"),
            minWidth: "19rem",
            maxWidth: "25rem",
            content: (
              <AssetsFolderRail
                t={t}
                folders={(foldersQuery.data?.items ?? []) as AdminAssetFolder[]}
                foldersLoading={foldersQuery.isLoading}
                currentFolderId={currentFolderId}
                focusedFolderId={focusedFolderId}
                currentAssetCount={controller.items.length}
                dropSuccessPulse={controller.dropSuccessPulse}
                reorderPending={reorderFoldersMutation.isPending}
                onSelectFolder={(folderId) => {
                  setCurrentFolderId(folderId);
                  setFocusedFolderId(folderId);
                  setSelection((prev) => clearSelection(prev));
                  setActive(null);
                }}
                onFocusFolder={setFocusedFolderId}
                onCreateFolder={(parentId) => {
                  setCreateFolderParentId(parentId);
                  setCreateFolderOpen(true);
                }}
                onEditFolder={(folder) => {
                  setEditFolderTarget(folder);
                  setEditFolderOpen(true);
                }}
                onMoveFolder={(folder) => {
                  setMoveFolderTarget(folder);
                  setMoveFolderOpen(true);
                }}
                onDeleteFolder={(folder) => {
                  void controller.tryDeleteFolder(folder);
                }}
                onReorderFolders={async (folders) => {
                  await reorderFoldersMutation.mutateAsync(folders);
                }}
              />
            ),
          },
        }}
      >
        <AssetsViewOverlays
          t={t}
          active={active}
          setActive={setActive}
          items={controller.items}
          currentFolderPathLabel={currentFolderPathLabel}
          moveModalOpen={moveModalOpen}
          setMoveModalOpen={setMoveModalOpen}
          folders={(foldersQuery.data?.items ?? []) as AdminAssetFolder[]}
          foldersLoading={foldersQuery.isLoading}
          selectedCount={selectedIds.size}
          bulkMovePending={bulkMoveMutation.isPending}
          onMoveAssets={async (folderId) => {
            const assetIds = Array.from(selectedIds);
            if (!assetIds.length) return;
            await bulkMoveMutation.mutateAsync({ assetIds, folderId });
            setSelection((prev) => clearSelection(prev));
          }}
          editFolderOpen={editFolderOpen}
          setEditFolderOpen={setEditFolderOpen}
          editFolderTarget={editFolderTarget}
          updateFolderPending={updateFolderMutation.isPending}
          onUpdateFolder={async (value) => {
            const folder = editFolderTarget;
            if (!folder) return;
            await updateFolderMutation.mutateAsync({
              folderId: String(folder.id),
              payload: { name: value.name, description: value.description },
            });
          }}
          moveFolderOpen={moveFolderOpen}
          setMoveFolderOpen={setMoveFolderOpen}
          moveFolderTarget={moveFolderTarget}
          onMoveFolder={async (parentId) => {
            const folder = moveFolderTarget;
            if (!folder) return;
            await updateFolderMutation.mutateAsync({
              folderId: String(folder.id),
              payload: { parentId },
            });
          }}
          editAccessOpen={editAccessOpen}
          setEditAccessOpen={setEditAccessOpen}
          editAccessMode={editAccessMode}
          editAccessCurrent={editAccessCurrent}
          bulkUpdatePending={bulkUpdateMutation.isPending}
          onConfirmEditAccess={async (value) => {
            const assetIds = Array.from(selectedIds);
            if (!assetIds.length) return;
            if (!value.visibility && !value.purpose && typeof value.indexable === "undefined") {
              return;
            }
            await bulkUpdateMutation.mutateAsync({ assetIds, ...value });
          }}
          createFolderOpen={createFolderOpen}
          setCreateFolderOpen={setCreateFolderOpen}
          createParentLabel={createParentLabel}
          createFolderPending={createFolderMutation.isPending}
          onCreateFolder={async (name, description) => {
            const parentId = createFolderParentId ?? currentFolderId;
            await createFolderMutation.mutateAsync({ name, parentId, description });
          }}
          folderNotEmptyInfo={folderNotEmptyInfo}
          setFolderNotEmptyInfo={setFolderNotEmptyInfo}
          bulkDeleteOpen={bulkDeleteOpen}
          setBulkDeleteOpen={setBulkDeleteOpen}
          bulkDeletePending={bulkDeleteMutation.isPending}
          onConfirmBulkDelete={async () => {
            const assetIds = Array.from(selectedIds);
            if (!assetIds.length) return;
            await bulkDeleteMutation.mutateAsync({ assetIds });
            setSelection((prev) => clearSelection(prev));
            setActive(null);
            setBulkDeleteOpen(false);
          }}
          scope={scope}
          uploadOpen={uploadOpen}
          setUploadOpen={setUploadOpen}
          currentFolderId={currentFolderId}
          onUploaded={() => {
            if (scopeKey) {
              void queryClient.invalidateQueries({ queryKey: ["assets", "folders", scopeKey] });
              void queryClient.invalidateQueries({ queryKey: ["assets", "tags", scopeKey] });
              void queryClient.invalidateQueries({ queryKey: ["assets", "list", scopeKey] });
            }
            void queryClient.invalidateQueries({ queryKey: assetsListQueryKey });
            setUploadOpen(false);
          }}
          onClearSelection={() => {
            setSelection((prev) => clearSelection(prev));
          }}
          onOpenMove={() => setMoveModalOpen(true)}
          onOpenEditAccess={() => openEditAccessDialog()}
          onOpenBulkDelete={() => openBulkDeleteDialog()}
        />

        <div className="min-h-0 min-w-0 w-full flex-1 overflow-x-hidden">
          <AssetsViewMasonrySection controller={controller} />
        </div>

        {assetsQuery.hasNextPage ? (
          <div ref={sentinelRef} className="py-8 flex justify-center">
            {assetsQuery.isFetchingNextPage ? (
              <Spinner className="size-4 text-label-secondary" />
            ) : (
              <div className="h-4 w-4" />
            )}
          </div>
        ) : null}
      </ColumnsPage>
    </AssetsViewDndSurface>
  );
}
