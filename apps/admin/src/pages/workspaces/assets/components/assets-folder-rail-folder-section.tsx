import { EllipsisVertical, FolderClosed, FolderPlus } from "lucide-react";
import { useMemo, useState } from "react";

import type { AdminAssetFolder } from "@arclayer/openapi/admin-types";
import { cn } from "@arclayer/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";

import { flattenFoldersDepthFirst } from "./assets-folder-rail-utils";
import { AssetsFolderRailEmptyCard } from "./assets-folder-rail-empty-card";
import { FolderCard, FolderCardSkeleton } from "./assets-folder-rail-folder-cards";
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
  canManageAssets?: boolean;
};

export function AssetsFolderRailFolderSection(props: AssetsFolderRailFolderSectionProps) {
  const [layoutMode, setLayoutMode] = useState<"single" | "multi">("single");
  const canManageAssets = props.canManageAssets !== false;
  const orderedFolders = useMemo(() => flattenFoldersDepthFirst(props.folders), [props.folders]);
  const gridClassName = layoutMode === "single" ? "grid-cols-1" : "grid-cols-2";

  return (
    <section className="space-y-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-title3 text-label-primary">
          {props.t("assets:ASSET_FOLDER_PANEL_TITLE")}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={props.t("assets:ASSET_ACTION_CREATE_FOLDER")}
            disabled={!canManageAssets}
            onClick={() => props.onCreateFolder(props.currentFolderId)}
          >
            <FolderPlus className="size-4" />
          </Button>
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
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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
          icon={<FolderPlus className="size-5" />}
        />
      ) : null}

      {!props.foldersLoading && !props.foldersError && orderedFolders.length > 0 ? (
        <div className={cn("grid gap-3", gridClassName)}>
          {orderedFolders.map((folder) => (
            <FolderCard
              key={String(folder.id)}
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
              layoutMode={layoutMode}
              canManageAssets={canManageAssets}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
