import { cn } from "@arclayer/lib/utils";
import { Badge } from "@arclayer/ui/badge";
import { ScrollArea } from "@arclayer/ui/scroll-area";
import type { BuilderChangeSetPreviewOut, BuilderRevisionPageOut } from "@arclayer/openapi";
import { FileText, Settings2, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { SitemapIntentEditor } from "@/pages/projects/editor/sitemap-intent-editor";
import type { SitemapPlanningDraft } from "@/pages/projects/editor/use-project-editor-controller";

export type InspectorMode = "page" | "ai";

interface EditorInspectorProps {
  mode: InspectorMode;
  onModeChange: (mode: InspectorMode) => void;
  page: BuilderRevisionPageOut | null;
  aiPanel: ReactNode;
  canWrite: boolean;
  planningPreview: BuilderChangeSetPreviewOut | null;
  planningPreviewing: boolean;
  planningApplying: boolean;
  planningError: string | null;
  onPreviewPlanning: (draft: SitemapPlanningDraft) => void;
  onApplyPlanning: () => void;
  onDiscardPlanning: () => void;
  onSyncWireframe?: () => void;
}

export function EditorInspector({
  mode,
  onModeChange,
  page,
  aiPanel,
  onSyncWireframe,
  ...planningProps
}: EditorInspectorProps) {
  const { t } = useTranslation("account");
  return (
    <aside
      className="flex w-[360px] min-w-0 shrink-0 flex-col border-l border-border bg-background"
      aria-label={t("CREATION_EDITOR_INSPECTOR_LABEL")}
    >
      <div className="flex h-12 shrink-0 items-center border-b border-border px-2">
        <InspectorTab
          active={mode === "page"}
          icon={Settings2}
          label={t("CREATION_EDITOR_INSPECTOR_PAGE")}
          onClick={() => onModeChange("page")}
        />
        <InspectorTab
          active={mode === "ai"}
          icon={Sparkles}
          label={t("CREATION_EDITOR_INSPECTOR_AI")}
          onClick={() => onModeChange("ai")}
        />
      </div>
      {mode === "ai" ? (
        aiPanel
      ) : (
        <PageInspector page={page} onSyncWireframe={onSyncWireframe} {...planningProps} />
      )}
    </aside>
  );
}

function InspectorTab({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Settings2;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex min-h-9 flex-1 items-center justify-center gap-2 rounded-md text-footnote font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        active ? "bg-muted text-label-primary" : "text-label-secondary hover:text-label-primary",
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function PageInspector({
  page,
  canWrite,
  planningPreview,
  planningPreviewing,
  planningApplying,
  planningError,
  onPreviewPlanning,
  onApplyPlanning,
  onDiscardPlanning,
  onSyncWireframe,
}: Omit<EditorInspectorProps, "mode" | "onModeChange" | "aiPanel">) {
  const { t } = useTranslation("account");
  if (!page) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 text-center">
        <span className="mb-4 flex size-10 items-center justify-center rounded-lg bg-muted text-label-secondary">
          <FileText className="size-5" />
        </span>
        <h2 className="text-body font-semibold text-label-primary">
          {t("CREATION_EDITOR_INSPECTOR_EMPTY_TITLE")}
        </h2>
        <p className="mt-2 text-footnote leading-5 text-label-secondary">
          {t("CREATION_EDITOR_INSPECTOR_EMPTY_DESC")}
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="min-h-0 min-w-0 flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
      <div className="w-full min-w-0 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-caption font-semibold tracking-wide text-label-secondary uppercase">
              {t("CREATION_EDITOR_PAGE_TYPE")}
            </p>
            <h2 className="mt-1 truncate text-title-3 font-semibold text-label-primary">
              {page.title}
            </h2>
          </div>
          <Badge variant="outline" className="font-mono font-normal">
            v{page.versionNumber}
          </Badge>
        </div>
        {page.summary ? (
          <p className="mt-3 text-footnote leading-5 text-label-secondary">{page.summary}</p>
        ) : null}

        <div className="mt-6 space-y-5 border-t border-border pt-5">
          <InspectorField label={t("CREATION_EDITOR_PAGE_TITLE")} value={page.title} />
          <InspectorField
            label={t("CREATION_EDITOR_PAGE_PARENT")}
            value={page.parentItemId ?? t("CREATION_EDITOR_PAGE_ROOT")}
            mono={Boolean(page.parentItemId)}
          />
          <InspectorField
            label={t("CREATION_EDITOR_PAGE_ORDER")}
            value={String(page.sortOrder + 1)}
            mono
          />
        </div>

        <SitemapIntentEditor
          page={page}
          canWrite={canWrite}
          preview={planningPreview}
          previewing={planningPreviewing}
          applying={planningApplying}
          error={planningError}
          onPreview={onPreviewPlanning}
          onApply={onApplyPlanning}
          onDiscard={onDiscardPlanning}
          onSyncWireframe={onSyncWireframe}
        />

        <section
          className="mt-6 border-t border-border pt-5"
          aria-labelledby="editor-routes-heading"
        >
          <h3 id="editor-routes-heading" className="text-body font-semibold text-label-primary">
            {t("CREATION_EDITOR_PAGE_ROUTES")}
          </h3>
          <div className="mt-3 space-y-2">
            {(page.routes ?? []).length > 0 ? (
              page.routes?.map((route) => (
                <div
                  key={`${route.locale}:${route.path}`}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <code className="truncate text-footnote font-medium text-label-primary">
                      {route.path}
                    </code>
                    <Badge variant={route.isActive ? "secondary" : "outline"}>
                      {route.isActive
                        ? t("CREATION_EDITOR_PAGE_ROUTE_ACTIVE")
                        : t("CREATION_EDITOR_PAGE_ROUTE_INACTIVE")}
                    </Badge>
                  </div>
                  <p className="mt-1 font-mono text-caption text-label-secondary">{route.locale}</p>
                </div>
              ))
            ) : (
              <p className="text-footnote text-label-secondary">
                {t("CREATION_EDITOR_PAGE_ROUTES_EMPTY")}
              </p>
            )}
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}

function InspectorField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-caption font-medium text-label-secondary">{label}</p>
      <p className={cn("mt-1 break-all text-footnote text-label-primary", mono && "font-mono")}>
        {value}
      </p>
    </div>
  );
}
