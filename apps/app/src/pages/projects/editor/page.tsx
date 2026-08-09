import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BuilderGenerationTargetV1 } from "@arclayer/openapi";

import { AddPageDialog } from "@/pages/projects/editor/add-page-dialog";
import { CompositionSagaReview } from "@/pages/projects/editor/composition-saga-review";
import { DesignStage } from "@/pages/projects/editor/design-stage";
import { EditorBoundary, EditorLoadingState } from "@/pages/projects/editor/editor-boundaries";
import { EditorInspector } from "@/pages/projects/editor/editor-inspector";
import { EditorToolbar, type EditorStage } from "@/pages/projects/editor/editor-toolbar";
import { GenerationPanel } from "@/pages/projects/editor/generation-panel";
import { SitemapCanvas } from "@/pages/projects/editor/sitemap-canvas";
import { SharedSectionManagerDialog } from "@/pages/projects/editor/shared-section-manager-dialog";
import { StyleGuideStage } from "@/pages/projects/editor/style-guide-stage";
import { useProjectEditorController } from "@/pages/projects/editor/use-project-editor-controller";
import { useProjectDesignController } from "@/pages/projects/editor/use-project-design-controller";
import { useProjectStyleGuideController } from "@/pages/projects/editor/use-project-style-guide-controller";
import { WireframeCanvas } from "@/pages/projects/editor/wireframe-canvas";
import { WireframeChangeReview } from "@/pages/projects/editor/wireframe-change-review";
import { WireframeEditPanel } from "@/pages/projects/editor/wireframe-edit-panel";
import { WireframeGenerationPanel } from "@/pages/projects/editor/wireframe-generation-panel";
import { WireframeInspector } from "@/pages/projects/editor/wireframe-inspector";
import { VisitorPreviewWorkbench } from "@/pages/projects/editor/visitor-preview-workbench";
import { useProjectWireframeGeneration } from "@/pages/projects/editor/use-project-wireframe-generation";
import { getErrorMessage } from "@/lib/notifications";
import { serializeProjectEditorTarget } from "@/pages/projects/editor/editor-deep-link";

const EMPTY_GENERATION_TARGETS: readonly BuilderGenerationTargetV1[] = [];

export interface ProjectEditorPageProps {
  projectId: string;
  initialStage?: EditorStage;
  initialPageId?: string | null;
  initialTargets?: readonly BuilderGenerationTargetV1[];
}

export function ProjectEditorPage({
  projectId,
  initialStage = "sitemap",
  initialPageId = null,
  initialTargets = EMPTY_GENERATION_TARGETS,
}: ProjectEditorPageProps) {
  const { t } = useTranslation("account");
  const navigate = useNavigate({ from: "/projects/$projectId/editor/" });
  const editor = useProjectEditorController(projectId, initialPageId);
  const [stage, setStage] = useState<EditorStage>(initialStage);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [sharedSectionsOpen, setSharedSectionsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const currentRevision = editor.revisionQuery.data ?? null;
  const currentPage =
    currentRevision?.pages.find((page) => page.itemId === editor.selectedPageId) ?? null;
  const syncWireframeTargetsToUrl = useCallback(
    (targets: readonly BuilderGenerationTargetV1[]) => {
      if (stage !== "wireframe") return;
      void navigate({
        search: {
          stage: "wireframe",
          page: editor.selectedPageId ?? undefined,
          target: targets.map(serializeProjectEditorTarget),
        },
        replace: true,
      });
    },
    [editor.selectedPageId, navigate, stage],
  );
  const wireframeGeneration = useProjectWireframeGeneration({
    projectId,
    workspaceId: editor.workspaceId,
    revision: currentRevision,
    page: currentPage,
    componentCatalog: editor.componentCatalogQuery.data ?? null,
    componentCatalogPending: editor.componentCatalogQuery.isPending,
    componentCatalogError: Boolean(editor.componentCatalogQuery.error),
    initialTargets,
    onTargetsChange: syncWireframeTargetsToUrl,
    enabled: stage === "wireframe",
    canWrite: editor.canWrite,
    permissionReady: editor.permissionReady,
    blockedByPreview: Boolean(editor.wireframePreview),
  });
  const projectName =
    editor.projectQuery.data?.project.name ?? t("CREATION_EDITOR_PROJECT_FALLBACK");
  const styleGuide = useProjectStyleGuideController({
    projectId,
    workspaceId: editor.workspaceId,
    revision: editor.revisionQuery.data ?? null,
    enabled: stage === "styleGuide" && Boolean(editor.revisionQuery.data),
    canWrite: editor.canWrite,
  });
  const design = useProjectDesignController({
    projectId,
    revision: currentRevision,
    page: currentPage,
    componentCatalog: editor.componentCatalogQuery.data ?? null,
    enabled: stage === "design",
  });
  const backToProject = () => void navigate({ to: `/projects/${projectId}` as never });
  const retryBuilderBootstrap = () => {
    void editor.builderQuery.refetch();
  };

  if (
    editor.builderQuery.isPending ||
    (editor.builderQuery.data?.currentSiteRevision?.id && editor.revisionQuery.isPending)
  ) {
    return <EditorLoadingState />;
  }
  if (editor.builderQuery.error) {
    return (
      <EditorBoundary
        title={t("CREATION_EDITOR_LOAD_ERROR_TITLE")}
        description={getErrorMessage(editor.builderQuery.error)}
        actionLabel={t("CREATION_EDITOR_RETRY")}
        onAction={() => void editor.builderQuery.refetch()}
        onBack={backToProject}
      />
    );
  }

  const builder = editor.builderQuery.data;
  if (
    builder.authoringAuthority.state === "migration_required" ||
    builder.authoringAuthority.mode !== "builder_managed"
  ) {
    return (
      <EditorBoundary
        title={t("CREATION_EDITOR_MIGRATION_TITLE")}
        description={t("CREATION_EDITOR_MIGRATION_DESC")}
        actionLabel={t("CREATION_EDITOR_RETRY")}
        onAction={retryBuilderBootstrap}
        onBack={backToProject}
      />
    );
  }
  if (builder.initializationRequired || !builder.currentSiteRevision) {
    return (
      <EditorBoundary
        title={t("CREATION_EDITOR_INITIALIZE_TITLE")}
        description={t("CREATION_EDITOR_INITIALIZE_DESC")}
        actionLabel={t("CREATION_EDITOR_RETRY")}
        onAction={retryBuilderBootstrap}
        onBack={backToProject}
      />
    );
  }
  if (editor.revisionQuery.error || !editor.revisionQuery.data) {
    return (
      <EditorBoundary
        title={t("CREATION_EDITOR_REVISION_ERROR_TITLE")}
        description={
          editor.revisionQuery.error
            ? getErrorMessage(editor.revisionQuery.error)
            : t("CREATION_EDITOR_REVISION_ERROR_DESC")
        }
        actionLabel={t("CREATION_EDITOR_RETRY")}
        onAction={() => void editor.revisionQuery.refetch()}
        onBack={backToProject}
      />
    );
  }

  const revision = editor.revisionQuery.data;
  const selectedPage = revision.pages.find((page) => page.itemId === editor.selectedPageId) ?? null;
  const designDisabledReason = editor.componentCatalogQuery.isPending
    ? t("CREATION_EDITOR_DESIGN_CONTRACT_LOADING")
    : editor.componentCatalogQuery.error
      ? t("CREATION_EDITOR_DESIGN_CONTRACT_ERROR_SHORT")
      : !selectedPage
        ? t("CREATION_EDITOR_DESIGN_PAGE_REQUIRED_SHORT")
        : !selectedPage.wireframe || !selectedPage.wireframeChecksum
          ? t("CREATION_EDITOR_DESIGN_WIREFRAME_REQUIRED_SHORT")
          : !(selectedPage.routes ?? []).some((route) => route.isActive)
            ? t("CREATION_EDITOR_DESIGN_ROUTE_REQUIRED_SHORT")
            : undefined;
  const previewLocales = (selectedPage?.routes ?? [])
    .filter((route) => route.isActive)
    .map((route) => route.locale);
  const generationPreview = wireframeGeneration.selectedCandidate?.changeSet ?? null;
  const activeWireframePreview = editor.wireframePreview ?? generationPreview;
  const wireframeCandidate = activeWireframePreview?.wireframeCandidates?.find(
    (candidate) => candidate.itemId === editor.selectedPageId,
  );
  const wireframePages = wireframeCandidate
    ? revision.pages.map((page) =>
        page.itemId === wireframeCandidate.itemId
          ? { ...page, wireframe: wireframeCandidate.wireframe }
          : page,
      )
    : revision.pages;
  const displayedWireframePage =
    wireframePages.find((page) => page.itemId === editor.selectedPageId) ?? null;
  const selectedSection =
    (displayedWireframePage?.wireframe?.sections ?? []).find(
      (section) => section.id === selectedSectionId,
    ) ?? null;
  const canonicalSelectedSection =
    (selectedPage?.wireframe?.sections ?? []).find((section) => section.id === selectedSectionId) ??
    null;
  return (
    <main
      className="flex h-screen min-h-0 flex-col overflow-hidden bg-background"
      data-testid="creation-editor"
    >
      <EditorToolbar
        projectName={projectName}
        revisionNumber={revision.siteRevision.revisionNumber}
        status={revision.status.status}
        stage={stage}
        onStageChange={(nextStage) => {
          editor.discardWireframePreview();
          editor.discardSitemapPlanningPreview();
          design.discardPreview();
          wireframeGeneration.discardCandidatePreview();
          setStage(nextStage);
        }}
        onBack={backToProject}
        onPreview={() => setPreviewOpen(true)}
        previewDisabledReason={
          selectedPage && previewLocales.length > 0
            ? undefined
            : t("CREATION_EDITOR_PREVIEW_PAGE_REQUIRED")
        }
        designDisabledReason={designDisabledReason}
      />
      <div className="flex min-h-0 flex-1">
        {stage === "sitemap" ? (
          <>
            <SitemapCanvas
              pages={revision.pages}
              selectedPageId={editor.selectedPageId}
              onSelectPage={(pageId) => {
                editor.discardSitemapPlanningPreview();
                editor.setSelectedPageId(pageId);
                editor.setInspectorMode("page");
              }}
              onOpenAI={() => editor.setInspectorMode("ai")}
              onAddPage={() => editor.setAddPageOpen(true)}
              onManageSharedSections={() => setSharedSectionsOpen(true)}
              canEdit={editor.canWrite}
              editDisabledReason={
                editor.permissionReady
                  ? t("CREATION_EDITOR_AI_PERMISSION_REQUIRED")
                  : t("CREATION_EDITOR_AI_PREPARING")
              }
              canOpenAI
              openAIDisabledReason=""
            />
            <EditorInspector
              mode={editor.inspectorMode}
              onModeChange={editor.setInspectorMode}
              page={selectedPage}
              canWrite={editor.canWrite}
              planningPreview={editor.sitemapPlanningPreview}
              planningPreviewing={editor.previewSitemapPlanning.isPending}
              planningApplying={editor.applySitemapPlanning.isPending}
              planningError={
                editor.sitemapPlanningError ? getErrorMessage(editor.sitemapPlanningError) : null
              }
              onPreviewPlanning={(draft) => editor.previewSitemapPlanning.mutate(draft)}
              onApplyPlanning={() => editor.applySitemapPlanning.mutate()}
              onDiscardPlanning={editor.discardSitemapPlanningPreview}
              aiPanel={
                <GenerationPanel
                  agents={editor.eligibleAgents}
                  selectedAgentId={editor.selectedAgentId}
                  onSelectAgent={editor.setSelectedAgentId}
                  objective={editor.objective}
                  onObjectiveChange={editor.setObjective}
                  generation={editor.generation}
                  selectedCandidateIndex={editor.selectedCandidateIndex}
                  onSelectCandidate={editor.setSelectedCandidateIndex}
                  onStart={() => editor.startGeneration.mutate()}
                  onCancel={() => editor.cancelGeneration.mutate()}
                  onApply={() => editor.applyCandidate.mutate()}
                  starting={editor.startGeneration.isPending}
                  cancelling={editor.cancelGeneration.isPending}
                  applying={editor.applyCandidate.isPending}
                  canStart={editor.canStart}
                  startDisabledReason={editor.startDisabledReason}
                  error={editor.operationError ? getErrorMessage(editor.operationError) : null}
                />
              }
            />
            <AddPageDialog
              open={editor.addPageOpen}
              onOpenChange={editor.setAddPageOpen}
              projectId={projectId}
              revision={revision}
              onApplied={editor.invalidateBuilder}
            />
            <SharedSectionManagerDialog
              open={sharedSectionsOpen}
              onOpenChange={setSharedSectionsOpen}
              projectId={projectId}
              revision={revision}
              canWrite={editor.canEditWireframe}
              permissionReady={editor.permissionReady}
              onApplied={editor.invalidateBuilder}
            />
          </>
        ) : stage === "wireframe" ? (
          <>
            <WireframeCanvas
              pages={wireframePages}
              selectedPageId={editor.selectedPageId}
              onSelectPage={(pageId) => {
                editor.setSelectedPageId(pageId);
                setSelectedSectionId(null);
                editor.discardWireframePreview();
              }}
              selectedSectionId={selectedSectionId}
              onSelectSection={setSelectedSectionId}
              candidateActive={Boolean(wireframeCandidate)}
              reviewPanel={
                editor.wireframePreview ? (
                  <WireframeChangeReview
                    preview={editor.wireframePreview}
                    applying={editor.applyWireframeChange.isPending}
                    onApply={() => editor.applyWireframeChange.mutate()}
                    onDiscard={editor.discardWireframePreview}
                  />
                ) : generationPreview && wireframeGeneration.compositionSagaReviewPhase ? (
                  <CompositionSagaReview
                    phase={wireframeGeneration.compositionSagaReviewPhase}
                    preview={generationPreview}
                    targets={wireframeGeneration.selectedTargetOptions}
                    applying={wireframeGeneration.applyCandidate.isPending}
                    onApply={() => wireframeGeneration.applyCandidate.mutate()}
                    onDiscard={wireframeGeneration.discardCandidatePreview}
                  />
                ) : generationPreview && !wireframeGeneration.compositionSaga ? (
                  <WireframeChangeReview
                    preview={generationPreview}
                    targets={wireframeGeneration.selectedTargetOptions}
                    applying={wireframeGeneration.applyCandidate.isPending}
                    onApply={() => wireframeGeneration.applyCandidate.mutate()}
                    onDiscard={wireframeGeneration.discardCandidatePreview}
                  />
                ) : undefined
              }
            />
            <WireframeInspector
              page={displayedWireframePage}
              section={selectedSection}
              generationPanel={
                <WireframeGenerationPanel
                  selectedTargets={wireframeGeneration.selectedTargetOptions}
                  availableTargets={wireframeGeneration.availableTargetOptions}
                  onAddTarget={wireframeGeneration.addTarget}
                  onRemoveTarget={wireframeGeneration.removeTarget}
                  onMoveTarget={wireframeGeneration.moveTarget}
                  agents={wireframeGeneration.eligibleAgents}
                  selectedAgentId={wireframeGeneration.selectedAgentId}
                  onSelectAgent={wireframeGeneration.setSelectedAgentId}
                  objective={wireframeGeneration.objective}
                  onObjectiveChange={wireframeGeneration.setObjective}
                  candidateCount={wireframeGeneration.candidateCount}
                  onCandidateCountChange={wireframeGeneration.setCandidateCount}
                  generation={wireframeGeneration.generation}
                  compositionSaga={wireframeGeneration.compositionSaga}
                  startMode={wireframeGeneration.startMode}
                  selectedCandidateIndex={wireframeGeneration.selectedCandidateIndex}
                  onSelectCandidate={wireframeGeneration.selectCandidate}
                  onStart={() => wireframeGeneration.startGeneration.mutate()}
                  onCancel={() => wireframeGeneration.cancelGeneration.mutate()}
                  starting={wireframeGeneration.startGeneration.isPending}
                  cancelling={wireframeGeneration.cancelGeneration.isPending}
                  canStart={wireframeGeneration.canStart}
                  active={wireframeGeneration.active}
                  startDisabledReason={wireframeGeneration.startDisabledReason}
                  error={
                    wireframeGeneration.error ? getErrorMessage(wireframeGeneration.error) : null
                  }
                />
              }
              editPanel={
                selectedPage ? (
                  <WireframeEditPanel
                    page={selectedPage}
                    section={canonicalSelectedSection}
                    componentCatalog={editor.componentCatalogQuery.data ?? null}
                    globalSections={revision.globalSections ?? []}
                    globalSectionGraph={revision.globalSectionGraph ?? null}
                    disabled={
                      !editor.canEditWireframe ||
                      editor.componentCatalogQuery.isPending ||
                      Boolean(editor.componentCatalogQuery.error) ||
                      editor.previewWireframeChange.isPending ||
                      Boolean(activeWireframePreview) ||
                      wireframeGeneration.active
                    }
                    disabledReason={
                      editor.wireframeOperationError
                        ? getErrorMessage(editor.wireframeOperationError)
                        : editor.componentCatalogQuery.error
                          ? getErrorMessage(editor.componentCatalogQuery.error)
                          : !editor.canEditWireframe
                            ? t("CREATION_EDITOR_WIREFRAME_PERMISSION_REQUIRED")
                            : editor.componentCatalogQuery.isPending
                              ? t("CREATION_EDITOR_WIREFRAME_CATALOG_LOADING")
                              : editor.previewWireframeChange.isPending
                                ? t("CREATION_EDITOR_WIREFRAME_PREVIEWING")
                                : activeWireframePreview
                                  ? t("CREATION_EDITOR_WIREFRAME_REVIEW_BEFORE_EDIT")
                                  : wireframeGeneration.active
                                    ? t("CREATION_EDITOR_WIREFRAME_GENERATION_ACTIVE")
                                    : ""
                    }
                    onPreview={(operations) => editor.previewWireframeChange.mutate(operations)}
                  />
                ) : undefined
              }
            />
          </>
        ) : stage === "styleGuide" ? (
          <StyleGuideStage
            projectName={projectName}
            revision={revision}
            componentCatalog={editor.componentCatalogQuery.data?.catalog ?? null}
            controller={styleGuide}
          />
        ) : (
          <DesignStage
            projectId={projectId}
            workspaceId={editor.workspaceId}
            revision={revision}
            selectedPageId={editor.selectedPageId}
            onSelectPage={editor.setSelectedPageId}
            componentCatalog={editor.componentCatalogQuery.data ?? null}
            componentCatalogPending={editor.componentCatalogQuery.isPending}
            componentCatalogError={editor.componentCatalogQuery.error}
            onRetryComponentCatalog={() => void editor.componentCatalogQuery.refetch()}
            canEdit={editor.canEditWireframe}
            permissionReady={editor.permissionReady}
            controller={design}
          />
        )}
      </div>
      {selectedPage && previewLocales.length > 0 ? (
        <VisitorPreviewWorkbench
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          projectId={projectId}
          projectName={projectName}
          revisionId={revision.siteRevision.id}
          revisionNumber={revision.siteRevision.revisionNumber}
          pageItemId={selectedPage.itemId}
          pageTitle={selectedPage.title}
          availableLocales={previewLocales}
        />
      ) : null}
    </main>
  );
}
