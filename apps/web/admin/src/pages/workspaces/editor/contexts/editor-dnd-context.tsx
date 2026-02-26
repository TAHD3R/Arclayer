import * as React from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useTranslation } from "react-i18next";

import type { BlockNode } from "@celestial/site-block-protocol";

import { notifyErrorText } from "@/lib/notifications";
import { getErrorMessage } from "@/lib/notifications";
import { useEditorBridgeContext } from "@/pages/workspaces/editor/contexts/editor-bridge-context";
import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";
import { resolveAssetRefToPublicUrlPath } from "@/lib/assets/asset-urls";
import { cn } from "@/lib/utils";

export const EDITOR_CANVAS_DROPPABLE_ID = "editor-canvas";

export type EditorDragItem =
  | { kind: "new-block"; blockType: string }
  | { kind: "asset"; assetId: string; assetName?: string | null };

type EditorDndContextValue = {
  activeItem: EditorDragItem | null;
};

const EditorDndContext = React.createContext<EditorDndContextValue | null>(null);

export function useEditorDndContext(): EditorDndContextValue {
  const ctx = React.useContext(EditorDndContext);
  if (!ctx) {
    throw new Error("useEditorDndContext must be used within EditorDndProvider");
  }
  return ctx;
}

export function EditorDndProvider(props: { children: React.ReactNode }) {
  const { t } = useTranslation(["content_pages"]);
  const { portal } = useEditorBridgeContext();

  const bridgeStatus = useEditorStore((s) => s.bridgeStatus);
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);
  const setInspectorData = useEditorStore((s) => s.setInspectorData);
  const setLayerTree = useEditorStore((s) => s.setLayerTree);
  const setDirty = useEditorStore((s) => s.setDirty);

  const [activeItem, setActiveItem] = React.useState<EditorDragItem | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const onDragStart = (event: DragStartEvent) => {
    const item = event.active.data.current?.editorItem as EditorDragItem | undefined;
    setActiveItem(item ?? null);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const item = event.active.data.current?.editorItem as EditorDragItem | undefined;
    setActiveItem(null);

    if (!item) return;
    if (!event.over) return;
    if (String(event.over.id) !== EDITOR_CANVAS_DROPPABLE_ID) return;

    if (!portal || bridgeStatus !== "connected") {
      notifyErrorText(t("content_pages:EDITOR_SHELL_BRIDGE_DISCONNECTED"));
      return;
    }

    const targetBlockId = selectedBlockId ?? null;
    const position = targetBlockId ? ("inside" as const) : undefined;

    void (async () => {
      try {
        if (item.kind === "new-block") {
          const out = await portal.insertBlock({
            type: item.blockType,
            targetBlockId,
            position,
          });
          setInspectorData(out.inspector);
          setLayerTree(out.layers);
          setDirty(true);
          return;
        }

        // Asset -> insert an image block with src preset.
        const src = resolveAssetRefToPublicUrlPath(item.assetId) ?? "";
        const blocks: BlockNode[] = [
          {
            id: "b-temp",
            type: "image",
            props: {
              src,
              alt: item.assetName ?? "",
            },
          },
        ];

        const out = await portal.insertBlockTree({
          blocks,
          targetBlockId,
          position,
        });
        setInspectorData(out.inspector);
        setLayerTree(out.layers);
        setDirty(true);
      } catch (err) {
        notifyErrorText(getErrorMessage(err));
      }
    })();
  };

  const onDragCancel = () => setActiveItem(null);

  return (
    <EditorDndContext.Provider value={{ activeItem }}>
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        {props.children}
        {activeItem ? (
          <DragOverlay>
            <div
              className={cn(
                "pointer-events-none select-none rounded-md border border-border bg-card px-3 py-2 shadow-md",
                "text-footnote font-medium",
              )}
            >
              {activeItem.kind === "new-block"
                ? t("content_pages:EDITOR_DND_NEW_BLOCK", { type: activeItem.blockType })
                : t("content_pages:EDITOR_DND_ASSET")}
            </div>
          </DragOverlay>
        ) : null}
      </DndContext>
    </EditorDndContext.Provider>
  );
}
