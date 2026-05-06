import { FolderInput, Settings2, Trash2 } from "lucide-react";

import { FloatingBulkToolbar } from "@/components/common/floating-bulk-toolbar";
import type { AdminAssetFolder } from "@arclayer/openapi/admin-types";
import type { AssetMasonryItem } from "@/types/assets-masonry";
import { AssetPreviewDialog, type AssetPreviewProjectBreadcrumb } from "./asset-preview-dialog";
import { BulkDeleteAssetsDialog } from "./bulk-delete-assets-dialog";
import { CreateAssetFolderDialog } from "./create-asset-folder-dialog";
import { DeleteAssetDialog } from "./delete-asset-dialog";
import { DeleteAssetFolderDialog } from "./delete-asset-folder-dialog";
import { MoveAssetsToFolderModal } from "./move-assets-to-folder-modal";
import { MoveFolderModal } from "./move-folder-modal";
import { UpdateAssetDialog } from "./update-asset-dialog";
import { UpdateAssetsAccessDialog } from "./update-assets-access-dialog";
import {
  UpdateAssetFolderDialog,
  type UpdateAssetFolderDialogValue,
} from "./update-asset-folder-dialog";
import { AssetUploadDialog } from "./asset-upload-dialog";
import type { AssetScopeRef } from "@/lib/assets/asset-scope";

interface AssetsViewOverlaysProps {
  t: (key: string, options?: Record<string, unknown>) => string;
  active: AssetMasonryItem | null;
  setActive: (next: AssetMasonryItem | null) => void;
  projectId: string;
  items: AssetMasonryItem[];
  currentFolderPathLabel: string;
  folderBreadcrumbs: string[];
  projectBreadcrumb: AssetPreviewProjectBreadcrumb | null;
  moveModalOpen: boolean;
  setMoveModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  folders: AdminAssetFolder[];
  foldersLoading: boolean;
  selectedCount: number;
  bulkMovePending: boolean;
  onMoveAssets: (folderId: string | null) => Promise<void>;
  editFolderOpen: boolean;
  setEditFolderOpen: React.Dispatch<React.SetStateAction<boolean>>;
  editFolderTarget: AdminAssetFolder | null;
  updateFolderPending: boolean;
  onUpdateFolder: (value: UpdateAssetFolderDialogValue) => Promise<void>;
  moveFolderOpen: boolean;
  setMoveFolderOpen: React.Dispatch<React.SetStateAction<boolean>>;
  moveFolderTarget: AdminAssetFolder | null;
  onMoveFolder: (parentId: string | null) => Promise<void>;
  editAccessOpen: boolean;
  setEditAccessOpen: React.Dispatch<React.SetStateAction<boolean>>;
  editAccessMode: "single" | "bulk";
  editAccessCurrent: { visibility?: string; purpose?: string; indexable?: boolean };
  bulkUpdatePending: boolean;
  onConfirmEditAccess: (value: {
    visibility?: string;
    purpose?: string;
    indexable?: boolean;
  }) => Promise<void>;
  createFolderOpen: boolean;
  setCreateFolderOpen: (open: boolean) => void;
  createFolderInitialParentId: string | null;
  createParentLabel: string;
  createFolderPending: boolean;
  createFolderAssetCount?: number;
  onCreateFolder: (value: {
    name: string;
    description: string | null;
    parentId: string | null;
  }) => Promise<void>;
  deleteFolderOpen: boolean;
  setDeleteFolderOpen: React.Dispatch<React.SetStateAction<boolean>>;
  deleteFolderTarget: AdminAssetFolder | null;
  deleteFolderPending: boolean;
  onDeleteFolder: (destinationFolderId: string | null) => Promise<void>;
  bulkDeleteOpen: boolean;
  setBulkDeleteOpen: React.Dispatch<React.SetStateAction<boolean>>;
  bulkDeletePending: boolean;
  onConfirmBulkDelete: () => Promise<void>;
  scope: AssetScopeRef | null;
  uploadOpen: boolean;
  setUploadOpen: React.Dispatch<React.SetStateAction<boolean>>;
  currentFolderId: string | null;
  onUploaded: () => void;
  onClearSelection: () => void;
  onOpenMove: () => void;
  onOpenEditAccess: () => void;
  onOpenBulkDelete: () => void;
  editAssetOpen: boolean;
  setEditAssetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  editAssetTarget: AssetMasonryItem | null;
  onOpenEditAsset: (asset: AssetMasonryItem) => void;
  assetDeleteOpen: boolean;
  setAssetDeleteOpen: React.Dispatch<React.SetStateAction<boolean>>;
  assetDeleteTarget: AssetMasonryItem | null;
  assetDeletePending: boolean;
  onConfirmAssetDelete: () => Promise<void>;
  assetEditAccessOpen: boolean;
  setAssetEditAccessOpen: React.Dispatch<React.SetStateAction<boolean>>;
  assetEditAccessTarget: AssetMasonryItem | null;
  singleAssetAccessPending: boolean;
  onConfirmSingleAssetAccess: (value: {
    visibility?: string;
    purpose?: string;
    indexable?: boolean;
  }) => Promise<void>;
  canManageAssets?: boolean;
}

export function AssetsSelectionToolbar(
  props: Pick<
    AssetsViewOverlaysProps,
    | "t"
    | "selectedCount"
    | "bulkMovePending"
    | "bulkUpdatePending"
    | "bulkDeletePending"
    | "onClearSelection"
    | "onOpenMove"
    | "onOpenEditAccess"
    | "onOpenBulkDelete"
    | "canManageAssets"
  >,
) {
  const canManageAssets = props.canManageAssets !== false;
  return (
    <FloatingBulkToolbar
      visible={props.selectedCount > 0}
      selectedLabel={props.t("assets:ASSET_SELECTED_COUNT", { count: props.selectedCount })}
      clearLabel={props.t("assets:ASSET_CLEAR_SELECTION")}
      onClear={props.onClearSelection}
      actions={[
        {
          key: "move",
          label: props.t("assets:ASSET_ACTION_MOVE"),
          icon: <FolderInput size={16} />,
          onClick: props.onOpenMove,
          disabled: !canManageAssets || props.bulkMovePending,
        },
        {
          key: "edit-access",
          label: props.t("assets:ASSET_ACTION_EDIT_ACCESS"),
          icon: <Settings2 size={16} />,
          onClick: props.onOpenEditAccess,
          disabled: !canManageAssets || props.bulkUpdatePending,
        },
        {
          key: "delete",
          label: props.t("assets:ASSET_ACTION_DELETE_SELECTED"),
          icon: <Trash2 size={16} />,
          onClick: props.onOpenBulkDelete,
          disabled: !canManageAssets || props.bulkDeletePending,
          variant: "destructive",
        },
      ]}
    />
  );
}

export function AssetsViewOverlays(props: AssetsViewOverlaysProps) {
  return (
    <>
      <AssetPreviewDialog
        projectId={props.projectId}
        active={props.active}
        items={props.items}
        currentFolderPathLabel={props.currentFolderPathLabel}
        folderBreadcrumbs={props.folderBreadcrumbs}
        projectBreadcrumb={props.projectBreadcrumb}
        onSelectAsset={(asset) => props.setActive(asset)}
        onOpenEditAsset={props.onOpenEditAsset}
        onClose={() => props.setActive(null)}
        canManageAssets={props.canManageAssets}
      />
      <MoveAssetsToFolderModal
        open={props.moveModalOpen}
        onOpenChange={props.setMoveModalOpen}
        folders={props.folders}
        foldersLoading={props.foldersLoading}
        assetCount={props.selectedCount}
        confirmLoading={props.bulkMovePending}
        onMove={props.onMoveAssets}
      />
      <UpdateAssetDialog
        open={props.editAssetOpen}
        onOpenChange={(open) => {
          props.setEditAssetOpen(open);
        }}
        projectId={props.projectId}
        asset={props.editAssetTarget}
        folders={props.folders}
      />
      <UpdateAssetFolderDialog
        open={props.editFolderOpen}
        onOpenChange={props.setEditFolderOpen}
        folder={props.editFolderTarget}
        confirmLoading={props.updateFolderPending}
        onConfirm={props.onUpdateFolder}
      />
      <MoveFolderModal
        open={props.moveFolderOpen}
        onOpenChange={props.setMoveFolderOpen}
        folder={props.moveFolderTarget}
        folders={props.folders}
        foldersLoading={props.foldersLoading}
        confirmLoading={props.updateFolderPending}
        onMove={props.onMoveFolder}
      />
      <UpdateAssetsAccessDialog
        open={props.editAccessOpen}
        onOpenChange={props.setEditAccessOpen}
        mode={props.editAccessMode}
        assetCount={props.selectedCount}
        currentVisibility={props.editAccessCurrent.visibility}
        currentPurpose={props.editAccessCurrent.purpose}
        currentIndexable={props.editAccessCurrent.indexable}
        confirmLoading={props.bulkUpdatePending}
        onConfirm={props.onConfirmEditAccess}
      />
      <UpdateAssetsAccessDialog
        open={props.assetEditAccessOpen}
        onOpenChange={props.setAssetEditAccessOpen}
        mode="single"
        currentVisibility={props.assetEditAccessTarget?.visibility}
        currentPurpose={props.assetEditAccessTarget?.purpose}
        currentIndexable={props.assetEditAccessTarget?.indexable}
        confirmLoading={props.singleAssetAccessPending}
        onConfirm={props.onConfirmSingleAssetAccess}
      />
      <CreateAssetFolderDialog
        open={props.createFolderOpen}
        onOpenChange={props.setCreateFolderOpen}
        folders={props.folders}
        initialParentId={props.createFolderInitialParentId}
        parentLabel={props.createParentLabel}
        confirmLoading={props.createFolderPending}
        foldersLoading={props.foldersLoading}
        assetCount={props.createFolderAssetCount}
        onCreate={props.onCreateFolder}
      />
      <DeleteAssetFolderDialog
        open={props.deleteFolderOpen}
        onOpenChange={props.setDeleteFolderOpen}
        folder={props.deleteFolderTarget}
        folders={props.folders}
        confirmLoading={props.deleteFolderPending}
        onConfirm={props.onDeleteFolder}
      />
      <BulkDeleteAssetsDialog
        open={props.bulkDeleteOpen}
        onOpenChange={props.setBulkDeleteOpen}
        assetCount={props.selectedCount}
        confirmLoading={props.bulkDeletePending}
        onConfirm={props.onConfirmBulkDelete}
      />
      <DeleteAssetDialog
        open={props.assetDeleteOpen}
        onOpenChange={props.setAssetDeleteOpen}
        confirmLoading={props.assetDeletePending}
        title={props.t("assets:ASSET_DELETE_CONFIRM_TITLE")}
        description={props.t("assets:ASSET_DELETE_CONFIRM_DESC")}
        cancelLabel={props.t("assets:ASSET_DELETE_CANCEL")}
        confirmLabel={props.t("assets:ASSET_DELETE_CONFIRM")}
        confirmLoadingLabel={props.t("assets:ASSET_DELETE_DELETING")}
        onConfirm={() => {
          void props.onConfirmAssetDelete();
        }}
      />
      {props.scope ? (
        <AssetUploadDialog
          scope={props.scope}
          open={props.uploadOpen}
          onOpenChange={props.setUploadOpen}
          defaultFolderId={props.currentFolderId || undefined}
          onUploaded={props.onUploaded}
        />
      ) : null}
    </>
  );
}
