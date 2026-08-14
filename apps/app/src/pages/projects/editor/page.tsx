import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  BuilderGenerationTargetV1,
  BuilderRevisionGlobalSectionOut,
  BuilderSectionIntentV1,
} from "@arclayer/openapi";

import { EditorSidebar } from "@/layouts/creation-layout";
import { CompositionSagaReview } from "@/pages/projects/editor/composition-saga-review";
import { DesignStage } from "@/pages/projects/editor/design-stage";
import { EditorBoundary, EditorLoadingState } from "@/pages/projects/editor/editor-boundaries";
import { EditorConflictSurface } from "@/pages/projects/editor/editor-conflict-surface";
import { EditorToolbar, type EditorStage } from "@/pages/projects/editor/editor-toolbar";
import {
  SitemapCanvas,
  type SitemapAddPagePlacement,
} from "@/pages/projects/editor/sitemap-canvas";
import {
  SitemapAddSectionPanel,
  type SitemapSectionInsert,
} from "@/pages/projects/editor/sitemap-add-section";
import {
  SitemapPagePromptPanel,
  type SitemapPagePromptTarget,
} from "@/pages/projects/editor/sitemap-page-prompt-panel";
import { SitemapChangeReview } from "@/pages/projects/editor/sitemap-change-review";
import { SitemapStageInspector } from "@/pages/projects/editor/sitemap-stage-inspector";
import { SharedSectionManagerPanel } from "@/pages/projects/editor/shared-section-manager-dialog";
import { StyleGuideStage } from "@/pages/projects/editor/style-guide-stage";
import { useProjectEditorController } from "@/pages/projects/editor/use-project-editor-controller";
import { useSitemapInstantPageCreate } from "@/pages/projects/editor/use-sitemap-page-create";
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
  const [sitemapSectionId, setSitemapSectionId] = useState<string | null>(null);
  const [sitemapInspectorOpen, setSitemapInspectorOpen] = useState(true);
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [addSectionAnchor, setAddSectionAnchor] = useState<HTMLElement | null>(null);
  const [addSectionTarget, setAddSectionTarget] = useState<{
    pageId: string;
    insertIndex: number;
  } | null>(null);
  const [pagePromptOpen, setPagePromptOpen] = useState(false);
  const [pagePromptAnchor, setPagePromptAnchor] = useState<HTMLElement | null>(null);
  const [pagePromptTarget, setPagePromptTarget] = useState<SitemapPagePromptTarget | null>(null);
  const [pagePromptPlacement, setPagePromptPlacement] = useState<SitemapAddPagePlacement | null>(
    null,
  );
  const [sharedSectionsOpen, setSharedSectionsOpen] = useState(false);
  const [sharedSectionsAnchor, setSharedSectionsAnchor] = useState<HTMLElement | null>(null);
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
  const sitemapRevision = editor.revisionQuery.data ?? null;
  const globalInstanceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const reference of sitemapRevision?.globalSectionGraph?.references ?? []) {
      counts.set(reference.targetItemId, (counts.get(reference.targetItemId) ?? 0) + 1);
    }
    return counts;
  }, [sitemapRevision?.globalSectionGraph?.references]);

  const placementForSibling = useCallback(
    (placement: SitemapAddPagePlacement) => {
      const pages = sitemapRevision?.pages ?? [];
      const target = pages.find((page) => page.itemId === placement.pageId);
      if (!target) {
        return {
          parentItemId: null,
          sortOrder: pages.filter((page) => !page.parentItemId).length,
        };
      }
      const parentItemId = target.parentItemId ?? null;
      const siblings = pages
        .filter((page) => (page.parentItemId ?? null) === parentItemId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const index = siblings.findIndex((page) => page.itemId === placement.pageId);
      return {
        parentItemId,
        sortOrder: placement.position === "before" ? Math.max(0, index) : index + 1,
      };
    },
    [sitemapRevision?.pages],
  );

  const instantPageCreate = useSitemapInstantPageCreate({
    projectId,
    revision: sitemapRevision,
    onDraftAutosave: editor.queueDraftAutosave,
    onDraftDiscard: editor.discardDraftCheckpoint,
    invalidateBuilder: editor.invalidateBuilder,
    onCreated: (created) => {
      const createdPage = editor.revisionQuery.data?.pages.find(
        (page) => page.title === created.title,
      );
      if (createdPage) {
        editor.setSelectedPageId(createdPage.itemId);
        setSitemapSectionId(null);
      }
      setSitemapInspectorOpen(true);
    },
  });

  const applySectionIntents = useCallback(
    (
      pageId: string,
      transform: (intents: BuilderSectionIntentV1[]) => BuilderSectionIntentV1[],
    ) => {
      const page = sitemapRevision?.pages.find((item) => item.itemId === pageId);
      if (!page?.sectionIntents?.length) return;
      editor.previewSitemapPlanning.mutate({
        itemId: pageId,
        purpose: page.purpose?.trim() || t("CREATION_EDITOR_SITEMAP_DEFAULT_PURPOSE"),
        sectionIntents: transform(page.sectionIntents),
      });
    },
    [sitemapRevision?.pages, t],
  );

  const insertSectionIntent = useCallback(
    (insert: SitemapSectionInsert) => {
      const target = addSectionTarget;
      if (!target) return;
      const page = sitemapRevision?.pages.find((item) => item.itemId === target.pageId);
      if (!page) return;
      const current = page.sectionIntents ?? [];
      const index = target.insertIndex < 0 ? current.length : target.insertIndex;
      const next = [...current];
      next.splice(Math.max(0, Math.min(index, next.length)), 0, {
        id: `intent.${globalThis.crypto.randomUUID()}`,
        label: insert.label,
        goal: insert.goal,
      });
      editor.previewSitemapPlanning.mutate({
        itemId: page.itemId,
        purpose: page.purpose?.trim() || t("CREATION_EDITOR_SITEMAP_DEFAULT_PURPOSE"),
        sectionIntents: next,
      });
    },
    [addSectionTarget, sitemapRevision?.pages, t],
  );

  const insertGlobalSection = useCallback(
    (section: BuilderRevisionGlobalSectionOut) => {
      const target = addSectionTarget;
      if (!target) return;
      const page = sitemapRevision?.pages.find((item) => item.itemId === target.pageId);
      if (!page) return;
      const current = page.sectionIntents ?? [];
      const index = target.insertIndex < 0 ? current.length : target.insertIndex;
      const copied: BuilderSectionIntentV1[] = (section.sectionIntents ?? []).map((intent) => ({
        ...intent,
        id: `intent.${globalThis.crypto.randomUUID()}`,
      }));
      const inserted =
        copied.length > 0
          ? copied
          : [
              {
                id: `intent.${globalThis.crypto.randomUUID()}`,
                label: section.title,
                goal:
                  section.purpose ??
                  section.summary ??
                  t("CREATION_EDITOR_SITEMAP_DEFAULT_PURPOSE"),
              },
            ];
      const next = [...current];
      next.splice(Math.max(0, Math.min(index, next.length)), 0, ...inserted);
      editor.previewSitemapPlanning.mutate({
        itemId: page.itemId,
        purpose: page.purpose?.trim() || t("CREATION_EDITOR_SITEMAP_DEFAULT_PURPOSE"),
        sectionIntents: next,
      });
    },
    [addSectionTarget, sitemapRevision?.pages, t],
  );

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
  const wireframeDisabledReason = revision.pages.length
    ? undefined
    : t("CREATION_EDITOR_WIREFRAME_PAGE_REQUIRED_SHORT");
  const hasAnyWireframe = revision.pages.some((page) => page.wireframe && page.wireframeChecksum);
  const styleGuideDisabledReason = hasAnyWireframe
    ? undefined
    : t("CREATION_EDITOR_STYLE_GUIDE_WIREFRAME_REQUIRED_SHORT");
  const designSystemAssigned = Boolean(revision.siteRevision.designSystemVersionId);
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
            : !designSystemAssigned
              ? t("CREATION_EDITOR_DESIGN_STYLE_GUIDE_REQUIRED_SHORT")
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

  const addSectionTargetPage =
    revision.pages.find((page) => page.itemId === addSectionTarget?.pageId) ?? null;
  const addSectionInsertLabel = !addSectionTarget
    ? null
    : addSectionTarget.insertIndex < 0
      ? t("CREATION_EDITOR_SITEMAP_ADD_SECTION_POSITION_END")
      : t("CREATION_EDITOR_SITEMAP_ADD_SECTION_POSITION_AT", {
          index: addSectionTarget.insertIndex + 1,
        });

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
        wireframeDisabledReason={wireframeDisabledReason}
        styleGuideDisabledReason={styleGuideDisabledReason}
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
                globalSections={revision.globalSections ?? []}
                selectedPageId={editor.selectedPageId}
                selectedSectionId={sitemapSectionId}
                onSelectSection={(pageId, sectionId) => {
                  editor.discardSitemapPlanningPreview();
                  editor.setSelectedPageId(pageId);
                  setSitemapSectionId(sectionId);
                }}
                onOpenAI={openAiDrawer}
                onAddPage={(placement, anchor) => {
                  const neighbor = revision.pages.find((page) => page.itemId === placement.pageId);
                  setPagePromptPlacement(placement);
                  setPagePromptTarget({
                    placement: placement.position,
                    neighborLabel: neighbor?.title ?? null,
                    neighborId: placement.pageId,
                  });
                  setPagePromptAnchor(anchor);
                  setPagePromptOpen(true);
                }}
                onAddPageAtRoot={(anchor) => {
                  setPagePromptPlacement(null);
                  setPagePromptTarget({ placement: "root", neighborLabel: null, neighborId: null });
                  setPagePromptAnchor(anchor);
                  setPagePromptOpen(true);
                }}
                onAddSection={(pageId, insertIndex, anchor) => {
                  setAddSectionTarget({ pageId, insertIndex });
                  setAddSectionAnchor(anchor);
                  setAddSectionOpen(true);
                }}
                onManageSharedSections={(anchor) => {
                  setSharedSectionsAnchor(anchor);
                  setSharedSectionsOpen(true);
                }}
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
                onRenamePage={(pageId, title) => {
                  const page = revision.pages.find((item) => item.itemId === pageId);
                  if (!page) return;
                  editor.previewSitemapChange.mutate([
                    {
                      type: "page.rename",
                      operationId: globalThis.crypto.randomUUID(),
                      itemId: pageId,
                      title,
                      expectedDraftVersion: page.versionNumber,
                    },
                  ]);
                }}
                onDeletePage={(pageId) => {
                  const page = revision.pages.find((item) => item.itemId === pageId);
                  if (!page) return;
                  setSitemapSectionId(null);
                  editor.previewSitemapChange.mutate([
                    {
                      type: "page.delete",
                      operationId: globalThis.crypto.randomUUID(),
                      itemId: pageId,
                      expectedDraftVersion: page.versionNumber,
                    },
                  ]);
                }}
                onRenameSection={(pageId, sectionId, label) =>
                  applySectionIntents(pageId, (intents) =>
                    intents.map((intent) =>
                      intent.id === sectionId ? { ...intent, label } : intent,
                    ),
                  )
                }
                onDeleteSection={(pageId, sectionId) =>
                  applySectionIntents(pageId, (intents) =>
                    intents.filter((intent) => intent.id !== sectionId),
                  )
                }
                onReorderSection={(pageId, sectionId, targetIndex) =>
                  applySectionIntents(pageId, (intents) => {
                    const fromIndex = intents.findIndex((intent) => intent.id === sectionId);
                    if (fromIndex < 0) return intents;
                    const next = [...intents];
                    const [moved] = next.splice(fromIndex, 1);
                    next.splice(Math.max(0, Math.min(targetIndex, next.length)), 0, moved);
                    return next;
                  })
                }
                onFindInWireframe={(pageId) => {
                  editor.setSelectedPageId(pageId);
                  setSelectedSectionId(null);
                  setStage("wireframe");
                }}
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
                  ) : editor.sitemapPlanningPreview ? (
                    <SitemapChangeReview
                      preview={editor.sitemapPlanningPreview}
                      applying={editor.applySitemapPlanning.isPending}
                      onApply={() => editor.applySitemapPlanning.mutate()}
                      onDiscard={editor.discardSitemapPlanningPreview}
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
              />
              {sitemapInspectorOpen ? (
                <SitemapStageInspector
                  page={selectedPage}
                  selectedSectionId={sitemapSectionId}
                  globalSections={revision.globalSections ?? []}
                  globalInstanceCounts={globalInstanceCounts}
                  canEdit={editor.canWrite}
                  onRenamePage={(pageId, title) => {
                    const page = revision.pages.find((item) => item.itemId === pageId);
                    if (!page) return;
                    editor.previewSitemapChange.mutate([
                      {
                        type: "page.rename",
                        operationId: globalThis.crypto.randomUUID(),
                        itemId: pageId,
                        title,
                        expectedDraftVersion: page.versionNumber,
                      },
                    ]);
                  }}
                  onClearSection={() => setSitemapSectionId(null)}
                  onClose={() => setSitemapInspectorOpen(false)}
                  onOpenAI={openAiDrawer}
                />
              ) : null}
              <SitemapPagePromptPanel
                open={pagePromptOpen}
                anchor={pagePromptAnchor}
                onOpenChange={setPagePromptOpen}
                target={pagePromptTarget}
                blankCreatePending={instantPageCreate.isPending}
                onBlankCreate={() => {
                  if (pagePromptPlacement) {
                    instantPageCreate.mutate(placementForSibling(pagePromptPlacement));
                  } else {
                    instantPageCreate.mutate({
                      parentItemId: null,
                      sortOrder: revision.pages.filter((page) => !page.parentItemId).length,
                    });
                  }
                }}
              />
              <SitemapAddSectionPanel
                open={addSectionOpen}
                anchor={addSectionAnchor}
                onOpenChange={setAddSectionOpen}
                pageTitle={addSectionTargetPage?.title ?? null}
                insertLabel={addSectionInsertLabel}
                globalSections={revision.globalSections ?? []}
                globalInstanceCounts={globalInstanceCounts}
                onInsertPreset={(insert) => insertSectionIntent(insert)}
                onInsertGlobal={(section) => insertGlobalSection(section)}
              />
              <SharedSectionManagerPanel
                open={sharedSectionsOpen}
                anchor={sharedSectionsAnchor}
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
                onDuplicateSection={(sectionId) => {
                  if (!selectedPage) return;
                  const sections = selectedPage.wireframe?.sections ?? [];
                  const sourceIndex = sections.findIndex((section) => section.id === sectionId);
                  if (sourceIndex < 0) return;
                  editor.previewWireframeChange.mutate([
                    {
                      type: "wireframe.section.duplicate",
                      operationId: globalThis.crypto.randomUUID(),
                      itemId: selectedPage.itemId,
                      expectedDraftVersion: selectedPage.versionNumber,
                      sectionId,
                      index: sourceIndex + 1,
                      newSectionId: globalThis.crypto.randomUUID(),
                      newIntentId: globalThis.crypto.randomUUID(),
                    },
                  ]);
                }}
                onRemoveSection={(sectionId) => {
                  if (!selectedPage) return;
                  editor.previewWireframeChange.mutate([
                    {
                      type: "wireframe.section.remove",
                      operationId: globalThis.crypto.randomUUID(),
                      itemId: selectedPage.itemId,
                      expectedDraftVersion: selectedPage.versionNumber,
                      sectionId,
                    },
                  ]);
                }}
                onOpenAI={openAiDrawer}
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
              onOpenAI={openAiDrawer}
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
