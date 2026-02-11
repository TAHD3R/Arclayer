import { useEffect, type ComponentProps, type ReactNode } from "react";
import { DragOverlay, useDraggable, useDroppable } from "@dnd-kit/core";
import { motion } from "motion/react";
import { useAnimationControls } from "motion/react";

export const DND_ASSET_PREFIX = "asset:";
export const DND_FOLDER_PREFIX = "folder:";
const DND_FOLDER_ITEM_PREFIX = "folderItem:";
export const DND_ROOT_ID = `${DND_FOLDER_PREFIX}__root__`;

export function toAssetDndId(assetId: string) {
  return `${DND_ASSET_PREFIX}${assetId}`;
}

export function toFolderDndId(folderId: string) {
  return `${DND_FOLDER_PREFIX}${folderId}`;
}

export function toFolderItemDndId(folderId: string) {
  return `${DND_FOLDER_ITEM_PREFIX}${folderId}`;
}

export function parseAssetDndId(id: string): string | null {
  if (!id.startsWith(DND_ASSET_PREFIX)) return null;
  return id.slice(DND_ASSET_PREFIX.length);
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

export function AssetDraggableProvider(props: {
  assetId: string;
  children: (bindings: DraggableBindings) => ReactNode;
}) {
  const dnd = useDraggable({
    id: toAssetDndId(props.assetId),
    data: { kind: "asset", assetId: props.assetId },
  });

  return props.children({
    setNodeRef: dnd.setNodeRef,
    listeners: dnd.listeners as unknown as Record<string, unknown>,
    attributes: dnd.attributes as unknown as Record<string, unknown>,
  });
}

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

export function DragSelectionOverlay(props: { count: number }) {
  const stackCount = Math.min(3, Math.max(1, props.count));
  const offset = (stackCount - 1) * 8;
  const width = 156 + offset;
  const height = 104 + offset;

  return (
    <motion.div
      className="relative inline-block pointer-events-none select-none"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      style={{ willChange: "transform", width, height }}
    >
      <div className="relative h-full w-full">
        {Array.from({ length: stackCount }).map((_, idx) => (
          <div
            key={idx}
            className="absolute left-0 top-0 overflow-hidden rounded-lg border border-border bg-card"
            style={{
              transform: `translate(${idx * 8}px, ${idx * 8}px)`,
              width: 156,
              height: 104,
            }}
          >
            <div className="relative h-full w-full bg-muted/20">
              <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted/10 via-muted/35 to-muted/10" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,hsl(var(--foreground)/0.08),transparent_55%),radial-gradient(circle_at_80%_70%,hsl(var(--foreground)/0.06),transparent_60%)] opacity-70" />
              <div className="absolute inset-0 flex items-end p-3">
                <div className="w-full space-y-2 opacity-70">
                  <div className="h-2 w-2/3 bg-foreground/10" />
                  <div className="h-2 w-1/2 bg-foreground/5" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      {props.count > 1 ? (
        <div className="absolute right-2 top-2 border border-border bg-card px-2 py-1 text-xs font-semibold">
          {props.count}
        </div>
      ) : null}
    </motion.div>
  );
}
