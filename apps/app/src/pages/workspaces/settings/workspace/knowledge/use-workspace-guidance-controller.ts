import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import type {
  KnowledgeGuidanceDraftSaveRequest,
  KnowledgeGuidanceLayerOut,
  KnowledgeGuidancePreviewOut,
} from "@arclayer/openapi";
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

function guidanceContent(layer: KnowledgeGuidanceLayerOut | null): string {
  return (layer?.currentDraft ?? layer?.currentPublished)?.content ?? "";
}

function guidanceProjectMode(layer: KnowledgeGuidanceLayerOut | null): ProjectGuidanceMode {
  return layer?.projectMode ?? "supplement";
}

function queryKeysMatch(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function useWorkspaceGuidanceController(scopeInput: GuidanceScope) {
  const { workspaceId, projectId } = scopeInput;
  const { t } = useTranslation("knowledge");
  const queryClient = useQueryClient();
  const [draft, setDraftValue] = useState("");
  const [projectMode, setProjectMode] = useState<ProjectGuidanceMode>("supplement");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingPreview, setPendingPreview] = useState<PendingPreview | null>(null);
  const scope = useMemo(() => ({ workspaceId, projectId }), [projectId, workspaceId]);
  const layerQueryKey = useMemo(
    () => [...guidanceQueryKey(workspaceId, projectId), "layer"] as const,
    [projectId, workspaceId],
  );

  const guidanceQuery = useQuery({
    queryKey: layerQueryKey,
    queryFn: ({ signal }) => getGuidanceLayer(scope, signal),
    retry: false,
  });
  const layer = guidanceQuery.data ?? null;
  useEffect(() => {
    setDraftValue("");
    setProjectMode("supplement");
    setHasUnsavedChanges(false);
  }, [projectId, workspaceId]);
  useEffect(() => {
    if (hasUnsavedChanges) return;
    setDraftValue(guidanceContent(layer));
    setProjectMode(guidanceProjectMode(layer));
  }, [hasUnsavedChanges, layer]);

  const effectiveQuery = useQuery({
    queryKey: [...guidanceQueryKey(workspaceId, projectId), "effective"],
    queryFn: ({ signal }) => getEffectiveGuidance(workspaceId, projectId ?? null, signal),
    enabled: Boolean(layer && projectId),
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
    enabled: Boolean(layer && projectId),
    retry: false,
  });
  const referenceBasesQuery = useQuery({
    queryKey: [...guidanceQueryKey(workspaceId, projectId), "reference-bases"],
    queryFn: ({ signal }) => listKnowledgeBases(workspaceId, { limit: 100, signal }),
    enabled: Boolean(layer && projectId),
    retry: false,
  });
  const history = useMemo(
    () => (historyQuery.data?.pages ?? []).flatMap((page) => page.items ?? []),
    [historyQuery.data?.pages],
  );

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: WORKSPACE_GUIDANCE_QUERY_KEY,
        predicate: (query) => !queryKeysMatch(query.queryKey, layerQueryKey),
      }),
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KNOWLEDGE_QUERY_KEY }),
    ]);
  };
  const cacheServerLayer = (nextLayer: KnowledgeGuidanceLayerOut) => {
    queryClient.setQueryData(layerQueryKey, nextLayer);
  };
  const acceptServerLayer = (nextLayer: KnowledgeGuidanceLayerOut) => {
    cacheServerLayer(nextLayer);
    setDraftValue(guidanceContent(nextLayer));
    setProjectMode(guidanceProjectMode(nextLayer));
    setHasUnsavedChanges(false);
  };
  const saveDraftMutation = useMutation({
    mutationFn: (input: KnowledgeGuidanceDraftSaveRequest) =>
      saveGuidanceDraft(scope, input, crypto.randomUUID()),
    onSuccess: async (nextLayer, input) => {
      cacheServerLayer(nextLayer);
      const savedCurrentEditor =
        draft === input.content &&
        (!projectId || projectMode === (input.projectMode ?? "supplement"));
      if (savedCurrentEditor) acceptServerLayer(nextLayer);
      await invalidate();
      notifySuccessText(t("DRAFT_SAVED"));
    },
  });
  const publishMutation = useMutation({
    mutationFn: (input: { expectedRevision: number; revisionId: string }) =>
      publishGuidance(scope, input, crypto.randomUUID()),
    onSuccess: async (nextLayer) => {
      acceptServerLayer(nextLayer);
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

  return {
    layer,
    draft,
    setDraft: (value: string) => {
      setDraftValue(value);
      setHasUnsavedChanges(
        value !== guidanceContent(layer) ||
          (Boolean(projectId) && projectMode !== guidanceProjectMode(layer)),
      );
    },
    hasUnsavedChanges,
    isProject: Boolean(projectId),
    projectMode,
    setProjectMode: (value: ProjectGuidanceMode) => {
      setProjectMode(value);
      setHasUnsavedChanges(
        draft !== guidanceContent(layer) || value !== guidanceProjectMode(layer),
      );
    },
    history,
    pendingPreview,
    setPendingPreview,
    guidanceQuery,
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
    saveDraft: () => {
      if (!layer) throw new Error("KNOWLEDGE_GUIDANCE_LAYER_REQUIRED");
      saveDraftMutation.mutate({
        content: draft,
        expectedRevision: layer.metadataRevision,
        ...(projectId ? { projectMode } : {}),
      });
    },
    publish: () => {
      if (!layer?.currentDraft?.id) throw new Error("KNOWLEDGE_GUIDANCE_DRAFT_REQUIRED");
      publishMutation.mutate({
        expectedRevision: layer.metadataRevision,
        revisionId: layer.currentDraft.id,
      });
    },
    previewRestore: (sourceRevisionId: string) => {
      if (!layer) throw new Error("KNOWLEDGE_GUIDANCE_LAYER_REQUIRED");
      restorePreviewMutation.mutate({
        expectedRevision: layer.metadataRevision,
        sourceRevisionId,
      });
    },
    previewRemoval: () => {
      if (!layer) throw new Error("KNOWLEDGE_GUIDANCE_LAYER_REQUIRED");
      removePreviewMutation.mutate({ expectedRevision: layer.metadataRevision });
    },
    applyPendingPreview: () => {
      if (!pendingPreview) throw new Error("KNOWLEDGE_GUIDANCE_PREVIEW_REQUIRED");
      applyPreviewMutation.mutate(pendingPreview);
    },
  };
}

export type WorkspaceGuidanceController = ReturnType<typeof useWorkspaceGuidanceController>;
