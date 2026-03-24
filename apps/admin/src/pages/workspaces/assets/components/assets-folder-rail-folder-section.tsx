import { EllipsisVertical, FolderClosed, FolderPlus } from "lucide-react";
import { useMemo, useState } from "react";

import type { AdminAssetFolder } from "@/types/api";
import { cn } from "@arclayer/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";

import {
  buildFolderById,
  buildFolderPath,
  flattenFoldersDepthFirst,
} from "./assets-folder-rail-utils";
import { AssetsFolderRailEmptyCard } from "./assets-folder-rail-empty-card";
import { FolderAddCard, FolderCard, FolderCardSkeleton } from "./assets-folder-rail-folder-cards";
import { toFolderDndId } from "./assets-view-dnd";

type AssetsFolderRailFolderSectionProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  folders: AdminAssetFolder[];
  foldersLoading: boolean;
  foldersError: boolean;
  currentFolderId: string | null;
  onRetryFolders: () => void;
  onSelectFolder: (folderId: string | null) => void;
  onCreateFolder: (parentId: string | null) => void;
  onEditFolder: (folder: AdminAssetFolder) => void;
  onMoveFolder: (folder: AdminAssetFolder) => void;
  onDeleteFolder: (folder: AdminAssetFolder) => void;
  dropSuccessPulse?: {
    droppableId: string;
    nonce: number;
  } | null;
  tooltipDisabled?: boolean;
  isDraggingAssets?: boolean;
};

export function AssetsFolderRailFolderSection(props: AssetsFolderRailFolderSectionProps) {
  const [layoutMode, setLayoutMode] = useState<"single" | "multi">("multi");
  const folderById = useMemo(() => buildFolderById(props.folders), [props.folders]);
  const orderedFolders = useMemo(() => flattenFoldersDepthFirst(props.folders), [props.folders]);
  const currentFolder = props.currentFolderId
    ? (folderById.get(props.currentFolderId) ?? null)
    : null;
  const gridClassName = layoutMode === "single" ? "grid-cols-1" : "grid-cols-2";

  return (
    <section className="space-y-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-title3 font-semibold text-label-primary">
          {props.t("assets:ASSET_FOLDER_PANEL_TITLE")}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={props.t("common:MORE")}>
              <EllipsisVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              value={layoutMode}
              onValueChange={(value) => setLayoutMode(value === "single" ? "single" : "multi")}
            >
              <DropdownMenuRadioItem value="single">
                {props.t("assets:ASSET_FOLDER_LAYOUT_SINGLE")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="multi">
                {props.t("assets:ASSET_FOLDER_LAYOUT_MULTI")}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuIconItem
              icon={<FolderPlus className="size-4" />}
              onSelect={() => props.onCreateFolder(currentFolder ? String(currentFolder.id) : null)}
            >
              {props.t("assets:ASSET_ACTION_CREATE_FOLDER")}
            </DropdownMenuIconItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {props.foldersLoading ? (
        <div className={cn("grid gap-3", gridClassName)}>
          {Array.from({ length: 3 }).map((_, index) => (
            <FolderCardSkeleton key={index} layoutMode={layoutMode} />
          ))}
        </div>
      ) : null}

      {!props.foldersLoading && props.foldersError ? (
        <Alert className="rounded-[22px] border-border/60 bg-card/70">
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

      {!props.foldersLoading && !props.foldersError && orderedFolders.length === 0 ? (
        <AssetsFolderRailEmptyCard
          title={props.t("assets:ASSET_FOLDER_PANEL_EMPTY")}
          description={props.t("assets:ASSET_FOLDER_PANEL_EMPTY_DESC")}
          icon={<FolderClosed className="size-5" />}
          actionLabel={props.t("assets:ASSET_ACTION_CREATE_FOLDER")}
          onAction={() => props.onCreateFolder(null)}
        />
      ) : null}

      {!props.foldersLoading && !props.foldersError && orderedFolders.length > 0 ? (
        <div className={cn("grid gap-3", gridClassName)}>
          {orderedFolders.map((folder) => {
            const parentPath = buildFolderPath(
              folder.parentId ? String(folder.parentId) : null,
              folderById,
            )
              .map((item) => item.name)
              .join(" / ");
            const locationLabel = parentPath
              ? props.t("assets:ASSET_FOLDER_CARD_NESTED_IN", { name: parentPath })
              : props.t("assets:ASSET_FOLDER_CARD_ROOT");

            return (
              <FolderCard
                key={String(folder.id)}
                t={props.t}
                folder={folder}
                isActive={props.currentFolderId === String(folder.id)}
                locationLabel={locationLabel}
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
                layoutMode={layoutMode}
              />
            );
          })}
          <FolderAddCard
            t={props.t}
            currentFolder={currentFolder}
            onCreateFolder={props.onCreateFolder}
            isDraggingAssets={props.isDraggingAssets}
            layoutMode={layoutMode}
          />
        </div>
      ) : null}
    </section>
  );
}
