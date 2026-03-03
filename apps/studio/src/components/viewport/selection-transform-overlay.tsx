import type { PageBlueprint } from "@celestial/block-protocol";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import { clonePageBlueprint } from "@/lib/page-blueprint";

type Rect = { x: number; y: number; width: number; height: number };

type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type SnapGuide = { axis: "x" | "y"; pos: number };

function isFiniteRect(rect: any): rect is Rect {
  return (
    rect &&
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height)
  );
}

function getNodeLocalRect(doc: PageBlueprint, nodeId: string): Rect | null {
  const node = doc.nodesById[nodeId];
  const rect = (node as any)?.layout?.self?.rect;
  if (!isFiniteRect(rect)) return null;
  return {
    x: Number(rect.x),
    y: Number(rect.y),
    width: Number(rect.width),
    height: Number(rect.height),
  };
}

function updateNodeLocalRect(doc: PageBlueprint, nodeId: string, nextRect: Rect): PageBlueprint {
  const curNode = doc.nodesById[nodeId] as any;
  if (!curNode) return doc;

  const next: PageBlueprint = {
    ...doc,
    nodesById: { ...doc.nodesById },
  };

  const nextNode: any = { ...curNode };
  next.nodesById[nodeId] = nextNode;

  const layout = nextNode.layout ? { ...nextNode.layout } : {};
  const self = layout.self ? { ...layout.self } : {};
  self.rect = {
    x: nextRect.x,
    y: nextRect.y,
    width: nextRect.width,
    height: nextRect.height,
  };
  layout.self = self;
  nextNode.layout = layout;
  return next;
}

function clampRect(input: Rect): Rect {
  const minW = 40;
  const minH = 40;
  const width = Math.max(minW, Math.round(input.width));
  const height = Math.max(minH, Math.round(input.height));
  const x = Math.round(input.x);
  const y = Math.round(input.y);
  return { x, y, width, height };
}

function applyResize(args: { start: Rect; dx: number; dy: number; handle: ResizeHandle }): Rect {
  const { start, dx, dy, handle } = args;
  let x = start.x;
  let y = start.y;
  let width = start.width;
  let height = start.height;

  const applyE = () => {
    width = start.width + dx;
  };
  const applyS = () => {
    height = start.height + dy;
  };
  const applyW = () => {
    width = start.width - dx;
    x = start.x + dx;
  };
  const applyN = () => {
    height = start.height - dy;
    y = start.y + dy;
  };

  if (handle.includes("e")) applyE();
  if (handle.includes("s")) applyS();
  if (handle.includes("w")) applyW();
  if (handle.includes("n")) applyN();

  const clamped = clampRect({ x, y, width, height });

  if (handle.includes("w")) {
    const right = start.x + start.width;
    clamped.x = right - clamped.width;
  }
  if (handle.includes("n")) {
    const bottom = start.y + start.height;
    clamped.y = bottom - clamped.height;
  }
  return clamped;
}

function safeCssEscape(value: string): string {
  const raw = String(value || "");
  const c = (globalThis as any)?.CSS;
  if (c && typeof c.escape === "function") return c.escape(raw);
  return raw.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function measureNodeBoxRelativeToCanvas(args: {
  canvasRootEl: HTMLElement | null;
  nodeId: string;
}): Rect | null {
  const root = args.canvasRootEl;
  if (!root) return null;
  const el = root.querySelector(
    `[data-node-id="${safeCssEscape(args.nodeId)}"]`,
  ) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const c = root.getBoundingClientRect();
  return {
    x: Math.round(r.left - c.left),
    y: Math.round(r.top - c.top),
    width: Math.round(r.width),
    height: Math.round(r.height),
  };
}

function toSafeSegment(value: string): string {
  return String(value || "").replaceAll(/[^A-Za-z0-9:_-]/g, "_");
}

function findContainingSectionId(doc: PageBlueprint, nodeId: string): string | null {
  const id = (nodeId || "").trim();
  if (!id) return null;
  for (const node of Object.values(doc.nodesById)) {
    if (!node || node.type !== "prefab_instance") continue;
    if ((node.prefabId || "").trim() !== "section") continue;
    const ids = node.slotChildren?.default ?? [];
    if (Array.isArray(ids) && ids.includes(id)) return node.id;
  }
  return null;
}

function readLiteralNumber(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  if ((value as any).kind !== "literal") return null;
  const v = (value as any).value;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function readLiteralBoolean(value: unknown): boolean | null {
  if (!value || typeof value !== "object") return null;
  if ((value as any).kind !== "literal") return null;
  const v = (value as any).value;
  return typeof v === "boolean" ? v : null;
}

function computeSectionGrid(args: {
  sectionNode: any;
  containerSize: { width: number; height: number };
}): {
  showGrid: boolean;
  verticalLines: number[];
  horizontalLines: number[];
} {
  const props = args.sectionNode?.props ?? {};
  const columns = Math.max(1, Math.round(readLiteralNumber(props.columns) ?? 12));
  const columnGap = Math.max(0, Math.round(readLiteralNumber(props.columnGap) ?? 24));
  const paddingX = Math.max(0, Math.round(readLiteralNumber(props.paddingX) ?? 24));
  const paddingY = Math.max(0, Math.round(readLiteralNumber(props.paddingY) ?? 24));
  const rowHeight = Math.max(1, Math.round(readLiteralNumber(props.rowHeight) ?? 8));
  const rowGap = Math.max(0, Math.round(readLiteralNumber(props.rowGap) ?? 8));
  const showGrid = readLiteralBoolean(props.showGrid) ?? true;

  const innerW = Math.max(0, args.containerSize.width - paddingX * 2);
  const innerH = Math.max(0, args.containerSize.height - paddingY * 2);

  const colWidth =
    columns > 0 ? Math.max(0, (innerW - columnGap * Math.max(0, columns - 1)) / columns) : 0;

  const verticalLines: number[] = [];
  for (let i = 0; i < columns; i += 1) {
    const start = paddingX + i * (colWidth + columnGap);
    const end = start + colWidth;
    verticalLines.push(Math.round(start));
    verticalLines.push(Math.round(end));
  }

  const horizontalLines: number[] = [];
  const step = rowHeight + rowGap;
  const maxRows = step > 0 ? Math.min(200, Math.ceil(innerH / step) + 2) : 0;
  for (let r = 0; r < maxRows; r += 1) {
    const top = paddingY + r * step;
    const bottom = top + rowHeight;
    horizontalLines.push(Math.round(top));
    horizontalLines.push(Math.round(bottom));
  }

  return {
    showGrid,
    verticalLines: Array.from(new Set(verticalLines)).sort((a, b) => a - b),
    horizontalLines: Array.from(new Set(horizontalLines)).sort((a, b) => a - b),
  };
}

function snapAxis(args: { value: number; size: number; lines: number[]; threshold: number }): {
  next: number;
  guide: SnapGuide | null;
} {
  const left = args.value;
  const center = args.value + args.size / 2;
  const right = args.value + args.size;

  let best: { delta: number; line: number; kind: "left" | "center" | "right" } | null = null;
  for (const line of args.lines) {
    const candidates: Array<{ kind: "left" | "center" | "right"; v: number }> = [
      { kind: "left", v: left },
      { kind: "center", v: center },
      { kind: "right", v: right },
    ];
    for (const c of candidates) {
      const delta = line - c.v;
      const dist = Math.abs(delta);
      if (dist > args.threshold) continue;
      if (!best || dist < Math.abs(best.delta)) best = { delta, line, kind: c.kind };
    }
  }

  if (!best) return { next: args.value, guide: null };
  return { next: Math.round(args.value + best.delta), guide: { axis: "x", pos: best.line } };
}

function snapAxisY(args: { value: number; size: number; lines: number[]; threshold: number }): {
  next: number;
  guide: SnapGuide | null;
} {
  const top = args.value;
  const center = args.value + args.size / 2;
  const bottom = args.value + args.size;

  let best: { delta: number; line: number; kind: "top" | "center" | "bottom" } | null = null;
  for (const line of args.lines) {
    const candidates: Array<{ kind: "top" | "center" | "bottom"; v: number }> = [
      { kind: "top", v: top },
      { kind: "center", v: center },
      { kind: "bottom", v: bottom },
    ];
    for (const c of candidates) {
      const delta = line - c.v;
      const dist = Math.abs(delta);
      if (dist > args.threshold) continue;
      if (!best || dist < Math.abs(best.delta)) best = { delta, line, kind: c.kind };
    }
  }

  if (!best) return { next: args.value, guide: null };
  return { next: Math.round(args.value + best.delta), guide: { axis: "y", pos: best.line } };
}

export type SelectionTransformOverlayApi = {
  beginMove: (args: {
    nodeId: string;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    beforeDoc: PageBlueprint;
  }) => void;
  beginReorder: (args: {
    nodeId: string;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    beforeDoc: PageBlueprint;
    siblingIds: string[];
  }) => void;
};

export type SelectionTransformOverlayProps = {
  enabled: boolean;
  doc: PageBlueprint;
  nodeId: string | null;
  moveEnabled?: boolean;
  canvasRootEl: HTMLElement | null;
  scrollerEl: HTMLElement | null;
  onStartTransform?: () => void;
  onCommitBeforeDoc: (before: PageBlueprint) => void;
  onCommitNextDoc: (next: PageBlueprint) => void;
  onPreviewNextDoc?: (next: PageBlueprint) => void;
};

export const SelectionTransformOverlay = forwardRef<
  SelectionTransformOverlayApi,
  SelectionTransformOverlayProps
>(function SelectionTransformOverlay(props, ref) {
  const dragRef = useRef<
    | {
        active: boolean;
        kind: "move" | "resize";
        nodeId: string;
        handle?: ResizeHandle;
        startClientX: number;
        startClientY: number;
        startLocalRect: Rect;
        startDomRect: Rect;
        beforeDoc: PageBlueprint;
        pointerId: number;
        changed: boolean;
        snapGuide: { x: SnapGuide | null; y: SnapGuide | null };
      }
    | {
        active: boolean;
        kind: "reorder";
        nodeId: string;
        startClientX: number;
        startClientY: number;
        startDomRect: Rect;
        beforeDoc: PageBlueprint;
        pointerId: number;
        changed: boolean;
        siblingIds: string[];
        siblingRectsById: Record<string, Rect>;
      }
    | null
  >(null);

  const [ghostRect, setGhostRect] = useState<Rect | null>(null);
  const [grid, setGrid] = useState<{
    containerRect: Rect;
    verticalLines: number[];
    horizontalLines: number[];
    showGrid: boolean;
    snapGuide: { x: SnapGuide | null; y: SnapGuide | null };
  } | null>(null);

  const previewRafRef = useRef<number | null>(null);
  const previewDocRef = useRef<PageBlueprint | null>(null);

  useEffect(() => {
    return () => {
      if (previewRafRef.current) {
        window.cancelAnimationFrame(previewRafRef.current);
        previewRafRef.current = null;
      }
    };
  }, []);

  const activeNodeId = props.nodeId ?? dragRef.current?.nodeId ?? null;

  const localRect = useMemo(() => {
    if (!activeNodeId) return null;
    return getNodeLocalRect(props.doc, activeNodeId);
  }, [activeNodeId, props.doc]);

  const [measureTick, setMeasureTick] = useState(0);

  useEffect(() => {
    if (!props.scrollerEl) return;
    const el = props.scrollerEl;
    const onScroll = () => setMeasureTick((x) => x + 1);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [props.scrollerEl]);

  useEffect(() => {
    const onResize = () => setMeasureTick((x) => x + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const domRect = useMemo(() => {
    if (!activeNodeId) return null;
    void measureTick;
    return measureNodeBoxRelativeToCanvas({
      canvasRootEl: props.canvasRootEl,
      nodeId: activeNodeId,
    });
  }, [activeNodeId, measureTick, props.canvasRootEl]);

  const computeGridState = useCallback(
    (args: { nodeId: string; snapGuide: { x: SnapGuide | null; y: SnapGuide | null } }) => {
      const sectionId = findContainingSectionId(props.doc, args.nodeId);
      if (!sectionId) return null;
      const sectionNode = props.doc.nodesById[sectionId];
      if (!sectionNode || sectionNode.type !== "prefab_instance") return null;

      const slotRenderedId = `p_${toSafeSegment("section")}_${toSafeSegment(sectionId)}_section_slot`;
      const slotRect =
        measureNodeBoxRelativeToCanvas({
          canvasRootEl: props.canvasRootEl,
          nodeId: slotRenderedId,
        }) ?? null;
      if (!slotRect) return null;

      const computed = computeSectionGrid({
        sectionNode,
        containerSize: { width: slotRect.width, height: slotRect.height },
      });

      return {
        containerRect: slotRect,
        verticalLines: computed.verticalLines,
        horizontalLines: computed.horizontalLines,
        showGrid: computed.showGrid,
        snapGuide: args.snapGuide,
      };
    },
    [props.canvasRootEl, props.doc],
  );

  useImperativeHandle(
    ref,
    () => ({
      beginMove: (args) => {
        if (!props.enabled) return;
        const nodeId = (args.nodeId || "").trim();
        if (!nodeId) return;
        const startLocalRect = getNodeLocalRect(args.beforeDoc, nodeId);
        if (!startLocalRect) return;
        const measured = measureNodeBoxRelativeToCanvas({
          canvasRootEl: props.canvasRootEl,
          nodeId,
        });
        const startDomRect = measured ?? startLocalRect;
        props.onStartTransform?.();
        dragRef.current = {
          active: true,
          kind: "move",
          nodeId,
          startClientX: args.startClientX,
          startClientY: args.startClientY,
          startLocalRect,
          startDomRect,
          beforeDoc: args.beforeDoc,
          pointerId: args.pointerId,
          changed: false,
          snapGuide: { x: null, y: null },
        };
        setGhostRect(startDomRect);
        setGrid(computeGridState({ nodeId, snapGuide: { x: null, y: null } }));
      },
      beginReorder: (args) => {
        if (!props.enabled) return;
        const nodeId = (args.nodeId || "").trim();
        if (!nodeId) return;
        const measured = measureNodeBoxRelativeToCanvas({
          canvasRootEl: props.canvasRootEl,
          nodeId,
        });
        if (!measured) return;

        const siblingRectsById: Record<string, Rect> = {};
        for (const id of args.siblingIds ?? []) {
          const rect = measureNodeBoxRelativeToCanvas({
            canvasRootEl: props.canvasRootEl,
            nodeId: id,
          });
          if (rect) siblingRectsById[id] = rect;
        }

        props.onStartTransform?.();
        dragRef.current = {
          active: true,
          kind: "reorder",
          nodeId,
          startClientX: args.startClientX,
          startClientY: args.startClientY,
          startDomRect: measured,
          beforeDoc: args.beforeDoc,
          pointerId: args.pointerId,
          changed: false,
          siblingIds: [...(args.siblingIds ?? [])],
          siblingRectsById,
        };
        setGhostRect(measured);
        setGrid(null);
      },
    }),
    [computeGridState, props.canvasRootEl, props.enabled, props.onStartTransform],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const s = dragRef.current;
      if (!s || !s.active) return;
      if (e.pointerId !== s.pointerId) return;
      e.preventDefault();

      const dx = e.clientX - s.startClientX;
      const dy = e.clientY - s.startClientY;
      if (!s.changed && (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5)) s.changed = true;

      if (s.kind === "reorder") {
        const nextGhost: Rect = {
          x: Math.round(s.startDomRect.x),
          y: Math.round(s.startDomRect.y + dy),
          width: s.startDomRect.width,
          height: s.startDomRect.height,
        };
        setGhostRect(nextGhost);
        return;
      }

      let nextLocalRect =
        s.kind === "move"
          ? clampRect({
              x: s.startLocalRect.x + dx,
              y: s.startLocalRect.y + dy,
              width: s.startLocalRect.width,
              height: s.startLocalRect.height,
            })
          : applyResize({ start: s.startLocalRect, dx, dy, handle: s.handle! });

      const snapGuide = { x: null as SnapGuide | null, y: null as SnapGuide | null };
      if (s.kind === "move") {
        const gridState = computeGridState({ nodeId: s.nodeId, snapGuide });
        if (gridState) {
          const threshold = 6;
          const snappedX = snapAxis({
            value: nextLocalRect.x,
            size: nextLocalRect.width,
            lines: gridState.verticalLines,
            threshold,
          });
          const snappedY = snapAxisY({
            value: nextLocalRect.y,
            size: nextLocalRect.height,
            lines: gridState.horizontalLines,
            threshold,
          });
          nextLocalRect = { ...nextLocalRect, x: snappedX.next, y: snappedY.next };
          snapGuide.x = snappedX.guide ? { axis: "x", pos: snappedX.guide.pos } : null;
          snapGuide.y = snappedY.guide ? { axis: "y", pos: snappedY.guide.pos } : null;
        }
      }
      s.snapGuide = snapGuide;

      const dxLocal = nextLocalRect.x - s.startLocalRect.x;
      const dyLocal = nextLocalRect.y - s.startLocalRect.y;
      const nextGhost: Rect = {
        x: Math.round(s.startDomRect.x + dxLocal),
        y: Math.round(s.startDomRect.y + dyLocal),
        width: nextLocalRect.width,
        height: nextLocalRect.height,
      };
      setGhostRect(nextGhost);

      setGrid(computeGridState({ nodeId: s.nodeId, snapGuide }));

      if (props.onPreviewNextDoc) {
        const nextDoc = updateNodeLocalRect(s.beforeDoc, s.nodeId, nextLocalRect);
        previewDocRef.current = nextDoc;
        if (!previewRafRef.current) {
          previewRafRef.current = window.requestAnimationFrame(() => {
            previewRafRef.current = null;
            const doc = previewDocRef.current;
            if (doc) props.onPreviewNextDoc?.(doc);
          });
        }
      }
    };

    const onUp = (e: PointerEvent) => {
      const s = dragRef.current;
      if (!s || !s.active) return;
      if (e.pointerId !== s.pointerId) return;
      e.preventDefault();
      dragRef.current = null;

      const before = s.beforeDoc;
      setGhostRect(null);
      setGrid(null);
      if (!s.changed) return;

      const dx = e.clientX - s.startClientX;
      const dy = e.clientY - s.startClientY;

      if (s.kind === "reorder") {
        const raw = s.siblingIds ?? [];
        if (raw.length < 2) return;
        const root = before.nodesById[before.rootId];
        if (!root || root.type !== "page_root") return;
        const siblings = raw.filter((id) => id && id !== s.nodeId);
        const centerY = s.startDomRect.y + dy + s.startDomRect.height / 2;
        const index = siblings.filter((id) => {
          const r = s.siblingRectsById[id];
          if (!r) return false;
          return r.y + r.height / 2 < centerY;
        }).length;

        const next = clonePageBlueprint(before);
        const nextRoot = next.nodesById[next.rootId];
        if (!nextRoot || nextRoot.type !== "page_root") return;
        const existing = [...(nextRoot.children ?? [])].filter(Boolean);
        const filtered = existing.filter((id) => id !== s.nodeId);
        const clamped = Math.max(0, Math.min(filtered.length, index));
        filtered.splice(clamped, 0, s.nodeId);
        nextRoot.children = filtered;
        props.onCommitBeforeDoc(before);
        props.onCommitNextDoc(next);
        return;
      }

      let nextLocalRect =
        s.kind === "move"
          ? clampRect({
              x: s.startLocalRect.x + dx,
              y: s.startLocalRect.y + dy,
              width: s.startLocalRect.width,
              height: s.startLocalRect.height,
            })
          : applyResize({ start: s.startLocalRect, dx, dy, handle: s.handle! });

      if (s.kind === "move") {
        const gridState = computeGridState({ nodeId: s.nodeId, snapGuide: s.snapGuide });
        if (gridState) {
          const threshold = 6;
          const snappedX = snapAxis({
            value: nextLocalRect.x,
            size: nextLocalRect.width,
            lines: gridState.verticalLines,
            threshold,
          });
          const snappedY = snapAxisY({
            value: nextLocalRect.y,
            size: nextLocalRect.height,
            lines: gridState.horizontalLines,
            threshold,
          });
          nextLocalRect = { ...nextLocalRect, x: snappedX.next, y: snappedY.next };
        }
      }

      const nextDoc = updateNodeLocalRect(before, s.nodeId, nextLocalRect);
      props.onCommitBeforeDoc(before);
      props.onCommitNextDoc(nextDoc);
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp, { passive: false });
    window.addEventListener("pointercancel", onUp, { passive: false });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [computeGridState, props.onCommitBeforeDoc, props.onCommitNextDoc, props.onPreviewNextDoc]);

  if (!props.enabled) return null;
  if (!activeNodeId) return null;
  if (!localRect) return null;

  const startDomRect = domRect ?? {
    x: localRect.x,
    y: localRect.y,
    width: localRect.width,
    height: localRect.height,
  };

  const startDrag = (e: ReactPointerEvent, kind: "move" | "resize", handle?: ResizeHandle) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    props.onStartTransform?.();

    dragRef.current = {
      active: true,
      kind,
      nodeId: activeNodeId,
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startLocalRect: localRect,
      startDomRect,
      beforeDoc: props.doc,
      pointerId: e.pointerId,
      changed: false,
      snapGuide: { x: null, y: null },
    };
  };

  const display = ghostRect ?? startDomRect;
  const dragging = Boolean(dragRef.current?.active);

  const boxStyle: CSSProperties = {
    position: "absolute",
    left: display.x,
    top: display.y,
    width: display.width,
    height: display.height,
    boxSizing: "border-box",
    border: dragging ? "2px dashed #1677ff" : "2px solid #1677ff",
    background: dragging ? "rgba(22,119,255,0.06)" : "transparent",
    boxShadow: dragging ? "0 8px 24px rgba(0,0,0,0.12)" : undefined,
    zIndex: 50,
    pointerEvents: "none",
  };

  const handleStyleBase: CSSProperties = {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 2,
    background: "#ffffff",
    border: "1px solid #1677ff",
    boxSizing: "border-box",
    pointerEvents: "auto",
  };

  const handles: Array<{ h: ResizeHandle; style: CSSProperties; cursor: string }> = [
    { h: "nw", style: { left: -5, top: -5 }, cursor: "nwse-resize" },
    { h: "n", style: { left: "50%", top: -5, marginLeft: -5 }, cursor: "ns-resize" },
    { h: "ne", style: { right: -5, top: -5 }, cursor: "nesw-resize" },
    { h: "e", style: { right: -5, top: "50%", marginTop: -5 }, cursor: "ew-resize" },
    { h: "se", style: { right: -5, bottom: -5 }, cursor: "nwse-resize" },
    { h: "s", style: { left: "50%", bottom: -5, marginLeft: -5 }, cursor: "ns-resize" },
    { h: "sw", style: { left: -5, bottom: -5 }, cursor: "nesw-resize" },
    { h: "w", style: { left: -5, top: "50%", marginTop: -5 }, cursor: "ew-resize" },
  ];

  const gridEl =
    grid && dragging && grid.showGrid ? (
      <div style={{ position: "absolute", left: 0, top: 0, zIndex: 40, pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            left: grid.containerRect.x,
            top: grid.containerRect.y,
            width: grid.containerRect.width,
            height: grid.containerRect.height,
            boxSizing: "border-box",
          }}
        >
          {grid.verticalLines.map((x) => (
            <div
              key={`vx_${x}`}
              style={{
                position: "absolute",
                left: x,
                top: 0,
                width: 1,
                height: "100%",
                background: "rgba(22,119,255,0.10)",
              }}
            />
          ))}
          {grid.horizontalLines.map((y) => (
            <div
              key={`hy_${y}`}
              style={{
                position: "absolute",
                left: 0,
                top: y,
                width: "100%",
                height: 1,
                background: "rgba(22,119,255,0.10)",
              }}
            />
          ))}

          {grid.snapGuide.x ? (
            <div
              style={{
                position: "absolute",
                left: grid.snapGuide.x.pos,
                top: 0,
                width: 2,
                height: "100%",
                background: "rgba(22,119,255,0.7)",
              }}
            />
          ) : null}
          {grid.snapGuide.y ? (
            <div
              style={{
                position: "absolute",
                left: 0,
                top: grid.snapGuide.y.pos,
                width: "100%",
                height: 2,
                background: "rgba(22,119,255,0.7)",
              }}
            />
          ) : null}
        </div>
      </div>
    ) : null;

  return (
    <>
      {gridEl}
      <div style={boxStyle} />
      {handles.map((it) => {
        const left =
          typeof it.style.left === "number"
            ? display.x + it.style.left
            : typeof it.style.right === "number"
              ? display.x + display.width - it.style.right - 10
              : typeof it.style.left === "string" && it.style.left === "50%"
                ? display.x + display.width / 2 - 5
                : display.x;
        const top =
          typeof it.style.top === "number"
            ? display.y + it.style.top
            : typeof it.style.bottom === "number"
              ? display.y + display.height - it.style.bottom - 10
              : typeof it.style.top === "string" && it.style.top === "50%"
                ? display.y + display.height / 2 - 5
                : display.y;
        const marginLeft = typeof it.style.marginLeft === "number" ? it.style.marginLeft : 0;
        const marginTop = typeof it.style.marginTop === "number" ? it.style.marginTop : 0;

        return (
          <div
            key={it.h}
            style={{
              ...handleStyleBase,
              left: Math.round(left + marginLeft),
              top: Math.round(top + marginTop),
              cursor: it.cursor,
              zIndex: 60,
            }}
            onPointerDown={(e) => startDrag(e, "resize", it.h)}
            data-celestial="transform-handle"
          />
        );
      })}
    </>
  );
});
