import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import { ScrollArea } from "@arclayer/ui/scroll-area";
import { Skeleton } from "@arclayer/ui/skeleton";
import type {
  BuilderComponentCatalogOut,
  BuilderRevisionOut,
  ComponentCatalogComponentV1,
  WireframeSectionV1Output,
} from "@arclayer/openapi";
import { AlertTriangle, File, Layers3, RefreshCw } from "lucide-react";

import { BaseTag } from "@/components/ui/tags";
import { getErrorMessage } from "@/lib/notifications";
import { DesignCanvas, type DesignViewport } from "@/pages/projects/editor/design-canvas";
import { DesignChangeReview } from "@/pages/projects/editor/design-change-review";
import { DesignGenerationPanel } from "@/pages/projects/editor/design-generation-panel";
import { DesignInspector } from "@/pages/projects/editor/design-inspector";
import type { useProjectDesignController } from "@/pages/projects/editor/use-project-design-controller";
import { useProjectDesignGeneration } from "@/pages/projects/editor/use-project-design-generation";

interface DesignStageProps {
  projectId: string;
  workspaceId: string | null;
  revision: BuilderRevisionOut;
  selectedPageId: string | null;
  onSelectPage: (pageId: string) => void;
  componentCatalog: BuilderComponentCatalogOut | null;
  componentCatalogPending: boolean;
  componentCatalogError: unknown;
  onRetryComponentCatalog: () => void;
  canEdit: boolean;
  permissionReady: boolean;
  controller: ReturnType<typeof useProjectDesignController>;
}

export function DesignStage({
  projectId,
  workspaceId,
  revision,
  selectedPageId,
  onSelectPage,
  componentCatalog,
  componentCatalogPending,
  componentCatalogError,
  onRetryComponentCatalog,
  canEdit,
  permissionReady,
  controller,
}: DesignStageProps) {
  const { t } = useTranslation("account");
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<DesignViewport>("desktop");
  const [stateKey, setStateKey] = useState("default");
  const [breakpoint, setBreakpoint] = useState<string | null>(null);
  const online = useOnlineStatus();
  const page = revision.pages.find((item) => item.itemId === selectedPageId) ?? null;
  const sections = page?.wireframe?.sections ?? [];
  const section = sections.find((item) => item.id === selectedSectionId) ?? null;
  const component = findComponent(componentCatalog, section);
  const states = useMemo(() => designStates(component), [component]);
  const generation = useProjectDesignGeneration({
    projectId,
    workspaceId,
    revision,
    page,
    componentCatalog,
    componentCatalogPending,
    componentCatalogError: Boolean(componentCatalogError),
    enabled: true,
    canWrite: canEdit,
    permissionReady,
    online,
    blockedByPreview: Boolean(controller.preview),
  });
  const activePreview = generation.selectedCandidate
    ? {
        changeSet: generation.selectedCandidate.changeSet,
        label: t("CREATION_EDITOR_DESIGN_GENERATION_DIRECTION", {
          index: generation.selectedCandidate.candidateIndex + 1,
        }),
        source: "agent" as const,
      }
    : controller.preview
      ? {
          changeSet: controller.preview,
          label: t("CREATION_EDITOR_DESIGN_SERVER_CANDIDATE"),
          source: "manual" as const,
        }
      : null;
  const candidateBlueprint =
    activePreview?.changeSet.designCandidates?.find((item) => item.itemId === page?.itemId)
      ?.visualBlueprint ?? null;
  const blueprint = candidateBlueprint ?? page?.visualBlueprint ?? null;
  const exactContract = componentCatalog?.siteRevisionId === revision.siteRevision.id;

  useEffect(() => {
    if (selectedSectionId && sections.some((item) => item.id === selectedSectionId)) return;
    setSelectedSectionId(sections[0]?.id ?? null);
  }, [sections, selectedSectionId]);

  useEffect(() => {
    if (states.includes(stateKey)) return;
    setStateKey(states[0] ?? "default");
  }, [stateKey, states]);

  useEffect(() => {
    if (!breakpoint || breakpoint in (componentCatalog?.breakpoints ?? {})) return;
    setBreakpoint(null);
  }, [breakpoint, componentCatalog?.breakpoints]);

  if (componentCatalogPending) {
    return <DesignStageLoading />;
  }
  if (componentCatalogError || (componentCatalog && !exactContract)) {
    return (
      <DesignStageBoundary
        title={t("CREATION_EDITOR_DESIGN_CONTRACT_ERROR_TITLE")}
        description={
          componentCatalogError
            ? getErrorMessage(componentCatalogError)
            : t("CREATION_EDITOR_DESIGN_CONTRACT_STALE")
        }
        actionLabel={t("CREATION_EDITOR_RETRY")}
        onAction={onRetryComponentCatalog}
      />
    );
  }

  return (
    <section
      className="relative flex min-h-0 min-w-0 flex-1"
      aria-label={t("CREATION_EDITOR_DESIGN_STAGE_LABEL")}
    >
      <DesignLayerRail
        revision={revision}
        selectedPageId={page?.itemId ?? null}
        selectedSectionId={selectedSectionId}
        onSelectPage={(pageId) => {
          controller.discardPreview();
          setSelectedSectionId(null);
          onSelectPage(pageId);
        }}
        onSelectSection={setSelectedSectionId}
      />
      <DesignCanvas
        page={page}
        selectedSectionId={selectedSectionId}
        onSelectSection={setSelectedSectionId}
        viewport={viewport}
        onViewportChange={setViewport}
        stateKey={stateKey}
        onStateChange={setStateKey}
        states={states}
        breakpoints={componentCatalog?.breakpoints ?? {}}
        online={online}
        controller={controller}
        componentCatalog={componentCatalog}
        preview={activePreview}
      />
      <DesignInspector
        page={page}
        section={section}
        component={component}
        contract={componentCatalog}
        blueprint={blueprint}
        stateKey={stateKey}
        breakpoint={breakpoint}
        onBreakpointChange={setBreakpoint}
        canEdit={canEdit}
        permissionReady={permissionReady}
        online={online}
        generationActive={generation.active}
        generationPanel={
          <DesignGenerationPanel
            agents={generation.eligibleAgents}
            selectedAgentId={generation.selectedAgentId}
            onSelectAgent={generation.setSelectedAgentId}
            objective={generation.objective}
            onObjectiveChange={generation.setObjective}
            candidateCount={generation.candidateCount}
            onCandidateCountChange={generation.setCandidateCount}
            generation={generation.generation}
            selectedCandidateIndex={generation.selectedCandidateIndex}
            onSelectCandidate={generation.selectCandidate}
            onStart={() => generation.startGeneration.mutate()}
            onCancel={() => generation.cancelGeneration.mutate()}
            starting={generation.startGeneration.isPending}
            cancelling={generation.cancelGeneration.isPending}
            canStart={generation.canStart}
            startDisabledReason={generation.startDisabledReason}
            recoveryPending={generation.recoveryPending}
            error={generation.error ? getErrorMessage(generation.error) : null}
          />
        }
        previewActive={Boolean(activePreview)}
        previewing={controller.previewChange.isPending}
        onPreview={(operations) => controller.previewChange.mutate(operations)}
      />
      {controller.operationError ? (
        <div
          className="absolute top-16 right-[376px] z-30 flex max-w-lg items-start gap-2 rounded-lg border border-negative/25 bg-background px-3 py-2 text-caption text-negative shadow-sm"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {getErrorMessage(controller.operationError)}
        </div>
      ) : null}
      {activePreview && page ? (
        <DesignChangeReview
          preview={activePreview.changeSet}
          pageItemId={page.itemId}
          applying={
            activePreview.source === "agent"
              ? generation.applyCandidate.isPending
              : controller.applyChange.isPending
          }
          onApply={() =>
            activePreview.source === "agent"
              ? generation.applyCandidate.mutate()
              : controller.applyChange.mutate()
          }
          onDiscard={
            activePreview.source === "agent"
              ? generation.discardCandidatePreview
              : controller.discardPreview
          }
          candidateLabel={activePreview.label}
          revisionNumber={revision.siteRevision.revisionNumber}
          applyDisabled={activePreview.source === "agent" && generation.active}
          applyDisabledReason={t("CREATION_EDITOR_DESIGN_GENERATION_APPLY_AFTER_COMPLETE")}
        />
      ) : null}
    </section>
  );
}

function DesignLayerRail({
  revision,
  selectedPageId,
  selectedSectionId,
  onSelectPage,
  onSelectSection,
}: Readonly<{
  revision: BuilderRevisionOut;
  selectedPageId: string | null;
  selectedSectionId: string | null;
  onSelectPage: (pageId: string) => void;
  onSelectSection: (sectionId: string) => void;
}>) {
  const { t } = useTranslation("account");
  return (
    <aside
      className="flex w-60 shrink-0 flex-col border-r border-border bg-background"
      aria-label={t("CREATION_EDITOR_DESIGN_LAYERS_LABEL")}
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <Layers3 className="size-4 text-label-secondary" aria-hidden="true" />
          <h2 className="text-footnote font-semibold text-label-primary">
            {t("CREATION_EDITOR_DESIGN_LAYERS_TITLE")}
          </h2>
        </div>
        <BaseTag>{revision.pages.length}</BaseTag>
      </div>
      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
        <ul className="py-2">
          {revision.pages.map((page) => {
            const active = page.itemId === selectedPageId;
            const sections = page.wireframe?.sections ?? [];
            return (
              <li key={page.itemId}>
                <button
                  type="button"
                  className={cn(
                    "flex min-h-11 w-full items-center gap-2 border-l-2 px-3 text-left text-footnote transition-[background-color,color,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30 motion-reduce:transition-none",
                    active
                      ? "border-primary bg-primary/7 text-label-primary"
                      : "border-transparent text-label-secondary hover:bg-muted/60 hover:text-label-primary",
                  )}
                  aria-current={active ? "page" : undefined}
                  onClick={() => onSelectPage(page.itemId)}
                >
                  <File className="size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{page.title}</span>
                  <span className="font-mono text-caption tabular-nums">{sections.length}</span>
                </button>
                {active && sections.length > 0 ? (
                  <ol className="relative ml-5 border-l border-border py-1">
                    {sections.map((section, index) => {
                      const selected = section.id === selectedSectionId;
                      return (
                        <li key={section.id}>
                          <button
                            type="button"
                            className={cn(
                              "flex min-h-11 w-full items-center gap-2 px-3 text-left text-caption transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30 motion-reduce:transition-none",
                              selected
                                ? "text-primary"
                                : "text-label-secondary hover:text-label-primary",
                            )}
                            aria-pressed={selected}
                            onClick={() => onSelectSection(section.id)}
                          >
                            <span
                              className={cn(
                                "flex size-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] tabular-nums",
                                selected
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border",
                              )}
                              aria-hidden="true"
                            >
                              {index + 1}
                            </span>
                            <span className="min-w-0 flex-1 truncate">{section.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                ) : null}
              </li>
            );
          })}
        </ul>
      </ScrollArea>
    </aside>
  );
}

function DesignStageLoading() {
  return (
    <div className="flex min-h-0 flex-1" aria-busy="true">
      <div className="w-60 shrink-0 border-r border-border bg-background p-4">
        <Skeleton className="h-5 w-24" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-11 w-full" />
          ))}
        </div>
      </div>
      <div className="min-w-0 flex-1 bg-muted/25 p-10 pt-24">
        <Skeleton className="mx-auto h-[34rem] max-w-5xl rounded-xl" />
      </div>
      <div className="w-[360px] shrink-0 border-l border-border bg-background p-5">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="mt-8 h-11 w-full" />
        <Skeleton className="mt-4 h-32 w-full" />
      </div>
    </div>
  );
}

function DesignStageBoundary({
  title,
  description,
  actionLabel,
  onAction,
}: Readonly<{
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}>) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-muted/25 p-8">
      <div className="max-w-md text-center">
        <span className="mx-auto flex size-11 items-center justify-center rounded-lg bg-muted text-label-secondary">
          <RefreshCw className="size-5" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-body font-semibold text-label-primary">{title}</h2>
        <p className="mt-2 text-footnote leading-5 text-label-secondary">{description}</p>
        <Button type="button" className="mt-5 min-h-11" onClick={onAction}>
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}

function findComponent(
  contract: BuilderComponentCatalogOut | null,
  section: WireframeSectionV1Output | null,
): ComponentCatalogComponentV1 | null {
  if (!contract || !section) return null;
  return contract.catalog.components.find((item) => item.key === section.componentKey) ?? null;
}

function designStates(component: ComponentCatalogComponentV1 | null): string[] {
  if (!component) return ["default"];
  const states = new Set<string>(["default"]);
  for (const slot of component.styleSlots ?? []) {
    for (const state of slot.requiredStates ?? []) states.add(state);
  }
  return [...states];
}

function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const markOnline = () => setOnline(true);
    const markOffline = () => setOnline(false);
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);
  return online;
}
