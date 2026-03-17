import {
  EllipsisVertical,
  FolderClosed,
  FolderPlus,
  MoreVertical,
  PencilLine,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { AdminAssetFolder } from "@/types/api";
import { cn } from "@arclayer/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Badge } from "@arclayer/ui/badge";
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
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@arclayer/ui/empty";
import { Skeleton } from "@arclayer/ui/skeleton";

import {
  buildFolderById,
  buildFolderPath,
  flattenFoldersDepthFirst,
} from "./assets-folder-rail-utils";

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
};

function FolderCardSkeleton() {
  return (
    <div className="flex min-h-40 flex-col rounded-lg border border-border/60 bg-card p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <Skeleton className="size-10 rounded-xl" />
        <Skeleton className="size-8 rounded-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
      <div className="mt-auto pt-4">
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
    </div>
  );
}

function FolderAddCard(props: {
  t: AssetsFolderRailFolderSectionProps["t"];
  currentFolder: AdminAssetFolder | null;
  onCreateFolder: (parentId: string | null) => void;
}) {
  return (
    <button
      type="button"
      onClick={() =>
        props.onCreateFolder(props.currentFolder ? String(props.currentFolder.id) : null)
      }
      className="group flex min-h-40 flex-col rounded-lg border border-dashed border-border/70 bg-transparent p-4 text-left transition-colors duration-200 hover:border-primary/45 hover:bg-primary/5"
    >
      <div className="mb-4 flex items-start gap-3">
        <div className="grid size-10 place-items-center rounded-xl border border-dashed border-border/70 bg-background/70 text-label-secondary transition-colors group-hover:border-primary/40 group-hover:text-primary">
          <FolderPlus className="size-4" />
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="text-headline font-semibold text-foreground">
          {props.t("assets:ASSET_FOLDER_ADD_CARD_TITLE")}
        </div>
        <div className="text-footnote text-label-secondary">
          {props.currentFolder
            ? props.t("assets:ASSET_FOLDER_ADD_CARD_DESC_IN", { name: props.currentFolder.name })
            : props.t("assets:ASSET_FOLDER_ADD_CARD_DESC_ROOT")}
        </div>
      </div>
    </button>
  );
}

function FolderCard(props: {
  t: AssetsFolderRailFolderSectionProps["t"];
  folder: AdminAssetFolder;
  isActive: boolean;
  locationLabel: string;
  onSelectFolder: (folderId: string | null) => void;
  onEditFolder: (folder: AdminAssetFolder) => void;
  onMoveFolder: (folder: AdminAssetFolder) => void;
  onDeleteFolder: (folder: AdminAssetFolder) => void;
}) {
  return (
    <div
      className={cn(
        "group col-span-1 flex cursor-pointer flex-col rounded-lg border bg-card p-4 shadow-sm transition-colors duration-200",
        props.isActive
          ? "border-primary/40 bg-primary/5 shadow-[0_12px_30px_-22px_rgba(24,24,27,0.32)]"
          : "border-border hover:border-border/80 hover:bg-accent/35 hover:shadow-md",
      )}
      onClick={() => props.onSelectFolder(props.isActive ? null : String(props.folder.id))}
    >
      <div className="mb-4 flex flex-row justify-between gap-3">
        <div className="grid size-10 place-items-center rounded-xl border border-border/60 bg-background/85 text-label-secondary">
          <FolderClosed className="size-4" />
        </div>
        <div className="shrink-0" onClick={(event) => event.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="opacity-70 transition-opacity group-hover:opacity-100"
              >
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuIconItem
                icon={<PencilLine className="size-4" />}
                onSelect={() => props.onEditFolder(props.folder)}
              >
                {props.t("assets:ASSET_ACTION_EDIT_FOLDER")}
              </DropdownMenuIconItem>
              <DropdownMenuIconItem
                icon={<FolderClosed className="size-4" />}
                onSelect={() => props.onMoveFolder(props.folder)}
              >
                {props.t("assets:ASSET_ACTION_MOVE_FOLDER")}
              </DropdownMenuIconItem>
              <DropdownMenuSeparator />
              <DropdownMenuIconItem
                icon={<Trash2 className="size-4" />}
                variant="destructive"
                onSelect={() => props.onDeleteFolder(props.folder)}
              >
                {props.t("assets:ASSET_ACTION_DELETE_FOLDER")}
              </DropdownMenuIconItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex flex-col wrap-break-word" style={{ overflowWrap: "anywhere" }}>
        <div className="text-headline font-semibold text-foreground">{props.folder.name}</div>
        <div className="text-footnote line-clamp-2 text-label-secondary">
          {props.folder.description || props.t("assets:ASSET_FOLDER_DESCRIPTION_EMPTY")}
        </div>
      </div>

      <div className="mt-auto flex items-center gap-2 pt-4">
        <Badge
          variant={props.isActive ? "default" : "secondary"}
          className="rounded-full px-2.5 py-0.5 text-[11px]"
        >
          {props.isActive ? props.t("assets:ASSET_FOLDER_CARD_SELECTED") : props.locationLabel}
        </Badge>
      </div>
    </div>
  );
}

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
        <div className="text-[15px] font-semibold text-foreground">
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
            <FolderCardSkeleton key={index} />
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
        <div className={cn("grid gap-3", gridClassName)}>
          <Empty className="rounded-[22px] border border-dashed border-border/60 bg-muted/15 px-4 py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderClosed className="size-5" />
              </EmptyMedia>
              <EmptyTitle className="text-title3">
                {props.t("assets:ASSET_FOLDER_PANEL_EMPTY")}
              </EmptyTitle>
              <EmptyDescription>{props.t("assets:ASSET_FOLDER_PANEL_EMPTY_DESC")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
          <FolderAddCard
            t={props.t}
            currentFolder={currentFolder}
            onCreateFolder={props.onCreateFolder}
          />
        </div>
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
              />
            );
          })}
          <FolderAddCard
            t={props.t}
            currentFolder={currentFolder}
            onCreateFolder={props.onCreateFolder}
          />
        </div>
      ) : null}
    </section>
  );
}
