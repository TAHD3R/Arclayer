import { DndContext, DragOverlay } from "@dnd-kit/core";
import { Button, Masonry } from "antd";
import { Eye, FolderInput, FolderPlus, PencilLine, Settings2, Trash2 } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { flushSync } from "react-dom";

import type { AdminAssetFolder } from "@/types/api";
import { AssetMasonryTile } from "./asset-masonry-card";
import {
  AssetsExplorerFolderDragOverlay,
  AssetsExplorerFolderTile,
  AssetsExplorerFolderUpTile,
} from "./explorer/assets-explorer-folder-tiles";
import { ContentGuard } from "@/components/common/content-guard";
import { LoaderOne } from "@/components/ui/loader";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  clearSelection,
  rangeSelect,
  selectOnly,
  selectOrClearOnPlainClick,
  toggleSelect,
} from "@/lib/assets/asset-selection";
import { shouldClearMasonrySelectionOnMouseDown } from "@/lib/assets/masonry-interactions";
import { cn } from "@/lib/utils";

import {
  AssetDraggableProvider,
  DragSelectionOverlay,
  DND_ROOT_ID,
  DroppablePulse,
  FolderDraggableProvider,
  FolderDroppableProvider,
  snapOverlayCenterToPointer,
  toFolderDndId,
} from "./assets-view-dnd";
import type { AssetsViewController } from "../hooks/use-assets-view-controller";

interface AssetsViewMasonrySectionProps {
  controller: AssetsViewController;
}

type MasonryEntry = AssetsViewController["masonryEntries"][number];

export function AssetsViewMasonrySection(props: AssetsViewMasonrySectionProps) {
  const { controller } = props;
  const {
    t,
    assetsQuery,
    masonryEntries,
    explicitFilterActive,
    setSearchInput,
    setSearchQuery,
    setFilters,
    setMoreOpen,
    sensors,
    onDragStart,
    onDragEnd,
    onDragCancel,
    dropSuccessPulse,
    setCurrentFolderId,
    setFocusedFolderId,
    setSelection,
    folderPath,
    folderById,
    currentFolderId,
    focusedFolderId,
    selectedIds,
    movingAssetIds,
    orderedAssetIds,
    aspectRatioRef,
    forceLayoutTick,
    foldersQuery,
    setCreateFolderParentId,
    setCreateFolderOpen,
    setEditFolderTarget,
    setEditFolderOpen,
    setMoveFolderTarget,
    setMoveFolderOpen,
    tryDeleteFolder,
    setMoveModalOpen,
    openEditAccessDialog,
    openBulkDeleteDialog,
    draggingAssetIds,
    draggingFolderId,
    setActive,
  } = controller;

  return (
    <ContentGuard
      loading={assetsQuery.isLoading && !assetsQuery.data}
      loadingVariant="masonry"
      error={assetsQuery.isError ? assetsQuery.error : null}
      onRetry={() => void assetsQuery.refetch()}
      errorDescription={assetsQuery.isError ? t("assets:ASSET_LIST_LOAD_FAILED_DESC") : undefined}
      empty={masonryEntries.length === 0}
      emptyTitle={
        explicitFilterActive ? t("assets:ASSET_EMPTY_SEARCH_TITLE") : t("assets:ASSET_EMPTY")
      }
      emptyDescription={
        explicitFilterActive ? t("assets:ASSET_EMPTY_SEARCH_DESC") : t("assets:ASSET_EMPTY_DESC")
      }
      emptyExtra={
        explicitFilterActive ? (
          <Button
            type="primary"
            onClick={() => {
              setSearchInput("");
              setSearchQuery("");
              setFilters({ visibility: "public" });
              setMoreOpen(false);
            }}
          >
            {t("assets:ASSET_FILTER_RESET")}
          </Button>
        ) : null
      }
    >
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-footnote">
            <FolderDroppableProvider droppableId={DND_ROOT_ID}>
              {({ setNodeRef, isOver }) => (
                <DroppablePulse
                  droppableId={DND_ROOT_ID}
                  setNodeRef={setNodeRef}
                  isOver={isOver}
                  pulseNonce={
                    dropSuccessPulse?.droppableId === DND_ROOT_ID ? dropSuccessPulse.nonce : null
                  }
                >
                  <div className={cn("inline-flex", isOver ? "ring-1 ring-foreground/60" : null)}>
                    <Button
                      type="text"
                      onClick={() => {
                        setCurrentFolderId(null);
                        setFocusedFolderId(null);
                        setSelection((prev) => clearSelection(prev));
                      }}
                    >
                      {t("assets:ASSET_BREADCRUMB_ROOT")}
                    </Button>
                  </div>
                </DroppablePulse>
              )}
            </FolderDroppableProvider>

            {folderPath.map((folder) => {
              const folderDroppableId = toFolderDndId(String(folder.id));
              return (
                <div key={String(folder.id)} className="flex items-center gap-2">
                  <span className="text-label-secondary">/</span>
                  <FolderDroppableProvider droppableId={folderDroppableId}>
                    {({ setNodeRef, isOver }) => (
                      <DroppablePulse
                        droppableId={folderDroppableId}
                        setNodeRef={setNodeRef}
                        isOver={isOver}
                        pulseNonce={
                          dropSuccessPulse?.droppableId === folderDroppableId
                            ? dropSuccessPulse.nonce
                            : null
                        }
                      >
                        <div
                          className={cn("inline-flex", isOver ? "ring-1 ring-foreground/60" : null)}
                        >
                          <Button
                            type="text"
                            size="small"
                            onClick={() => {
                              setCurrentFolderId(String(folder.id));
                              setFocusedFolderId(null);
                              setSelection((prev) => clearSelection(prev));
                            }}
                          >
                            {folder.name}
                          </Button>
                        </div>
                      </DroppablePulse>
                    )}
                  </FolderDroppableProvider>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            {assetsQuery.isFetching && !assetsQuery.isFetchingNextPage ? (
              <div className="scale-75 opacity-75">
                <LoaderOne />
              </div>
            ) : null}
            <Button
              type="text"
              icon={<FolderPlus size={16} />}
              onClick={() => {
                setCreateFolderParentId(currentFolderId);
                setCreateFolderOpen(true);
              }}
            >
              {t("assets:ASSET_ACTION_CREATE_FOLDER")}
            </Button>
          </div>
        </div>

        <div
          className="select-none"
          onMouseDown={(event) => {
            const target = event.target as HTMLElement | null;
            if (!shouldClearMasonrySelectionOnMouseDown(target)) return;
            setSelection((prev) => clearSelection(prev));
            setFocusedFolderId(null);
          }}
        >
          <Masonry
            gutter={[16, 16]}
            columns={{ xs: 1, sm: 2, md: 3, xl: 4, xxl: 5 }}
            fresh
            items={masonryEntries.map((entry) => ({
              key:
                entry.kind === "asset"
                  ? entry.asset.id
                  : entry.kind === "folder"
                    ? `folder:${entry.folder.id}`
                    : "folder:__up__",
              data: entry,
            }))}
            itemRender={(info) => {
              const entry = info.data as MasonryEntry;
              if (entry.kind === "asset") {
                return (
                  <AssetDraggableProvider assetId={entry.asset.id}>
                    {(dnd) => (
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <div
                            onContextMenuCapture={() => {
                              const assetId = entry.asset.id;
                              setFocusedFolderId(null);
                              if (selectedIds.has(assetId)) return;
                              flushSync(() => {
                                setSelection((prev) => selectOnly(prev, assetId));
                              });
                            }}
                          >
                            <AssetMasonryTile
                              asset={entry.asset}
                              selected={selectedIds.has(entry.asset.id)}
                              moving={movingAssetIds.has(entry.asset.id)}
                              dragRef={
                                dnd.setNodeRef as unknown as (node: HTMLDivElement | null) => void
                              }
                              dragAttributes={dnd.attributes}
                              dragListeners={dnd.listeners}
                              onSelect={(event) => {
                                setFocusedFolderId(null);
                                const assetId = entry.asset.id;
                                if (event.shiftKey) {
                                  setSelection((prev) =>
                                    rangeSelect(prev, assetId, orderedAssetIds),
                                  );
                                  return;
                                }
                                if (event.metaKey || event.ctrlKey) {
                                  setSelection((prev) => toggleSelect(prev, assetId));
                                  return;
                                }
                                setSelection((prev) =>
                                  selectOrClearOnPlainClick(prev, assetId, event.detail),
                                );
                              }}
                              onToggleSelected={(assetId) => {
                                setFocusedFolderId(null);
                                setSelection((prev) => toggleSelect(prev, assetId));
                              }}
                              onAspectRatio={(assetId, aspectRatio) => {
                                const safeAspectRatio =
                                  Number.isFinite(aspectRatio) && aspectRatio > 0.05
                                    ? aspectRatio
                                    : 4 / 3;
                                const previousAspectRatio = aspectRatioRef.current.get(assetId);
                                if (
                                  previousAspectRatio &&
                                  Math.abs(previousAspectRatio - safeAspectRatio) < 0.02
                                ) {
                                  return;
                                }
                                aspectRatioRef.current.set(assetId, safeAspectRatio);
                                forceLayoutTick((value) => value + 1);
                              }}
                              onOpen={setActive}
                            />
                          </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          {selectedIds.size <= 1 && (
                            <ContextMenuItem onSelect={() => setActive(entry.asset)}>
                              <Eye size={16} />
                              {t("assets:ASSET_ACTION_OPEN")}
                            </ContextMenuItem>
                          )}
                          <ContextMenuItem onSelect={() => setMoveModalOpen(true)}>
                            <FolderInput size={16} />
                            {t("assets:ASSET_ACTION_MOVE")}
                          </ContextMenuItem>
                          <ContextMenuItem onSelect={() => openEditAccessDialog()}>
                            <Settings2 size={16} />
                            {t("assets:ASSET_ACTION_EDIT_ACCESS")}
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => openBulkDeleteDialog()}
                          >
                            <Trash2 size={16} />
                            {t("assets:ASSET_ACTION_DELETE_SELECTED")}
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    )}
                  </AssetDraggableProvider>
                );
              }

              if (entry.kind === "folderUp") {
                return (
                  <AssetsExplorerFolderUpTile
                    label={t("assets:ASSET_FOLDER_UP")}
                    onClick={() => {
                      setFocusedFolderId("__up__");
                      setSelection((prev) => clearSelection(prev));
                      setActive(null);
                    }}
                    onDoubleClick={() => {
                      const folders = (foldersQuery.data?.items ?? []) as AdminAssetFolder[];
                      const currentFolder = folders.find((folder) => folder.id === currentFolderId);
                      setCurrentFolderId(
                        currentFolder?.parentId ? String(currentFolder.parentId) : null,
                      );
                    }}
                  />
                );
              }

              const folderDroppableId = toFolderDndId(String(entry.folder.id));
              return (
                <FolderDraggableProvider folderId={String(entry.folder.id)}>
                  {(drag) => (
                    <FolderDroppableProvider droppableId={folderDroppableId}>
                      {({ setNodeRef, isOver }) => (
                        <DroppablePulse
                          droppableId={folderDroppableId}
                          setNodeRef={setNodeRef}
                          isOver={isOver}
                          pulseNonce={
                            dropSuccessPulse?.droppableId === folderDroppableId
                              ? dropSuccessPulse.nonce
                              : null
                          }
                          className="block w-full"
                        >
                          <ContextMenu>
                            <ContextMenuTrigger asChild>
                              <div
                                onContextMenuCapture={() => {
                                  flushSync(() => {
                                    setFocusedFolderId(entry.folder.id);
                                    setSelection((prev) => clearSelection(prev));
                                    setActive(null);
                                  });
                                }}
                              >
                                <AssetsExplorerFolderTile
                                  ref={
                                    drag.setNodeRef as unknown as (
                                      node: HTMLDivElement | null,
                                    ) => void
                                  }
                                  folder={entry.folder}
                                  folderLabel={t("assets:ASSET_FOLDER")}
                                  focused={focusedFolderId === entry.folder.id}
                                  isOver={isOver}
                                  rootProps={{
                                    ...(drag.attributes as unknown as Record<string, unknown>),
                                    ...(drag.listeners as unknown as Record<string, unknown>),
                                  }}
                                  onClick={() => {
                                    setFocusedFolderId(entry.folder.id);
                                    setSelection((prev) => clearSelection(prev));
                                    setActive(null);
                                  }}
                                  onDoubleClick={() => {
                                    setCurrentFolderId(entry.folder.id);
                                    setFocusedFolderId(null);
                                  }}
                                />
                              </div>
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                              <ContextMenuItem
                                onSelect={() => {
                                  setCreateFolderParentId(String(entry.folder.id));
                                  setCreateFolderOpen(true);
                                }}
                              >
                                <FolderPlus size={16} />
                                {t("assets:ASSET_ACTION_CREATE_FOLDER")}
                              </ContextMenuItem>
                              <ContextMenuItem
                                onSelect={() => {
                                  setEditFolderTarget(entry.folder);
                                  setEditFolderOpen(true);
                                }}
                              >
                                <PencilLine size={16} />
                                {t("assets:ASSET_ACTION_EDIT_FOLDER")}
                              </ContextMenuItem>
                              <ContextMenuItem
                                onSelect={() => {
                                  setMoveFolderTarget(entry.folder);
                                  setMoveFolderOpen(true);
                                }}
                              >
                                <FolderInput size={16} />
                                {t("assets:ASSET_ACTION_MOVE_FOLDER")}
                              </ContextMenuItem>
                              <ContextMenuSeparator />
                              <ContextMenuItem
                                className="text-destructive focus:text-destructive"
                                onSelect={() => void tryDeleteFolder(entry.folder)}
                              >
                                <Trash2 size={16} />
                                {t("assets:ASSET_ACTION_DELETE_FOLDER")}
                              </ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>
                        </DroppablePulse>
                      )}
                    </FolderDroppableProvider>
                  )}
                </FolderDraggableProvider>
              );
            }}
          />
        </div>

        <DragOverlay modifiers={[snapOverlayCenterToPointer]}>
          <AnimatePresence>
            {draggingAssetIds.length > 0 ? (
              <DragSelectionOverlay count={draggingAssetIds.length} key="drag-selection-overlay" />
            ) : draggingFolderId ? (
              <AssetsExplorerFolderDragOverlay
                key="drag-folder-overlay"
                folderLabel={t("assets:ASSET_FOLDER")}
                folderName={
                  folderById.get(String(draggingFolderId))?.name || t("assets:ASSET_FOLDER")
                }
              />
            ) : null}
          </AnimatePresence>
        </DragOverlay>
      </DndContext>
    </ContentGuard>
  );
}
