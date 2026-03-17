import { useEffect, type ComponentProps, type ReactNode } from "react";
import { DragOverlay, useDraggable, useDroppable } from "@dnd-kit/core";
import { motion } from "motion/react";
import { useAnimationControls } from "motion/react";

export const DND_FOLDER_PREFIX = "folder:";
const DND_FOLDER_ITEM_PREFIX = "folderItem:";
export const DND_ROOT_ID = `${DND_FOLDER_PREFIX}__root__`;

export function toFolderDndId(folderId: string) {
  return `${DND_FOLDER_PREFIX}${folderId}`;
}

export function toFolderItemDndId(folderId: string) {
  return `${DND_FOLDER_ITEM_PREFIX}${folderId}`;
}

export function parseFolderDndId(id: string): string | null {
  if (!id.startsWith(DND_FOLDER_PREFIX)) return null;
  const raw = id.slice(DND_FOLDER_PREFIX.length);
  if (!raw) return null;
  return raw === "__root__" ? null : raw;
}

export function parseFolderItemDndId(id: string): string | null {
  if (!id.startsWith(DND_FOLDER_ITEM_PREFIX)) return null;
  const raw = id.slice(DND_FOLDER_ITEM_PREFIX.length);
  if (!raw) return null;
  return raw;
}

type DragOverlayModifier = NonNullable<ComponentProps<typeof DragOverlay>["modifiers"]>[number];

type PointerActivatorEvent = { clientX: number; clientY: number };
type TouchActivatorEvent = { touches: Array<PointerActivatorEvent> };

function getPointerActivatorPosition(event: unknown): PointerActivatorEvent | null {
  if (!event || typeof event !== "object") return null;

  if ("clientX" in event && "clientY" in event) {
    const pointerEvent = event as PointerActivatorEvent;
    return {
      clientX: Number(pointerEvent.clientX),
      clientY: Number(pointerEvent.clientY),
    };
  }

  if ("touches" in event) {
    const touchEvent = event as TouchActivatorEvent;
    const firstTouch = touchEvent.touches?.[0];
    if (!firstTouch) return null;
    return {
      clientX: Number(firstTouch.clientX),
      clientY: Number(firstTouch.clientY),
    };
  }

  return null;
}

export const snapOverlayCenterToPointer: DragOverlayModifier = ({
  transform,
  activeNodeRect,
  overlayNodeRect,
  activatorEvent,
}) => {
  const base = {
    x: Number(transform?.x || 0),
    y: Number(transform?.y || 0),
    scaleX: Number.isFinite(transform?.scaleX) ? Number(transform.scaleX) : 1,
    scaleY: Number.isFinite(transform?.scaleY) ? Number(transform.scaleY) : 1,
  };

  if (!activeNodeRect || !overlayNodeRect || !activatorEvent) return base;

  // Keep overlay centered under the pointer throughout drag.
  const pointerPosition = getPointerActivatorPosition(activatorEvent);
  if (!pointerPosition) return base;

  const { clientX, clientY } = pointerPosition;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return base;

  const grabOffsetX = clientX - activeNodeRect.left;
  const grabOffsetY = clientY - activeNodeRect.top;

  return {
    ...base,
    x: base.x + grabOffsetX - overlayNodeRect.width / 2,
    y: base.y + grabOffsetY - overlayNodeRect.height / 2,
  };
};

type DraggableBindings = {
  setNodeRef: (node: HTMLElement | null) => void;
  listeners: Record<string, unknown>;
  attributes: Record<string, unknown>;
};

export function FolderDraggableProvider(props: {
  folderId: string;
  children: (bindings: DraggableBindings) => ReactNode;
}) {
  const dnd = useDraggable({
    id: toFolderItemDndId(props.folderId),
    data: { kind: "folder", folderId: props.folderId },
  });

  return props.children({
    setNodeRef: dnd.setNodeRef,
    listeners: dnd.listeners as unknown as Record<string, unknown>,
    attributes: dnd.attributes as unknown as Record<string, unknown>,
  });
}

type DroppableBindings = {
  setNodeRef: (node: HTMLElement | null) => void;
  isOver: boolean;
};

export function DroppablePulse(props: {
  droppableId: string;
  setNodeRef: (node: HTMLElement | null) => void;
  isOver: boolean;
  pulseNonce: number | null;
  className?: string;
  children: ReactNode;
}) {
  const controls = useAnimationControls();

  useEffect(() => {
    if (props.isOver) {
      void controls.start({ scale: 1.02, transition: { duration: 0.12, ease: "easeOut" } });
      return;
    }
    void controls.start({ scale: 1, transition: { duration: 0.12, ease: "easeOut" } });
  }, [controls, props.isOver]);

  useEffect(() => {
    if (props.isOver) return;
    if (!props.pulseNonce) return;
    void controls.start({
      scale: [1, 1.06, 1],
      transition: { duration: 0.18, ease: "easeOut" },
    });
  }, [controls, props.isOver, props.pulseNonce]);

  return (
    <motion.div
      ref={props.setNodeRef}
      className={props.className || "inline-flex"}
      animate={controls}
      style={{ willChange: "transform" }}
    >
      {props.children}
    </motion.div>
  );
}

export function FolderDroppableProvider(props: {
  droppableId: string;
  children: (bindings: DroppableBindings) => ReactNode;
}) {
  const dnd = useDroppable({
    id: props.droppableId,
    data: { kind: "folder", folderId: parseFolderDndId(props.droppableId) },
  });
  return props.children({ setNodeRef: dnd.setNodeRef, isOver: dnd.isOver });
}
