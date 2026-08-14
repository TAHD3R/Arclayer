import { useClientPlatform } from "@arclayer/hooks/use-client-platform";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { Kbd, KbdGroup } from "@arclayer/ui/kbd";
import { ChevronUp } from "lucide-react";
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
const DEFAULT_MAX_ZOOM = 2;
const DEFAULT_FIT_MAX_ZOOM = 1;
const DEFAULT_FIT_PADDING = 64;
const CANVAS_ZOOM_STEP = 0.1;
const CANVAS_ZOOM_PRESETS = [2, 1, 0.5] as const;

type ZoomShortcutKey = "mod" | "shift" | "+" | "−" | "0" | "1";

interface CanvasPointerDrag {
  pointerId: number;
  x: number;
  y: number;
}

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

function resolveZoomShortcutKey(
  key: ZoomShortcutKey,
  platform: ReturnType<typeof useClientPlatform>,
): string {
  if (key === "mod") return platform === "mac" ? "⌘" : "Ctrl";
  if (key === "shift") return platform === "mac" ? "⇧" : "Shift";
  return key;
}

function ZoomMenuShortcut(props: {
  keys: readonly ZoomShortcutKey[];
  platform: ReturnType<typeof useClientPlatform>;
}) {
  return (
    <DropdownMenuShortcut>
      <KbdGroup className="gap-1">
        {props.keys.map((key, index) => (
          <Kbd key={`${key}-${index}`}>{resolveZoomShortcutKey(key, props.platform)}</Kbd>
        ))}
      </KbdGroup>
    </DropdownMenuShortcut>
  );
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
        if (event.deltaY === 0) return;
        const rect = event.currentTarget.getBoundingClientRect();
        setZoom(viewport.zoom * (event.deltaY > 0 ? 0.92 : 1.08), {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
        return;
      }
      if (event.shiftKey) {
        const horizontalDelta = event.deltaX || event.deltaY;
        setViewport((current) => panCanvasViewport(current, { x: -horizontalDelta, y: 0 }));
        return;
      }
      setViewport((current) => panCanvasViewport(current, { x: 0, y: -event.deltaY }));
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
  labels: { zoom: string; zoomOut: string; zoomIn: string; fit: string };
}) {
  const platform = useClientPlatform();
  const percentage = `${Math.round(zoom * 100)}%`;
  const changeZoomBy = useCallback(
    (delta: number) => onZoomChange(Math.round((zoom + delta) * 100) / 100),
    [onZoomChange, zoom],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTextInputTarget(event.target)) return;

      const hasModifier = event.metaKey || event.ctrlKey;
      if (!event.altKey && hasModifier) {
        if (event.key === "+" || event.key === "=") {
          event.preventDefault();
          changeZoomBy(CANVAS_ZOOM_STEP);
          return;
        }
        if (event.key === "-" || event.key === "−") {
          event.preventDefault();
          changeZoomBy(-CANVAS_ZOOM_STEP);
          return;
        }
        if (event.key === "0") {
          event.preventDefault();
          onZoomChange(1);
          return;
        }
      }

      if (!hasModifier && !event.altKey && event.shiftKey && event.code === "Digit1") {
        event.preventDefault();
        onFit();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [changeZoomBy, onFit, onZoomChange]);

  return (
    <div className="pointer-events-none absolute right-4 bottom-4 z-20">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="pointer-events-auto h-10 min-w-24 justify-between rounded-lg bg-background px-3 font-mono font-medium text-label-secondary shadow-sm tabular-nums"
            aria-label={`${labels.zoom}: ${percentage}`}
          >
            <span>{percentage}</span>
            <ChevronUp className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" sideOffset={8} className="w-56 p-2">
          <DropdownMenuGroup className="space-y-1">
            <DropdownMenuItem onSelect={() => changeZoomBy(CANVAS_ZOOM_STEP)}>
              <span>{labels.zoomIn}</span>
              <ZoomMenuShortcut keys={["mod", "+"]} platform={platform} />
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => changeZoomBy(-CANVAS_ZOOM_STEP)}>
              <span>{labels.zoomOut}</span>
              <ZoomMenuShortcut keys={["mod", "−"]} platform={platform} />
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onFit}>
              <span>{labels.fit}</span>
              <ZoomMenuShortcut keys={["shift", "1"]} platform={platform} />
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator className="my-2" />
          <DropdownMenuRadioGroup
            value={String(zoom)}
            onValueChange={(value) => onZoomChange(Number(value))}
            className="space-y-1"
          >
            {CANVAS_ZOOM_PRESETS.map((preset) => (
              <DropdownMenuRadioItem
                key={preset}
                value={String(preset)}
                hideIndicator
                className="justify-between data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground"
              >
                <span>{Math.round(preset * 100)}%</span>
                {preset === 1 ? <ZoomMenuShortcut keys={["mod", "0"]} platform={platform} /> : null}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
