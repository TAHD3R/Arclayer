import { FolderClosed } from "lucide-react";
import { useMemo } from "react";

import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";

import type { AdminAssetFolderOut as AdminAssetFolder } from "@arclayer/openapi";
import type { AssetsExplorerEntry } from "@/types/assets-explorer";

import { buildFolderById } from "./assets-folder-rail-utils";
import { FolderCard, FolderCardSkeleton, FolderUpCard } from "./assets-folder-rail-folder-cards";
import { DND_ROOT_ID, toFolderDndId } from "./assets-view-dnd";

type AssetsFolderStripProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  folders: AdminAssetFolder[];
  folderEntries: AssetsExplorerEntry[];
  foldersLoading: boolean;
  foldersError: boolean;
  assetLibraryHasContent: boolean;
  currentFolderId: string | null;
  onRetryFolders: () => void;
  onSelectFolder: (folderId: string | null) => void;
  onEditFolder: (folder: AdminAssetFolder) => void;
  onMoveFolder: (folder: AdminAssetFolder) => void;
  onDeleteFolder: (folder: AdminAssetFolder) => void;
  dropSuccessPulse?: {
    droppableId: string;
    nonce: number;
  } | null;
  tooltipDisabled?: boolean;
  canManageAssets?: boolean;
};

const FOLDER_CARD_WIDTH_CLASSNAME = "w-[12rem] shrink-0";

export function AssetsFolderStrip(props: AssetsFolderStripProps) {
  const canManageAssets = props.canManageAssets !== false;
  const folders = useMemo(
    () => props.folderEntries.flatMap((entry) => (entry.kind === "folder" ? [entry.folder] : [])),
    [props.folderEntries],
  );
  const hasFolderUp = Boolean(props.currentFolderId);
  const shouldShow =
    props.assetLibraryHasContent &&
    (props.foldersLoading || props.foldersError || hasFolderUp || folders.length > 0);
  const folderById = useMemo(() => buildFolderById(props.folders), [props.folders]);
  const parentFolderId = useMemo(() => {
    if (!props.currentFolderId) return null;
    const currentFolder = folderById.get(props.currentFolderId);
    return currentFolder?.parentId ? String(currentFolder.parentId) : null;
  }, [folderById, props.currentFolderId]);
  const parentFolderName = parentFolderId ? (folderById.get(parentFolderId)?.name ?? null) : null;

  if (!shouldShow) return null;

  return (
    <section className="shrink-0">
      {props.foldersError ? (
        <Alert className="rounded-lg border-border/60 bg-card/70">
          <FolderClosed className="size-4" />
          <AlertTitle>{props.t("assets:ASSET_FOLDER_PANEL_LOAD_FAILED_TITLE")}</AlertTitle>
          <AlertDescription>
            <p>{props.t("assets:ASSET_FOLDER_PANEL_LOAD_FAILED_DESC")}</p>
            <Button className="mt-3" variant="outline" size="sm" onClick={props.onRetryFolders}>
              {props.t("common:RETRY")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {!props.foldersError ? (
        <div className="overflow-x-auto pb-4 pt-1 px-1">
          <div className="flex min-w-max gap-3">
            {props.foldersLoading
              ? Array.from({ length: 3 }).map((_, index) => (
                  <div className={FOLDER_CARD_WIDTH_CLASSNAME} key={index}>
                    <FolderCardSkeleton layoutMode="single" />
                  </div>
                ))
              : null}

            {!props.foldersLoading && hasFolderUp ? (
              <div className={FOLDER_CARD_WIDTH_CLASSNAME}>
                <FolderUpCard
                  t={props.t}
                  parentFolderId={parentFolderId}
                  parentFolderName={parentFolderName}
                  onSelectFolder={props.onSelectFolder}
                  dropPulseNonce={
                    props.dropSuccessPulse?.droppableId ===
                    (parentFolderId ? toFolderDndId(parentFolderId) : DND_ROOT_ID)
                      ? props.dropSuccessPulse.nonce
                      : null
                  }
                  layoutMode="single"
                />
              </div>
            ) : null}

            {!props.foldersLoading
              ? folders.map((folder) => (
                  <div className={FOLDER_CARD_WIDTH_CLASSNAME} key={String(folder.id)}>
                    <FolderCard
                      t={props.t}
                      folder={folder}
                      isActive={props.currentFolderId === String(folder.id)}
                      onSelectFolder={props.onSelectFolder}
                      onEditFolder={props.onEditFolder}
                      onMoveFolder={props.onMoveFolder}
                      onDeleteFolder={props.onDeleteFolder}
                      dropPulseNonce={
                        props.dropSuccessPulse?.droppableId === toFolderDndId(String(folder.id))
                          ? props.dropSuccessPulse.nonce
                          : null
                      }
                      tooltipDisabled={props.tooltipDisabled}
                      layoutMode="single"
                      canManageAssets={canManageAssets}
                    />
                  </div>
                ))
              : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
