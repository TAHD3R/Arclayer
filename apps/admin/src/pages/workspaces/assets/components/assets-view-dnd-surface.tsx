import { DndContext, DragOverlay } from "@dnd-kit/core";
import { AnimatePresence } from "motion/react";
import type { PropsWithChildren } from "react";

import type { AssetsViewController } from "../hooks/use-assets-view-controller";
import { AssetsExplorerFolderDragOverlay } from "./explorer/assets-explorer-folder-tiles";
import { snapOverlayCenterToPointer } from "./assets-view-dnd";

export function AssetsViewDndSurface(
  props: PropsWithChildren<{ controller: AssetsViewController }>,
) {
  const { controller, children } = props;
  const { t, sensors, onDragStart, onDragEnd, onDragCancel, draggingFolderId, folderById } =
    controller;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
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
          ) : null}
        </AnimatePresence>
      </DragOverlay>
    </DndContext>
  );
}
