import { useEffect, useMemo, useRef, useState } from "react";
import { PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";

import { AccessNoticeAlert } from "@/components/common/access-notice-alert";
import { type ViewMode as AssetsViewMode } from "@/components/common/view-mode-toggle";
import { ColumnsPage } from "@/layouts/page-shell/columns-page";
import { STORAGE_KEYS } from "@/constants/storage";
import { useProjectPermissionAccess } from "@/hooks/use-workspace-permission-access";
import { invalidateAssetListQueries } from "@/lib/assets/invalidate-asset-list-queries";
import { Button } from "@arclayer/ui/button";
import { readStorageItem, writeStorageItem } from "@/lib/storage";
import type { AdminAssetFolder, AdminAssetTag } from "@/types/api";
import type { AssetMasonryItem } from "@/types/assets-masonry";

import { clearSelection } from "@/lib/assets/asset-selection";
import { useAssetsViewController } from "../hooks/use-assets-view-controller";
import { AssetsFolderRail } from "./assets-folder-rail";
import { AssetsViewDndSurface } from "./assets-view-dnd-surface";
import { AssetsViewHeader } from "./assets-view-header";
import { AssetsViewMasonrySection } from "./assets-view-masonry-section";
import { AssetsSelectionToolbar, AssetsViewOverlays } from "./assets-view-overlays";
import { AssetsViewTableSection, useAssetsViewTableController } from "./assets-view-table-section";

export function AssetsPageView(props: {
  projectId: string;
  initialSearchQuery?: string;
  initialAssetId?: string;
}) {
  const [viewMode, setViewMode] = useState<AssetsViewMode>("card");
  const [cardSidebarOpen, setCardSidebarOpen] = useState(() => {
    const stored = readStorageItem(STORAGE_KEYS.assetsFolderRailOpen);
    return stored ? stored === "true" : true;
  });
  const controller = useAssetsViewController(props.projectId, viewMode);
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
    createFolderSeedAssetIds,
    setCreateFolderSeedAssetIds,
    createFolderSeedAssetCount,
    editFolderOpen,
    setEditFolderOpen,
    editFolderTarget,
    setEditFolderTarget,
    moveFolderOpen,
    setMoveFolderOpen,
    moveFolderTarget,
    setMoveFolderTarget,
    deleteFolderOpen,
    setDeleteFolderOpen,
    deleteFolderTarget,
    editAccessOpen,
    setEditAccessOpen,
    editAccessMode,
    editAccessCurrent,
    searchInput,
    setSearchInput,
    currentFolderId,
    setCurrentFolderId,
    setFocusedFolderId,
    filters,
    setFilters,
    ordering,
    setOrdering,
    foldersQuery,
    tagsQuery,
    recentAssets,
    removeRecentAsset,
    clearRecentAssets,
    editAssetOpen,
    setEditAssetOpen,
    editAssetTarget,
    assetDeleteOpen,
    setAssetDeleteOpen,
    assetDeleteTarget,
    assetDeleteMutation,
    assetEditAccessOpen,
    setAssetEditAccessOpen,
    assetEditAccessTarget,
    singleAssetAccessMutation,
    bulkMoveMutation,
    bulkDeleteMutation,
    bulkUpdateMutation,
    createFolderMutation,
    updateFolderMutation,
    deleteFolderMutation,
    openEditAssetDialog,
    openEditAccessDialog,
    createParentLabel,
    openBulkDeleteDialog,
    openDeleteFolderDialog,
    openAssetDetails,
  } = controller;
  const setActiveAsset = (next: AssetMasonryItem | null) => {
    if (next) {
      openAssetDetails(next);
      return;
    }
    setActive(null);
  };
  const tableView = useAssetsViewTableController(controller);
  const permissionAccess = useProjectPermissionAccess(props.projectId);
  const permissionReady =
    permissionAccess.authzQuery.isFetched && permissionAccess.actionsQuery.isFetched;
  const canManageAssets = !permissionReady || permissionAccess.hasAction("project:assets:manage");
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
    openAssetDetails(matched);
  }, [controller.items, props.initialAssetId]);

  const currentFolderPathLabel = currentFolderId
    ? [
        t("assets:ASSET_BREADCRUMB_ROOT"),
        ...controller.folderPath.map((folder) => folder.name),
      ].join(" / ")
    : t("assets:ASSET_BREADCRUMB_ROOT");
  const folderBreadcrumbs = useMemo(
    () => controller.folderPath.map((folder) => folder.name),
    [controller.folderPath],
  );
  const setCreateFolderDialogOpen = (open: boolean) => {
    setCreateFolderOpen(open);
    if (open) return;
    setCreateFolderParentId(null);
    setCreateFolderSeedAssetIds([]);
  };

  const cardLibraryIsEmpty =
    viewMode === "card" &&
    !currentFolderId &&
    !controller.explicitFilterActive &&
    !controller.assetsQuery.isLoading &&
    (controller.assetsQuery.data?.pages?.[0]?.total ?? 0) === 0;
  const canToggleCardSidebar = viewMode === "card" && !cardLibraryIsEmpty;
  const showCardSidebar = viewMode === "card" && cardSidebarOpen && !cardLibraryIsEmpty;

  const sideSlots = showCardSidebar
    ? {
        left: {
          title: t("assets:ASSET_FOLDER_PANEL_TITLE"),
          mobileLabel: t("assets:ASSET_FOLDER_PANEL_TITLE"),
          minWidth: "16rem",
          maxWidth: "24rem",
          defaultWidth: "clamp(16rem, 20vw, 24rem)",
          sticky: true,
          stickyTop: 0,
          content: (
            <AssetsFolderRail
              t={t}
              scope={scope}
              folders={(foldersQuery.data?.items ?? []) as AdminAssetFolder[]}
              foldersLoading={foldersQuery.isLoading}
              foldersError={foldersQuery.isError}
              onRetryFolders={() => {
                void foldersQuery.refetch();
              }}
              currentFolderId={currentFolderId}
              activeAssetId={active?.id ?? null}
              recentAssets={recentAssets}
              onSelectFolder={(folderId) => {
                setCurrentFolderId(folderId);
                setFocusedFolderId(folderId);
                setActiveAsset(null);
              }}
              onCreateFolder={(parentId) => {
                if (!canManageAssets) return;
                setCreateFolderParentId(parentId);
                setCreateFolderSeedAssetIds([]);
                setCreateFolderDialogOpen(true);
              }}
              onEditFolder={(folder) => {
                if (!canManageAssets) return;
                setEditFolderTarget(folder);
                setEditFolderOpen(true);
              }}
              onMoveFolder={(folder) => {
                if (!canManageAssets) return;
                setMoveFolderTarget(folder);
                setMoveFolderOpen(true);
              }}
              onDeleteFolder={(folder) => {
                if (!canManageAssets) return;
                openDeleteFolderDialog(folder);
              }}
              dropSuccessPulse={controller.dropSuccessPulse}
              tooltipDisabled={
                Boolean(controller.draggingFolderId) || controller.draggingAssetIds.length > 0
              }
              isDraggingAssets={controller.draggingAssetIds.length > 0}
              onOpenAsset={openAssetDetails}
              onRemoveRecentAsset={removeRecentAsset}
              onClearRecentAssets={clearRecentAssets}
              canManageAssets={canManageAssets}
            />
          ),
        },
      }
    : {};

  const action = canToggleCardSidebar ? (
    <div className="inline-flex items-center gap-2">
      <Button
        variant="outline"
        aria-label={t("common:SIDEBAR_TOGGLE")}
        onClick={() =>
          setCardSidebarOpen((prev) => {
            const next = !prev;
            writeStorageItem(STORAGE_KEYS.assetsFolderRailOpen, String(next));
            return next;
          })
        }
      >
        {cardSidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        <span className="sr-only">{t("common:SIDEBAR_TOGGLE")}</span>
      </Button>
      <Button onClick={() => setUploadOpen(true)} disabled={!canManageAssets}>
        <Plus size={16} />
        {t("assets:ASSET_ACTION_UPLOAD")}
      </Button>
    </div>
  ) : (
    <Button onClick={() => setUploadOpen(true)} disabled={!canManageAssets}>
      <Plus size={16} />
      {t("assets:ASSET_ACTION_UPLOAD")}
    </Button>
  );

  return (
    <AssetsViewDndSurface controller={controller} disabled={!canManageAssets}>
      <ColumnsPage
        title={t("nav:NAV_ASSETS")}
        footer={
          <AssetsSelectionToolbar
            t={t}
            selectedCount={selectedIds.size}
            bulkMovePending={bulkMoveMutation.isPending}
            bulkUpdatePending={bulkUpdateMutation.isPending}
            bulkDeletePending={bulkDeleteMutation.isPending}
            onClearSelection={() => {
              setSelection((prev) => clearSelection(prev));
            }}
            onOpenMove={() => setMoveModalOpen(true)}
            onOpenEditAccess={() => openEditAccessDialog()}
            onOpenBulkDelete={() => openBulkDeleteDialog()}
            canManageAssets={canManageAssets}
          />
        }
        action={action}
        extra={
          <AssetsViewHeader
            t={t}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            setFilters={setFilters}
            searchInput={searchInput}
            setSearchInput={setSearchInput}
            filters={filters}
            ordering={ordering}
            setOrdering={setOrdering}
            tags={(tagsQuery.data?.items ?? []) as AdminAssetTag[]}
            tagsLoading={tagsQuery.isLoading}
            table={viewMode === "table" ? tableView.table : undefined}
            rowHeight={tableView.rowHeight}
            onRowHeightChange={tableView.setRowHeight}
            wrapHeaders={tableView.wrapHeaders}
            onWrapHeadersChange={tableView.setWrapHeaders}
            onRefresh={() => void controller.assetsQuery.refetch()}
            refreshing={tableView.refreshing}
            onResetColumnVisibility={tableView.resetColumnVisibility}
            labels={tableView.toolsLabels}
          />
        }
        sideSlots={sideSlots}
      >
        <div className="relative flex h-full min-h-0 min-w-0 w-full flex-col">
          {!canManageAssets ? (
            <AccessNoticeAlert
              className="mx-4 mt-4 sm:mx-6 lg:mx-8"
              data-testid="assets-read-only-notice"
              description={t("assets:ASSET_LIBRARY_NO_ACCESS_DESC")}
            />
          ) : null}
          <AssetsViewOverlays
            t={t}
            active={active}
            setActive={setActiveAsset}
            projectId={props.projectId}
            items={controller.items}
            currentFolderPathLabel={currentFolderPathLabel}
            folderBreadcrumbs={folderBreadcrumbs}
            workspaceBreadcrumb={null}
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
            setCreateFolderOpen={setCreateFolderDialogOpen}
            createFolderInitialParentId={createFolderParentId ?? currentFolderId}
            createParentLabel={createParentLabel}
            createFolderPending={createFolderMutation.isPending}
            createFolderAssetCount={createFolderSeedAssetCount}
            onCreateFolder={async ({ name, description, parentId }) => {
              const nextFolder = await createFolderMutation.mutateAsync({
                name,
                parentId,
                description,
              });
              if (!createFolderSeedAssetIds.length) return;
              await bulkMoveMutation.mutateAsync({
                assetIds: createFolderSeedAssetIds,
                folderId: String(nextFolder.id),
              });
              setSelection((prev) => clearSelection(prev));
              setActive((prev) =>
                prev && createFolderSeedAssetIds.includes(String(prev.id)) ? null : prev,
              );
            }}
            deleteFolderOpen={deleteFolderOpen}
            setDeleteFolderOpen={setDeleteFolderOpen}
            deleteFolderTarget={deleteFolderTarget}
            deleteFolderPending={deleteFolderMutation.isPending}
            onDeleteFolder={async (destinationFolderId) => {
              const folder = deleteFolderTarget;
              if (!folder) return;
              await deleteFolderMutation.mutateAsync({
                folderId: String(folder.id),
                destinationFolderId,
              });
              if (String(currentFolderId || "") === String(folder.id)) {
                setCurrentFolderId(destinationFolderId);
              }
            }}
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
              }
              void invalidateAssetListQueries(queryClient, scopeKey);
              setUploadOpen(false);
            }}
            onClearSelection={() => {
              setSelection((prev) => clearSelection(prev));
            }}
            onOpenMove={() => setMoveModalOpen(true)}
            onOpenEditAccess={() => openEditAccessDialog()}
            onOpenBulkDelete={() => openBulkDeleteDialog()}
            editAssetOpen={editAssetOpen}
            setEditAssetOpen={setEditAssetOpen}
            editAssetTarget={editAssetTarget}
            onOpenEditAsset={openEditAssetDialog}
            assetDeleteOpen={assetDeleteOpen}
            setAssetDeleteOpen={setAssetDeleteOpen}
            assetDeleteTarget={assetDeleteTarget}
            assetDeletePending={assetDeleteMutation.isPending}
            onConfirmAssetDelete={async () => {
              if (!assetDeleteTarget) return;
              await assetDeleteMutation.mutateAsync(assetDeleteTarget.id);
            }}
            assetEditAccessOpen={assetEditAccessOpen}
            setAssetEditAccessOpen={setAssetEditAccessOpen}
            assetEditAccessTarget={assetEditAccessTarget}
            singleAssetAccessPending={singleAssetAccessMutation.isPending}
            onConfirmSingleAssetAccess={async (value) => {
              if (!assetEditAccessTarget) return;
              await singleAssetAccessMutation.mutateAsync({
                assetId: assetEditAccessTarget.id,
                ...value,
              });
            }}
            canManageAssets={canManageAssets}
          />

          <div className="min-h-0 min-w-0 w-full flex-1 overflow-x-hidden overflow-y-auto pb-8 scrollbar-none">
            {viewMode === "card" ? (
              <AssetsViewMasonrySection controller={controller} />
            ) : (
              <AssetsViewTableSection
                controller={controller}
                table={tableView.table}
                rowHeight={tableView.rowHeight}
                wrapHeaders={tableView.wrapHeaders}
                refreshing={tableView.refreshing}
                onRowClick={tableView.onRowClick}
              />
            )}
          </div>
        </div>
      </ColumnsPage>
    </AssetsViewDndSurface>
  );
}
