import type { BlockId, EditorInsertBlockPosition, EditorLayerNode } from "./index";

export type DndItemKind = "new-block" | "existing-block";

export interface DndNewBlockItem {
  kind: "new-block";
  blockType: string;
}

export interface DndExistingBlockItem {
  kind: "existing-block";
  blockId: BlockId;
}

export type DndItem = DndNewBlockItem | DndExistingBlockItem;

export interface DndDropTarget {
  targetBlockId: BlockId;
  position: EditorInsertBlockPosition;
}

export interface DndDropResult {
  layers: EditorLayerNode[];
}
