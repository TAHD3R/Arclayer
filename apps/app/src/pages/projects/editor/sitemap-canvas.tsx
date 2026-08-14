import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import type { BuilderRevisionPageOut } from "@arclayer/openapi";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  FileText,
  MoreHorizontal,
  Network,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";

import { SitemapCanvasTools } from "@/pages/projects/editor/sitemap-canvas-controls";
import {
  EditorCanvasSurface,
  EditorCanvasZoomControls,
  useEditorCanvasViewport,
} from "@/pages/projects/editor/canvas/editor-canvas";
import {
  layoutSitemapPages,
  SITEMAP_NODE_WIDTH,
  type PositionedSitemapPage,
} from "@/pages/projects/editor/sitemap-layout";

interface SitemapCanvasProps {
  projectName: string;
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
  onReorderPage?: (pageId: string, sortOrder: number) => void;
  pageDetails?: ReactNode;
  reviewPanel?: ReactNode;
}

function primaryRoute(page: BuilderRevisionPageOut): string {
  return page.routes?.find((route) => route.isActive)?.path ?? page.routes?.[0]?.path ?? "—";
}

export function SitemapCanvas({
  projectName,
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
  onReorderPage,
  pageDetails,
  reviewPanel,
}: SitemapCanvasProps) {
  const { t } = useTranslation("account");
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);
  const [dropTargetPageId, setDropTargetPageId] = useState<string | null>(null);
  const canvas = useEditorCanvasViewport({
    initialViewport: { x: 88, y: 72, zoom: 1 },
    fitPadding: 96,
    fitBottomSafeArea: 72,
  });
  const layout = useMemo(() => layoutSitemapPages(pages), [pages]);
  const worldWidth = Math.max(layout.bounds.width, 320);
  const pageOffsetX = (worldWidth - layout.bounds.width) / 2;
  const pageOffsetY = 92 + 56;
  const positioned = useMemo(
    () =>
      layout.pages.map((page) => ({ ...page, x: page.x + pageOffsetX, y: page.y + pageOffsetY })),
    [layout.pages, pageOffsetX],
  );
  const worldBounds = useMemo(
    () => ({
      x: 0,
      y: 0,
      width: worldWidth,
      height: layout.bounds.height + pageOffsetY,
    }),
    [layout.bounds.height, pageOffsetY, worldWidth],
  );
  const byId = useMemo(() => new Map(positioned.map((page) => [page.itemId, page])), [positioned]);
  const selectedPosition = selectedPageId ? (byId.get(selectedPageId) ?? null) : null;
  const [hoveredPageId, setHoveredPageId] = useState<string | null>(null);
  const fitCanvas = useCallback(
    () => canvas.fit(positioned.length > 0 ? worldBounds : null),
    [canvas.fit, positioned.length, worldBounds],
  );

  useEffect(() => {
    fitCanvas();
  }, [fitCanvas]);

  const handlePageDrop = (targetPage: PositionedSitemapPage) => {
    if (!draggedPageId || !onReorderPage || draggedPageId === targetPage.itemId) return;
    const draggedPage = byId.get(draggedPageId);
    if (!draggedPage || draggedPage.parentItemId !== targetPage.parentItemId) return;
    const siblings = positioned
      .filter((page) => page.parentItemId === targetPage.parentItemId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const targetIndex = siblings.findIndex((page) => page.itemId === targetPage.itemId);
    if (targetIndex < 0) return;
    onReorderPage(draggedPageId, targetIndex);
    setDraggedPageId(null);
    setDropTargetPageId(null);
  };

  return (
    <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-transparent">
      <SitemapCanvasTools
        onAddPage={onAddPage}
        onManageSharedSections={onManageSharedSections}
        onOpenAI={onOpenAI}
        canEdit={canEdit}
        editDisabledReason={editDisabledReason}
        canOpenAI={canOpenAI}
        openAIDisabledReason={openAIDisabledReason}
      />

      <EditorCanvasSurface
        surfaceRef={canvas.surfaceRef}
        viewport={canvas.viewport}
        handlers={canvas.handlers}
        worldBounds={worldBounds}
        ariaLabel={t("CREATION_EDITOR_CANVAS_LABEL")}
      >
        <svg
          className="pointer-events-none absolute top-0 left-0 overflow-visible"
          width={worldBounds.width}
          height={worldBounds.height}
          aria-hidden="true"
        >
          {positioned.map((page) => {
            const parent = page.parentItemId ? byId.get(page.parentItemId) : undefined;
            if (!parent) return null;
            const startX = parent.x + parent.width / 2;
            const startY = parent.y + parent.height;
            const endX = page.x;
            const endY = page.y;
            const bend = startY + (endY - startY) / 2;
            return (
              <path
                key={`${parent.itemId}:${page.itemId}`}
                d={`M ${startX} ${startY} C ${startX} ${bend}, ${endX + page.width / 2} ${bend}, ${endX + page.width / 2} ${endY}`}
                fill="none"
                className="stroke-border"
                strokeWidth="2"
              />
            );
          })}
          {positioned
            .filter((page) => !page.parentItemId)
            .map((page) => {
              const startX = worldWidth / 2;
              const startY = 92;
              const endX = page.x + page.width / 2;
              const endY = page.y;
              const bend = startY + (endY - startY) / 2;
              return (
                <path
                  key={`project:${page.itemId}`}
                  d={`M ${startX} ${startY} C ${startX} ${bend}, ${endX} ${bend}, ${endX} ${endY}`}
                  fill="none"
                  className="stroke-border"
                  strokeWidth="2"
                />
              );
            })}
        </svg>
        <ProjectRootNode projectName={projectName} pageCount={pages.length} />
        <div className="absolute top-0 left-0">
          {positioned.map((page) => (
            <div
              key={page.itemId}
              role="button"
              tabIndex={0}
              data-sitemap-node=""
              data-canvas-interactive=""
              draggable={Boolean(canEdit && onReorderPage)}
              onMouseEnter={() => setHoveredPageId(page.itemId)}
              onMouseLeave={() => setHoveredPageId(null)}
              onDragStart={() => {
                setDraggedPageId(page.itemId);
                setDropTargetPageId(null);
              }}
              onDragOver={(event) => {
                if (!draggedPageId || draggedPageId === page.itemId) return;
                event.preventDefault();
                setDropTargetPageId(page.itemId);
              }}
              onDragLeave={() => {
                if (dropTargetPageId === page.itemId) setDropTargetPageId(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                handlePageDrop(page);
              }}
              onDragEnd={() => {
                setDraggedPageId(null);
                setDropTargetPageId(null);
              }}
              aria-pressed={selectedPageId === page.itemId}
              onClick={() => onSelectPage(page.itemId)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectPage(page.itemId);
                }
              }}
              className={cn(
                "absolute flex flex-col rounded-xl border bg-background text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[border-color,box-shadow,transform] duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                selectedPageId === page.itemId
                  ? "border-primary shadow-[0_0_0_1px_var(--primary),0_8px_24px_rgba(0,0,0,0.08)]"
                  : "border-border hover:-translate-y-0.5 hover:border-label-secondary/45 hover:shadow-md",
                dropTargetPageId === page.itemId && "border-primary/70 bg-primary/5",
              )}
              style={{ left: page.x, top: page.y, width: SITEMAP_NODE_WIDTH, height: page.height }}
            >
              <div className="flex min-h-10 items-center gap-2 rounded-t-xl bg-muted/80 px-3">
                <FileText className="size-4 shrink-0 text-label-secondary" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-footnote font-semibold text-label-primary">
                  {page.title}
                </span>
                <MoreHorizontal
                  className="size-4 shrink-0 text-label-secondary"
                  aria-hidden="true"
                />
              </div>
              <div className="flex min-h-0 flex-1 flex-col p-3">
                <div className="rounded-md border border-border/80 px-2.5 py-2">
                  <span className="block truncate text-caption font-medium text-label-primary">
                    {t("CREATION_EDITOR_SITEMAP_NAVIGATION")}
                  </span>
                  <span className="mt-1 block truncate font-mono text-[11px] text-label-secondary">
                    {primaryRoute(page)}
                  </span>
                </div>
                {page.wireframe?.sections?.length ? (
                  <div className="mt-3 space-y-1.5 border-t border-border/70 pt-2">
                    {page.wireframe.sections.slice(0, 6).map((section) => (
                      <div
                        key={section.id}
                        className="flex min-h-7 items-center justify-between gap-2 rounded border border-border/75 bg-muted/25 px-2 py-1 text-left"
                      >
                        <span className="truncate text-caption font-medium text-label-primary">
                          {section.label}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-label-tertiary">
                          {section.componentKey}
                        </span>
                      </div>
                    ))}
                    {page.wireframe.sections.length > 6 ? (
                      <span className="block text-left text-caption text-label-secondary">
                        +{page.wireframe.sections.length - 6} sections
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {hoveredPageId === page.itemId ? <SitemapNodeArrows /> : null}
            </div>
          ))}
        </div>
        {selectedPosition && pageDetails ? (
          <div
            data-sitemap-page-details=""
            className="absolute z-30 max-h-[min(44rem,calc(100vh-10rem))] w-[min(360px,calc(100vw-3rem))] overflow-y-auto rounded-xl border border-border bg-background/95 p-4 shadow-xl backdrop-blur"
            style={{
              left: Math.max(
                0,
                Math.min(selectedPosition.x + selectedPosition.width + 24, worldBounds.width - 376),
              ),
              top: selectedPosition.y,
            }}
          >
            {pageDetails}
          </div>
        ) : null}
      </EditorCanvasSurface>
      {positioned.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8">
          <div className="pointer-events-auto max-w-md rounded-xl border border-border bg-background p-6 text-center shadow-sm">
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

      <EditorCanvasZoomControls
        zoom={canvas.viewport.zoom}
        onZoomChange={canvas.setZoom}
        onFit={fitCanvas}
        labels={{
          zoom: t("CREATION_EDITOR_ZOOM"),
          zoomOut: t("CREATION_EDITOR_ZOOM_OUT"),
          zoomIn: t("CREATION_EDITOR_ZOOM_IN"),
          fit: t("CREATION_EDITOR_FIT_CANVAS"),
        }}
      />
      {reviewPanel}
    </div>
  );
}

function ProjectRootNode({ projectName, pageCount }: { projectName: string; pageCount: number }) {
  const { t } = useTranslation("account");
  return (
    <div
      data-sitemap-root=""
      className="absolute flex flex-col overflow-hidden rounded-xl border border-primary/45 bg-background shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_25%,transparent),0_10px_30px_rgba(0,0,0,0.08)]"
      style={{ left: "50%", top: 0, width: 320, height: 92, transform: "translateX(-50%)" }}
    >
      <div className="flex min-h-10 items-center gap-2 bg-primary/10 px-3">
        <Network className="size-4 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-footnote font-semibold text-label-primary">
          {t("CREATION_EDITOR_SITEMAP_ROOT")}
        </span>
        <MoreHorizontal className="size-4 text-label-secondary" aria-hidden="true" />
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-between gap-3 px-3 py-2">
        <div className="min-w-0" data-project-name={projectName}>
          <p className="truncate text-body font-semibold text-label-primary">{projectName}</p>
          <p className="truncate text-caption text-label-secondary">
            {t("CREATION_EDITOR_SITEMAP_PROJECT_PROPERTIES")}
          </p>
        </div>
        <span className="shrink-0 rounded-md border border-border bg-muted/40 px-2 py-1 font-mono text-caption text-label-secondary">
          {t("CREATION_EDITOR_SITEMAP_PAGE_COUNT", { count: pageCount })}
        </span>
      </div>
    </div>
  );
}

function SitemapNodeArrows() {
  return (
    <div
      data-sitemap-node-arrows=""
      className="pointer-events-none absolute -inset-8 z-20 text-label-secondary"
      aria-hidden="true"
    >
      <ArrowUp className="absolute top-0 left-1/2 size-4 -translate-x-1/2" />
      <ArrowDown className="absolute bottom-0 left-1/2 size-4 -translate-x-1/2" />
      <ArrowLeft className="absolute top-1/2 left-0 size-4 -translate-y-1/2" />
      <ArrowRight className="absolute top-1/2 right-0 size-4 -translate-y-1/2" />
    </div>
  );
}
