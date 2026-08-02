import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import type {
  KnowledgeGuidanceDraftSaveRequest,
  KnowledgeGuidancePreviewOut,
} from "@arclayer/openapi";
import { listProjects } from "@/api/projects";
import {
  WORKSPACE_GUIDANCE_QUERY_KEY,
  type GuidanceScope,
  applyGuidanceRemovePreview,
  applyGuidanceRestorePreview,
  attachGuidanceReference,
  createGuidanceRemovePreview,
  createGuidanceRestorePreview,
  detachGuidanceReference,
  getEffectiveGuidance,
  getGuidanceLayer,
  listGuidanceHistory,
  publishGuidance,
  saveGuidanceDraft,
} from "@/api/workspace-guidance";
import { WORKSPACE_KNOWLEDGE_QUERY_KEY, listKnowledgeBases } from "@/api/workspace-knowledge";
import { notifySuccessText } from "@/lib/notifications";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const HISTORY_PAGE_SIZE = 25;
type ProjectGuidanceMode = NonNullable<KnowledgeGuidanceDraftSaveRequest["projectMode"]>;

type PendingPreview = Readonly<{
  kind: "restore" | "remove";
  preview: KnowledgeGuidancePreviewOut;
}>;

function guidanceQueryKey(workspaceId: string, projectId?: string | null) {
  return [
    ...WORKSPACE_GUIDANCE_QUERY_KEY,
    workspaceId,
    projectId ? "project" : "workspace",
    projectId ?? "shared",
  ] as const;
}

export function useWorkspaceGuidanceController(scopeInput: GuidanceScope) {
  const { workspaceId, projectId } = scopeInput;
  const { t } = useTranslation("knowledge");
  const queryClient = useQueryClient();
  const currentProjectId = useWorkspaceStore((state) => state.currentProjectId);
  const [draft, setDraft] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projectId ?? null);
  const [projectMode, setProjectMode] = useState<ProjectGuidanceMode>("supplement");
  const [pendingPreview, setPendingPreview] = useState<PendingPreview | null>(null);
  const scope = useMemo(() => ({ workspaceId, projectId }), [projectId, workspaceId]);

  const guidanceQuery = useQuery({
    queryKey: [...guidanceQueryKey(workspaceId, projectId), "layer"],
    queryFn: ({ signal }) => getGuidanceLayer(scope, signal),
    retry: false,
  });
  const layer = guidanceQuery.data ?? null;
  const contentRevision = layer?.currentDraft ?? layer?.currentPublished ?? null;

  useEffect(() => {
    setDraft(contentRevision?.content ?? "");
  }, [contentRevision?.content, contentRevision?.id]);

  useEffect(() => {
    setProjectMode(layer?.projectMode ?? "supplement");
  }, [layer?.projectMode]);

  const projectsQuery = useQuery({
    queryKey: [...guidanceQueryKey(workspaceId, projectId), "projects"],
    queryFn: () => listProjects({ workspaceId, archived: false, size: 100 }),
    enabled: !projectId,
    retry: false,
  });
  const projects = projectsQuery.data?.items ?? [];

  useEffect(() => {
    if (projectId) {
      setSelectedProjectId(projectId);
      return;
    }
    const projectIds = new Set(projects.map((project) => project.id));
    setSelectedProjectId((current) => {
      if (current && projectIds.has(current)) return current;
      if (currentProjectId && projectIds.has(currentProjectId)) return currentProjectId;
      return null;
    });
  }, [currentProjectId, projectId, projects]);

  const effectiveQuery = useQuery({
    queryKey: [...guidanceQueryKey(workspaceId, projectId), "effective", selectedProjectId],
    queryFn: ({ signal }) => getEffectiveGuidance(workspaceId, selectedProjectId, signal),
    enabled: Boolean(layer),
    retry: false,
  });
  const historyQuery = useInfiniteQuery({
    queryKey: [...guidanceQueryKey(workspaceId, projectId), "history"],
    queryFn: ({ pageParam, signal }) =>
      listGuidanceHistory(scope, {
        limit: HISTORY_PAGE_SIZE,
        cursor: pageParam ?? undefined,
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(layer),
    retry: false,
  });
  const referenceBasesQuery = useQuery({
    queryKey: [...guidanceQueryKey(workspaceId, projectId), "reference-bases"],
    queryFn: ({ signal }) => listKnowledgeBases(workspaceId, { limit: 100, signal }),
    enabled: Boolean(layer),
    retry: false,
  });
  const history = useMemo(
    () => (historyQuery.data?.pages ?? []).flatMap((page) => page.items ?? []),
    [historyQuery.data?.pages],
  );

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: WORKSPACE_GUIDANCE_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KNOWLEDGE_QUERY_KEY }),
    ]);
  };
  const saveDraftMutation = useMutation({
    mutationFn: (input: KnowledgeGuidanceDraftSaveRequest) =>
      saveGuidanceDraft(scope, input, crypto.randomUUID()),
    onSuccess: async () => {
      await invalidate();
      notifySuccessText(t("DRAFT_SAVED"));
    },
  });
  const publishMutation = useMutation({
    mutationFn: (input: { expectedRevision: number; revisionId: string }) =>
      publishGuidance(scope, input, crypto.randomUUID()),
    onSuccess: async () => {
      await invalidate();
      notifySuccessText(t("PUBLISHED"));
    },
  });
  const restorePreviewMutation = useMutation({
    mutationFn: (input: { expectedRevision: number; sourceRevisionId: string }) =>
      createGuidanceRestorePreview(scope, input, crypto.randomUUID()),
    onSuccess: (preview) => setPendingPreview({ kind: "restore", preview }),
  });
  const removePreviewMutation = useMutation({
    mutationFn: (input: { expectedRevision: number }) =>
      createGuidanceRemovePreview(scope, input, crypto.randomUUID()),
    onSuccess: (preview) => setPendingPreview({ kind: "remove", preview }),
  });
  const applyPreviewMutation = useMutation({
    mutationFn: (pending: PendingPreview) => {
      const payload = {
        expectedGuidanceRevision: pending.preview.expectedGuidanceRevision,
        expectedPreviewRevision: pending.preview.previewRevision,
      };
      if (pending.kind === "restore") {
        return applyGuidanceRestorePreview(scope, pending.preview.id, payload, crypto.randomUUID());
      }
      return applyGuidanceRemovePreview(scope, pending.preview.id, payload, crypto.randomUUID());
    },
    onSuccess: async () => {
      setPendingPreview(null);
      await invalidate();
      notifySuccessText(t("CHANGE_APPLIED"));
    },
  });
  const attachReferenceMutation = useMutation({
    mutationFn: (knowledgeBaseId: string) => {
      if (!layer) throw new Error("KNOWLEDGE_GUIDANCE_LAYER_REQUIRED");
      return attachGuidanceReference(
        scope,
        { expectedRevision: layer.metadataRevision, knowledgeBaseId },
        crypto.randomUUID(),
      );
    },
    onSuccess: async () => {
      await invalidate();
      notifySuccessText(t("REFERENCE_ATTACHED"));
    },
  });
  const detachReferenceMutation = useMutation({
    mutationFn: (knowledgeBaseId: string) => {
      if (!layer) throw new Error("KNOWLEDGE_GUIDANCE_LAYER_REQUIRED");
      return detachGuidanceReference(
        scope,
        knowledgeBaseId,
        { expectedRevision: layer.metadataRevision },
        crypto.randomUUID(),
      );
    },
    onSuccess: async () => {
      await invalidate();
      notifySuccessText(t("REFERENCE_DETACHED"));
    },
  });

  const commandError =
    saveDraftMutation.error ??
    publishMutation.error ??
    restorePreviewMutation.error ??
    removePreviewMutation.error ??
    applyPreviewMutation.error ??
    attachReferenceMutation.error ??
    detachReferenceMutation.error;

  return {
    layer,
    draft,
    setDraft,
    isProject: Boolean(projectId),
    projectMode,
    setProjectMode,
    projects,
    selectedProjectId,
    setSelectedProjectId,
    history,
    pendingPreview,
    setPendingPreview,
    guidanceQuery,
    projectsQuery,
    effectiveQuery,
    historyQuery,
    referenceBasesQuery,
    saveDraftMutation,
    publishMutation,
    restorePreviewMutation,
    removePreviewMutation,
    applyPreviewMutation,
    attachReferenceMutation,
    detachReferenceMutation,
    commandError,
    saveDraft: () => {
      if (!layer) throw new Error("KNOWLEDGE_GUIDANCE_LAYER_REQUIRED");
      return saveDraftMutation.mutateAsync({
        content: draft,
        expectedRevision: layer.metadataRevision,
        ...(projectId ? { projectMode } : {}),
      });
    },
    publish: () => {
      if (!layer?.currentDraft?.id) throw new Error("KNOWLEDGE_GUIDANCE_DRAFT_REQUIRED");
      return publishMutation.mutateAsync({
        expectedRevision: layer.metadataRevision,
        revisionId: layer.currentDraft.id,
      });
    },
    previewRestore: (sourceRevisionId: string) => {
      if (!layer) throw new Error("KNOWLEDGE_GUIDANCE_LAYER_REQUIRED");
      return restorePreviewMutation.mutateAsync({
        expectedRevision: layer.metadataRevision,
        sourceRevisionId,
      });
    },
    previewRemoval: () => {
      if (!layer) throw new Error("KNOWLEDGE_GUIDANCE_LAYER_REQUIRED");
      return removePreviewMutation.mutateAsync({ expectedRevision: layer.metadataRevision });
    },
    applyPendingPreview: () => {
      if (!pendingPreview) throw new Error("KNOWLEDGE_GUIDANCE_PREVIEW_REQUIRED");
      return applyPreviewMutation.mutateAsync(pendingPreview);
    },
    resetCommandErrors: () => {
      saveDraftMutation.reset();
      publishMutation.reset();
      restorePreviewMutation.reset();
      removePreviewMutation.reset();
      applyPreviewMutation.reset();
      attachReferenceMutation.reset();
      detachReferenceMutation.reset();
    },
  };
}

export type WorkspaceGuidanceController = ReturnType<typeof useWorkspaceGuidanceController>;
