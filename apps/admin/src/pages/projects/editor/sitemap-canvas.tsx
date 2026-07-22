import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import type { BuilderRevisionPageOut } from "@arclayer/openapi";
import { FileText, Sparkles } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { useTranslation } from "react-i18next";

import {
  SitemapCanvasTools,
  SitemapZoomControls,
} from "@/pages/projects/editor/sitemap-canvas-controls";

const NODE_WIDTH = 244;
const NODE_HEIGHT = 104;
const COLUMN_GAP = 92;
const ROW_GAP = 44;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.65;

type PositionedPage = BuilderRevisionPageOut & { x: number; y: number };

interface SitemapCanvasProps {
  pages: BuilderRevisionPageOut[];
  selectedPageId: string | null;
  onSelectPage: (pageId: string) => void;
  onOpenAI: () => void;
  onAddPage: () => void;
  onManageSharedSections: () => void;
  canEdit: boolean;
  editDisabledReason: string;
  canOpenAI: boolean;
  openAIDisabledReason: string;
}

function layoutPages(pages: BuilderRevisionPageOut[]): PositionedPage[] {
  const byId = new Map(pages.map((page) => [page.itemId, page]));
  const children = new Map<string | null, BuilderRevisionPageOut[]>();
  for (const page of pages) {
    const parentId = page.parentItemId && byId.has(page.parentItemId) ? page.parentItemId : null;
    const siblings = children.get(parentId) ?? [];
    siblings.push(page);
    children.set(parentId, siblings);
  }
  for (const siblings of children.values()) siblings.sort((a, b) => a.sortOrder - b.sortOrder);

  const positioned: PositionedPage[] = [];
  const visited = new Set<string>();
  let row = 0;
  const visit = (page: BuilderRevisionPageOut, depth: number) => {
    if (visited.has(page.itemId)) return;
    visited.add(page.itemId);
    positioned.push({
      ...page,
      x: depth * (NODE_WIDTH + COLUMN_GAP),
      y: row * (NODE_HEIGHT + ROW_GAP),
    });
    row += 1;
    for (const child of children.get(page.itemId) ?? []) visit(child, depth + 1);
  };
  for (const root of children.get(null) ?? []) visit(root, 0);
  for (const page of pages) visit(page, 0);
  return positioned;
}

function primaryRoute(page: BuilderRevisionPageOut): string {
  return page.routes?.find((route) => route.isActive)?.path ?? page.routes?.[0]?.path ?? "—";
}

export function SitemapCanvas({
  pages,
  selectedPageId,
  onSelectPage,
  onOpenAI,
  onAddPage,
  onManageSharedSections,
  canEdit,
  editDisabledReason,
  canOpenAI,
  openAIDisabledReason,
}: SitemapCanvasProps) {
  const { t } = useTranslation("account");
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [viewport, setViewport] = useState({ x: 88, y: 72, zoom: 1 });
  const positioned = useMemo(() => layoutPages(pages), [pages]);
  const byId = useMemo(() => new Map(positioned.map((page) => [page.itemId, page])), [positioned]);
  const bounds = useMemo(() => {
    const width = Math.max(...positioned.map((page) => page.x + NODE_WIDTH), NODE_WIDTH);
    const height = Math.max(...positioned.map((page) => page.y + NODE_HEIGHT), NODE_HEIGHT);
    return { width, height };
  }, [positioned]);

  const fitCanvas = useCallback(() => {
    const surface = surfaceRef.current;
    if (!surface || positioned.length === 0) return;
    const padding = 128;
    const zoom = Math.min(
      1,
      Math.max(
        MIN_ZOOM,
        Math.min(
          (surface.clientWidth - padding) / bounds.width,
          (surface.clientHeight - padding) / bounds.height,
        ),
      ),
    );
    setViewport({
      zoom,
      x: Math.max(48, (surface.clientWidth - bounds.width * zoom) / 2),
      y: Math.max(48, (surface.clientHeight - bounds.height * zoom) / 2),
    });
  }, [bounds.height, bounds.width, positioned.length]);

  useEffect(() => {
    fitCanvas();
  }, [fitCanvas]);

  const setZoom = (nextZoom: number) => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
    const centerX = surface.clientWidth / 2;
    const centerY = surface.clientHeight / 2;
    setViewport((current) => ({
      zoom,
      x: centerX - ((centerX - current.x) / current.zoom) * zoom,
      y: centerY - ((centerY - current.y) / current.zoom) * zoom,
    }));
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      setZoom(viewport.zoom * (event.deltaY > 0 ? 0.92 : 1.08));
      return;
    }
    setViewport((current) => ({
      ...current,
      x: current.x - event.deltaX,
      y: current.y - event.deltaY,
    }));
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("[data-sitemap-node]")) return;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    dragRef.current = { ...drag, x: event.clientX, y: event.clientY };
    setViewport((current) => ({ ...current, x: current.x + deltaX, y: current.y + deltaY }));
  };

  const endPointerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-[#f7f8fa] dark:bg-[#090a0b]">
      <SitemapCanvasTools
        onAddPage={onAddPage}
        onManageSharedSections={onManageSharedSections}
        onOpenAI={onOpenAI}
        canEdit={canEdit}
        editDisabledReason={editDisabledReason}
        canOpenAI={canOpenAI}
        openAIDisabledReason={openAIDisabledReason}
      />

      <div
        ref={surfaceRef}
        role="application"
        aria-label={t("CREATION_EDITOR_CANVAS_LABEL")}
        className="absolute inset-0 cursor-grab touch-none overflow-hidden active:cursor-grabbing"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPointerDrag}
        onPointerCancel={endPointerDrag}
      >
        <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
          <defs>
            <pattern id="sitemap-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" className="fill-border/55" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#sitemap-grid)" />
        </svg>
        <svg
          className="pointer-events-none absolute top-0 left-0 overflow-visible"
          width={bounds.width}
          height={bounds.height}
          style={{
            transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})`,
            transformOrigin: "0 0",
          }}
          aria-hidden="true"
        >
          {positioned.map((page) => {
            const parent = page.parentItemId ? byId.get(page.parentItemId) : undefined;
            if (!parent) return null;
            const startX = parent.x + NODE_WIDTH;
            const startY = parent.y + NODE_HEIGHT / 2;
            const endX = page.x;
            const endY = page.y + NODE_HEIGHT / 2;
            const bend = startX + (endX - startX) / 2;
            return (
              <path
                key={`${parent.itemId}:${page.itemId}`}
                d={`M ${startX} ${startY} C ${bend} ${startY}, ${bend} ${endY}, ${endX} ${endY}`}
                fill="none"
                className="stroke-border"
                strokeWidth="2"
              />
            );
          })}
        </svg>
        <div
          className="absolute top-0 left-0 motion-reduce:transition-none"
          style={{
            width: bounds.width,
            height: bounds.height,
            transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {positioned.map((page) => (
            <button
              key={page.itemId}
              type="button"
              data-sitemap-node=""
              aria-pressed={selectedPageId === page.itemId}
              onClick={() => onSelectPage(page.itemId)}
              className={cn(
                "absolute flex flex-col rounded-lg border bg-background p-4 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[border-color,box-shadow,transform] duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                selectedPageId === page.itemId
                  ? "border-primary shadow-[0_0_0_1px_var(--primary),0_8px_24px_rgba(0,0,0,0.08)]"
                  : "border-border hover:-translate-y-0.5 hover:border-label-secondary/45 hover:shadow-md",
              )}
              style={{ left: page.x, top: page.y, width: NODE_WIDTH, height: NODE_HEIGHT }}
            >
              <span className="mb-3 flex size-7 items-center justify-center rounded-md bg-muted text-label-secondary">
                <FileText className="size-4" />
              </span>
              <span className="w-full truncate text-body font-semibold text-label-primary">
                {page.title}
              </span>
              <span className="mt-1 w-full truncate font-mono text-caption text-label-secondary">
                {primaryRoute(page)}
              </span>
            </button>
          ))}
        </div>
        {positioned.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center px-8">
            <div className="max-w-md rounded-xl border border-border bg-background p-6 text-center shadow-sm">
              <span className="mx-auto flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="size-5" />
              </span>
              <h2 className="mt-4 text-title-3 font-semibold text-label-primary">
                {t("CREATION_EDITOR_EMPTY_TITLE")}
              </h2>
              <p className="mt-2 text-footnote leading-5 text-label-secondary">
                {t("CREATION_EDITOR_EMPTY_DESC")}
              </p>
              <Button
                className="mt-5"
                onClick={onOpenAI}
                disabled={!canOpenAI}
                title={!canOpenAI ? openAIDisabledReason : undefined}
              >
                <Sparkles className="size-4" />
                {t("CREATION_EDITOR_EMPTY_ACTION")}
              </Button>
              {!canOpenAI ? (
                <p className="mt-2 text-caption text-label-secondary">{openAIDisabledReason}</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <SitemapZoomControls zoom={viewport.zoom} onZoomChange={setZoom} onFit={fitCanvas} />
    </div>
  );
}
