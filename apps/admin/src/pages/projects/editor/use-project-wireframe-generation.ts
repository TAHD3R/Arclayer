import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  BuilderGenerationOut,
  BuilderGenerationTargetV1,
  BuilderComponentCatalogOut,
  BuilderRevisionOut,
  BuilderRevisionPageOut,
} from "@arclayer/openapi";

import { listAIWorkspaceAgents } from "@/api/ai";
import {
  applyProjectBuilderChangeSet,
  buildProjectBuilderQueryKey,
  cancelProjectBuilderGeneration,
  createProjectBuilderGeneration,
  getProjectBuilderGeneration,
  recoverProjectBuilderGeneration,
} from "@/api/project-builder";
import {
  buildWireframeGenerationTargetCatalog,
  resolveWireframeGenerationTargets,
  wireframeGenerationTargetKey,
  type WireframeGenerationTargetOption,
} from "@/pages/projects/editor/wireframe-generation-targets";
import { useProjectCompositionSaga } from "@/pages/projects/editor/use-project-composition-saga";
import { useWireframeGenerationTargetScope } from "@/pages/projects/editor/use-wireframe-generation-target-scope";

const WIREFRAME_GENERATION_TOOL = "builder.wireframe.generate";
const COMPOSITION_SAGA_TOOLS = [
  "builder.sitemap.generate",
  "builder.sitemap.apply",
  WIREFRAME_GENERATION_TOOL,
  "builder.wireframe.apply",
] as const;
const TERMINAL_STATUSES = new Set<BuilderGenerationOut["status"]>([
  "partial",
  "succeeded",
  "failed",
  "cancelled",
]);

function commandKey(prefix: string): string {
  return `${prefix}:${globalThis.crypto.randomUUID()}`;
}

function generationQueryKey(projectId: string, generationId: string | null) {
  return ["project", "builder", projectId, "generation", generationId] as const;
}

export function useProjectWireframeGeneration({
  projectId,
  workspaceId,
  revision,
  page,
  componentCatalog,
  componentCatalogPending,
  componentCatalogError,
  initialTargets,
  onTargetsChange,
  enabled,
  canWrite,
  permissionReady,
  blockedByPreview,
}: {
  projectId: string;
  workspaceId: string | null;
  revision: BuilderRevisionOut | null;
  page: BuilderRevisionPageOut | null;
  componentCatalog: BuilderComponentCatalogOut | null;
  componentCatalogPending: boolean;
  componentCatalogError: boolean;
  initialTargets: readonly BuilderGenerationTargetV1[];
  onTargetsChange: (targets: readonly BuilderGenerationTargetV1[]) => void;
  enabled: boolean;
  canWrite: boolean;
  permissionReady: boolean;
  blockedByPreview: boolean;
}) {
  const { t } = useTranslation("account");
  const queryClient = useQueryClient();
  const [objective, setObjective] = useState("");
  const [candidateCount, setCandidateCount] = useState(2);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState<number | null>(null);
  const [candidatePreviewEnabled, setCandidatePreviewEnabled] = useState(false);
  const [dismissedGenerationId, setDismissedGenerationId] = useState<string | null>(null);
  const { selectedTargets, updateTargets } = useWireframeGenerationTargetScope({
    revision,
    page,
    initialTargets,
    onTargetsChange,
  });
  const targetCatalog = useMemo(
    () => buildWireframeGenerationTargetCatalog(revision, componentCatalog),
    [componentCatalog, revision],
  );
  const selectedTargetOptions = useMemo(
    () => resolveWireframeGenerationTargets(selectedTargets, targetCatalog),
    [selectedTargets, targetCatalog],
  );
  const selectedTargetKeys = useMemo(
    () => new Set(selectedTargets.map(wireframeGenerationTargetKey)),
    [selectedTargets],
  );
  const availableTargetOptions = useMemo(
    () =>
      targetCatalog.filter(
        (option) => !selectedTargetKeys.has(wireframeGenerationTargetKey(option.target)),
      ),
    [selectedTargetKeys, targetCatalog],
  );
  const targetScopeKey = selectedTargets.map(wireframeGenerationTargetKey).join("|");
  const scopeKey = `${revision?.siteRevision.id ?? "none"}:${targetScopeKey}`;
  const requiresPlanning = selectedTargetOptions.some((target) => target.state === "plan_missing");

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
          (requiresPlanning
            ? COMPOSITION_SAGA_TOOLS.every((tool) => agent.toolGrants.includes(tool))
            : agent.toolGrants.includes(WIREFRAME_GENERATION_TOOL)),
      ),
    [agentsQuery.data?.agents, requiresPlanning],
  );

  useEffect(() => {
    if (selectedAgentId && eligibleAgents.some((agent) => agent.agentId === selectedAgentId)) {
      return;
    }
    const defaultAgent = eligibleAgents.find(
      (agent) => agent.agentId === agentsQuery.data?.defaultAgentId,
    );
    setSelectedAgentId(defaultAgent?.agentId ?? eligibleAgents[0]?.agentId ?? null);
  }, [agentsQuery.data?.defaultAgentId, eligibleAgents, selectedAgentId]);

  const compositionSaga = useProjectCompositionSaga({
    projectId,
    revision,
    targets: selectedTargets,
    scopeKey: targetScopeKey,
    selectedAgentId,
    objective,
    candidateCount,
    enabled,
    canWrite,
    invalidRequestMessage: t("CREATION_EDITOR_WIREFRAME_GENERATION_REQUEST_INVALID"),
    cancelReason: t("CREATION_EDITOR_COMPOSITION_SAGA_CANCEL_REASON"),
  });

  const recoveryQuery = useQuery({
    queryKey: ["project", "builder", projectId, "generation", "recovery", scopeKey],
    queryFn: ({ signal }) => {
      if (selectedTargets.length === 0) {
        throw new Error("Wireframe generation target scope is unavailable");
      }
      return recoverProjectBuilderGeneration(
        projectId,
        {
          targetStage: "wireframe",
          targets: [...selectedTargets],
        },
        signal,
      );
    },
    enabled: enabled && canWrite && Boolean(revision && selectedTargets.length > 0),
    retry: false,
  });
  const recoveredGeneration =
    recoveryQuery.data?.active ?? recoveryQuery.data?.latestTerminal ?? null;
  const visibleRecoveredGeneration =
    recoveredGeneration?.generationId === dismissedGenerationId ? null : recoveredGeneration;
  const recoveredGenerationId = visibleRecoveredGeneration?.generationId ?? null;
  const resolvedGenerationId = generationId ?? recoveredGenerationId;
  const generationQuery = useQuery({
    queryKey: generationQueryKey(projectId, resolvedGenerationId),
    queryFn: ({ signal }) => getProjectBuilderGeneration(projectId, resolvedGenerationId!, signal),
    enabled: enabled && Boolean(resolvedGenerationId),
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.status ?? visibleRecoveredGeneration?.status;
      return status && TERMINAL_STATUSES.has(status) ? false : 1_250;
    },
  });

  const startGeneration = useMutation({
    mutationFn: () => {
      const normalizedObjective = objective.trim();
      if (
        !revision ||
        !selectedAgentId ||
        !normalizedObjective ||
        selectedTargets.length === 0 ||
        selectedTargetOptions.some((target) => !target.executable)
      ) {
        throw new Error(t("CREATION_EDITOR_WIREFRAME_GENERATION_REQUEST_INVALID"));
      }
      return createProjectBuilderGeneration(
        projectId,
        {
          targetStage: "wireframe",
          baseRevisionId: revision.siteRevision.id,
          baseEtag: revision.siteRevision.manifestHash,
          agentId: selectedAgentId,
          objective: normalizedObjective,
          locale: revision.contentStructureRevision.snapshot.locales[0] ?? "zh-CN",
          candidateCount,
          targets: [...selectedTargets],
        },
        commandKey("wireframe-generation"),
      );
    },
    onSuccess: (generation) => {
      compositionSaga.dismissSaga();
      setGenerationId(generation.generationId);
      setDismissedGenerationId(null);
      setSelectedCandidateIndex(generation.candidates[0]?.candidateIndex ?? null);
      setCandidatePreviewEnabled(generation.candidates.length > 0);
      queryClient.setQueryData(generationQueryKey(projectId, generation.generationId), generation);
    },
  });

  const directGeneration =
    generationQuery.data ??
    (startGeneration.data?.generationId === resolvedGenerationId ? startGeneration.data : null) ??
    visibleRecoveredGeneration;
  const directActive = Boolean(directGeneration && !TERMINAL_STATUSES.has(directGeneration.status));
  const generation = compositionSaga.saga ? compositionSaga.generation : directGeneration;
  const active = compositionSaga.active || directActive;
  const terminalSagaCandidateAvailable =
    compositionSaga.saga?.status === "failed" || compositionSaga.saga?.status === "cancelled";
  const candidateReviewAvailable = compositionSaga.saga
    ? compositionSaga.reviewPhase !== null || terminalSagaCandidateAvailable
    : !directActive;
  const selectedCandidate =
    candidatePreviewEnabled && candidateReviewAvailable
      ? (generation?.candidates.find(
          (candidate) => candidate.candidateIndex === selectedCandidateIndex,
        ) ?? null)
      : null;

  const cancelGeneration = useMutation({
    mutationFn: () => {
      if (!directGeneration) {
        throw new Error(t("CREATION_EDITOR_WIREFRAME_GENERATION_REQUEST_INVALID"));
      }
      return cancelProjectBuilderGeneration(projectId, directGeneration.generationId, {
        reason: t("CREATION_EDITOR_WIREFRAME_GENERATION_CANCEL_REASON"),
      });
    },
    onSuccess: (cancelled) => {
      setGenerationId(cancelled.generationId);
      queryClient.setQueryData(generationQueryKey(projectId, cancelled.generationId), cancelled);
    },
  });

  const applyCandidate = useMutation({
    mutationFn: async () => {
      if (!selectedCandidate) {
        throw new Error(t("CREATION_EDITOR_WIREFRAME_GENERATION_CANDIDATE_REQUIRED"));
      }
      const changeSet = selectedCandidate.changeSet;
      const sagaPhase = compositionSaga.reviewPhase;
      const saga = compositionSaga.saga;
      const idempotencyKey =
        saga && sagaPhase
          ? `composition-saga:${saga.sagaId}:${sagaPhase}:${changeSet.changeSetId}:apply`
          : commandKey("wireframe-generation-apply");
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
        idempotencyKey,
      );
      await queryClient.invalidateQueries({ queryKey: buildProjectBuilderQueryKey(projectId) });
      if (!saga || !sagaPhase) return { kind: "direct" as const };
      const transitioned = await compositionSaga.transitionPhase.mutateAsync({
        phase: sagaPhase,
        appliedChangeSetId: changeSet.changeSetId,
        appliedSiteRevisionId: applied.siteRevision.id,
      });
      return { kind: "saga" as const, transitioned };
    },
    onSuccess: (result) => {
      if (result.kind === "direct") {
        if (directGeneration) setDismissedGenerationId(directGeneration.generationId);
        setGenerationId(null);
      }
      setSelectedCandidateIndex(null);
      setCandidatePreviewEnabled(false);
    },
  });

  useEffect(() => {
    if (compositionSaga.active) return;
    setGenerationId(null);
    setSelectedCandidateIndex(null);
    setCandidatePreviewEnabled(false);
    setDismissedGenerationId(null);
    startGeneration.reset();
    cancelGeneration.reset();
    applyCandidate.reset();
  }, [scopeKey]);

  useEffect(() => {
    if (
      !generation ||
      !candidateReviewAvailable ||
      generation.candidates.length === 0 ||
      candidatePreviewEnabled
    )
      return;
    setSelectedCandidateIndex(generation.candidates[0]?.candidateIndex ?? null);
    setCandidatePreviewEnabled(true);
  }, [candidateReviewAvailable, candidatePreviewEnabled, generation]);

  const startDisabledReason = resolveStartDisabledReason({
    permissionReady,
    agentsPending: agentsQuery.isPending,
    recoveryPending:
      (recoveryQuery.isPending && recoveryQuery.fetchStatus !== "idle") ||
      (compositionSaga.recoveryQuery.isPending &&
        compositionSaga.recoveryQuery.fetchStatus !== "idle"),
    componentCatalogPending,
    componentCatalogError,
    canWrite,
    targets: selectedTargetOptions,
    selectedAgentId,
    objective,
    blockedByPreview,
    candidatePreviewActive: selectedCandidate !== null,
    active,
    translate: t,
  });

  return {
    agentsQuery,
    recoveryQuery,
    generationQuery,
    eligibleAgents,
    targetCatalog,
    availableTargetOptions,
    selectedTargets,
    selectedTargetOptions,
    addTarget: (option: WireframeGenerationTargetOption) =>
      updateTargets((current) =>
        current.some(
          (target) =>
            wireframeGenerationTargetKey(target) === wireframeGenerationTargetKey(option.target),
        )
          ? current
          : [...current, option.target],
      ),
    removeTarget: (option: WireframeGenerationTargetOption) =>
      updateTargets((current) =>
        current.length <= 1
          ? current
          : current.filter(
              (target) =>
                wireframeGenerationTargetKey(target) !==
                wireframeGenerationTargetKey(option.target),
            ),
      ),
    moveTarget: (option: WireframeGenerationTargetOption, direction: -1 | 1) =>
      updateTargets((current) => moveTarget(current, option.target, direction)),
    selectedAgentId,
    setSelectedAgentId,
    objective,
    setObjective,
    candidateCount,
    setCandidateCount,
    compositionSaga: compositionSaga.saga,
    compositionSagaReviewPhase: compositionSaga.reviewPhase,
    startMode: requiresPlanning ? ("plan_first" as const) : ("direct" as const),
    generation,
    active,
    selectedCandidate,
    selectedCandidateIndex,
    selectCandidate: (candidateIndex: number) => {
      setSelectedCandidateIndex(candidateIndex);
      setCandidatePreviewEnabled(true);
    },
    discardCandidatePreview: () => setCandidatePreviewEnabled(false),
    startGeneration: requiresPlanning ? compositionSaga.startSaga : startGeneration,
    cancelGeneration: compositionSaga.active ? compositionSaga.cancelSaga : cancelGeneration,
    applyCandidate,
    canStart: startDisabledReason === "",
    startDisabledReason,
    error:
      compositionSaga.error ??
      startGeneration.error ??
      cancelGeneration.error ??
      applyCandidate.error ??
      generationQuery.error ??
      recoveryQuery.error,
  };
}

function resolveStartDisabledReason({
  permissionReady,
  agentsPending,
  recoveryPending,
  componentCatalogPending,
  componentCatalogError,
  canWrite,
  targets,
  selectedAgentId,
  objective,
  blockedByPreview,
  candidatePreviewActive,
  active,
  translate,
}: {
  permissionReady: boolean;
  agentsPending: boolean;
  recoveryPending: boolean;
  componentCatalogPending: boolean;
  componentCatalogError: boolean;
  canWrite: boolean;
  targets: readonly WireframeGenerationTargetOption[];
  selectedAgentId: string | null;
  objective: string;
  blockedByPreview: boolean;
  candidatePreviewActive: boolean;
  active: boolean;
  translate: (key: string) => string;
}): string {
  if (!permissionReady || agentsPending || recoveryPending || componentCatalogPending) {
    return translate("CREATION_EDITOR_WIREFRAME_GENERATION_PREPARING");
  }
  if (componentCatalogError) {
    return translate("CREATION_EDITOR_WIREFRAME_GENERATION_TARGET_CATALOG_UNAVAILABLE");
  }
  if (!canWrite) return translate("CREATION_EDITOR_WIREFRAME_GENERATION_PERMISSION_REQUIRED");
  if (targets.length === 0)
    return translate("CREATION_EDITOR_WIREFRAME_GENERATION_TARGET_REQUIRED");
  const unavailableTarget = targets.find(
    (target) => !target.executable && target.state !== "plan_missing",
  );
  if (unavailableTarget?.reasonKey) return translate(unavailableTarget.reasonKey);
  if (blockedByPreview || candidatePreviewActive) {
    return translate("CREATION_EDITOR_WIREFRAME_GENERATION_REVIEW_REQUIRED");
  }
  if (active) return translate("CREATION_EDITOR_WIREFRAME_GENERATION_ACTIVE");
  if (!selectedAgentId) return translate("CREATION_EDITOR_WIREFRAME_GENERATION_AGENT_REQUIRED");
  if (!objective.trim())
    return translate("CREATION_EDITOR_WIREFRAME_GENERATION_OBJECTIVE_REQUIRED");
  return "";
}

function moveTarget(
  targets: readonly BuilderGenerationTargetV1[],
  target: BuilderGenerationTargetV1,
  direction: -1 | 1,
): readonly BuilderGenerationTargetV1[] {
  const index = targets.findIndex(
    (candidate) => wireframeGenerationTargetKey(candidate) === wireframeGenerationTargetKey(target),
  );
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= targets.length) return targets;
  return targets.map((candidate, candidateIndex) => {
    if (candidateIndex === index) return targets[nextIndex] ?? candidate;
    if (candidateIndex === nextIndex) return targets[index] ?? candidate;
    return candidate;
  });
}
