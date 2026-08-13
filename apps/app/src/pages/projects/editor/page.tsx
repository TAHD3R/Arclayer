import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BuilderGenerationTargetV1 } from "@arclayer/openapi";

import { AddPageDialog } from "@/pages/projects/editor/add-page-dialog";
import { EditorSidebar } from "@/layouts/creation-layout";
import { CompositionSagaReview } from "@/pages/projects/editor/composition-saga-review";
import { DesignStage } from "@/pages/projects/editor/design-stage";
import { EditorBoundary, EditorLoadingState } from "@/pages/projects/editor/editor-boundaries";
import { EditorConflictSurface } from "@/pages/projects/editor/editor-conflict-surface";
import { EditorToolbar, type EditorStage } from "@/pages/projects/editor/editor-toolbar";
import { SitemapCanvas } from "@/pages/projects/editor/sitemap-canvas";
import { SitemapChangeReview } from "@/pages/projects/editor/sitemap-change-review";
import { SitemapIntentEditor } from "@/pages/projects/editor/sitemap-intent-editor";
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
import { serializeProjectEditorTarget } from "@/pages/projects/editor/editor-deep-link";
import { patchProject } from "@/api/projects";
import { getErrorMessage, notifyError, notifySuccessText } from "@/lib/notifications";
import { useAiChatStore } from "@/stores/use-ai-chat-store";

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
  const { t } = useTranslation(["account", "common"]);
  const navigate = useNavigate({ from: "/projects/$projectId/editor/" });
  const queryClient = useQueryClient();
  const editor = useProjectEditorController(projectId, initialPageId);
  const openAiDrawer = useAiChatStore((state) => state.openDrawer);
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
    onDraftAutosave: editor.queueDraftAutosave,
    onDraftDiscard: editor.discardDraftCheckpoint,
  });
  const projectName =
    editor.projectQuery.data?.project.name ?? t("CREATION_EDITOR_PROJECT_FALLBACK");
  const renameProject = useMutation({
    mutationFn: (name: string) => patchProject(projectId, { name }),
    onSuccess: async () => {
      notifySuccessText(t("common:ACTION_SUCCESS"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project", "detail", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["global-nav", "projects"] }),
        queryClient.invalidateQueries({ queryKey: ["projects-cards"] }),
      ]);
    },
    onError: notifyError,
  });
  const styleGuide = useProjectStyleGuideController({
    projectId,
    workspaceId: editor.workspaceId,
    revision: editor.revisionQuery.data ?? null,
    enabled: stage === "styleGuide" && Boolean(editor.revisionQuery.data),
    canWrite: editor.canWrite,
    recoveredPreview:
      editor.recoveredDraftPreview?.kind === "styleGuide"
        ? editor.recoveredDraftPreview.preview
        : null,
    onDraftAutosave: editor.queueDraftAutosave,
    onDraftDiscard: editor.discardDraftCheckpoint,
  });
  const design = useProjectDesignController({
    projectId,
    revision: currentRevision,
    page: currentPage,
    componentCatalog: editor.componentCatalogQuery.data ?? null,
    enabled: stage === "design",
    recoveredPreview:
      editor.recoveredDraftPreview?.kind === "design" ? editor.recoveredDraftPreview.preview : null,
    onDraftAutosave: editor.queueDraftAutosave,
    onDraftDiscard: editor.discardDraftCheckpoint,
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
  const undoDisabledReason = editor.historyQuery.isPending
    ? t("CREATION_EDITOR_HISTORY_LOADING")
    : editor.historyQuery.error
      ? t("CREATION_EDITOR_HISTORY_ERROR")
      : editor.historyQuery.data?.restoreCapability === "available" &&
          editor.historyQuery.data.undoTargetRevisionId
        ? undefined
        : t("CREATION_EDITOR_UNDO_EMPTY");
  const redoDisabledReason = editor.historyQuery.isPending
    ? t("CREATION_EDITOR_HISTORY_LOADING")
    : editor.historyQuery.error
      ? t("CREATION_EDITOR_HISTORY_ERROR")
      : editor.historyQuery.data?.redoTargetRevisionId
        ? undefined
        : t("CREATION_EDITOR_REDO_EMPTY");
  return (
    <main
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-transparent"
      data-testid="creation-editor"
    >
      <EditorToolbar
        projectName={projectName}
        stage={stage}
        onProjectNameChange={(name) => renameProject.mutate(name)}
        onStageChange={(nextStage) => {
          editor.discardWireframePreview();
          editor.discardSitemapPlanningPreview();
          design.discardPreview();
          wireframeGeneration.discardCandidatePreview();
          setStage(nextStage);
        }}
        onPreview={() => setPreviewOpen(true)}
        previewDisabledReason={
          selectedPage && previewLocales.length > 0
            ? undefined
            : t("CREATION_EDITOR_PREVIEW_PAGE_REQUIRED")
        }
        designDisabledReason={designDisabledReason}
        undoDisabledReason={undoDisabledReason}
        redoDisabledReason={redoDisabledReason}
        onUndo={() => editor.previewRestore.mutate(undefined)}
        onRedo={() => {
          const target = editor.historyQuery.data?.redoTargetRevisionId;
          if (target) editor.previewRestore.mutate(target);
        }}
      />
      <div className="relative flex min-h-0 flex-1">
        <EditorSidebar />
        <div className="flex min-w-0 min-h-0 flex-1">
          {stage === "sitemap" ? (
            <>
              <SitemapCanvas
                projectName={projectName}
                pages={revision.pages}
                selectedPageId={editor.selectedPageId}
                onSelectPage={(pageId) => {
                  editor.discardSitemapPlanningPreview();
                  editor.setSelectedPageId(pageId);
                }}
                onOpenAI={openAiDrawer}
                onAddPage={() => editor.setAddPageOpen(true)}
                onManageSharedSections={() => setSharedSectionsOpen(true)}
                onReorderPage={(pageId, sortOrder) =>
                  editor.previewSitemapChange.mutate([
                    {
                      type: "page.reorder",
                      operationId: globalThis.crypto.randomUUID(),
                      itemId: pageId,
                      sortOrder,
                    },
                  ])
                }
                reviewPanel={
                  editor.restorePreview ? (
                    <SitemapChangeReview
                      preview={editor.restorePreview}
                      applying={editor.applyRestore.isPending}
                      onApply={() => editor.applyRestore.mutate()}
                      onDiscard={editor.discardRestorePreview}
                    />
                  ) : editor.sitemapStructurePreview ? (
                    <SitemapChangeReview
                      preview={editor.sitemapStructurePreview}
                      applying={editor.applySitemapChange.isPending}
                      onApply={() => editor.applySitemapChange.mutate()}
                      onDiscard={editor.discardSitemapStructurePreview}
                    />
                  ) : undefined
                }
                canEdit={editor.canWrite}
                editDisabledReason={
                  editor.permissionReady
                    ? t("CREATION_EDITOR_AI_PERMISSION_REQUIRED")
                    : t("CREATION_EDITOR_AI_PREPARING")
                }
                canOpenAI
                openAIDisabledReason=""
                pageDetails={
                  selectedPage ? (
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-caption font-semibold tracking-wide text-label-secondary uppercase">
                            {t("CREATION_EDITOR_PAGE_TYPE")}
                          </p>
                          <h2 className="mt-1 truncate text-title-3 font-semibold text-label-primary">
                            {selectedPage.title}
                          </h2>
                          <p className="mt-1 truncate font-mono text-caption text-label-secondary">
                            {selectedPage.routes?.find((route) => route.isActive)?.path ??
                              selectedPage.routes?.[0]?.path ??
                              "—"}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-md border border-border px-2 py-1 font-mono text-caption text-label-secondary">
                          v{selectedPage.versionNumber}
                        </span>
                      </div>
                      {selectedPage.summary ? (
                        <p className="mt-3 break-words text-footnote leading-5 text-label-secondary">
                          {selectedPage.summary}
                        </p>
                      ) : null}
                      <SitemapIntentEditor
                        page={selectedPage}
                        canWrite={editor.canWrite}
                        preview={editor.sitemapPlanningPreview}
                        previewing={editor.previewSitemapPlanning.isPending}
                        applying={editor.applySitemapPlanning.isPending}
                        error={
                          editor.sitemapPlanningError
                            ? getErrorMessage(editor.sitemapPlanningError)
                            : null
                        }
                        onPreview={(draft) => editor.previewSitemapPlanning.mutate(draft)}
                        onApply={() => editor.applySitemapPlanning.mutate()}
                        onDiscard={editor.discardSitemapPlanningPreview}
                        onSyncWireframe={() => {
                          setSelectedSectionId(null);
                          setStage("wireframe");
                        }}
                      />
                    </div>
                  ) : undefined
                }
              />
              <AddPageDialog
                open={editor.addPageOpen}
                onOpenChange={editor.setAddPageOpen}
                projectId={projectId}
                revision={revision}
                onApplied={async () => {
                  await editor.discardDraftCheckpoint();
                  await editor.invalidateBuilder();
                }}
                onDraftAutosave={editor.queueDraftAutosave}
              />
              <SharedSectionManagerDialog
                open={sharedSectionsOpen}
                onOpenChange={setSharedSectionsOpen}
                projectId={projectId}
                revision={revision}
                canWrite={editor.canEditWireframe}
                permissionReady={editor.permissionReady}
                onApplied={editor.invalidateBuilder}
                onDraftAutosave={editor.queueDraftAutosave}
                onDraftDiscard={editor.discardDraftCheckpoint}
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
                canEdit={editor.canEditWireframe}
                onReorderSection={(sectionId, index) => {
                  if (!selectedPage) return;
                  const section = selectedPage.wireframe?.sections?.find(
                    (candidate) => candidate.id === sectionId,
                  );
                  if (!section) return;
                  editor.previewWireframeChange.mutate([
                    {
                      type: "wireframe.section.reorder",
                      operationId: globalThis.crypto.randomUUID(),
                      itemId: selectedPage.itemId,
                      expectedDraftVersion: selectedPage.versionNumber,
                      sectionId,
                      index,
                    },
                  ]);
                }}
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
              onDraftAutosave={editor.queueDraftAutosave}
              onDraftDiscard={editor.discardDraftCheckpoint}
            />
          )}
        </div>
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
      {editor.conflictError ? (
        <EditorConflictSurface
          error={editor.conflictError}
          refreshing={editor.conflictRefreshing}
          repreviewError={
            editor.conflictRepreviewError ? getErrorMessage(editor.conflictRepreviewError) : null
          }
          onRefresh={() => void editor.refreshConflict()}
          onDiscard={editor.discardConflict}
        />
      ) : null}
    </main>
  );
}
