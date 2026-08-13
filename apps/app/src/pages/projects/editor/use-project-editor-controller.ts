import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  applyProjectBuilderChangeSet,
  buildProjectBuilderQueryKey,
  buildProjectBuilderHistoryQueryKey,
  buildProjectBuilderRevisionQueryKey,
  discardProjectBuilderDraftCheckpoint,
  getProjectBuilder,
  getProjectBuilderDraftCheckpoint,
  getProjectBuilderHistory,
  getProjectBuilderComponentCatalog,
  getProjectBuilderRevision,
  previewProjectBuilderChangeSet,
  saveProjectBuilderDraftCheckpoint,
  type BuilderDraftCheckpoint,
} from "@/api/project-builder";
import type {
  BuilderChangeSetPreviewOut,
  BuilderChangeSetPreviewRequest,
  BuilderSectionIntentV1,
} from "@arclayer/openapi";
import { getProjectDetail } from "@/api/projects";
import { useProjectPermissionAccess } from "@/hooks/use-workspace-permission-access";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { ApiError } from "@/lib/http";

const BUILDER_DRAFT_SESSION = "project-editor";
const BUILDER_DRAFT_DEBOUNCE_MS = 250;

type BuilderChangeOperation = BuilderChangeSetPreviewRequest["operations"][number];
type RestoreChangeOperation = Extract<BuilderChangeOperation, { type: "revision.restore" }>;
export type WireframeChangeOperation = Extract<
  BuilderChangeOperation,
  { type: `wireframe.${string}` }
>;
export type SitemapChangeOperation = Extract<BuilderChangeOperation, { type: `page.${string}` }>;
export interface SitemapPlanningDraft {
  itemId: string;
  purpose: string;
  sectionIntents: BuilderSectionIntentV1[];
}

type ConflictPreviewIntent =
  | { kind: "wireframe"; operations: WireframeChangeOperation[] }
  | { kind: "sitemap"; operations: SitemapChangeOperation[] };

export type BuilderDraftSaveState = "idle" | "queued" | "saving" | "saved" | "conflict" | "error";

interface PendingDraftSave {
  operations: BuilderChangeSetPreviewRequest["operations"];
  resolvers: Array<(checkpoint: BuilderDraftCheckpoint) => void>;
  rejecters: Array<(error: unknown) => void>;
}

function commandKey(prefix: string): string {
  return `${prefix}:${globalThis.crypto.randomUUID()}`;
}

export function useProjectEditorController(
  projectId: string,
  initialSelectedPageId: string | null,
) {
  const { t } = useTranslation("account");
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(initialSelectedPageId);
  const [addPageOpen, setAddPageOpen] = useState(false);
  const [wireframePreview, setWireframePreview] = useState<BuilderChangeSetPreviewOut | null>(null);
  const [sitemapPlanningPreview, setSitemapPlanningPreview] =
    useState<BuilderChangeSetPreviewOut | null>(null);
  const [sitemapStructurePreview, setSitemapStructurePreview] =
    useState<BuilderChangeSetPreviewOut | null>(null);
  const [restorePreview, setRestorePreview] = useState<BuilderChangeSetPreviewOut | null>(null);
  const [recoveredDraftPreview, setRecoveredDraftPreview] = useState<{
    kind: "design" | "styleGuide";
    preview: BuilderChangeSetPreviewOut;
  } | null>(null);
  const conflictIntentRef = useRef<ConflictPreviewIntent | null>(null);

  const projectQuery = useQuery({
    queryKey: ["project", "detail", projectId],
    queryFn: () => getProjectDetail(projectId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const builderQuery = useQuery({
    queryKey: buildProjectBuilderQueryKey(projectId),
    queryFn: ({ signal }) => getProjectBuilder(projectId, signal),
    retry: false,
  });
  const revisionId = builderQuery.data?.currentSiteRevision?.id ?? null;
  const revisionQuery = useQuery({
    queryKey: buildProjectBuilderRevisionQueryKey(projectId, revisionId),
    queryFn: ({ signal }) => getProjectBuilderRevision(projectId, revisionId!, signal),
    enabled: Boolean(revisionId),
    retry: false,
  });
  const historyQuery = useQuery({
    queryKey: buildProjectBuilderHistoryQueryKey(projectId),
    queryFn: ({ signal }) => getProjectBuilderHistory(projectId, signal),
    enabled: Boolean(revisionId),
    retry: false,
  });
  const draftCheckpointQuery = useQuery({
    queryKey: ["project", "builder", projectId, "draft-checkpoint", BUILDER_DRAFT_SESSION],
    queryFn: ({ signal }) =>
      getProjectBuilderDraftCheckpoint(projectId, BUILDER_DRAFT_SESSION, signal),
    enabled: Boolean(revisionId),
    retry: false,
  });
  const [draftSaveState, setDraftSaveState] = useState<BuilderDraftSaveState>("idle");
  const checkpointVersionRef = useRef(0);
  const pendingDraftSaveRef = useRef<PendingDraftSave | null>(null);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftSaveInFlightRef = useRef(false);
  const recoveredCheckpointRef = useRef<string | null>(null);
  const localCheckpointRef = useRef<string | null>(null);
  const componentCatalogQuery = useQuery({
    queryKey: ["project", "builder", projectId, "component-catalog", revisionId],
    queryFn: ({ signal }) => getProjectBuilderComponentCatalog(projectId, signal),
    enabled: Boolean(revisionId),
    retry: false,
  });
  const permission = useProjectPermissionAccess(projectId);

  const flushDraftAutosave = useCallback(async () => {
    if (draftSaveInFlightRef.current) return;
    const pending = pendingDraftSaveRef.current;
    if (!pending) return;
    pendingDraftSaveRef.current = null;
    const revision = revisionQuery.data;
    if (!revision) {
      const error = new Error(t("CREATION_EDITOR_SITEMAP_REVISION_REQUIRED"));
      pending.rejecters.forEach((reject) => reject(error));
      return;
    }
    draftSaveInFlightRef.current = true;
    setDraftSaveState("saving");
    try {
      const saved = await saveProjectBuilderDraftCheckpoint(
        projectId,
        {
          baseRevisionId: revision.siteRevision.id,
          baseEtag: revision.siteRevision.manifestHash,
          expectedCheckpointVersion: checkpointVersionRef.current,
          clientSessionId: BUILDER_DRAFT_SESSION,
          operations: pending.operations,
          provenanceSource: "human",
        },
        commandKey("builder-draft-autosave"),
      );
      checkpointVersionRef.current = saved.checkpointVersion;
      localCheckpointRef.current = `${saved.id}:${saved.checkpointVersion}`;
      setDraftSaveState("saved");
      pending.resolvers.forEach((resolve) => resolve(saved));
      queryClient.setQueryData(
        ["project", "builder", projectId, "draft-checkpoint", BUILDER_DRAFT_SESSION],
        saved,
      );
    } catch (error) {
      setDraftSaveState(error instanceof ApiError && error.status === 409 ? "conflict" : "error");
      pending.rejecters.forEach((reject) => reject(error));
    } finally {
      draftSaveInFlightRef.current = false;
      if (pendingDraftSaveRef.current) {
        draftSaveTimerRef.current = setTimeout(
          () => void flushDraftAutosave(),
          BUILDER_DRAFT_DEBOUNCE_MS,
        );
      }
    }
  }, [projectId, queryClient, revisionQuery.data, t]);

  const queueDraftAutosave = useCallback(
    (operations: BuilderChangeSetPreviewRequest["operations"]) =>
      new Promise<BuilderDraftCheckpoint>((resolve, reject) => {
        const pending = pendingDraftSaveRef.current;
        if (pending) {
          pendingDraftSaveRef.current = {
            operations,
            resolvers: [...pending.resolvers, resolve],
            rejecters: [...pending.rejecters, reject],
          };
        } else {
          pendingDraftSaveRef.current = {
            operations,
            resolvers: [resolve],
            rejecters: [reject],
          };
        }
        setDraftSaveState("queued");
        if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = setTimeout(
          () => void flushDraftAutosave(),
          BUILDER_DRAFT_DEBOUNCE_MS,
        );
      }),
    [flushDraftAutosave],
  );

  const discardDraftCheckpoint = useCallback(async () => {
    const version = checkpointVersionRef.current;
    if (version < 1) {
      setRecoveredDraftPreview(null);
      return;
    }
    await discardProjectBuilderDraftCheckpoint(projectId, version, BUILDER_DRAFT_SESSION);
    checkpointVersionRef.current = 0;
    setRecoveredDraftPreview(null);
    setDraftSaveState("idle");
    await queryClient.invalidateQueries({
      queryKey: ["project", "builder", projectId, "draft-checkpoint", BUILDER_DRAFT_SESSION],
    });
  }, [projectId, queryClient]);

  useEffect(() => {
    const checkpoint = draftCheckpointQuery.data;
    const revision = revisionQuery.data;
    if (!checkpoint || checkpoint.status !== "draft" || !revision) return;
    checkpointVersionRef.current = checkpoint.checkpointVersion;
    if (
      checkpoint.baseRevisionId !== revision.siteRevision.id ||
      checkpoint.operations.length === 0 ||
      recoveredCheckpointRef.current === `${checkpoint.id}:${checkpoint.checkpointVersion}`
    ) {
      return;
    }
    if (localCheckpointRef.current === `${checkpoint.id}:${checkpoint.checkpointVersion}`) {
      return;
    }
    recoveredCheckpointRef.current = `${checkpoint.id}:${checkpoint.checkpointVersion}`;
    void previewProjectBuilderChangeSet(
      projectId,
      {
        baseRevisionId: checkpoint.baseRevisionId,
        baseEtag: checkpoint.baseEtag,
        operations: checkpoint.operations,
        provenanceSource: "human",
      },
      commandKey("builder-draft-recovery-preview"),
    )
      .then((preview) => {
        const family = checkpoint.operations[0]?.type ?? "";
        if (family.startsWith("wireframe.")) {
          conflictIntentRef.current = {
            kind: "wireframe",
            operations: checkpoint.operations as WireframeChangeOperation[],
          };
          setWireframePreview(preview);
        } else if (family === "revision.restore") setRestorePreview(preview);
        else if (family.startsWith("design-system.")) {
          setRecoveredDraftPreview({ kind: "styleGuide", preview });
        } else if (family.startsWith("design.")) {
          setRecoveredDraftPreview({ kind: "design", preview });
        } else {
          conflictIntentRef.current = {
            kind: "sitemap",
            operations: checkpoint.operations as SitemapChangeOperation[],
          };
          setSitemapStructurePreview(preview);
        }
      })
      .catch(() => setDraftSaveState("error"));
  }, [draftCheckpointQuery.data, projectId, revisionQuery.data]);

  useEffect(
    () => () => {
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
      void flushDraftAutosave();
    },
    [flushDraftAutosave],
  );

  useEffect(() => {
    const pages = revisionQuery.data?.pages ?? [];
    if (pages.length === 0) return;
    if (selectedPageId && pages.some((page) => page.itemId === selectedPageId)) return;
    setSelectedPageId(pages[0]?.itemId ?? null);
  }, [revisionQuery.data?.pages, selectedPageId]);

  useEffect(() => {
    if (conflictIntentRef.current) {
      setSitemapPlanningPreview(null);
      return;
    }
    setWireframePreview(null);
    setSitemapPlanningPreview(null);
    setSitemapStructurePreview(null);
    setRecoveredDraftPreview(null);
  }, [revisionId]);

  const previewWireframeChange = useMutation({
    mutationFn: async (operations: WireframeChangeOperation[]) => {
      const revision = revisionQuery.data;
      if (!revision) throw new Error(t("CREATION_EDITOR_WIREFRAME_REVISION_REQUIRED"));
      await queueDraftAutosave(operations);
      return previewProjectBuilderChangeSet(
        projectId,
        {
          baseRevisionId: revision.siteRevision.id,
          baseEtag: revision.siteRevision.manifestHash,
          operations,
          provenanceSource: "human",
        },
        commandKey("wireframe-preview"),
      );
    },
    onMutate: (operations) => {
      conflictIntentRef.current = { kind: "wireframe", operations };
    },
    onSuccess: setWireframePreview,
  });

  const applyWireframeChange = useMutation({
    mutationFn: () => {
      if (!wireframePreview) throw new Error(t("CREATION_EDITOR_WIREFRAME_PREVIEW_REQUIRED"));
      return applyProjectBuilderChangeSet(
        projectId,
        wireframePreview.changeSetId,
        {
          previewToken: wireframePreview.previewToken,
          approval: wireframePreview.approval
            ? {
                approvalId: wireframePreview.approval.approvalId,
                decision: "approve",
                expectedApprovalClass: wireframePreview.approval.approvalClass,
              }
            : undefined,
        },
        commandKey("wireframe-apply"),
      );
    },
    onSuccess: async () => {
      setWireframePreview(null);
      conflictIntentRef.current = null;
      await discardDraftCheckpoint();
      await invalidateBuilder();
    },
  });

  const previewSitemapPlanning = useMutation({
    mutationFn: async (draft: SitemapPlanningDraft) => {
      const revision = revisionQuery.data;
      if (!revision) throw new Error(t("CREATION_EDITOR_SITEMAP_REVISION_REQUIRED"));
      const operations: SitemapChangeOperation[] = [
        {
          type: "page.intent.replace",
          operationId: `plan-${draft.itemId}`,
          itemId: draft.itemId,
          purpose: draft.purpose,
          sectionIntents: draft.sectionIntents,
        },
      ];
      await queueDraftAutosave(operations);
      return previewProjectBuilderChangeSet(
        projectId,
        {
          baseRevisionId: revision.siteRevision.id,
          baseEtag: revision.siteRevision.manifestHash,
          provenanceSource: "human",
          operations,
        },
        commandKey("sitemap-planning-preview"),
      );
    },
    onMutate: (draft) => {
      conflictIntentRef.current = {
        kind: "sitemap",
        operations: [
          {
            type: "page.intent.replace",
            operationId: `plan-${draft.itemId}`,
            itemId: draft.itemId,
            purpose: draft.purpose,
            sectionIntents: draft.sectionIntents,
          },
        ],
      };
    },
    onSuccess: setSitemapPlanningPreview,
  });

  const applySitemapPlanning = useMutation({
    mutationFn: () => {
      if (!sitemapPlanningPreview) {
        throw new Error(t("CREATION_EDITOR_SITEMAP_PREVIEW_REQUIRED"));
      }
      return applyProjectBuilderChangeSet(
        projectId,
        sitemapPlanningPreview.changeSetId,
        {
          previewToken: sitemapPlanningPreview.previewToken,
          approval: sitemapPlanningPreview.approval
            ? {
                approvalId: sitemapPlanningPreview.approval.approvalId,
                decision: "approve",
                expectedApprovalClass: sitemapPlanningPreview.approval.approvalClass,
              }
            : undefined,
        },
        commandKey("sitemap-planning-apply"),
      );
    },
    onSuccess: async () => {
      setSitemapPlanningPreview(null);
      conflictIntentRef.current = null;
      await discardDraftCheckpoint();
      await invalidateBuilder();
    },
  });

  const previewSitemapChange = useMutation({
    mutationFn: async (operations: SitemapChangeOperation[]) => {
      const revision = revisionQuery.data;
      if (!revision) throw new Error(t("CREATION_EDITOR_SITEMAP_REVISION_REQUIRED"));
      await queueDraftAutosave(operations);
      return previewProjectBuilderChangeSet(
        projectId,
        {
          baseRevisionId: revision.siteRevision.id,
          baseEtag: revision.siteRevision.manifestHash,
          provenanceSource: "human",
          operations,
        },
        commandKey("sitemap-change-preview"),
      );
    },
    onMutate: (operations) => {
      conflictIntentRef.current = { kind: "sitemap", operations };
    },
    onSuccess: setSitemapStructurePreview,
  });

  const applySitemapChange = useMutation({
    mutationFn: () => {
      if (!sitemapStructurePreview) {
        throw new Error(t("CREATION_EDITOR_SITEMAP_PREVIEW_REQUIRED"));
      }
      return applyProjectBuilderChangeSet(
        projectId,
        sitemapStructurePreview.changeSetId,
        {
          previewToken: sitemapStructurePreview.previewToken,
          approval: sitemapStructurePreview.approval
            ? {
                approvalId: sitemapStructurePreview.approval.approvalId,
                decision: "approve",
                expectedApprovalClass: sitemapStructurePreview.approval.approvalClass,
              }
            : undefined,
        },
        commandKey("sitemap-change-apply"),
      );
    },
    onSuccess: async () => {
      setSitemapStructurePreview(null);
      conflictIntentRef.current = null;
      await discardDraftCheckpoint();
      await invalidateBuilder();
    },
  });

  const previewRestore = useMutation({
    mutationFn: async (requestedTargetRevisionId?: string) => {
      const revision = revisionQuery.data;
      const targetRevisionId = requestedTargetRevisionId ?? historyQuery.data?.undoTargetRevisionId;
      if (!revision || !targetRevisionId) throw new Error(t("CREATION_EDITOR_UNDO_EMPTY"));
      const operation: RestoreChangeOperation = {
        type: "revision.restore",
        operationId: globalThis.crypto.randomUUID(),
        targetRevisionId,
      };
      await queueDraftAutosave([operation]);
      return previewProjectBuilderChangeSet(
        projectId,
        {
          baseRevisionId: revision.siteRevision.id,
          baseEtag: revision.siteRevision.manifestHash,
          operations: [operation],
          provenanceSource: "human",
        },
        commandKey("revision-restore-preview"),
      );
    },
    onSuccess: setRestorePreview,
  });

  const applyRestore = useMutation({
    mutationFn: () => {
      if (!restorePreview) throw new Error(t("CREATION_EDITOR_SITEMAP_PREVIEW_REQUIRED"));
      return applyProjectBuilderChangeSet(
        projectId,
        restorePreview.changeSetId,
        {
          previewToken: restorePreview.previewToken,
          approval: restorePreview.approval
            ? {
                approvalId: restorePreview.approval.approvalId,
                decision: "approve",
                expectedApprovalClass: restorePreview.approval.approvalClass,
              }
            : undefined,
        },
        commandKey("revision-restore-apply"),
      );
    },
    onSuccess: async () => {
      setRestorePreview(null);
      await discardDraftCheckpoint();
      await invalidateBuilder();
    },
  });

  const invalidateBuilder = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: buildProjectBuilderQueryKey(projectId) }),
      queryClient.invalidateQueries({ queryKey: buildProjectBuilderHistoryQueryKey(projectId) }),
    ]);
  };
  const conflictError = [
    previewWireframeChange.error,
    applyWireframeChange.error,
    previewSitemapPlanning.error,
    applySitemapPlanning.error,
    previewSitemapChange.error,
    applySitemapChange.error,
    previewRestore.error,
    applyRestore.error,
  ].find(isEditorConflictError);
  const [conflictRefreshing, setConflictRefreshing] = useState(false);
  const [conflictRepreviewError, setConflictRepreviewError] = useState<unknown>(null);
  const refreshConflict = async () => {
    setConflictRefreshing(true);
    setConflictRepreviewError(null);
    try {
      const latestBuilder = await queryClient.fetchQuery({
        queryKey: buildProjectBuilderQueryKey(projectId),
        queryFn: ({ signal }) => getProjectBuilder(projectId, signal),
      });
      await queryClient.fetchQuery({
        queryKey: buildProjectBuilderHistoryQueryKey(projectId),
        queryFn: ({ signal }) => getProjectBuilderHistory(projectId, signal),
      });
      const latestRevisionId = latestBuilder.currentSiteRevision?.id ?? null;
      const latestRevision = latestRevisionId
        ? await queryClient.fetchQuery({
            queryKey: buildProjectBuilderRevisionQueryKey(projectId, latestRevisionId),
            queryFn: ({ signal }) => getProjectBuilderRevision(projectId, latestRevisionId, signal),
          })
        : null;
      const intent = conflictIntentRef.current;
      if (intent && latestRevision) {
        const operations = rebaseConflictOperations(intent.operations, latestRevision);
        const nextPreview = await previewProjectBuilderChangeSet(
          projectId,
          {
            baseRevisionId: latestRevision.siteRevision.id,
            baseEtag: latestRevision.siteRevision.manifestHash,
            operations,
            provenanceSource: "human",
          },
          commandKey("conflict-repreview"),
        );
        if (intent.kind === "wireframe") setWireframePreview(nextPreview);
        else setSitemapStructurePreview(nextPreview);
      }
      applyWireframeChange.reset();
      applySitemapPlanning.reset();
      applySitemapChange.reset();
    } catch (error) {
      setConflictRepreviewError(error);
    } finally {
      setConflictRefreshing(false);
    }
  };
  const discardConflict = () => {
    setWireframePreview(null);
    setSitemapPlanningPreview(null);
    setSitemapStructurePreview(null);
    conflictIntentRef.current = null;
    setConflictRepreviewError(null);
    applyWireframeChange.reset();
    applySitemapPlanning.reset();
    applySitemapChange.reset();
  };
  const permissionReady = !permission.authzQuery.isPending && !permission.actionsQuery.isPending;
  const canWrite = permissionReady && permission.hasAction("project:content:site-builder:write");
  const canEditWireframe = canWrite && permission.hasAction("project:content:items:write");
  return {
    workspaceId,
    projectQuery,
    builderQuery,
    revisionQuery,
    historyQuery,
    draftCheckpointQuery,
    draftSaveState,
    recoveredDraftPreview,
    discardDraftCheckpoint,
    queueDraftAutosave,
    componentCatalogQuery,
    selectedPageId,
    setSelectedPageId,
    canWrite,
    permissionReady,
    operationError:
      previewWireframeChange.error ??
      applyWireframeChange.error ??
      previewSitemapChange.error ??
      applySitemapChange.error,
    addPageOpen,
    setAddPageOpen,
    invalidateBuilder,
    canEditWireframe,
    wireframePreview,
    previewWireframeChange,
    applyWireframeChange,
    wireframeOperationError: previewWireframeChange.error ?? applyWireframeChange.error,
    discardWireframePreview: () => {
      setWireframePreview(null);
      conflictIntentRef.current = null;
    },
    sitemapPlanningPreview,
    previewSitemapPlanning,
    applySitemapPlanning,
    sitemapPlanningError: previewSitemapPlanning.error ?? applySitemapPlanning.error,
    discardSitemapPlanningPreview: () => {
      setSitemapPlanningPreview(null);
      conflictIntentRef.current = null;
    },
    sitemapStructurePreview,
    previewSitemapChange,
    applySitemapChange,
    restorePreview,
    previewRestore,
    applyRestore,
    discardRestorePreview: () => {
      setRestorePreview(null);
      applyRestore.reset();
      previewRestore.reset();
    },
    sitemapStructureError: previewSitemapChange.error ?? applySitemapChange.error,
    discardSitemapStructurePreview: () => {
      setSitemapStructurePreview(null);
      conflictIntentRef.current = null;
    },
    conflictError,
    conflictRefreshing,
    conflictRepreviewError,
    refreshConflict,
    discardConflict,
  };
}

function rebaseConflictOperations(
  operations: readonly BuilderChangeOperation[],
  revision: Awaited<ReturnType<typeof getProjectBuilderRevision>>,
): BuilderChangeOperation[] {
  return operations.map((operation) => {
    if (!("expectedDraftVersion" in operation)) return operation;
    const page = revision.pages.find((item) => item.itemId === operation.itemId);
    return page ? { ...operation, expectedDraftVersion: page.versionNumber } : operation;
  });
}

function isEditorConflictError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 409;
}
