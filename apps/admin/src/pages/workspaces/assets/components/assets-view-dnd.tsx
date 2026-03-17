import { useEffect, type ComponentProps, type ReactNode } from "react";
import { DragOverlay, useDraggable, useDroppable } from "@dnd-kit/core";
import { Badge } from "@arclayer/ui/badge";
import { motion } from "motion/react";
import { useAnimationControls } from "motion/react";

import type { AssetMasonryItem } from "@/types/assets-masonry";

export const DND_FOLDER_PREFIX = "folder:";
const DND_FOLDER_ITEM_PREFIX = "folderItem:";
const DND_ASSET_ITEM_PREFIX = "assetItem:";
const DND_CREATE_FOLDER_PREFIX = "folderCreate:";
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

export function toAssetItemDndId(assetId: string) {
  return `${DND_ASSET_ITEM_PREFIX}${assetId}`;
}

export function parseAssetItemDndId(id: string): string | null {
  if (!id.startsWith(DND_ASSET_ITEM_PREFIX)) return null;
  const raw = id.slice(DND_ASSET_ITEM_PREFIX.length);
  if (!raw) return null;
  return raw;
}

export function toCreateFolderDndId(parentFolderId: string | null) {
  return `${DND_CREATE_FOLDER_PREFIX}${parentFolderId ?? "__root__"}`;
}

export function parseCreateFolderDndId(id: string): string | null | undefined {
  if (!id.startsWith(DND_CREATE_FOLDER_PREFIX)) return undefined;
  const raw = id.slice(DND_CREATE_FOLDER_PREFIX.length);
  if (!raw) return undefined;
  return raw === "__root__" ? null : raw;
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
  setActivatorNodeRef?: (node: HTMLElement | null) => void;
  listeners: Record<string, unknown>;
  attributes: Record<string, unknown>;
  isDragging: boolean;
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
    setActivatorNodeRef: dnd.setActivatorNodeRef,
    listeners: dnd.listeners as unknown as Record<string, unknown>,
    attributes: dnd.attributes as unknown as Record<string, unknown>,
    isDragging: dnd.isDragging,
  });
}

export function AssetDraggableProvider(props: {
  assetId: string;
  children: (bindings: DraggableBindings) => ReactNode;
}) {
  const dnd = useDraggable({
    id: toAssetItemDndId(props.assetId),
    data: { kind: "asset", assetId: props.assetId },
  });

  return props.children({
    setNodeRef: dnd.setNodeRef,
    setActivatorNodeRef: dnd.setActivatorNodeRef,
    listeners: dnd.listeners as unknown as Record<string, unknown>,
    attributes: dnd.attributes as unknown as Record<string, unknown>,
    isDragging: dnd.isDragging,
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
      void controls.start({
        scale: 1.02,
        x: [0, -1.5, 1.5, 0],
        transition: {
          scale: { duration: 0.12, ease: "easeOut" },
          x: { duration: 0.24, ease: "easeInOut", repeat: Infinity },
        },
      });
      return;
    }
    void controls.start({ scale: 1, x: 0, transition: { duration: 0.12, ease: "easeOut" } });
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

export function CreateFolderDroppableProvider(props: {
  parentFolderId: string | null;
  children: (bindings: DroppableBindings & { droppableId: string }) => ReactNode;
}) {
  const droppableId = toCreateFolderDndId(props.parentFolderId);
  const dnd = useDroppable({
    id: droppableId,
    data: { kind: "create-folder", parentFolderId: props.parentFolderId },
  });

  return props.children({
    droppableId,
    setNodeRef: dnd.setNodeRef,
    isOver: dnd.isOver,
  });
}

export function AssetsDragOverlayCard(props: {
  asset: AssetMasonryItem;
  assetCount: number;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const mimeLabel = props.asset.ext || props.asset.mimeType || props.t("assets:ASSET_FILE_GENERIC");
  return (
    <motion.div
      className="pointer-events-none select-none"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 0.72, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      style={{ width: 220, willChange: "transform" }}
    >
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-2xl">
        <div className="relative overflow-hidden bg-muted/20" style={{ aspectRatio: 4 / 3 }}>
          {props.asset.previewUrl ? (
            <img
              src={props.asset.previewUrl}
              alt={props.asset.name}
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-caption font-medium text-label-secondary">
              {String(mimeLabel).replace(/^\./, "").toUpperCase()}
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/35 to-transparent" />
          <div className="absolute left-3 right-3 bottom-3">
            <div
              className="truncate text-footnote font-semibold text-white"
              title={props.asset.name}
            >
              {props.asset.name}
            </div>
          </div>
          {props.assetCount > 1 ? (
            <Badge className="absolute right-3 top-3 rounded-full bg-background/92 text-foreground shadow-sm">
              {props.t("assets:ASSET_SELECTED_COUNT", { count: props.assetCount })}
            </Badge>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
