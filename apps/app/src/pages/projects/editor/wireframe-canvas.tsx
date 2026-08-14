import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import type { BuilderRevisionPageOut, WireframeSectionV1Output } from "@arclayer/openapi";
import {
  GripVertical,
  Monitor,
  PanelsTopLeft,
  Smartphone,
  Tablet,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { DragEvent as ReactDragEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { BaseTag } from "@/components/ui/tags";
import {
  EditorCanvasSurface,
  EditorCanvasZoomControls,
  useCanvasContentBounds,
  useEditorCanvasViewport,
} from "@/pages/projects/editor/canvas/editor-canvas";
import { WireframePageRail } from "@/pages/projects/editor/wireframe-page-rail";

type WireframeViewport = "desktop" | "tablet" | "mobile";

const VIEWPORT_WIDTH: Record<WireframeViewport, number> = {
  desktop: 920,
  tablet: 680,
  mobile: 390,
};

interface WireframeCanvasProps {
  pages: BuilderRevisionPageOut[];
  selectedPageId: string | null;
  onSelectPage: (pageId: string) => void;
  selectedSectionId: string | null;
  onSelectSection: (sectionId: string | null) => void;
  reviewPanel?: ReactNode;
  candidateActive?: boolean;
  canEdit?: boolean;
  onReorderSection?: (sectionId: string, index: number) => void;
}

export function WireframeCanvas({
  pages,
  selectedPageId,
  onSelectPage,
  selectedSectionId,
  onSelectSection,
  reviewPanel,
  candidateActive = false,
  canEdit = false,
  onReorderSection,
}: WireframeCanvasProps) {
  const { t } = useTranslation("account");
  const [viewport, setViewport] = useState<WireframeViewport>("desktop");
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null);
  const [dropTargetSectionId, setDropTargetSectionId] = useState<string | null>(null);
  const page = pages.find((candidate) => candidate.itemId === selectedPageId) ?? pages[0] ?? null;
  const sections = page?.wireframe?.sections ?? [];
  const canvas = useEditorCanvasViewport({
    initialViewport: { x: 0, y: 32, zoom: 0.8 },
    fitPadding: 56,
    fitBottomSafeArea: 48,
  });
  const { contentRef, bounds: contentBounds } = useCanvasContentBounds<HTMLElement>();

  const handleSectionDrop = (targetSectionId: string) => {
    if (!draggedSectionId || draggedSectionId === targetSectionId || !onReorderSection) return;
    const targetIndex = sections.findIndex((section) => section.id === targetSectionId);
    if (targetIndex < 0) return;
    onReorderSection(draggedSectionId, targetIndex);
    setDraggedSectionId(null);
    setDropTargetSectionId(null);
  };

  useEffect(() => {
    if (selectedSectionId && sections.some((section) => section.id === selectedSectionId)) return;
    onSelectSection(sections[0]?.id ?? null);
  }, [onSelectSection, sections, selectedSectionId]);

  useEffect(() => {
    canvas.fit(contentBounds);
  }, [canvas.fit, contentBounds, page?.itemId, viewport]);

  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 bg-transparent"
      aria-label={t("CREATION_EDITOR_WIREFRAME_CANVAS_LABEL")}
    >
      <WireframePageRail
        pages={pages}
        selectedPageId={page?.itemId ?? null}
        onSelectPage={onSelectPage}
      />
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <div className="absolute top-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-border bg-background p-1 shadow-sm">
          <ViewportButton
            viewport="desktop"
            current={viewport}
            icon={Monitor}
            label={t("CREATION_EDITOR_WIREFRAME_VIEWPORT_DESKTOP")}
            onChange={setViewport}
          />
          <ViewportButton
            viewport="tablet"
            current={viewport}
            icon={Tablet}
            label={t("CREATION_EDITOR_WIREFRAME_VIEWPORT_TABLET")}
            onChange={setViewport}
          />
          <ViewportButton
            viewport="mobile"
            current={viewport}
            icon={Smartphone}
            label={t("CREATION_EDITOR_WIREFRAME_VIEWPORT_MOBILE")}
            onChange={setViewport}
          />
        </div>
        <EditorCanvasSurface
          surfaceRef={canvas.surfaceRef}
          viewport={canvas.viewport}
          handlers={canvas.handlers}
          worldBounds={contentBounds}
          ariaLabel={t("CREATION_EDITOR_WIREFRAME_CANVAS_LABEL")}
        >
          {page?.wireframe ? (
            <article
              ref={contentRef}
              className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
              aria-label={t("CREATION_EDITOR_WIREFRAME_PAGE_FRAME", { page: page.title })}
              style={{ width: VIEWPORT_WIDTH[viewport] }}
            >
              <header className="flex items-start justify-between gap-6 border-b border-border px-6 py-5">
                <div className="min-w-0">
                  <p className="text-caption font-medium text-label-secondary">
                    {t("CREATION_EDITOR_WIREFRAME_PAGE_LABEL")}
                  </p>
                  <h2 className="mt-1 truncate text-title-3 font-semibold text-label-primary">
                    {page.title}
                  </h2>
                </div>
                <BaseTag>
                  {t(
                    candidateActive
                      ? "CREATION_EDITOR_WIREFRAME_CANDIDATE_ACTIVE"
                      : "CREATION_EDITOR_WIREFRAME_REVISION_PINNED",
                  )}
                </BaseTag>
              </header>
              {sections.length > 0 ? (
                <ol className="relative space-y-4 px-6 py-6 before:absolute before:top-8 before:bottom-8 before:left-9 before:w-px before:bg-border">
                  {sections.map((section, index) => (
                    <WireframeSection
                      key={section.id}
                      section={section}
                      index={index}
                      selected={selectedSectionId === section.id}
                      draggable={canEdit && Boolean(onReorderSection)}
                      dropTarget={dropTargetSectionId === section.id}
                      onDragStart={() => setDraggedSectionId(section.id)}
                      onDragOver={(event) => {
                        if (!draggedSectionId || draggedSectionId === section.id) return;
                        event.preventDefault();
                        setDropTargetSectionId(section.id);
                      }}
                      onDragLeave={() => {
                        if (dropTargetSectionId === section.id) setDropTargetSectionId(null);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        handleSectionDrop(section.id);
                      }}
                      onDragEnd={() => {
                        setDraggedSectionId(null);
                        setDropTargetSectionId(null);
                      }}
                      onSelect={() => onSelectSection(section.id)}
                    />
                  ))}
                </ol>
              ) : (
                <div className="px-6 py-12">
                  <WireframeEmpty
                    title={t("CREATION_EDITOR_WIREFRAME_SECTIONS_EMPTY_TITLE")}
                    description={t("CREATION_EDITOR_WIREFRAME_SECTIONS_EMPTY_DESC")}
                    compact
                  />
                </div>
              )}
            </article>
          ) : null}
        </EditorCanvasSurface>
        {!page ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8">
            <div className="pointer-events-auto">
              <WireframeEmpty
                title={t("CREATION_EDITOR_WIREFRAME_PAGE_REQUIRED_TITLE")}
                description={t("CREATION_EDITOR_WIREFRAME_PAGE_REQUIRED_DESC")}
              />
            </div>
          </div>
        ) : !page.wireframe ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8">
            <div className="pointer-events-auto">
              <WireframeEmpty
                title={t("CREATION_EDITOR_WIREFRAME_EMPTY_TITLE")}
                description={t("CREATION_EDITOR_WIREFRAME_EMPTY_DESC")}
              />
            </div>
          </div>
        ) : null}
        <EditorCanvasZoomControls
          zoom={canvas.viewport.zoom}
          onZoomChange={canvas.setZoom}
          onFit={() => canvas.fit(contentBounds)}
          labels={{
            zoom: t("CREATION_EDITOR_ZOOM"),
            zoomOut: t("CREATION_EDITOR_WIREFRAME_ZOOM_OUT"),
            zoomIn: t("CREATION_EDITOR_WIREFRAME_ZOOM_IN"),
            fit: t("CREATION_EDITOR_FIT_CANVAS"),
          }}
        />
        {reviewPanel}
      </div>
    </section>
  );
}

function WireframeSection({
  section,
  index,
  selected,
  draggable,
  dropTarget,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onSelect,
}: {
  section: WireframeSectionV1Output;
  index: number;
  selected: boolean;
  draggable: boolean;
  dropTarget: boolean;
  onDragStart: () => void;
  onDragOver: (event: ReactDragEvent<HTMLLIElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: ReactDragEvent<HTMLLIElement>) => void;
  onDragEnd: () => void;
  onSelect: () => void;
}) {
  const { t } = useTranslation("account");
  const bindings = section.bindings ?? [];
  const missingCount = bindings.filter((binding) => binding.kind === "missing").length;
  return (
    <li
      className={cn("relative pl-8", dropTarget && "rounded-lg bg-primary/5")}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <span
        className={cn(
          "absolute top-5 left-0 z-10 flex size-6 items-center justify-center rounded-full border bg-background font-mono text-caption tabular-nums",
          selected ? "border-primary text-primary" : "border-border text-label-secondary",
        )}
        aria-hidden="true"
      >
        {index + 1}
      </span>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          "w-full rounded-lg border p-5 text-left transition-[border-color,box-shadow,transform] duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transition-none",
          layoutWidthClass(section.layout?.width),
          layoutAlignClass(section.layout?.align),
          selected
            ? "border-primary shadow-[0_0_0_1px_var(--primary)]"
            : "border-border hover:-translate-y-0.5 hover:border-label-secondary/45 hover:shadow-sm",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-caption text-label-secondary">{section.intentId}</p>
            <h3 className="mt-1 truncate text-body font-semibold text-label-primary">
              {section.label}
            </h3>
            <p className="mt-1 truncate text-footnote text-label-secondary">
              {section.componentKey} · {section.variantKey}
            </p>
          </div>
          <BaseTag color={missingCount > 0 ? "gold" : "default"}>
            {missingCount > 0
              ? t("CREATION_EDITOR_WIREFRAME_MISSING_COUNT", { count: missingCount })
              : t("CREATION_EDITOR_WIREFRAME_BINDINGS_READY")}
          </BaseTag>
        </div>
        {draggable ? (
          <span className="mt-3 inline-flex items-center gap-1 text-caption text-label-secondary">
            <GripVertical className="size-3.5" aria-hidden="true" />
            {t("CREATION_EDITOR_WIREFRAME_DRAG_TO_REORDER")}
          </span>
        ) : null}
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {bindings.slice(0, 4).map((binding) => (
            <div
              key={binding.slotKey}
              className={cn(
                "min-h-11 rounded-md border px-3 py-2",
                binding.kind === "missing"
                  ? "border-dashed border-border bg-muted/45"
                  : "border-border",
              )}
            >
              <p className="truncate text-caption font-medium text-label-secondary">
                {binding.slotKey}
              </p>
              <p className="mt-0.5 truncate text-footnote text-label-primary">
                {binding.kind === "field"
                  ? binding.fieldKey
                  : binding.kind === "missing"
                    ? t(`CREATION_EDITOR_WIREFRAME_MISSING_${binding.reason.toUpperCase()}`)
                    : t("CREATION_EDITOR_WIREFRAME_LITERAL_VALUE")}
              </p>
            </div>
          ))}
        </div>
      </button>
    </li>
  );
}

function layoutWidthClass(width: string | undefined): string {
  switch (width) {
    case "narrow":
      return "max-w-2xl";
    case "content":
      return "max-w-4xl";
    case "wide":
      return "max-w-6xl";
    default:
      return "max-w-none";
  }
}

function layoutAlignClass(align: string | undefined): string {
  switch (align) {
    case "start":
      return "mr-auto";
    case "end":
      return "ml-auto";
    case "center":
      return "mx-auto";
    default:
      return "w-full";
  }
}

function ViewportButton({
  viewport,
  current,
  icon: Icon,
  label,
  onChange,
}: {
  viewport: WireframeViewport;
  current: WireframeViewport;
  icon: LucideIcon;
  label: string;
  onChange: (viewport: WireframeViewport) => void;
}) {
  return (
    <Button
      variant={viewport === current ? "secondary" : "ghost"}
      size="icon-sm"
      aria-label={label}
      aria-pressed={viewport === current}
      onClick={() => onChange(viewport)}
    >
      <Icon className="size-4" />
    </Button>
  );
}

function WireframeEmpty({
  title,
  description,
  compact,
}: {
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto max-w-md text-center",
        !compact && "mt-[14vh] rounded-xl border border-border bg-background p-8 shadow-sm",
      )}
    >
      <span className="mx-auto flex size-11 items-center justify-center rounded-lg bg-muted text-label-secondary">
        <PanelsTopLeft className="size-5" />
      </span>
      <h2 className="mt-4 text-body font-semibold text-label-primary">{title}</h2>
      <p className="mt-2 text-footnote leading-5 text-label-secondary">{description}</p>
    </div>
  );
}
