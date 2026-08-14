import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import type { BuilderRevisionGlobalSectionOut, BuilderRevisionPageOut } from "@arclayer/openapi";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  FileText,
  GripVertical,
  Network,
  Plus,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DragEvent as ReactDragEvent, ReactNode } from "react";

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
import {
  collectSitemapSectionRows,
  type SitemapSectionRow,
} from "@/pages/projects/editor/sitemap-section-rows";
import { SitemapPageMenu, SitemapSectionMenu } from "@/pages/projects/editor/sitemap-node-menus";
import type { AiEditorContext } from "@/stores/use-ai-chat-store";

export interface SitemapAddPagePlacement {
  pageId: string;
  position: "before" | "after";
}

interface SitemapCanvasProps {
  projectName: string;
  pages: BuilderRevisionPageOut[];
  globalSections: readonly BuilderRevisionGlobalSectionOut[];
  selectedPageId: string | null;
  selectedSectionId: string | null;
  onSelectSection: (pageId: string, sectionId: string | null) => void;
  onOpenAI: (context?: AiEditorContext) => void;
  onAddPage: (placement: SitemapAddPagePlacement, anchor: HTMLElement) => void;
  onAddPageAtRoot: (anchor: HTMLElement) => void;
  onAddSection: (pageId: string, insertIndex: number, anchor: HTMLElement) => void;
  onManageSharedSections: (anchor: HTMLElement) => void;
  onRenamePage: (pageId: string, title: string) => void;
  onDeletePage: (pageId: string) => void;
  onRenameSection: (pageId: string, sectionId: string, label: string) => void;
  onDeleteSection: (pageId: string, sectionId: string) => void;
  onReorderSection: (pageId: string, sectionId: string, targetIndex: number) => void;
  onReorderPage?: (pageId: string, sortOrder: number) => void;
  onFindInWireframe?: (pageId: string) => void;
  canEdit: boolean;
  editDisabledReason: string;
  canOpenAI: boolean;
  openAIDisabledReason: string;
  reviewPanel?: ReactNode;
}

export function SitemapCanvas({
  projectName,
  pages,
  globalSections,
  selectedPageId,
  selectedSectionId,
  onSelectSection,
  onOpenAI,
  onAddPage,
  onAddPageAtRoot,
  onAddSection,
  onManageSharedSections,
  onRenamePage,
  onDeletePage,
  onRenameSection,
  onDeleteSection,
  onReorderSection,
  onReorderPage,
  onFindInWireframe,
  canEdit,
  editDisabledReason,
  canOpenAI,
  openAIDisabledReason,
  reviewPanel,
}: SitemapCanvasProps) {
  const { t } = useTranslation("account");
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);
  const [dropTargetPageId, setDropTargetPageId] = useState<string | null>(null);
  const [draggedSectionKey, setDraggedSectionKey] = useState<string | null>(null);
  const [dropTargetSectionKey, setDropTargetSectionKey] = useState<string | null>(null);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [pageDraft, setPageDraft] = useState("");
  const [editingSectionKey, setEditingSectionKey] = useState<string | null>(null);
  const [sectionDraft, setSectionDraft] = useState("");
  const [hoveredPageId, setHoveredPageId] = useState<string | null>(null);
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

  const handleSectionDrop = (
    page: PositionedSitemapPage,
    row: SitemapSectionRow,
    index: number,
  ) => {
    if (!draggedSectionKey) return;
    const [dragPageId, dragSectionId] = draggedSectionKey.split("::");
    if (dragPageId !== page.itemId || dragSectionId === row.id) {
      setDraggedSectionKey(null);
      setDropTargetSectionKey(null);
      return;
    }
    onReorderSection(page.itemId, dragSectionId, index);
    setDraggedSectionKey(null);
    setDropTargetSectionKey(null);
  };

  const commitPageRename = (page: PositionedSitemapPage) => {
    const nextTitle = pageDraft.trim();
    if (nextTitle && nextTitle !== page.title) onRenamePage(page.itemId, nextTitle);
    setEditingPageId(null);
  };

  const commitSectionRename = (pageId: string, row: SitemapSectionRow) => {
    const nextLabel = sectionDraft.trim();
    if (nextLabel && nextLabel !== row.title) onRenameSection(pageId, row.id, nextLabel);
    setEditingSectionKey(null);
  };

  return (
    <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-transparent">
      <SitemapCanvasTools
        onAddPage={onAddPageAtRoot}
        onAddSection={(anchor) => selectedPageId && onAddSection(selectedPageId, -1, anchor)}
        onManageSharedSections={onManageSharedSections}
        onOpenAI={() => onOpenAI()}
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
          {positioned.map((page) => {
            const rows = collectSitemapSectionRows(page, globalSections);
            const isNodeActive =
              hoveredPageId === page.itemId ||
              selectedPageId === page.itemId ||
              editingPageId === page.itemId;
            return (
              <div
                key={page.itemId}
                data-sitemap-node=""
                data-canvas-interactive=""
                draggable={Boolean(canEdit && onReorderPage) && editingPageId !== page.itemId}
                onMouseEnter={() => setHoveredPageId(page.itemId)}
                onMouseLeave={() =>
                  setHoveredPageId((current) => (current === page.itemId ? null : current))
                }
                onDragStart={(event: ReactDragEvent<HTMLDivElement>) => {
                  setDraggedPageId(page.itemId);
                  setDropTargetPageId(null);
                  event.dataTransfer.effectAllowed = "move";
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
                onClick={() => onSelectSection(page.itemId, null)}
                className={cn(
                  "group/node absolute flex flex-col rounded-xl border bg-background text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[border-color,box-shadow,transform] duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                  isNodeActive && "z-40",
                  selectedPageId === page.itemId
                    ? "border-primary shadow-[0_0_0_1px_var(--primary),0_8px_24px_rgba(0,0,0,0.08)]"
                    : "border-border hover:-translate-y-0.5 hover:border-label-secondary/45 hover:shadow-md",
                  dropTargetPageId === page.itemId && "border-primary/70 bg-primary/5",
                )}
                style={{
                  left: page.x,
                  top: page.y,
                  width: SITEMAP_NODE_WIDTH,
                  height: page.height,
                }}
              >
                <div className="flex min-h-10 items-center gap-1.5 rounded-t-xl bg-muted/80 pr-2 pl-3">
                  <FileText className="size-4 shrink-0 text-label-secondary" aria-hidden="true" />
                  {editingPageId === page.itemId ? (
                    <input
                      data-canvas-interactive=""
                      value={pageDraft}
                      autoFocus
                      aria-label={t("CREATION_EDITOR_SITEMAP_NODE_RENAME_INPUT")}
                      onChange={(event) => setPageDraft(event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Escape") setEditingPageId(null);
                        if (event.key === "Enter") commitPageRename(page);
                      }}
                      onBlur={() => commitPageRename(page)}
                      className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-footnote font-semibold text-label-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    />
                  ) : (
                    <button
                      type="button"
                      data-canvas-interactive=""
                      title={page.title}
                      aria-label={t("CREATION_EDITOR_SITEMAP_PAGE_RENAME_TRIGGER", {
                        page: page.title,
                      })}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectSection(page.itemId, null);
                        if (canEdit) {
                          setPageDraft(page.title);
                          setEditingPageId(page.itemId);
                        }
                      }}
                      className="min-w-0 flex-1 truncate rounded-md px-1 text-left text-footnote font-semibold text-label-primary hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      {page.title}
                    </button>
                  )}
                  <div
                    data-sitemap-node-actions=""
                    className={cn(
                      "absolute top-11 right-3 z-10 flex items-center gap-0.5 rounded-md border border-border bg-background/95 p-0.5 shadow-sm transition-opacity",
                      isNodeActive ? "opacity-100" : "pointer-events-none opacity-0",
                    )}
                  >
                    <NodeActionButton
                      label={t("CREATION_EDITOR_SITEMAP_ADD_PAGE_BEFORE")}
                      icon={ArrowLeft}
                      disabled={!canEdit}
                      onClick={(anchor) =>
                        onAddPage({ pageId: page.itemId, position: "before" }, anchor)
                      }
                    />
                    <NodeActionButton
                      label={t("CREATION_EDITOR_SITEMAP_ADD_PAGE_AFTER")}
                      icon={ArrowRight}
                      disabled={!canEdit}
                      onClick={(anchor) =>
                        onAddPage({ pageId: page.itemId, position: "after" }, anchor)
                      }
                    />
                    <NodeActionButton
                      label={t("CREATION_EDITOR_SITEMAP_ADD_SECTION")}
                      icon={Plus}
                      disabled={!canEdit}
                      onClick={(anchor) => onAddSection(page.itemId, rows.length, anchor)}
                    />
                    {canEdit ? (
                      <SitemapPageMenu
                        onAskAI={() =>
                          onOpenAI({
                            stage: "sitemap",
                            pageId: page.itemId,
                            pageLabel: page.title,
                            targetKind: "page",
                            targetId: page.itemId,
                            label: page.title,
                          })
                        }
                        onRename={() => {
                          setPageDraft(page.title);
                          setEditingPageId(page.itemId);
                        }}
                        onAddPageBefore={(anchor) =>
                          onAddPage({ pageId: page.itemId, position: "before" }, anchor)
                        }
                        onAddPageAfter={(anchor) =>
                          onAddPage({ pageId: page.itemId, position: "after" }, anchor)
                        }
                        onAddSection={(anchor) => onAddSection(page.itemId, rows.length, anchor)}
                        onFindInWireframe={
                          onFindInWireframe ? () => onFindInWireframe(page.itemId) : undefined
                        }
                        onDelete={() => onDeletePage(page.itemId)}
                      />
                    ) : null}
                  </div>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-1 p-2.5">
                  {rows.length ? (
                    rows.map((row, index) => (
                      <SitemapSectionRowView
                        key={row.id}
                        page={page}
                        row={row}
                        index={index}
                        selected={selectedPageId === page.itemId && selectedSectionId === row.id}
                        dropTarget={dropTargetSectionKey === `${page.itemId}::${row.id}`}
                        dragged={draggedSectionKey === `${page.itemId}::${row.id}`}
                        editing={editingSectionKey === `${page.itemId}::${row.id}`}
                        draft={sectionDraft}
                        canEdit={canEdit}
                        canOpenAI={canOpenAI}
                        onDraftChange={setSectionDraft}
                        onStartEdit={() => {
                          setSectionDraft(row.title);
                          setEditingSectionKey(`${page.itemId}::${row.id}`);
                        }}
                        onCommitEdit={() => commitSectionRename(page.itemId, row)}
                        onCancelEdit={() => setEditingSectionKey(null)}
                        onSelect={() => onSelectSection(page.itemId, row.id)}
                        onOpenAI={(context) => onOpenAI(context)}
                        onInsertAbove={(anchor) => onAddSection(page.itemId, index, anchor)}
                        onInsertBelow={(anchor) => onAddSection(page.itemId, index + 1, anchor)}
                        onDelete={() => onDeleteSection(page.itemId, row.id)}
                        onDragStart={() => setDraggedSectionKey(`${page.itemId}::${row.id}`)}
                        onDragOver={(event) => {
                          if (
                            !draggedSectionKey ||
                            draggedSectionKey === `${page.itemId}::${row.id}`
                          )
                            return;
                          event.preventDefault();
                          setDropTargetSectionKey(`${page.itemId}::${row.id}`);
                        }}
                        onDragLeave={() => {
                          if (dropTargetSectionKey === `${page.itemId}::${row.id}`)
                            setDropTargetSectionKey(null);
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleSectionDrop(page, row, index);
                        }}
                        onDragEnd={() => {
                          setDraggedSectionKey(null);
                          setDropTargetSectionKey(null);
                        }}
                      />
                    ))
                  ) : (
                    <button
                      type="button"
                      data-canvas-interactive=""
                      disabled={!canEdit}
                      onClick={(event) => {
                        event.stopPropagation();
                        onAddSection(page.itemId, 0, event.currentTarget);
                      }}
                      className="flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-dashed border-border text-caption text-label-secondary transition-colors hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Plus className="size-3.5" aria-hidden="true" />
                      {t("CREATION_EDITOR_SITEMAP_ADD_SECTION_EMPTY")}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
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
              onClick={() => onOpenAI()}
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

function SitemapSectionRowView({
  page,
  row,
  index,
  selected,
  dropTarget,
  dragged,
  editing,
  draft,
  canEdit,
  canOpenAI,
  onDraftChange,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onSelect,
  onOpenAI,
  onInsertAbove,
  onInsertBelow,
  onDelete,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  page: PositionedSitemapPage;
  row: SitemapSectionRow;
  index: number;
  selected: boolean;
  dropTarget: boolean;
  dragged: boolean;
  editing: boolean;
  draft: string;
  canEdit: boolean;
  canOpenAI: boolean;
  onDraftChange: (value: string) => void;
  onStartEdit: () => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onSelect: () => void;
  onOpenAI: (context?: AiEditorContext) => void;
  onInsertAbove: (anchor: HTMLElement) => void;
  onInsertBelow: (anchor: HTMLElement) => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}) {
  const { t } = useTranslation("account");
  const isGlobal = row.globalReferenceId !== null;
  const draggable = canEdit && row.editable && !editing;
  return (
    <div
      data-sitemap-section-row=""
      data-canvas-interactive=""
      draggable={draggable}
      onDragStart={(event) => {
        onDragStart();
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      className={cn(
        "group/section relative rounded-md border px-2 py-1 pr-24 text-left transition-colors",
        isGlobal
          ? "border-primary/35 bg-primary/[0.04] hover:border-primary/60 hover:bg-primary/10"
          : "border-border/75 bg-muted/25 hover:border-label-secondary/45 hover:bg-muted/60",
        selected && "border-primary shadow-[0_0_0_1px_var(--primary)]",
        dropTarget && "border-primary/70",
        dragged && "opacity-50",
      )}
    >
      <div className="flex items-center gap-1">
        {draggable ? (
          <GripVertical
            className="absolute top-1/2 -left-5 size-3.5 -translate-y-1/2 text-label-tertiary opacity-0 transition-opacity group-hover/section:opacity-100"
            aria-hidden="true"
          />
        ) : null}
        {editing ? (
          <input
            data-canvas-interactive=""
            value={draft}
            autoFocus
            aria-label={t("CREATION_EDITOR_SITEMAP_SECTION_RENAME_INPUT")}
            onChange={(event) => onDraftChange(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Escape") onCancelEdit();
              if (event.key === "Enter") onCommitEdit();
            }}
            onBlur={onCommitEdit}
            className="h-6 min-w-0 flex-1 rounded border border-border bg-background px-1.5 text-caption font-medium text-label-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          />
        ) : (
          <button
            type="button"
            data-canvas-interactive=""
            title={row.title}
            aria-label={t("CREATION_EDITOR_SITEMAP_SECTION_RENAME_TRIGGER", {
              section: row.title,
            })}
            onClick={(event) => {
              event.stopPropagation();
              onSelect();
              if (canEdit && row.editable) onStartEdit();
            }}
            className="min-w-0 flex-1 truncate rounded px-0.5 text-left text-caption font-medium text-label-primary hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {index + 1}. {row.title}
          </button>
        )}
        {isGlobal ? (
          <span className="shrink-0 rounded-sm border border-primary/40 bg-primary/10 px-1 font-mono text-[10px] leading-4 text-primary">
            {t("CREATION_EDITOR_SITEMAP_GLOBAL_BADGE")}
          </span>
        ) : null}
      </div>
      {row.description ? (
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-label-tertiary">
          {row.description}
        </p>
      ) : null}
      <div
        data-sitemap-section-actions=""
        className={cn(
          "absolute top-1/2 right-1.5 z-10 flex -translate-y-1/2 items-center gap-0.5 rounded-md border border-border/80 bg-background/95 p-0.5 shadow-sm transition-opacity",
          selected
            ? "opacity-100"
            : "opacity-0 group-hover/section:opacity-100 focus-within:opacity-100",
        )}
      >
        <NodeActionButton
          label={t("CREATION_EDITOR_SITEMAP_INSERT_ABOVE")}
          icon={ArrowUp}
          disabled={!canEdit}
          onClick={onInsertAbove}
        />
        <NodeActionButton
          label={t("CREATION_EDITOR_SITEMAP_INSERT_BELOW")}
          icon={ArrowDown}
          disabled={!canEdit}
          onClick={onInsertBelow}
        />
        {canOpenAI ? (
          <NodeActionButton
            label={t("CREATION_EDITOR_SITEMAP_SECTION_ASK_AI")}
            icon={Sparkles}
            accent
            onClick={() =>
              onOpenAI({
                stage: "sitemap",
                pageId: page.itemId,
                pageLabel: page.title,
                targetKind: "section",
                targetId: row.id,
                label: row.title,
              })
            }
          />
        ) : null}
        {canEdit ? (
          <SitemapSectionMenu
            editable={row.editable}
            onAskAI={() =>
              onOpenAI({
                stage: "sitemap",
                pageId: page.itemId,
                pageLabel: page.title,
                targetKind: "section",
                targetId: row.id,
                label: row.title,
              })
            }
            onInsertAbove={onInsertAbove}
            onInsertBelow={onInsertBelow}
            onDelete={onDelete}
          />
        ) : null}
      </div>
    </div>
  );
}

function NodeActionButton({
  label,
  icon: Icon,
  onClick,
  disabled,
  accent,
}: {
  label: string;
  icon: typeof Plus;
  onClick: (anchor: HTMLElement) => void;
  disabled?: boolean;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      data-canvas-interactive=""
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick(event.currentTarget);
      }}
      className={cn(
        "flex size-6 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50",
        accent
          ? "text-label-secondary hover:bg-accent hover:text-primary"
          : "text-label-secondary hover:bg-accent hover:text-label-primary",
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
    </button>
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
