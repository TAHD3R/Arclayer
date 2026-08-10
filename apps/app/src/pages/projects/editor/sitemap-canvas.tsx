import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import type { BuilderRevisionPageOut } from "@arclayer/openapi";
import { FileText, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";

import {
  SitemapCanvasTools,
  SitemapZoomControls,
} from "@/pages/projects/editor/sitemap-canvas-controls";
import {
  EditorCanvasSurface,
  useEditorCanvasViewport,
} from "@/pages/projects/editor/canvas/editor-canvas";
import {
  layoutSitemapPages,
  SITEMAP_NODE_WIDTH,
  type PositionedSitemapPage,
} from "@/pages/projects/editor/sitemap-layout";

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
  onReorderPage?: (pageId: string, sortOrder: number) => void;
  reviewPanel?: ReactNode;
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
  onReorderPage,
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
  const positioned = layout.pages;
  const byId = useMemo(() => new Map(positioned.map((page) => [page.itemId, page])), [positioned]);
  const fitCanvas = useCallback(
    () => canvas.fit(positioned.length > 0 ? layout.bounds : null),
    [canvas.fit, layout.bounds, positioned.length],
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
        worldBounds={layout.bounds}
        ariaLabel={t("CREATION_EDITOR_CANVAS_LABEL")}
      >
        <svg
          className="pointer-events-none absolute top-0 left-0 overflow-visible"
          width={layout.bounds.width}
          height={layout.bounds.height}
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
        </svg>
        <div className="absolute top-0 left-0">
          {positioned.map((page) => (
            <button
              key={page.itemId}
              type="button"
              data-sitemap-node=""
              data-canvas-interactive=""
              draggable={Boolean(canEdit && onReorderPage)}
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
              className={cn(
                "absolute flex flex-col rounded-lg border bg-background p-4 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[border-color,box-shadow,transform] duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                selectedPageId === page.itemId
                  ? "border-primary shadow-[0_0_0_1px_var(--primary),0_8px_24px_rgba(0,0,0,0.08)]"
                  : "border-border hover:-translate-y-0.5 hover:border-label-secondary/45 hover:shadow-md",
                dropTargetPageId === page.itemId && "border-primary/70 bg-primary/5",
              )}
              style={{ left: page.x, top: page.y, width: SITEMAP_NODE_WIDTH, height: page.height }}
            >
              <span className="flex size-7 items-center justify-center rounded-md bg-muted text-label-secondary">
                <FileText className="size-4" />
              </span>
              <span className="mt-2 w-full truncate text-body font-semibold text-label-primary">
                {page.title}
              </span>
              <span className="mt-1 w-full truncate font-mono text-caption text-label-secondary">
                {primaryRoute(page)}
              </span>
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
            </button>
          ))}
        </div>
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

      <SitemapZoomControls
        zoom={canvas.viewport.zoom}
        onZoomChange={canvas.setZoom}
        onFit={fitCanvas}
      />
      {reviewPanel}
    </div>
  );
}
