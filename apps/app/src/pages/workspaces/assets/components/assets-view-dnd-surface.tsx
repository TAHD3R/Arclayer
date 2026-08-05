import { DndContext, DragOverlay, pointerWithin } from "@dnd-kit/core";
import { AnimatePresence } from "motion/react";
import type { PropsWithChildren } from "react";

import type { AssetsViewController } from "../hooks/use-assets-view-controller";
import { AssetsExplorerFolderDragOverlay } from "./explorer/assets-explorer-folder-tiles";
import { AssetsDragOverlayCard, snapOverlayCenterToPointer } from "./assets-view-dnd";

export function AssetsViewDndSurface(
  props: PropsWithChildren<{ controller: AssetsViewController; disabled?: boolean }>,
) {
  const { controller, children } = props;
  const {
    t,
    sensors,
    onDragStart,
    onDragEnd,
    onDragCancel,
    draggingFolderId,
    draggingAssetIds,
    draggingAssetLeadId,
    folderById,
    items,
  } = controller;
  const draggingAsset = draggingAssetLeadId
    ? (items.find((item) => item.id === draggingAssetLeadId) ?? null)
    : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={props.disabled ? undefined : onDragStart}
      onDragEnd={props.disabled ? undefined : onDragEnd}
      onDragCancel={onDragCancel}
    >
      {children}

      <DragOverlay modifiers={[snapOverlayCenterToPointer]}>
        <AnimatePresence>
          {draggingFolderId ? (
            <AssetsExplorerFolderDragOverlay
              key="drag-folder-overlay"
              folderLabel={t("assets:ASSET_FOLDER")}
              folderName={
                folderById.get(String(draggingFolderId))?.name || t("assets:ASSET_FOLDER")
              }
            />
          ) : draggingAsset ? (
            <AssetsDragOverlayCard
              key={`drag-asset-overlay:${draggingAsset.id}`}
              asset={draggingAsset}
              assetCount={draggingAssetIds.length || 1}
              t={t}
            />
          ) : null}
        </AnimatePresence>
      </DragOverlay>
    </DndContext>
  );
}
