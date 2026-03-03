import { Button } from "antd";
import { FolderInput, Settings2, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import type { AdminAssetFolder } from "@/types/api";
import type { AssetMasonryItem } from "@/types/assets-masonry";
import { AssetPreviewSheet } from "./asset-masonry-card";
import { BulkDeleteAssetsDialog } from "./bulk-delete-assets-dialog";
import { CreateAssetFolderDialog } from "./create-asset-folder-dialog";
import { FolderNotEmptyDialog } from "./folder-not-empty-dialog";
import { MoveAssetsToFolderModal } from "./move-assets-to-folder-modal";
import { MoveFolderModal } from "./move-folder-modal";
import { UpdateAssetsAccessDialog } from "./update-assets-access-dialog";
import {
  UpdateAssetFolderDialog,
  type UpdateAssetFolderDialogValue,
} from "./update-asset-folder-dialog";
import { AssetUploadDialog } from "./asset-upload-dialog";

interface AssetsViewOverlaysProps {
  t: (key: string, options?: Record<string, unknown>) => string;
  active: AssetMasonryItem | null;
  setActive: React.Dispatch<React.SetStateAction<AssetMasonryItem | null>>;
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
  editAccessCurrent: { visibility?: string; purpose?: string };
  bulkUpdatePending: boolean;
  onConfirmEditAccess: (value: { visibility?: string; purpose?: string }) => Promise<void>;
  createFolderOpen: boolean;
  setCreateFolderOpen: React.Dispatch<React.SetStateAction<boolean>>;
  createParentLabel: string;
  createFolderPending: boolean;
  onCreateFolder: (name: string, description: string | null) => Promise<void>;
  folderNotEmptyInfo: { folderName: string; hasAssets: boolean; hasChildren: boolean } | null;
  setFolderNotEmptyInfo: React.Dispatch<
    React.SetStateAction<{ folderName: string; hasAssets: boolean; hasChildren: boolean } | null>
  >;
  bulkDeleteOpen: boolean;
  setBulkDeleteOpen: React.Dispatch<React.SetStateAction<boolean>>;
  bulkDeletePending: boolean;
  onConfirmBulkDelete: () => Promise<void>;
  workspaceId: string;
  uploadOpen: boolean;
  setUploadOpen: React.Dispatch<React.SetStateAction<boolean>>;
  currentFolderId: string | null;
  onUploaded: () => void;
  onClearSelection: () => void;
  onOpenMove: () => void;
  onOpenEditAccess: () => void;
  onOpenBulkDelete: () => void;
}

export function AssetsViewOverlays(props: AssetsViewOverlaysProps) {
  return (
    <>
      <AssetPreviewSheet active={props.active} onClose={() => props.setActive(null)} />
      <MoveAssetsToFolderModal
        open={props.moveModalOpen}
        onOpenChange={props.setMoveModalOpen}
        folders={props.folders}
        foldersLoading={props.foldersLoading}
        assetCount={props.selectedCount}
        confirmLoading={props.bulkMovePending}
        onMove={props.onMoveAssets}
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
        confirmLoading={props.bulkUpdatePending}
        onConfirm={props.onConfirmEditAccess}
      />
      <CreateAssetFolderDialog
        open={props.createFolderOpen}
        onOpenChange={props.setCreateFolderOpen}
        parentLabel={props.createParentLabel}
        confirmLoading={props.createFolderPending}
        onCreate={props.onCreateFolder}
      />
      {props.folderNotEmptyInfo ? (
        <FolderNotEmptyDialog
          open={Boolean(props.folderNotEmptyInfo)}
          onOpenChange={(open) => {
            if (!open) props.setFolderNotEmptyInfo(null);
          }}
          folderName={props.folderNotEmptyInfo.folderName}
          hasAssets={props.folderNotEmptyInfo.hasAssets}
          hasChildren={props.folderNotEmptyInfo.hasChildren}
        />
      ) : null}
      <BulkDeleteAssetsDialog
        open={props.bulkDeleteOpen}
        onOpenChange={props.setBulkDeleteOpen}
        assetCount={props.selectedCount}
        confirmLoading={props.bulkDeletePending}
        onConfirm={props.onConfirmBulkDelete}
      />
      <AssetUploadDialog
        workspaceId={props.workspaceId}
        open={props.uploadOpen}
        onOpenChange={props.setUploadOpen}
        defaultFolderId={props.currentFolderId || undefined}
        onUploaded={props.onUploaded}
      />
      <AnimatePresence>
        {props.selectedCount > 0 ? (
          <motion.div
            key="assets-selection-toolbar"
            className="fixed bottom-0 right-0 left-[240px] z-30 pointer-events-none"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            <div className="pointer-events-auto w-full border-t border-border bg-card shadow-[0_-16px_30px_-24px_rgba(0,0,0,0.28)]">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-10">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-footnote font-semibold">
                    {props.t("assets:ASSET_SELECTED_COUNT", { count: props.selectedCount })}
                  </div>
                  <Button
                    type="text"
                    className="!h-8 !px-2"
                    onClick={props.onClearSelection}
                    autoInsertSpace={false}
                  >
                    {props.t("assets:ASSET_CLEAR_SELECTION")}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="text"
                    icon={<FolderInput size={16} />}
                    onClick={props.onOpenMove}
                    disabled={props.bulkMovePending}
                    autoInsertSpace={false}
                  >
                    {props.t("assets:ASSET_ACTION_MOVE")}
                  </Button>
                  <Button
                    type="text"
                    icon={<Settings2 size={16} />}
                    onClick={props.onOpenEditAccess}
                    disabled={props.bulkUpdatePending}
                    autoInsertSpace={false}
                  >
                    {props.t("assets:ASSET_ACTION_EDIT_ACCESS")}
                  </Button>
                  <Button
                    type="primary"
                    danger
                    icon={<Trash2 size={16} />}
                    onClick={props.onOpenBulkDelete}
                    disabled={props.bulkDeletePending}
                    autoInsertSpace={false}
                  >
                    {props.t("assets:ASSET_ACTION_DELETE_SELECTED")}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
