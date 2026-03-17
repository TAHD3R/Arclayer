import { ChevronRight, FolderOpen, GripVertical } from "lucide-react";

import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@arclayer/ui/item";
import { cn } from "@arclayer/lib/utils";

import type { AdminAssetFolder } from "@/types/api";

import {
  DND_ROOT_ID,
  DroppablePulse,
  FolderDraggableProvider,
  FolderDroppableProvider,
  toFolderDndId,
} from "./assets-view-dnd";

const MAX_TREE_DEPTH = 8;
const TREE_INDENT_PX = 14;

function buildFolderDescription(
  folder: AdminAssetFolder,
  childCount: number,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const description = folder.description?.trim();
  if (description) return description;
  return childCount > 0
    ? t("assets:ASSET_FOLDER_PANEL_CHILDREN", { count: childCount })
    : t("assets:ASSET_FOLDER_PANEL_REORDER_HINT");
}

export function FolderTreeRootRow(props: {
  t: (key: string, options?: Record<string, unknown>) => string;
  currentFolderId: string | null;
  rootAssetCount: number;
  dropSuccessPulse: { droppableId: string; nonce: number } | null;
  onSelectFolder: () => void;
  onCreateFolder: () => void;
}) {
  const description = props.currentFolderId
    ? props.t("assets:ASSET_FOLDER_PANEL_ROOT_SUMMARY")
    : props.t("assets:ASSET_FOLDER_PANEL_ROOT_HINT", {
        count: props.rootAssetCount,
      });

  return (
    <FolderDroppableProvider droppableId={DND_ROOT_ID}>
      {({ setNodeRef, isOver }) => (
        <DroppablePulse
          droppableId={DND_ROOT_ID}
          setNodeRef={setNodeRef}
          isOver={isOver}
          pulseNonce={
            props.dropSuccessPulse?.droppableId === DND_ROOT_ID
              ? props.dropSuccessPulse.nonce
              : null
          }
          className="block w-full"
        >
          <div>
            <Item
              size="sm"
              variant={props.currentFolderId ? "outline" : "muted"}
              asChild
              className={cn(
                "w-full rounded-2xl bg-background transition-colors hover:bg-accent/35",
                isOver && "ring-1 ring-foreground/55",
                !props.currentFolderId && "bg-accent/45",
              )}
            >
              <button type="button" onClick={props.onSelectFolder}>
                <ItemMedia
                  variant="icon"
                  className="size-8 rounded-lg border-border/60 bg-muted/60"
                >
                  <FolderOpen className="size-4 text-label-secondary" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle className="min-w-0 flex-1 truncate">
                    {props.t("assets:ASSET_BREADCRUMB_ROOT")}
                  </ItemTitle>
                  <ItemDescription className="truncate">{description}</ItemDescription>
                </ItemContent>
              </button>
            </Item>
          </div>
        </DroppablePulse>
      )}
    </FolderDroppableProvider>
  );
}

export function FolderTreeNode(props: {
  t: (key: string, options?: Record<string, unknown>) => string;
  folder: AdminAssetFolder;
  currentFolderId: string | null;
  focusedFolderId: string | null;
  depth: number;
  childrenByParent: ReadonlyMap<string | null, AdminAssetFolder[]>;
  expandedFolderIds: ReadonlySet<string>;
  dropSuccessPulse: { droppableId: string; nonce: number } | null;
  onToggleExpanded: (folderId: string) => void;
  onSelectFolder: (folderId: string) => void;
  onFocusFolder: (folderId: string) => void;
  onCreateFolder: (parentId: string) => void;
  onEditFolder: (folder: AdminAssetFolder) => void;
  onMoveFolder: (folder: AdminAssetFolder) => void;
  onDeleteFolder: (folder: AdminAssetFolder) => void;
}) {
  const folderId = String(props.folder.id);
  const childFolders = props.childrenByParent.get(folderId) ?? [];
  const hasChildren = childFolders.length > 0;
  const isExpanded = props.expandedFolderIds.has(folderId);
  const isCurrent = props.currentFolderId === folderId;
  const isFocused = props.focusedFolderId === folderId;
  const droppableId = toFolderDndId(folderId);
  const indent = Math.min(props.depth, MAX_TREE_DEPTH) * TREE_INDENT_PX;
  const description = buildFolderDescription(props.folder, childFolders.length, props.t);

  return (
    <div className="space-y-1">
      <FolderDraggableProvider folderId={folderId}>
        {(drag) => (
          <FolderDroppableProvider droppableId={droppableId}>
            {({ setNodeRef, isOver }) => (
              <DroppablePulse
                droppableId={droppableId}
                setNodeRef={(node) => {
                  setNodeRef(node);
                  drag.setNodeRef(node);
                }}
                isOver={isOver}
                pulseNonce={
                  props.dropSuccessPulse?.droppableId === droppableId
                    ? props.dropSuccessPulse.nonce
                    : null
                }
                className="block w-full"
              >
                <div
                  className={cn("flex items-center gap-1 rounded-2xl", isOver && "bg-accent/25")}
                >
                  <button
                    type="button"
                    aria-label={props.folder.name}
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg text-label-secondary transition-colors",
                      hasChildren
                        ? "hover:bg-muted/70 hover:text-foreground"
                        : "pointer-events-none opacity-0",
                    )}
                    style={{ marginInlineStart: indent }}
                    onClick={() => {
                      if (hasChildren) props.onToggleExpanded(folderId);
                    }}
                  >
                    <ChevronRight
                      className={cn("size-4 transition-transform", isExpanded && "rotate-90")}
                    />
                  </button>

                  <Item
                    size="sm"
                    variant={isCurrent ? "muted" : isFocused ? "outline" : "default"}
                    asChild
                    className={cn(
                      "min-w-0 flex-1 rounded-2xl bg-background transition-colors hover:bg-accent/35",
                      isCurrent && "bg-accent/45",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        props.onFocusFolder(folderId);
                        props.onSelectFolder(folderId);
                      }}
                    >
                      <ItemMedia
                        variant="icon"
                        className="size-8 rounded-lg border-border/60 bg-muted/60"
                      >
                        <FolderOpen className="size-4 text-label-secondary" />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle className="min-w-0 flex-1 truncate">
                          {props.folder.name}
                        </ItemTitle>
                        <ItemDescription className="truncate">{description}</ItemDescription>
                      </ItemContent>
                    </button>
                  </Item>

                  <button
                    type="button"
                    aria-label={props.t("assets:ASSET_ACTION_MOVE_FOLDER")}
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-label-secondary transition-colors hover:bg-muted/70 hover:text-foreground"
                    {...(drag.attributes as Record<string, unknown>)}
                    {...(drag.listeners as Record<string, unknown>)}
                    onClick={(event) => event.preventDefault()}
                  >
                    <GripVertical className="size-4" />
                  </button>
                </div>
              </DroppablePulse>
            )}
          </FolderDroppableProvider>
        )}
      </FolderDraggableProvider>

      {hasChildren && isExpanded ? (
        <div className="space-y-1">
          {childFolders.map((childFolder) => (
            <FolderTreeNode
              key={String(childFolder.id)}
              {...props}
              folder={childFolder}
              depth={props.depth + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
