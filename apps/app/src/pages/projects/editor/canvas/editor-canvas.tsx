import { Button } from "@arclayer/ui/button";
import { Focus, Minus, Plus } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type WheelEvent as ReactWheelEvent,
  type ReactNode,
} from "react";

import {
  fitCanvasViewport,
  panCanvasViewport,
  zoomCanvasViewport,
  type CanvasBounds,
  type CanvasPoint,
  type CanvasViewport,
} from "@/pages/projects/editor/canvas/canvas-engine";

const DEFAULT_MIN_ZOOM = 0.45;
const DEFAULT_MAX_ZOOM = 1.65;
const DEFAULT_FIT_MAX_ZOOM = 1;
const DEFAULT_FIT_PADDING = 64;

interface CanvasPointerDrag {
  pointerId: number;
  x: number;
  y: number;
}

export function useEditorCanvasViewport(options?: {
  initialViewport?: CanvasViewport;
  minZoom?: number;
  maxZoom?: number;
  fitMaxZoom?: number;
  fitPadding?: number;
  fitBottomSafeArea?: number;
  panExclusionSelector?: string;
}) {
  const {
    initialViewport = { x: 0, y: 0, zoom: 1 },
    minZoom = DEFAULT_MIN_ZOOM,
    maxZoom = DEFAULT_MAX_ZOOM,
    fitMaxZoom = DEFAULT_FIT_MAX_ZOOM,
    fitPadding = DEFAULT_FIT_PADDING,
    fitBottomSafeArea = 0,
    panExclusionSelector = "button,a,input,textarea,select,[role='button'],[draggable='true'],[data-canvas-interactive]",
  } = options ?? {};
  const surfaceRef = useRef<HTMLDivElement>(null);
  const pointerDragRef = useRef<CanvasPointerDrag | null>(null);
  const [viewport, setViewport] = useState<CanvasViewport>(initialViewport);

  const setZoom = useCallback(
    (nextZoom: number, anchor?: CanvasPoint) => {
      const surface = surfaceRef.current;
      if (!surface) return;
      const resolvedAnchor = anchor ?? {
        x: surface.clientWidth / 2,
        y: surface.clientHeight / 2,
      };
      setViewport((current) =>
        zoomCanvasViewport(current, nextZoom, resolvedAnchor, minZoom, maxZoom),
      );
    },
    [maxZoom, minZoom],
  );

  const fit = useCallback(
    (bounds: CanvasBounds | null) => {
      const surface = surfaceRef.current;
      if (!surface || !bounds) return;
      const nextViewport = fitCanvasViewport({
        bounds,
        surfaceWidth: surface.clientWidth,
        surfaceHeight: surface.clientHeight,
        minZoom,
        maxZoom,
        fitMaxZoom,
        padding: fitPadding,
        bottomSafeArea: fitBottomSafeArea,
      });
      if (nextViewport) setViewport(nextViewport);
    },
    [fitBottomSafeArea, fitMaxZoom, fitPadding, maxZoom, minZoom],
  );

  const handleWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const rect = event.currentTarget.getBoundingClientRect();
        setZoom(viewport.zoom * (event.deltaY > 0 ? 0.92 : 1.08), {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
        return;
      }
      setViewport((current) => panCanvasViewport(current, { x: -event.deltaX, y: -event.deltaY }));
    },
    [setZoom, viewport.zoom],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const target = event.target;
      if (target instanceof Element && target.closest(panExclusionSelector)) return;
      pointerDragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [panExclusionSelector],
  );

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = { x: event.clientX - drag.x, y: event.clientY - drag.y };
    pointerDragRef.current = { pointerId: drag.pointerId, x: event.clientX, y: event.clientY };
    setViewport((current) => panCanvasViewport(current, delta));
  }, []);

  const endPointerDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerDragRef.current?.pointerId !== event.pointerId) return;
    pointerDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  return {
    surfaceRef,
    viewport,
    setZoom,
    zoomIn: () => setZoom(viewport.zoom + 0.1),
    zoomOut: () => setZoom(viewport.zoom - 0.1),
    fit,
    handlers: {
      onWheel: handleWheel,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: endPointerDrag,
      onPointerCancel: endPointerDrag,
    },
  };
}

export function useCanvasContentBounds<T extends HTMLElement>() {
  const [content, setContent] = useState<T | null>(null);
  const [bounds, setBounds] = useState<CanvasBounds | null>(null);
  const contentRef = useCallback((element: T | null) => setContent(element), []);

  useEffect(() => {
    if (!content) {
      setBounds(null);
      return;
    }
    const updateBounds = () => {
      setBounds({ x: 0, y: 0, width: content.offsetWidth, height: content.offsetHeight });
    };
    const observer = new ResizeObserver(updateBounds);
    observer.observe(content);
    updateBounds();
    return () => observer.disconnect();
  }, [content]);

  return { contentRef, bounds };
}

export function EditorCanvasSurface({
  surfaceRef,
  viewport,
  handlers,
  children,
  worldBounds,
  className,
  ariaLabel,
}: {
  surfaceRef: RefObject<HTMLDivElement | null>;
  viewport: CanvasViewport;
  handlers: {
    onWheel: (event: ReactWheelEvent<HTMLDivElement>) => void;
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  };
  children: ReactNode;
  worldBounds?: CanvasBounds | null;
  className?: string;
  ariaLabel: string;
}) {
  return (
    <div
      ref={surfaceRef}
      role="application"
      aria-label={ariaLabel}
      className={`absolute inset-0 cursor-grab touch-none overflow-hidden active:cursor-grabbing ${className ?? ""}`}
      {...handlers}
    >
      <div
        data-canvas-world=""
        className="absolute top-0 left-0 motion-reduce:transition-none"
        style={{
          width: worldBounds ? Math.max(1, worldBounds.x + worldBounds.width) : undefined,
          height: worldBounds ? Math.max(1, worldBounds.y + worldBounds.height) : undefined,
          transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})`,
          transformOrigin: "0 0",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function EditorCanvasZoomControls({
  zoom,
  onZoomChange,
  onFit,
  labels,
}: {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onFit: () => void;
  labels: { zoomOut: string; zoomIn: string; fit: string };
}) {
  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-border bg-background p-1 shadow-sm">
      <Button
        variant="ghost"
        size="icon-sm"
        className="pointer-events-auto"
        aria-label={labels.zoomOut}
        onClick={() => onZoomChange(zoom - 0.1)}
      >
        <Minus className="size-4" />
      </Button>
      <span className="w-14 text-center font-mono text-caption text-label-secondary tabular-nums">
        {Math.round(zoom * 100)}%
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        className="pointer-events-auto"
        aria-label={labels.zoomIn}
        onClick={() => onZoomChange(zoom + 0.1)}
      >
        <Plus className="size-4" />
      </Button>
      <span className="mx-1 h-5 w-px bg-border" />
      <Button
        variant="ghost"
        size="icon-sm"
        className="pointer-events-auto"
        aria-label={labels.fit}
        onClick={onFit}
      >
        <Focus className="size-4" />
      </Button>
    </div>
  );
}
