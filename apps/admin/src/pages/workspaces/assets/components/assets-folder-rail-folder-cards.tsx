import { FolderClosed, MoreVertical, PencilLine, Trash2 } from "lucide-react";

import type { AdminAssetFolder } from "@/types/api";
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
  DroppablePulse,
  FolderDroppableProvider,
  toFolderDndId,
} from "./assets-view-dnd";

const folderCardBaseClassName =
  "group relative aspect-square overflow-hidden rounded-lg border text-card-foreground transition-all duration-300";

const folderActionButtonClassName =
  "inline-flex size-7 items-center justify-center rounded-full text-label-tertiary opacity-0 transition hover:bg-accent/70 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 dark:text-white/58 dark:hover:bg-white/8 dark:hover:text-white";

function FolderGlyph(props: { large?: boolean; withPlus?: boolean; className?: string }) {
  const sizeClassName = props.large ? "size-16" : "size-8";

  return (
    <div className={cn(sizeClassName, props.className ?? "text-foreground dark:text-white")}>
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

function FolderMetaLine(props: { label: string }) {
  return (
    <div className="relative mt-auto flex items-center gap-1.5 pt-3 text-caption leading-4 text-label-tertiary dark:text-white/42 xl:gap-2 xl:pt-4 xl:leading-5">
      <svg viewBox="0 0 20 20" className="size-3.5 shrink-0 stroke-current fill-none xl:size-4">
        <path
          d="M3.5 6.5h4l1.4-2h7.6a1.5 1.5 0 0 1 1.5 1.5v7.5A1.5 1.5 0 0 1 16.5 15h-13A1.5 1.5 0 0 1 2 13.5V8a1.5 1.5 0 0 1 1.5-1.5Z"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      <span className="truncate">{props.label}</span>
    </div>
  );
}

function FolderCardMenu(props: {
  t: (key: string, options?: Record<string, unknown>) => string;
  folder: AdminAssetFolder;
  onEditFolder: (folder: AdminAssetFolder) => void;
  onMoveFolder: (folder: AdminAssetFolder) => void;
  onDeleteFolder: (folder: AdminAssetFolder) => void;
}) {
  return (
    <div className="absolute right-3 top-3 z-10" onClick={(event) => event.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={folderActionButtonClassName}>
            <MoreVertical className="size-4" />
          </button>
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
  );
}

export function FolderCardSkeleton() {
  return (
    <div className="relative aspect-square overflow-hidden rounded-lg border border-border/60 bg-card p-3 dark:border-white/8 dark:bg-[#101010] xl:p-4">
      <div className="mb-4 flex items-start justify-end gap-3">
        <Skeleton className="size-7 rounded-full bg-muted/70 dark:bg-white/10" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-3/5 rounded-full bg-muted/80 dark:bg-white/10 xl:h-5" />
        <Skeleton className="h-3.5 w-full rounded-full bg-muted/65 dark:bg-white/8 xl:h-4" />
        <Skeleton className="h-3.5 w-4/5 rounded-full bg-muted/65 dark:bg-white/8 xl:h-4" />
      </div>
      <div className="mt-4">
        <Skeleton className="h-3.5 w-20 rounded-full bg-muted/65 dark:bg-white/8 xl:h-4 xl:w-24" />
      </div>
    </div>
  );
}

export function FolderAddCard(props: {
  t: (key: string, options?: Record<string, unknown>) => string;
  currentFolder: AdminAssetFolder | null;
  onCreateFolder: (parentId: string | null) => void;
  isDraggingAssets?: boolean;
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
            props.onCreateFolder(props.currentFolder ? String(props.currentFolder.id) : null)
          }
          className={cn(
            folderCardBaseClassName,
            "border-dashed p-3 text-left xl:p-4",
            isOver && props.isDraggingAssets
              ? "border-border bg-accent/40 ring-2 ring-black/5 ring-offset-2 ring-offset-background dark:border-white/18 dark:bg-[#171717] dark:ring-white/12"
              : "border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(244,247,250,0.98)_100%)] hover:border-border hover:bg-[linear-gradient(180deg,rgba(255,255,255,1)_0%,rgba(239,244,249,0.98)_100%)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(11,11,12,0.78)_0%,rgba(8,8,9,0.9)_100%)] dark:hover:border-white/18 dark:hover:bg-[linear-gradient(180deg,rgba(16,16,18,0.86)_0%,rgba(10,10,11,0.96)_100%)]",
          )}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(15,23,42,0.06),transparent_24%)] opacity-80 dark:bg-[radial-gradient(circle_at_18%_14%,rgba(255,255,255,0.05),transparent_24%)]" />
          <div className="pointer-events-none absolute -bottom-4 right-1 scale-[2.35] opacity-[0.05] transition-transform duration-300 group-hover:scale-[2.45] xl:-bottom-5 xl:right-2 xl:scale-[2.8] xl:group-hover:scale-[2.9]">
            <FolderGlyph large withPlus className="text-slate-950/12 dark:text-white/5" />
          </div>

          <div className="relative flex h-full flex-col">
            <div className="mt-4 flex min-h-0 flex-1 flex-col xl:mt-5">
              <div className="pr-7 text-headline font-semibold tracking-tight leading-5 text-label-primary dark:text-white/95 xl:pr-8">
                {props.t("assets:ASSET_FOLDER_ADD_CARD_TITLE")}
              </div>
              <div className="mt-1.5 max-w-[18ch] text-caption leading-[1.35] text-label-secondary dark:text-white/46 xl:mt-2 xl:leading-[1.45]">
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
  locationLabel: string;
  onSelectFolder: (folderId: string | null) => void;
  onEditFolder: (folder: AdminAssetFolder) => void;
  onMoveFolder: (folder: AdminAssetFolder) => void;
  onDeleteFolder: (folder: AdminAssetFolder) => void;
  dropPulseNonce: number | null;
  tooltipDisabled?: boolean;
}) {
  const droppableId = toFolderDndId(String(props.folder.id));
  const metaLabel = props.isActive
    ? props.t("assets:ASSET_FOLDER_CARD_SELECTED")
    : props.locationLabel;

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
              "p-3 xl:p-4",
              props.isActive
                ? "border-border bg-[linear-gradient(180deg,rgba(246,249,255,0.98)_0%,rgba(236,242,248,0.98)_100%)] dark:border-white/18 dark:bg-[linear-gradient(180deg,rgba(20,20,22,0.98)_0%,rgba(10,10,11,0.98)_100%)]"
                : "border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(244,247,250,0.98)_100%)] hover:border-border hover:-translate-y-[1px] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(18,18,20,0.96)_0%,rgba(11,11,12,0.98)_100%)] dark:hover:border-white/15",
              isOver &&
                "border-border bg-accent/40 ring-2 ring-black/5 ring-offset-2 ring-offset-background dark:border-white/20 dark:bg-[#181818] dark:ring-white/12",
            )}
            onClick={() => props.onSelectFolder(props.isActive ? null : String(props.folder.id))}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(15,23,42,0.06),transparent_26%)] dark:bg-[radial-gradient(circle_at_18%_16%,rgba(255,255,255,0.05),transparent_26%)]" />
            <div className="absolute inset-x-0 top-0 h-16 bg-[linear-gradient(180deg,rgba(15,23,42,0.04)_0%,rgba(15,23,42,0)_100%)] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.03)_0%,rgba(255,255,255,0)_100%)] xl:h-20" />
            <div className="pointer-events-none absolute -bottom-4 right-1 scale-[2.35] opacity-[0.05] transition-transform duration-300 group-hover:scale-[2.45] xl:-bottom-5 xl:right-2 xl:scale-[2.8] xl:group-hover:scale-[2.9]">
              <FolderGlyph large className="text-slate-950/12 dark:text-white/5" />
            </div>

            <div className="relative flex h-full flex-col">
              <FolderCardMenu
                t={props.t}
                folder={props.folder}
                onEditFolder={props.onEditFolder}
                onMoveFolder={props.onMoveFolder}
                onDeleteFolder={props.onDeleteFolder}
              />

              <div
                className="mt-4 flex min-h-0 flex-1 flex-col xl:mt-5"
                style={{ overflowWrap: "anywhere" }}
              >
                <div className="pr-7 text-headline font-semibold tracking-tight leading-5 text-label-primary dark:text-white/96 xl:pr-8">
                  {props.folder.name}
                </div>
                <FolderDescriptionTooltip
                  text={props.folder.description}
                  emptyText={props.t("assets:ASSET_FOLDER_DESCRIPTION_EMPTY")}
                  disabled={props.tooltipDisabled}
                  className="mt-1.5 min-h-0 text-caption leading-[1.35] text-label-secondary dark:text-white/48 xl:mt-2 xl:leading-[1.45]"
                />
                <FolderMetaLine label={metaLabel} />
              </div>
            </div>
          </div>
        </DroppablePulse>
      )}
    </FolderDroppableProvider>
  );
}
