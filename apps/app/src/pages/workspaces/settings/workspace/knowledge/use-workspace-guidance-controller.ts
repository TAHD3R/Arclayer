import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  attachGuidanceReference,
  createGuidanceRemovePreview,
  detachGuidanceReference,
  getEffectiveGuidance,
  getGuidanceLayer,
  publishGuidance,
  saveGuidanceDraft,
} from "@/api/workspace-guidance";
import { WORKSPACE_KNOWLEDGE_QUERY_KEY, listKnowledgeBases } from "@/api/workspace-knowledge";
import { notifySuccessText } from "@/lib/notifications";

type ProjectGuidanceMode = NonNullable<KnowledgeGuidanceDraftSaveRequest["projectMode"]>;

export type PendingGuidanceRemoval = Readonly<{ preview: KnowledgeGuidancePreviewOut }>;

function guidanceQueryKey(workspaceId: string, projectId?: string | null) {
  return [
    ...WORKSPACE_GUIDANCE_QUERY_KEY,
    workspaceId,
    projectId ? "project" : "workspace",
    projectId ?? "shared",
  ] as const;
}

function guidanceContent(layer: KnowledgeGuidanceLayerOut | null): string {
  return layer?.currentPublished?.content ?? "";
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
  const [content, setContentValue] = useState("");
  const [projectMode, setProjectMode] = useState<ProjectGuidanceMode>("supplement");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<PendingGuidanceRemoval | null>(null);
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
    setContentValue("");
    setProjectMode("supplement");
    setHasUnsavedChanges(false);
    setPendingRemoval(null);
  }, [projectId, workspaceId]);
  useEffect(() => {
    if (hasUnsavedChanges) return;
    setContentValue(guidanceContent(layer));
    setProjectMode(guidanceProjectMode(layer));
  }, [hasUnsavedChanges, layer]);

  const effectiveQuery = useQuery({
    queryKey: [...guidanceQueryKey(workspaceId, projectId), "effective"],
    queryFn: ({ signal }) => getEffectiveGuidance(workspaceId, projectId ?? null, signal),
    enabled: Boolean(layer && projectId),
    retry: false,
  });
  const referenceBasesQuery = useQuery({
    queryKey: [...guidanceQueryKey(workspaceId, projectId), "reference-bases"],
    queryFn: ({ signal }) => listKnowledgeBases(workspaceId, { limit: 100, signal }),
    enabled: Boolean(layer && projectId),
    retry: false,
  });

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
    setContentValue(guidanceContent(nextLayer));
    setProjectMode(guidanceProjectMode(nextLayer));
    setHasUnsavedChanges(false);
  };
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!layer) throw new Error("KNOWLEDGE_GUIDANCE_LAYER_REQUIRED");

      const savedLayer = await saveGuidanceDraft(
        scope,
        {
          content,
          expectedRevision: layer.metadataRevision,
          ...(projectId ? { projectMode } : {}),
        },
        crypto.randomUUID(),
      );
      const revisionId = savedLayer.currentDraft?.id;
      if (!revisionId) throw new Error("KNOWLEDGE_GUIDANCE_REVISION_REQUIRED");

      return publishGuidance(
        scope,
        { expectedRevision: savedLayer.metadataRevision, revisionId },
        crypto.randomUUID(),
      );
    },
    onSuccess: async (nextLayer) => {
      acceptServerLayer(nextLayer);
      await invalidate();
      notifySuccessText(t(projectId ? "PROJECT_SAVED" : "SAVED"));
    },
  });
  const removePreviewMutation = useMutation({
    mutationFn: () => {
      if (!layer) throw new Error("KNOWLEDGE_GUIDANCE_LAYER_REQUIRED");
      return createGuidanceRemovePreview(
        scope,
        { expectedRevision: layer.metadataRevision },
        crypto.randomUUID(),
      );
    },
    onSuccess: (preview) => setPendingRemoval({ preview }),
  });
  const applyRemoveMutation = useMutation({
    mutationFn: (pending: PendingGuidanceRemoval) =>
      applyGuidanceRemovePreview(
        scope,
        pending.preview.id,
        {
          expectedGuidanceRevision: pending.preview.expectedGuidanceRevision,
          expectedPreviewRevision: pending.preview.previewRevision,
        },
        crypto.randomUUID(),
      ),
    onSuccess: async () => {
      setPendingRemoval(null);
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
    content,
    setContent: (value: string) => {
      setContentValue(value);
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
        content !== guidanceContent(layer) || value !== guidanceProjectMode(layer),
      );
    },
    pendingRemoval,
    setPendingRemoval,
    guidanceQuery,
    effectiveQuery,
    referenceBasesQuery,
    saveMutation,
    removePreviewMutation,
    applyRemoveMutation,
    attachReferenceMutation,
    detachReferenceMutation,
    save: () => {
      saveMutation.mutate();
    },
    previewRemoval: () => {
      removePreviewMutation.mutate();
    },
    applyPendingRemoval: () => {
      if (!pendingRemoval) throw new Error("KNOWLEDGE_GUIDANCE_PREVIEW_REQUIRED");
      applyRemoveMutation.mutate(pendingRemoval);
    },
  };
}

export type WorkspaceGuidanceController = ReturnType<typeof useWorkspaceGuidanceController>;
