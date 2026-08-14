import { cn } from "@arclayer/lib/utils";
import { SiteRenderer } from "@arclayer/site-renderer";
import { Button } from "@arclayer/ui/button";
import { Skeleton } from "@arclayer/ui/skeleton";
import type {
  BuilderChangeSetPreviewOut,
  BuilderComponentCatalogOut,
  BuilderRevisionPageOut,
} from "@arclayer/openapi";
import {
  FileWarning,
  Laptop,
  LoaderCircle,
  Monitor,
  RefreshCw,
  Smartphone,
  Tablet,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { BaseTag } from "@/components/ui/tags";
import { getErrorMessage } from "@/lib/notifications";
import {
  DesignPreviewProjectionError,
  projectDesignPreviewDocument,
} from "@/pages/projects/editor/design-preview-document";
import type { useProjectDesignController } from "@/pages/projects/editor/use-project-design-controller";
import {
  EditorCanvasSurface,
  EditorCanvasZoomControls,
  useCanvasContentBounds,
  useEditorCanvasViewport,
} from "@/pages/projects/editor/canvas/editor-canvas";

export type DesignViewport = "desktop" | "tablet" | "mobile";

const VIEWPORT_WIDTH: Record<DesignViewport, number> = {
  desktop: 1440,
  tablet: 768,
  mobile: 384,
};

interface DesignCanvasProps {
  page: BuilderRevisionPageOut | null;
  selectedSectionId: string | null;
  onSelectSection: (sectionId: string | null) => void;
  viewport: DesignViewport;
  onViewportChange: (viewport: DesignViewport) => void;
  stateKey: string;
  onStateChange: (stateKey: string) => void;
  states: readonly string[];
  breakpoints: Readonly<Record<string, string>>;
  online: boolean;
  controller: ReturnType<typeof useProjectDesignController>;
  componentCatalog: BuilderComponentCatalogOut | null;
  preview: Readonly<{ changeSet: BuilderChangeSetPreviewOut; label: string }> | null;
}

export function DesignCanvas({
  page,
  selectedSectionId,
  onSelectSection,
  viewport,
  onViewportChange,
  stateKey,
  onStateChange,
  states,
  breakpoints,
  online,
  controller,
  componentCatalog,
  preview,
}: DesignCanvasProps) {
  const { t } = useTranslation("account");
  const render = controller.renderQuery;
  const previewBreakpoint = viewport in breakpoints ? viewport : null;
  const canvas = useEditorCanvasViewport({
    initialViewport: { x: 0, y: 32, zoom: 0.65 },
    minZoom: 0.2,
    maxZoom: 1.5,
    fitPadding: 48,
    fitBottomSafeArea: 56,
  });
  const { contentRef, bounds: contentBounds } = useCanvasContentBounds<HTMLDivElement>();
  const previewProjection = useMemo(() => {
    if (!preview || !render.data || !page) return null;
    const candidate = preview.changeSet.designCandidates?.find(
      (item) => item.itemId === page.itemId,
    );
    if (!candidate) {
      return {
        document: null,
        error: new DesignPreviewProjectionError(
          `ChangeSet ${preview.changeSet.changeSetId} has no Design candidate for ${page.itemId}`,
        ),
      };
    }
    try {
      return {
        document: projectDesignPreviewDocument(
          render.data,
          candidate,
          componentCatalog?.designTokens ?? [],
        ),
        error: null,
      };
    } catch (error) {
      return {
        document: null,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }, [componentCatalog?.designTokens, page, preview, render.data]);
  const document = previewProjection?.document ?? render.data ?? null;
  const source = document?.renderSource ?? null;

  useEffect(() => {
    canvas.fit(contentBounds);
  }, [canvas.fit, contentBounds, page?.itemId, viewport]);

  return (
    <section
      className="relative min-w-0 flex-1 overflow-hidden bg-transparent"
      aria-label={t("CREATION_EDITOR_DESIGN_CANVAS_LABEL")}
    >
      <div className="absolute top-3 right-3 left-3 z-20 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/80 bg-background/95 p-1.5 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-1">
          <ViewportButton
            viewport="desktop"
            current={viewport}
            icon={Monitor}
            label={t("CREATION_EDITOR_DESIGN_VIEWPORT_DESKTOP")}
            onChange={onViewportChange}
          />
          <ViewportButton
            viewport="tablet"
            current={viewport}
            icon={Tablet}
            label={t("CREATION_EDITOR_DESIGN_VIEWPORT_TABLET")}
            onChange={onViewportChange}
          />
          <ViewportButton
            viewport="mobile"
            current={viewport}
            icon={Smartphone}
            label={t("CREATION_EDITOR_DESIGN_VIEWPORT_MOBILE")}
            onChange={onViewportChange}
          />
          <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
          <div
            className="flex min-w-0 gap-1 overflow-x-auto"
            aria-label={t("CREATION_EDITOR_DESIGN_STATE_LABEL")}
          >
            {states.map((state) => (
              <Button
                key={state}
                type="button"
                variant={state === stateKey ? "secondary" : "ghost"}
                size="sm"
                className="min-h-9 shrink-0"
                aria-pressed={state === stateKey}
                onClick={() => onStateChange(state)}
              >
                {state}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {preview ? <BaseTag color="gold">{preview.label}</BaseTag> : null}
          <BaseTag>
            {source === "visual_blueprint"
              ? t("CREATION_EDITOR_DESIGN_SOURCE_BLUEPRINT")
              : t("CREATION_EDITOR_DESIGN_SOURCE_WIREFRAME")}
          </BaseTag>
        </div>
      </div>

      <EditorCanvasSurface
        surfaceRef={canvas.surfaceRef}
        viewport={canvas.viewport}
        handlers={canvas.handlers}
        worldBounds={contentBounds}
        ariaLabel={t("CREATION_EDITOR_DESIGN_CANVAS_LABEL")}
      >
        <div
          ref={contentRef}
          className={cn(
            "overflow-hidden rounded-xl border border-border bg-background shadow-[0_18px_48px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.06)]",
          )}
          style={{ width: VIEWPORT_WIDTH[viewport] }}
          data-testid="design-canvas-plane"
          data-viewport={viewport}
        >
          {!page ? (
            <CanvasState
              icon={FileWarning}
              title={t("CREATION_EDITOR_DESIGN_PAGE_REQUIRED_TITLE")}
              description={t("CREATION_EDITOR_DESIGN_PAGE_REQUIRED_DESC")}
            />
          ) : !page.wireframe ? (
            <CanvasState
              icon={FileWarning}
              title={t("CREATION_EDITOR_DESIGN_WIREFRAME_REQUIRED_TITLE")}
              description={t("CREATION_EDITOR_DESIGN_WIREFRAME_REQUIRED_DESC")}
            />
          ) : !online ? (
            <CanvasState
              icon={Laptop}
              title={t("CREATION_EDITOR_DESIGN_OFFLINE_TITLE")}
              description={t("CREATION_EDITOR_DESIGN_OFFLINE_DESC")}
            />
          ) : render.isPending ? (
            <DesignCanvasSkeleton />
          ) : render.error ? (
            <CanvasState
              icon={RefreshCw}
              title={t("CREATION_EDITOR_DESIGN_RENDER_ERROR_TITLE")}
              description={getErrorMessage(
                render.error,
                t("CREATION_EDITOR_DESIGN_RENDER_ERROR_DESC"),
              )}
              action={
                <Button type="button" size="sm" onClick={() => void render.refetch()}>
                  {t("CREATION_EDITOR_RETRY")}
                </Button>
              }
            />
          ) : previewProjection?.error ? (
            <CanvasState
              icon={FileWarning}
              title={t("CREATION_EDITOR_DESIGN_PREVIEW_INVALID_TITLE")}
              description={t("CREATION_EDITOR_DESIGN_PREVIEW_INVALID_DESC")}
            />
          ) : document ? (
            <SiteRenderer
              document={document}
              interactionMode="read-only"
              selectedSectionId={selectedSectionId}
              onSectionSelect={onSelectSection}
              sectionSelectionLabel={(section) =>
                t("CREATION_EDITOR_DESIGN_SELECT_SECTION", { section: section.label })
              }
              previewStateKey={stateKey}
              previewBreakpoint={previewBreakpoint}
            />
          ) : (
            <CanvasState
              icon={LoaderCircle}
              title={t("CREATION_EDITOR_DESIGN_RENDER_EMPTY_TITLE")}
              description={t("CREATION_EDITOR_DESIGN_RENDER_EMPTY_DESC")}
            />
          )}
        </div>
      </EditorCanvasSurface>
      <EditorCanvasZoomControls
        zoom={canvas.viewport.zoom}
        onZoomChange={canvas.setZoom}
        onFit={() => canvas.fit(contentBounds)}
        labels={{
          zoom: t("CREATION_EDITOR_ZOOM"),
          zoomOut: t("CREATION_EDITOR_ZOOM_OUT"),
          zoomIn: t("CREATION_EDITOR_ZOOM_IN"),
          fit: t("CREATION_EDITOR_FIT_CANVAS"),
        }}
      />
    </section>
  );
}

function ViewportButton({
  viewport,
  current,
  icon: Icon,
  label,
  onChange,
}: Readonly<{
  viewport: DesignViewport;
  current: DesignViewport;
  icon: LucideIcon;
  label: string;
  onChange: (viewport: DesignViewport) => void;
}>) {
  return (
    <Button
      type="button"
      variant={viewport === current ? "secondary" : "ghost"}
      size="icon-sm"
      className="min-h-11 min-w-11 lg:min-h-8 lg:min-w-8"
      aria-label={label}
      aria-pressed={viewport === current}
      onClick={() => onChange(viewport)}
    >
      <Icon className="size-4" />
    </Button>
  );
}

function CanvasState({
  icon: Icon,
  title,
  description,
  action,
}: Readonly<{
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-[34rem] items-center justify-center p-8 text-center">
      <div className="max-w-sm">
        <span className="mx-auto flex size-11 items-center justify-center rounded-lg bg-muted text-label-secondary">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-body font-semibold text-label-primary">{title}</h2>
        <p className="mt-2 text-footnote leading-5 text-label-secondary">{description}</p>
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  );
}

function DesignCanvasSkeleton() {
  return (
    <div className="min-h-[34rem] space-y-0" aria-busy="true">
      <div className="flex items-center justify-between border-b border-border px-8 py-5">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="grid min-h-80 gap-8 px-8 py-16 lg:grid-cols-[1fr_0.8fr]">
        <div className="space-y-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-12 w-4/5" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-11 w-32" />
        </div>
        <Skeleton className="min-h-56 rounded-lg" />
      </div>
    </div>
  );
}
