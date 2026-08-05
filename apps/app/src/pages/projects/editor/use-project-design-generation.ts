import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  BuilderComponentCatalogOut,
  BuilderGenerationOut,
  BuilderGenerationTargetV1,
  BuilderRevisionOut,
  BuilderRevisionPageOut,
} from "@arclayer/openapi";

import { listAIWorkspaceAgents } from "@/api/ai";
import {
  applyProjectBuilderChangeSet,
  buildProjectBuilderQueryKey,
  buildProjectBuilderRevisionQueryKey,
  cancelProjectBuilderGeneration,
  createProjectBuilderGeneration,
  getProjectBuilderGeneration,
  getProjectBuilderRevision,
  recoverProjectBuilderGeneration,
} from "@/api/project-builder";

const DESIGN_GENERATION_TOOL = "builder.design.generate";
const TERMINAL_STATUSES = new Set<BuilderGenerationOut["status"]>([
  "partial",
  "succeeded",
  "failed",
  "cancelled",
]);

function commandKey(prefix: string): string {
  return `${prefix}:${globalThis.crypto.randomUUID()}`;
}

function isExactDesignGeneration(
  generation: BuilderGenerationOut,
  target: BuilderGenerationTargetV1,
): boolean {
  return (
    generation.targetStage === "design" &&
    generation.targets.length === 1 &&
    generation.targets[0]?.kind === target.kind &&
    generation.targets[0]?.itemId === target.itemId
  );
}

export function useProjectDesignGeneration({
  projectId,
  workspaceId,
  revision,
  page,
  componentCatalog,
  componentCatalogPending,
  componentCatalogError,
  enabled,
  canWrite,
  permissionReady,
  online,
  blockedByPreview,
}: Readonly<{
  projectId: string;
  workspaceId: string | null;
  revision: BuilderRevisionOut;
  page: BuilderRevisionPageOut | null;
  componentCatalog: BuilderComponentCatalogOut | null;
  componentCatalogPending: boolean;
  componentCatalogError: boolean;
  enabled: boolean;
  canWrite: boolean;
  permissionReady: boolean;
  online: boolean;
  blockedByPreview: boolean;
}>) {
  const { t } = useTranslation("account");
  const queryClient = useQueryClient();
  const [objective, setObjective] = useState("");
  const [candidateCount, setCandidateCount] = useState(2);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState<number | null>(null);
  const [dismissedGenerationId, setDismissedGenerationId] = useState<string | null>(null);
  const target = useMemo<BuilderGenerationTargetV1 | null>(
    () => (page ? { kind: "page", itemId: page.itemId } : null),
    [page],
  );
  const scopeKey = `${revision.siteRevision.id}:${page?.itemId ?? "none"}`;

  const agentsQuery = useQuery({
    queryKey: ["ai", "workspace-agents", workspaceId, projectId, "builder"],
    queryFn: ({ signal }) =>
      listAIWorkspaceAgents({ workspaceId: workspaceId!, projectId, signal }),
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
    retry: false,
  });
  const eligibleAgents = useMemo(
    () =>
      (agentsQuery.data?.agents ?? []).filter(
        (agent) =>
          agent.available &&
          agent.supportedExecutionModes.includes("build") &&
          agent.toolGrants.includes(DESIGN_GENERATION_TOOL),
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

  const recoveryQuery = useQuery({
    queryKey: ["project", "builder", projectId, "generation", "recovery", "design", scopeKey],
    queryFn: async ({ signal }) => {
      if (!target) throw new Error(t("CREATION_EDITOR_DESIGN_GENERATION_PAGE_REQUIRED"));
      const recovery = await recoverProjectBuilderGeneration(
        projectId,
        { targetStage: "design", targets: [target] },
        signal,
      );
      for (const generation of [recovery.active, recovery.latestTerminal]) {
        if (generation && !isExactDesignGeneration(generation, target)) {
          throw new Error(t("CREATION_EDITOR_DESIGN_GENERATION_RECOVERY_INVALID"));
        }
      }
      return recovery;
    },
    enabled: enabled && Boolean(target),
    retry: false,
  });
  const recoveredGeneration = recoveryQuery.data?.active ?? recoveryQuery.data?.latestTerminal;
  const visibleRecoveredGeneration =
    recoveredGeneration?.generationId === dismissedGenerationId ? null : recoveredGeneration;
  const resolvedGenerationId = generationId ?? visibleRecoveredGeneration?.generationId ?? null;
  const generationQuery = useQuery({
    queryKey: ["project", "builder", projectId, "generation", resolvedGenerationId],
    queryFn: async ({ signal }) => {
      const generation = await getProjectBuilderGeneration(
        projectId,
        resolvedGenerationId!,
        signal,
      );
      if (!target || !isExactDesignGeneration(generation, target)) {
        throw new Error(t("CREATION_EDITOR_DESIGN_GENERATION_RECOVERY_INVALID"));
      }
      return generation;
    },
    enabled: enabled && Boolean(resolvedGenerationId && target),
    retry: false,
    refetchInterval: (query) =>
      TERMINAL_STATUSES.has(query.state.data?.status ?? "queued") ? false : 1_250,
  });

  const startGeneration = useMutation({
    mutationFn: () => {
      const normalizedObjective = objective.trim();
      if (!target || !selectedAgentId || !normalizedObjective) {
        throw new Error(t("CREATION_EDITOR_DESIGN_GENERATION_REQUEST_INVALID"));
      }
      return createProjectBuilderGeneration(
        projectId,
        {
          targetStage: "design",
          baseRevisionId: revision.siteRevision.id,
          baseEtag: revision.siteRevision.manifestHash,
          agentId: selectedAgentId,
          objective: normalizedObjective,
          locale:
            page?.routes?.find((route) => route.isActive)?.locale ??
            revision.contentStructureRevision.snapshot.locales[0] ??
            "zh-CN",
          candidateCount,
          targets: [target],
        },
        commandKey("design-generation"),
      );
    },
    onSuccess: (generation) => {
      setGenerationId(generation.generationId);
      setDismissedGenerationId(null);
      setSelectedCandidateIndex(null);
      queryClient.setQueryData(
        ["project", "builder", projectId, "generation", generation.generationId],
        generation,
      );
    },
  });
  const generation =
    generationQuery.data ??
    (startGeneration.data?.generationId === resolvedGenerationId ? startGeneration.data : null) ??
    visibleRecoveredGeneration ??
    null;
  const active = Boolean(generation && !TERMINAL_STATUSES.has(generation.status));
  const selectedCandidate =
    generation?.candidates.find((item) => item.candidateIndex === selectedCandidateIndex) ?? null;

  const cancelGeneration = useMutation({
    mutationFn: () => {
      if (!generation || !active) {
        throw new Error(t("CREATION_EDITOR_DESIGN_GENERATION_REQUEST_INVALID"));
      }
      return cancelProjectBuilderGeneration(projectId, generation.generationId, {
        reason: t("CREATION_EDITOR_DESIGN_GENERATION_CANCEL_REASON"),
      });
    },
    onSuccess: (cancelled) => {
      setGenerationId(cancelled.generationId);
      queryClient.setQueryData(
        ["project", "builder", projectId, "generation", cancelled.generationId],
        cancelled,
      );
    },
  });

  const applyCandidate = useMutation({
    mutationFn: async () => {
      if (!selectedCandidate || active) {
        throw new Error(t("CREATION_EDITOR_DESIGN_GENERATION_CANDIDATE_REQUIRED"));
      }
      const changeSet = selectedCandidate.changeSet;
      const applied = await applyProjectBuilderChangeSet(
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
        commandKey("design-generation-apply"),
      );
      if (applied.baseRevisionId !== generation?.baseRevisionId) {
        throw new Error(t("CREATION_EDITOR_DESIGN_GENERATION_RECONCILIATION_FAILED"));
      }
      const reconciled = await getProjectBuilderRevision(projectId, applied.siteRevision.id);
      if (
        reconciled.siteRevision.id !== applied.siteRevision.id ||
        reconciled.siteRevision.manifestHash !== applied.siteRevision.manifestHash
      ) {
        throw new Error(t("CREATION_EDITOR_DESIGN_GENERATION_RECONCILIATION_FAILED"));
      }
      return { applied, reconciled };
    },
    onSuccess: async ({ applied, reconciled }) => {
      queryClient.setQueryData(
        buildProjectBuilderRevisionQueryKey(projectId, applied.siteRevision.id),
        reconciled,
      );
      setDismissedGenerationId(generation?.generationId ?? null);
      setGenerationId(null);
      setSelectedCandidateIndex(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: buildProjectBuilderQueryKey(projectId) }),
        queryClient.invalidateQueries({
          queryKey: ["project", "builder", projectId, "component-catalog"],
        }),
      ]);
    },
  });

  useEffect(() => {
    setGenerationId(null);
    setSelectedCandidateIndex(null);
    setDismissedGenerationId(null);
    startGeneration.reset();
    cancelGeneration.reset();
    applyCandidate.reset();
  }, [scopeKey]);

  const recoveryPending = recoveryQuery.isPending && recoveryQuery.fetchStatus !== "idle";
  const startDisabledReason = resolveStartDisabledReason({
    permissionReady,
    canWrite,
    online,
    page,
    componentCatalog,
    componentCatalogExact: componentCatalog?.siteRevisionId === revision.siteRevision.id,
    componentCatalogPending,
    componentCatalogError,
    agentsPending: agentsQuery.isPending,
    recoveryPending,
    selectedAgentId,
    objective,
    blockedByPreview: blockedByPreview || selectedCandidate !== null,
    active,
    translate: t,
  });

  return {
    agentsQuery,
    recoveryQuery,
    generationQuery,
    eligibleAgents,
    selectedAgentId,
    setSelectedAgentId,
    objective,
    setObjective,
    candidateCount,
    setCandidateCount,
    generation,
    active,
    selectedCandidate,
    selectedCandidateIndex,
    selectCandidate: setSelectedCandidateIndex,
    discardCandidatePreview: () => setSelectedCandidateIndex(null),
    startGeneration,
    cancelGeneration,
    applyCandidate,
    recoveryPending,
    canStart: startDisabledReason === "",
    startDisabledReason,
    error:
      agentsQuery.error ??
      recoveryQuery.error ??
      generationQuery.error ??
      startGeneration.error ??
      cancelGeneration.error ??
      applyCandidate.error,
  };
}

function resolveStartDisabledReason({
  permissionReady,
  canWrite,
  online,
  page,
  componentCatalog,
  componentCatalogExact,
  componentCatalogPending,
  componentCatalogError,
  agentsPending,
  recoveryPending,
  selectedAgentId,
  objective,
  blockedByPreview,
  active,
  translate,
}: Readonly<{
  permissionReady: boolean;
  canWrite: boolean;
  online: boolean;
  page: BuilderRevisionPageOut | null;
  componentCatalog: BuilderComponentCatalogOut | null;
  componentCatalogExact: boolean;
  componentCatalogPending: boolean;
  componentCatalogError: boolean;
  agentsPending: boolean;
  recoveryPending: boolean;
  selectedAgentId: string | null;
  objective: string;
  blockedByPreview: boolean;
  active: boolean;
  translate: (key: string) => string;
}>): string {
  if (!permissionReady) return translate("CREATION_EDITOR_DESIGN_PERMISSION_CHECKING");
  if (!canWrite) return translate("CREATION_EDITOR_DESIGN_PERMISSION_REQUIRED");
  if (!online) return translate("CREATION_EDITOR_DESIGN_OFFLINE_MUTATION");
  if (!page) return translate("CREATION_EDITOR_DESIGN_GENERATION_PAGE_REQUIRED");
  if (!page.wireframe || !page.wireframeChecksum) {
    return translate("CREATION_EDITOR_DESIGN_WIREFRAME_REQUIRED_SHORT");
  }
  if (componentCatalogPending) return translate("CREATION_EDITOR_DESIGN_CONTRACT_LOADING");
  if (componentCatalogError || !componentCatalog) {
    return translate("CREATION_EDITOR_DESIGN_CONTRACT_ERROR_SHORT");
  }
  if (!componentCatalogExact) {
    return translate("CREATION_EDITOR_DESIGN_CONTRACT_STALE");
  }
  if (agentsPending || recoveryPending)
    return translate("CREATION_EDITOR_DESIGN_GENERATION_PREPARING");
  if (!selectedAgentId) return translate("CREATION_EDITOR_DESIGN_GENERATION_AGENT_REQUIRED");
  if (!objective.trim()) return translate("CREATION_EDITOR_DESIGN_GENERATION_OBJECTIVE_REQUIRED");
  if (blockedByPreview) return translate("CREATION_EDITOR_DESIGN_REVIEW_BEFORE_EDIT");
  if (active) return translate("CREATION_EDITOR_DESIGN_GENERATION_ACTIVE");
  return "";
}
