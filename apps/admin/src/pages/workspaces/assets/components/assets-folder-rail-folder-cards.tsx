import { CornerUpLeft, FolderClosed, MoreVertical, PencilLine, Trash2 } from "lucide-react";

import type { AdminAssetFolder } from "@arclayer/openapi/admin-types";
import { cn } from "@arclayer/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { Skeleton } from "@arclayer/ui/skeleton";

import { FolderDescriptionTooltip } from "./folder-description-tooltip";
import {
  CreateFolderDroppableProvider,
  DND_ROOT_ID,
  DroppablePulse,
  FolderDroppableProvider,
  toFolderDndId,
} from "./assets-view-dnd";

export type FolderLayoutMode = "single" | "multi";

const folderCardBaseClassName =
  "group relative overflow-hidden rounded-lg border text-card-foreground transition-all duration-300";

const folderActionButtonClassName =
  "inline-flex size-8 items-center justify-center rounded-full text-label-tertiary opacity-0 transition hover:bg-accent/70 hover:text-label-primary focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100";

const folderGlyphDecorationClassName =
  "pointer-events-none absolute -bottom-3 -right-1 scale-[2.55] opacity-[0.24] transition-transform duration-300 group-hover:scale-[2.7] xl:-bottom-4 xl:right-0 xl:scale-[3] xl:group-hover:scale-[3.15]";

const folderCardHeightClassNameByLayoutMode: Record<FolderLayoutMode, string> = {
  single: "min-h-[5rem]",
  multi: "min-h-[10.75rem]",
};

function FolderGlyph(props: { large?: boolean; withPlus?: boolean; className?: string }) {
  const sizeClassName = props.large ? "size-16" : "size-8";

  return (
    <div className={cn(sizeClassName, props.className ?? "text-label-primary dark:text-white")}>
      <svg viewBox="0 0 24 24" className="size-full fill-none stroke-current">
        <path
          d="M3.75 7.75h5l1.7-2.25h9.8a1.75 1.75 0 0 1 1.75 1.75v8.75a1.75 1.75 0 0 1-1.75 1.75H3.75A1.75 1.75 0 0 1 2 16V9.5a1.75 1.75 0 0 1 1.75-1.75Z"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        {props.withPlus ? (
          <path d="M12 9.25v5.5M9.25 12h5.5" strokeWidth="1.7" strokeLinecap="round" />
        ) : null}
      </svg>
    </div>
  );
}

function FolderCardMenu(props: {
  t: (key: string, options?: Record<string, unknown>) => string;
  folder: AdminAssetFolder;
  onEditFolder: (folder: AdminAssetFolder) => void;
  onMoveFolder: (folder: AdminAssetFolder) => void;
  onDeleteFolder: (folder: AdminAssetFolder) => void;
  canManageAssets?: boolean;
}) {
  const canManageAssets = props.canManageAssets !== false;
  return (
    <div className="absolute -top-1 -right-1 z-10" onClick={(event) => event.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={folderActionButtonClassName}>
            <MoreVertical className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuIconItem
            icon={<PencilLine className="size-4" />}
            disabled={!canManageAssets}
            onSelect={() => props.onEditFolder(props.folder)}
          >
            {props.t("assets:ASSET_ACTION_EDIT_FOLDER")}
          </DropdownMenuIconItem>
          <DropdownMenuIconItem
            icon={<FolderClosed className="size-4" />}
            disabled={!canManageAssets}
            onSelect={() => props.onMoveFolder(props.folder)}
          >
            {props.t("assets:ASSET_ACTION_MOVE_FOLDER")}
          </DropdownMenuIconItem>
          <DropdownMenuSeparator />
          <DropdownMenuIconItem
            icon={<Trash2 className="size-4" />}
            variant="destructive"
            disabled={!canManageAssets}
            onSelect={() => props.onDeleteFolder(props.folder)}
          >
            {props.t("assets:ASSET_ACTION_DELETE_FOLDER")}
          </DropdownMenuIconItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function FolderCardSkeletonInner(props: { layoutMode: FolderLayoutMode }) {
  const isSingle = props.layoutMode === "single";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border/60 bg-card p-3 dark:border-white/8 dark:bg-[#101010]",
        !isSingle && "xl:p-4",
        folderCardHeightClassNameByLayoutMode[props.layoutMode],
      )}
      data-layout-mode={props.layoutMode}
    >
      {isSingle ? (
        <Skeleton className="absolute right-3 top-3 size-7 rounded-full bg-muted/70 dark:bg-white/10" />
      ) : (
        <div className="mb-4 flex items-start justify-end gap-3">
          <Skeleton className="size-7 rounded-full bg-muted/70 dark:bg-white/10" />
        </div>
      )}
      <div className={cn(isSingle ? "space-y-2 pr-10" : "space-y-3")}>
        <Skeleton className="h-4 w-3/5 rounded-full bg-muted/80 dark:bg-white/10 xl:h-5" />
        <Skeleton className="h-3.5 w-full rounded-full bg-muted/65 dark:bg-white/8 xl:h-4" />
        {!isSingle ? (
          <Skeleton className="h-3.5 w-4/5 rounded-full bg-muted/65 dark:bg-white/8 xl:h-4" />
        ) : null}
      </div>
      {!isSingle ? (
        <div className="mt-4">
          <Skeleton className="h-3.5 w-20 rounded-full bg-muted/65 dark:bg-white/8 xl:h-4 xl:w-24" />
        </div>
      ) : null}
    </div>
  );
}

export function FolderCardSkeleton(props: { layoutMode: FolderLayoutMode }) {
  return <FolderCardSkeletonInner layoutMode={props.layoutMode} />;
}

export function FolderAddCard(props: {
  t: (key: string, options?: Record<string, unknown>) => string;
  currentFolder: AdminAssetFolder | null;
  onCreateFolder: (parentId: string | null) => void;
  isDraggingAssets?: boolean;
  layoutMode: FolderLayoutMode;
  disabled?: boolean;
}) {
  return (
    <CreateFolderDroppableProvider
      parentFolderId={props.currentFolder ? String(props.currentFolder.id) : null}
    >
      {({ setNodeRef, isOver }) => (
        <button
          ref={setNodeRef}
          type="button"
          onClick={() =>
            props.disabled
              ? undefined
              : props.onCreateFolder(props.currentFolder ? String(props.currentFolder.id) : null)
          }
          disabled={props.disabled}
          className={cn(
            folderCardBaseClassName,
            "border-dashed p-3 text-left",
            props.layoutMode === "multi" && "xl:p-4",
            folderCardHeightClassNameByLayoutMode[props.layoutMode],
            props.disabled && "cursor-not-allowed opacity-60",
            isOver && props.isDraggingAssets
              ? "border-border bg-accent/40 ring-2 ring-black/5 ring-offset-2 ring-offset-background dark:border-white/18 dark:bg-[#171717] dark:ring-white/12"
              : "border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(244,247,250,0.98)_100%)] hover:border-border hover:bg-[linear-gradient(180deg,rgba(255,255,255,1)_0%,rgba(239,244,249,0.98)_100%)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(11,11,12,0.78)_0%,rgba(8,8,9,0.9)_100%)] dark:hover:border-white/18 dark:hover:bg-[linear-gradient(180deg,rgba(16,16,18,0.86)_0%,rgba(10,10,11,0.96)_100%)]",
          )}
          data-folder-card="add-folder"
          data-layout-mode={props.layoutMode}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(15,23,42,0.06),transparent_24%)] opacity-80 dark:bg-[radial-gradient(circle_at_18%_14%,rgba(255,255,255,0.05),transparent_24%)]" />
          <div className={folderGlyphDecorationClassName}>
            <FolderGlyph large withPlus className="text-slate-950/24 dark:text-white/22" />
          </div>

          <div className="relative flex h-full flex-col">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div
                className={cn(
                  "font-semibold text-label-primary",
                  props.layoutMode === "single"
                    ? "truncate pr-10 text-headline xl:pr-11"
                    : "max-w-full pr-7 text-body line-clamp-3",
                )}
              >
                {props.t("assets:ASSET_FOLDER_ADD_CARD_TITLE")}
              </div>
              <div
                className={cn(
                  "mt-1.5 text-label-secondary! overflow-hidden",
                  "max-w-full text-callout line-clamp-3",
                )}
              >
                {props.currentFolder
                  ? props.t("assets:ASSET_FOLDER_ADD_CARD_DESC_IN", {
                      name: props.currentFolder.name,
                    })
                  : props.t("assets:ASSET_FOLDER_ADD_CARD_DESC_ROOT")}
              </div>
            </div>
          </div>
        </button>
      )}
    </CreateFolderDroppableProvider>
  );
}

export function FolderCard(props: {
  t: (key: string, options?: Record<string, unknown>) => string;
  folder: AdminAssetFolder;
  isActive: boolean;
  onSelectFolder: (folderId: string | null) => void;
  onEditFolder: (folder: AdminAssetFolder) => void;
  onMoveFolder: (folder: AdminAssetFolder) => void;
  onDeleteFolder: (folder: AdminAssetFolder) => void;
  dropPulseNonce: number | null;
  tooltipDisabled?: boolean;
  layoutMode: FolderLayoutMode;
  canManageAssets?: boolean;
}) {
  const droppableId = toFolderDndId(String(props.folder.id));

  return (
    <FolderDroppableProvider droppableId={droppableId}>
      {({ setNodeRef, isOver }) => (
        <DroppablePulse
          droppableId={droppableId}
          setNodeRef={setNodeRef}
          isOver={isOver}
          pulseNonce={props.dropPulseNonce}
          className="w-full"
        >
          <div
            className={cn(
              folderCardBaseClassName,
              "p-3",
              props.layoutMode === "multi" && "xl:p-4",
              folderCardHeightClassNameByLayoutMode[props.layoutMode],
              props.isActive
                ? "border-border bg-[linear-gradient(180deg,rgba(246,249,255,0.98)_0%,rgba(236,242,248,0.98)_100%)] dark:border-white/18 dark:bg-[linear-gradient(180deg,rgba(20,20,22,0.98)_0%,rgba(10,10,11,0.98)_100%)]"
                : "border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(244,247,250,0.98)_100%)] hover:border-border hover:-translate-y-[1px] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(18,18,20,0.96)_0%,rgba(11,11,12,0.98)_100%)] dark:hover:border-white/15",
              isOver &&
                "border-border bg-accent/40 ring-2 ring-black/5 ring-offset-2 ring-offset-background dark:border-white/20 dark:bg-[#181818] dark:ring-white/12",
            )}
            onClick={() => props.onSelectFolder(props.isActive ? null : String(props.folder.id))}
            data-folder-card={String(props.folder.id)}
            data-layout-mode={props.layoutMode}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(15,23,42,0.06),transparent_26%)] dark:bg-[radial-gradient(circle_at_18%_16%,rgba(255,255,255,0.05),transparent_26%)]" />
            <div className="absolute inset-x-0 top-0 h-16 bg-[linear-gradient(180deg,rgba(15,23,42,0.04)_0%,rgba(15,23,42,0)_100%)] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.03)_0%,rgba(255,255,255,0)_100%)] xl:h-20" />
            <div className={folderGlyphDecorationClassName}>
              <FolderGlyph large className="text-slate-950/24 dark:text-white/22" />
            </div>

            <div className="relative flex h-full flex-col">
              <FolderCardMenu
                t={props.t}
                folder={props.folder}
                onEditFolder={props.onEditFolder}
                onMoveFolder={props.onMoveFolder}
                onDeleteFolder={props.onDeleteFolder}
                canManageAssets={props.canManageAssets}
              />

              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <div
                  className={cn(
                    "font-semibold text-label-primary",
                    props.layoutMode === "single"
                      ? "truncate pr-10 text-headline xl:pr-11"
                      : "max-w-full pr-7 text-body line-clamp-3",
                  )}
                  title={props.folder.name}
                >
                  {props.folder.name}
                </div>
                <FolderDescriptionTooltip
                  text={props.folder.description}
                  emptyText={props.t("assets:ASSET_FOLDER_DESCRIPTION_EMPTY")}
                  disabled={props.tooltipDisabled}
                  className={cn(
                    "mt-1.5 min-h-0 overflow-hidden text-callout! text-label-secondary xl:mt-2",
                    props.layoutMode === "single"
                      ? "truncate line-clamp-1 xl:mt-1.5"
                      : "text-footnote! line-clamp-3",
                  )}
                />
              </div>
            </div>
          </div>
        </DroppablePulse>
      )}
    </FolderDroppableProvider>
  );
}

export function FolderUpCard(props: {
  t: (key: string, options?: Record<string, unknown>) => string;
  parentFolderId: string | null;
  parentFolderName: string | null;
  onSelectFolder: (folderId: string | null) => void;
  dropPulseNonce: number | null;
  layoutMode: FolderLayoutMode;
}) {
  const droppableId = props.parentFolderId ? toFolderDndId(props.parentFolderId) : DND_ROOT_ID;

  return (
    <FolderDroppableProvider droppableId={droppableId}>
      {({ setNodeRef, isOver }) => (
        <DroppablePulse
          droppableId={droppableId}
          setNodeRef={setNodeRef}
          isOver={isOver}
          pulseNonce={props.dropPulseNonce}
          className="w-full"
        >
          <button
            type="button"
            className={cn(
              folderCardBaseClassName,
              "w-full p-3 text-left",
              props.layoutMode === "multi" && "xl:p-4",
              folderCardHeightClassNameByLayoutMode[props.layoutMode],
              "border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(244,247,250,0.98)_100%)] hover:border-border hover:-translate-y-[1px] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(18,18,20,0.96)_0%,rgba(11,11,12,0.98)_100%)] dark:hover:border-white/15",
              isOver &&
                "border-border bg-accent/40 ring-2 ring-black/5 ring-offset-2 ring-offset-background dark:border-white/20 dark:bg-[#181818] dark:ring-white/12",
            )}
            onClick={() => props.onSelectFolder(props.parentFolderId)}
            data-folder-card="folder-up"
            data-layout-mode={props.layoutMode}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(15,23,42,0.06),transparent_26%)] dark:bg-[radial-gradient(circle_at_18%_16%,rgba(255,255,255,0.05),transparent_26%)]" />
            <div className="absolute inset-x-0 top-0 h-16 bg-[linear-gradient(180deg,rgba(15,23,42,0.04)_0%,rgba(15,23,42,0)_100%)] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.03)_0%,rgba(255,255,255,0)_100%)] xl:h-20" />
            <div className={folderGlyphDecorationClassName}>
              <FolderGlyph large className="text-slate-950/24 dark:text-white/22" />
            </div>

            <div className="relative flex h-full flex-col">
              <div className="mb-1.5 flex min-w-0 items-center gap-2 text-label-secondary">
                <CornerUpLeft className="size-4" />
                <span className="truncate text-caption font-semibold">
                  {props.t("assets:ASSET_FOLDER_UP")}
                </span>
              </div>
              <div className="min-w-0">
                <div className="truncate text-headline font-semibold text-label-primary">
                  {props.parentFolderName ?? props.t("assets:ASSET_BREADCRUMB_ROOT")}
                </div>
              </div>
            </div>
          </button>
        </DroppablePulse>
      )}
    </FolderDroppableProvider>
  );
}
