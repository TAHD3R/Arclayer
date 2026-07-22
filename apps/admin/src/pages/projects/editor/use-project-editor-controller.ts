import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { listAIWorkspaceAgents } from "@/api/ai";
import {
  applyProjectBuilderChangeSet,
  buildProjectBuilderQueryKey,
  buildProjectBuilderRevisionQueryKey,
  cancelProjectBuilderGeneration,
  createProjectBuilderGeneration,
  getProjectBuilder,
  getProjectBuilderComponentCatalog,
  getProjectBuilderGeneration,
  getProjectBuilderRevision,
  previewProjectBuilderChangeSet,
} from "@/api/project-builder";
import type {
  BuilderChangeSetPreviewOut,
  BuilderChangeSetPreviewRequest,
  BuilderSectionIntentV1,
} from "@arclayer/openapi";
import { getProjectDetail } from "@/api/projects";
import type { InspectorMode } from "@/pages/projects/editor/editor-inspector";
import { useProjectPermissionAccess } from "@/hooks/use-workspace-permission-access";
import { createAgentRun } from "@/lib/ai/agent-run-api";
import { createAgentThread } from "@/lib/ai/agent-thread-api";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const BUILDER_GENERATION_TOOL = "builder.sitemap.generate";
const TERMINAL_GENERATION_STATUSES = new Set(["partial", "succeeded", "failed", "cancelled"]);

type BuilderChangeOperation = BuilderChangeSetPreviewRequest["operations"][number];
export type WireframeChangeOperation = Extract<
  BuilderChangeOperation,
  { type: `wireframe.${string}` }
>;
export interface SitemapPlanningDraft {
  itemId: string;
  purpose: string;
  sectionIntents: BuilderSectionIntentV1[];
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
  const [inspectorMode, setInspectorMode] = useState<InspectorMode>("page");
  const [objective, setObjective] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState<number | null>(null);
  const [addPageOpen, setAddPageOpen] = useState(false);
  const [wireframePreview, setWireframePreview] = useState<BuilderChangeSetPreviewOut | null>(null);
  const [sitemapPlanningPreview, setSitemapPlanningPreview] =
    useState<BuilderChangeSetPreviewOut | null>(null);

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
  const componentCatalogQuery = useQuery({
    queryKey: ["project", "builder", projectId, "component-catalog", revisionId],
    queryFn: ({ signal }) => getProjectBuilderComponentCatalog(projectId, signal),
    enabled: Boolean(revisionId),
    retry: false,
  });
  const agentsQuery = useQuery({
    queryKey: ["ai", "workspace-agents", workspaceId, projectId, "builder"],
    queryFn: ({ signal }) =>
      listAIWorkspaceAgents({ workspaceId: workspaceId!, projectId, signal }),
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
    retry: false,
  });
  const permission = useProjectPermissionAccess(projectId);
  const eligibleAgents = useMemo(
    () =>
      (agentsQuery.data?.agents ?? []).filter(
        (agent) =>
          agent.available &&
          agent.supportedExecutionModes.includes("build") &&
          agent.toolGrants.includes(BUILDER_GENERATION_TOOL),
      ),
    [agentsQuery.data?.agents],
  );

  useEffect(() => {
    if (selectedAgentId && eligibleAgents.some((agent) => agent.agentId === selectedAgentId))
      return;
    const defaultAgent = eligibleAgents.find(
      (agent) => agent.agentId === agentsQuery.data?.defaultAgentId,
    );
    setSelectedAgentId(defaultAgent?.agentId ?? eligibleAgents[0]?.agentId ?? null);
  }, [agentsQuery.data?.defaultAgentId, eligibleAgents, selectedAgentId]);

  useEffect(() => {
    const pages = revisionQuery.data?.pages ?? [];
    if (pages.length === 0) return;
    if (selectedPageId && pages.some((page) => page.itemId === selectedPageId)) return;
    setSelectedPageId(pages[0]?.itemId ?? null);
  }, [revisionQuery.data?.pages, selectedPageId]);

  useEffect(() => {
    setWireframePreview(null);
    setSitemapPlanningPreview(null);
  }, [revisionId]);

  const generationQuery = useQuery({
    queryKey: ["project", "builder", projectId, "generation", generationId],
    queryFn: ({ signal }) => getProjectBuilderGeneration(projectId, generationId!, signal),
    enabled: Boolean(generationId),
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && TERMINAL_GENERATION_STATUSES.has(status) ? false : 1_250;
    },
  });

  const startGeneration = useMutation({
    mutationFn: async () => {
      const revision = revisionQuery.data;
      const agentId = selectedAgentId;
      const normalizedObjective = objective.trim();
      if (!workspaceId || !revision || !agentId || !normalizedObjective) {
        throw new Error(t("CREATION_EDITOR_AI_REQUEST_INVALID"));
      }
      const thread = await createAgentThread(workspaceId, {
        projectId,
        leadAgentId: agentId,
        title: t("CREATION_EDITOR_AI_THREAD_TITLE"),
        idempotencyKey: commandKey("builder-thread"),
      });
      const run = await createAgentRun({
        workspaceId,
        projectId,
        threadId: thread.threadId,
        leadAgentId: agentId,
        mentionedAgentIds: [],
        executionMode: "build",
        siteRevisionId: revision.siteRevision.id,
        message: normalizedObjective,
        idempotencyKey: commandKey("builder-run"),
      });
      return createProjectBuilderGeneration(
        projectId,
        {
          targetStage: "sitemap",
          baseRevisionId: revision.siteRevision.id,
          baseEtag: revision.siteRevision.manifestHash,
          agentRunId: run.runId,
          objective: normalizedObjective,
          locale: revision.contentStructureRevision.snapshot.locales[0] ?? "zh-CN",
          candidateCount: 2,
        },
        commandKey("builder-generation"),
      );
    },
    onSuccess: (generation) => {
      setGenerationId(generation.generationId);
      setSelectedCandidateIndex(null);
    },
  });

  const cancelGeneration = useMutation({
    mutationFn: () => {
      if (!generationId) throw new Error(t("CREATION_EDITOR_AI_REQUEST_INVALID"));
      return cancelProjectBuilderGeneration(projectId, generationId, {
        reason: t("CREATION_EDITOR_AI_CANCEL_REASON"),
      });
    },
    onSuccess: (generation) => {
      queryClient.setQueryData(
        ["project", "builder", projectId, "generation", generation.generationId],
        generation,
      );
    },
  });

  const generation = generationQuery.data ?? startGeneration.data ?? null;
  const selectedCandidate =
    generation?.candidates.find(
      (candidate) => candidate.candidateIndex === selectedCandidateIndex,
    ) ??
    generation?.candidates[0] ??
    null;
  const applyCandidate = useMutation({
    mutationFn: async () => {
      if (!selectedCandidate) throw new Error(t("CREATION_EDITOR_AI_CANDIDATE_REQUIRED"));
      const changeSet = selectedCandidate.changeSet;
      return applyProjectBuilderChangeSet(
        projectId,
        changeSet.changeSetId,
        {
          previewToken: changeSet.previewToken,
          approval: changeSet.approval
            ? {
                approvalId: changeSet.approval.approvalId,
                decision: "approve",
                expectedApprovalClass: changeSet.approval.approvalClass,
              }
            : undefined,
        },
        commandKey("builder-apply"),
      );
    },
    onSuccess: async () => {
      setGenerationId(null);
      setSelectedCandidateIndex(null);
      setInspectorMode("page");
      await invalidateBuilder();
    },
  });

  const previewWireframeChange = useMutation({
    mutationFn: (operations: WireframeChangeOperation[]) => {
      const revision = revisionQuery.data;
      if (!revision) throw new Error(t("CREATION_EDITOR_WIREFRAME_REVISION_REQUIRED"));
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
      await invalidateBuilder();
    },
  });

  const previewSitemapPlanning = useMutation({
    mutationFn: (draft: SitemapPlanningDraft) => {
      const revision = revisionQuery.data;
      if (!revision) throw new Error(t("CREATION_EDITOR_SITEMAP_REVISION_REQUIRED"));
      return previewProjectBuilderChangeSet(
        projectId,
        {
          baseRevisionId: revision.siteRevision.id,
          baseEtag: revision.siteRevision.manifestHash,
          provenanceSource: "human",
          operations: [
            {
              type: "page.intent.replace",
              operationId: `plan-${draft.itemId}`,
              itemId: draft.itemId,
              purpose: draft.purpose,
              sectionIntents: draft.sectionIntents,
            },
          ],
        },
        commandKey("sitemap-planning-preview"),
      );
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
      await invalidateBuilder();
    },
  });

  const invalidateBuilder = () =>
    queryClient.invalidateQueries({ queryKey: buildProjectBuilderQueryKey(projectId) });
  const permissionReady = !permission.authzQuery.isPending && !permission.actionsQuery.isPending;
  const canWrite = permissionReady && permission.hasAction("project:content:site-builder:write");
  const canEditWireframe = canWrite && permission.hasAction("project:content:items:write");
  const canStart =
    canWrite &&
    Boolean(workspaceId && revisionQuery.data && selectedAgentId && objective.trim()) &&
    !agentsQuery.isPending;
  const startDisabledReason = resolveGenerationDisabledReason({
    canWrite,
    permissionReady,
    workspaceId,
    revisionReady: Boolean(revisionQuery.data),
    selectedAgentId,
    objective,
    agentsPending: agentsQuery.isPending,
    translate: t,
  });

  return {
    workspaceId,
    projectQuery,
    builderQuery,
    revisionQuery,
    componentCatalogQuery,
    eligibleAgents,
    selectedPageId,
    setSelectedPageId,
    inspectorMode,
    setInspectorMode,
    objective,
    setObjective,
    selectedAgentId,
    setSelectedAgentId,
    generation,
    selectedCandidateIndex,
    setSelectedCandidateIndex,
    startGeneration,
    cancelGeneration,
    applyCandidate,
    canWrite,
    permissionReady,
    canStart,
    startDisabledReason,
    operationError:
      startGeneration.error ??
      cancelGeneration.error ??
      applyCandidate.error ??
      previewWireframeChange.error ??
      applyWireframeChange.error ??
      generationQuery.error,
    addPageOpen,
    setAddPageOpen,
    invalidateBuilder,
    canEditWireframe,
    wireframePreview,
    previewWireframeChange,
    applyWireframeChange,
    wireframeOperationError: previewWireframeChange.error ?? applyWireframeChange.error,
    discardWireframePreview: () => setWireframePreview(null),
    sitemapPlanningPreview,
    previewSitemapPlanning,
    applySitemapPlanning,
    sitemapPlanningError: previewSitemapPlanning.error ?? applySitemapPlanning.error,
    discardSitemapPlanningPreview: () => setSitemapPlanningPreview(null),
  };
}

function resolveGenerationDisabledReason({
  canWrite,
  permissionReady,
  workspaceId,
  revisionReady,
  selectedAgentId,
  objective,
  agentsPending,
  translate,
}: {
  canWrite: boolean;
  permissionReady: boolean;
  workspaceId: string | null;
  revisionReady: boolean;
  selectedAgentId: string | null;
  objective: string;
  agentsPending: boolean;
  translate: (key: string) => string;
}): string {
  if (!permissionReady || agentsPending) return translate("CREATION_EDITOR_AI_PREPARING");
  if (!workspaceId || !revisionReady) return translate("CREATION_EDITOR_AI_CONTEXT_REQUIRED");
  if (!canWrite) return translate("CREATION_EDITOR_AI_PERMISSION_REQUIRED");
  if (!selectedAgentId) return translate("CREATION_EDITOR_AI_AGENT_REQUIRED");
  if (!objective.trim()) return translate("CREATION_EDITOR_AI_OBJECTIVE_REQUIRED");
  return "";
}
