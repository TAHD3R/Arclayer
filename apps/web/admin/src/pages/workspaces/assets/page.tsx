import { Button } from "antd";
import { Plus } from "lucide-react";

import { DefaultPage } from "@/components/common/default-page";
import { LoaderOne } from "@/components/ui/loader";
import type { AdminAssetFolder, AdminAssetTag } from "@/api/assets";
import { getErrorMessage } from "@/lib/notifications";
import { clearSelection } from "@/lib/assets/asset-selection";
import { useAssetsViewController } from "./use-assets-view-controller";
import { AssetsViewHeader } from "./assets-view-header";
import { AssetsViewMasonrySection } from "./assets-view-masonry-section";
import { AssetsViewOverlays } from "./assets-view-overlays";

export function AssetsView() {
  const controller = useAssetsViewController();
  const {
    t,
    queryClient,
    workspaceId,
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
    editFolderOpen,
    setEditFolderOpen,
    editFolderTarget,
    moveFolderOpen,
    setMoveFolderOpen,
    moveFolderTarget,
    editAccessOpen,
    setEditAccessOpen,
    editAccessMode,
    editAccessCurrent,
    folderNotEmptyInfo,
    setFolderNotEmptyInfo,
    searchInput,
    setSearchInput,
    currentFolderId,
    filters,
    setFilters,
    ordering,
    setOrdering,
    foldersQuery,
    tagsQuery,
    assetsQuery,
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
    openEditAccessDialog,
    createParentLabel,
    openBulkDeleteDialog,
  } = controller;

  return (
    <DefaultPage
      title={t("nav:NAV_ASSETS")}
      width="full"
      action={
        <Button type="primary" icon={<Plus size={16} />} onClick={() => setUploadOpen(true)}>
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
    >
      <AssetsViewOverlays
        t={t}
        active={active}
        setActive={setActive}
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
          if (!value.visibility && !value.purpose) return;
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
        workspaceId={workspaceId ? String(workspaceId) : ""}
        uploadOpen={uploadOpen}
        setUploadOpen={setUploadOpen}
        currentFolderId={currentFolderId}
        onUploaded={() => {
          if (workspaceId)
            void queryClient.invalidateQueries({ queryKey: ["assets", "list", workspaceId] });
          setUploadOpen(false);
        }}
        onClearSelection={() => {
          setSelection((prev) => clearSelection(prev));
        }}
        onOpenMove={() => setMoveModalOpen(true)}
        onOpenEditAccess={() => openEditAccessDialog()}
        onOpenBulkDelete={() => openBulkDeleteDialog()}
      />

      <AssetsViewMasonrySection controller={controller} getErrorMessage={getErrorMessage} />

      {assetsQuery.hasNextPage ? (
        <div ref={sentinelRef} className="py-8 flex justify-center">
          {assetsQuery.isFetchingNextPage ? <LoaderOne /> : <div className="h-6 w-6" />}
        </div>
      ) : null}
    </DefaultPage>
  );
}
