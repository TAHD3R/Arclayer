import { FolderInput, Settings2, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import type { AdminAssetFolder } from "@/types/api";
import type { AssetMasonryItem } from "@/types/assets-masonry";
import { Button } from "@arclayer/ui/button";
import { SelectedCountTag } from "@/components/ui/tags";
import { AssetPreviewDialog } from "./asset-preview-dialog";
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
  setActive: React.Dispatch<React.SetStateAction<AssetMasonryItem | null>>;
  items: AssetMasonryItem[];
  currentFolderPathLabel: string;
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
  createParentLabel: string;
  createFolderPending: boolean;
  createFolderAssetCount?: number;
  onCreateFolder: (name: string, description: string | null) => Promise<void>;
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
  >,
) {
  return (
    <AnimatePresence>
      {props.selectedCount > 1 ? (
        <motion.div
          key="assets-selection-toolbar"
          className="pointer-events-none sticky bottom-0 z-30 mt-auto w-full"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
        >
          <div className="pointer-events-auto w-full border-t border-border bg-card shadow-[0_-18px_36px_-28px_rgba(0,0,0,0.28)]">
            <div className="flex w-full flex-wrap items-center justify-between gap-3 px-4 pt-3 pb-5 sm:px-6 lg:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <SelectedCountTag
                  label={props.t("assets:ASSET_SELECTED_COUNT", { count: props.selectedCount })}
                />
                <Button variant="ghost" size="sm" onClick={props.onClearSelection}>
                  {props.t("assets:ASSET_CLEAR_SELECTION")}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={props.onOpenMove}
                  disabled={props.bulkMovePending}
                >
                  <FolderInput size={16} />
                  {props.t("assets:ASSET_ACTION_MOVE")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={props.onOpenEditAccess}
                  disabled={props.bulkUpdatePending}
                >
                  <Settings2 size={16} />
                  {props.t("assets:ASSET_ACTION_EDIT_ACCESS")}
                </Button>
                <Button
                  variant="destructive"
                  onClick={props.onOpenBulkDelete}
                  disabled={props.bulkDeletePending}
                >
                  <Trash2 size={16} />
                  {props.t("assets:ASSET_ACTION_DELETE_SELECTED")}
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function AssetsViewOverlays(props: AssetsViewOverlaysProps) {
  return (
    <>
      <AssetPreviewDialog
        active={props.active}
        items={props.items}
        currentFolderPathLabel={props.currentFolderPathLabel}
        onSelectAsset={(asset) => props.setActive(asset)}
        onOpenEditAsset={props.onOpenEditAsset}
        onClose={() => props.setActive(null)}
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
        parentLabel={props.createParentLabel}
        confirmLoading={props.createFolderPending}
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
