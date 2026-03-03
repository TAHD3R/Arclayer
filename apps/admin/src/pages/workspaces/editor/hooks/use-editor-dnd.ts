import { useState } from "react";
import type { DndItem, DndDropTarget } from "@celestial/editor-protocol";

interface UseEditorDndOptions {
  onDrop?: (item: DndItem, target: DndDropTarget) => void;
}

interface UseEditorDndReturn {
  dragItem: DndItem | null;
  setDragItem: (item: DndItem | null) => void;
  dropTarget: DndDropTarget | null;
  setDropTarget: (target: DndDropTarget | null) => void;
  handleDrop: () => void;
}

export function useEditorDnd(options?: UseEditorDndOptions): UseEditorDndReturn {
  const [dragItem, setDragItem] = useState<DndItem | null>(null);
  const [dropTarget, setDropTarget] = useState<DndDropTarget | null>(null);

  const handleDrop = () => {
    if (dragItem && dropTarget) {
      options?.onDrop?.(dragItem, dropTarget);
    }
    setDragItem(null);
    setDropTarget(null);
  };

  return { dragItem, setDragItem, dropTarget, setDropTarget, handleDrop };
}
