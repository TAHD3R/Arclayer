import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import type {
  BuilderCompositionSagaOut,
  BuilderGenerationTargetV1,
  BuilderRevisionOut,
} from "@arclayer/openapi";

import {
  cancelProjectBuilderCompositionSaga,
  createProjectBuilderCompositionSaga,
  getProjectBuilderCompositionSaga,
  recoverProjectBuilderCompositionSaga,
  transitionProjectBuilderCompositionSagaPhase,
} from "@/api/project-builder";

const TERMINAL_SAGA_STATUSES = new Set<BuilderCompositionSagaOut["status"]>([
  "completed",
  "failed",
  "cancelled",
]);

function sagaQueryKey(projectId: string, sagaId: string | null) {
  return ["project", "builder", projectId, "composition-saga", sagaId] as const;
}

export function compositionSagaGeneration(saga: BuilderCompositionSagaOut | null) {
  if (!saga) return null;
  if (saga.currentPhase === "composition" || saga.currentPhase === "completed") {
    return saga.compositionGeneration ?? saga.planningGeneration;
  }
  return saga.planningGeneration;
}

export function useProjectCompositionSaga({
  projectId,
  revision,
  targets,
  scopeKey,
  selectedAgentId,
  objective,
  candidateCount,
  enabled,
  canWrite,
  invalidRequestMessage,
  cancelReason,
}: Readonly<{
  projectId: string;
  revision: BuilderRevisionOut | null;
  targets: readonly BuilderGenerationTargetV1[];
  scopeKey: string;
  selectedAgentId: string | null;
  objective: string;
  candidateCount: number;
  enabled: boolean;
  canWrite: boolean;
  invalidRequestMessage: string;
  cancelReason: string;
}>) {
  const queryClient = useQueryClient();
  const [sagaId, setSagaId] = useState<string | null>(null);
  const [dismissedSagaId, setDismissedSagaId] = useState<string | null>(null);

  const recoveryQuery = useQuery({
    queryKey: ["project", "builder", projectId, "composition-saga", "recovery", scopeKey],
    queryFn: ({ signal }) => {
      if (targets.length === 0) throw new Error(invalidRequestMessage);
      return recoverProjectBuilderCompositionSaga(projectId, { targets: [...targets] }, signal);
    },
    enabled: enabled && canWrite && Boolean(revision && targets.length > 0),
    retry: false,
  });
  const recoveredSaga = recoveryQuery.data?.active ?? recoveryQuery.data?.latestTerminal ?? null;
  const visibleRecoveredSaga = recoveredSaga?.sagaId === dismissedSagaId ? null : recoveredSaga;
  const resolvedSagaId = sagaId ?? visibleRecoveredSaga?.sagaId ?? null;
  const shouldReadSaga = Boolean(
    resolvedSagaId &&
    (sagaId || (visibleRecoveredSaga && !TERMINAL_SAGA_STATUSES.has(visibleRecoveredSaga.status))),
  );

  const sagaQuery = useQuery({
    queryKey: sagaQueryKey(projectId, resolvedSagaId),
    queryFn: ({ signal }) => getProjectBuilderCompositionSaga(projectId, resolvedSagaId!, signal),
    enabled: enabled && shouldReadSaga,
    retry: false,
    refetchInterval: (query) =>
      TERMINAL_SAGA_STATUSES.has(query.state.data?.status ?? "failed") ? false : 1_250,
  });

  const startSaga = useMutation({
    mutationFn: () => {
      const normalizedObjective = objective.trim();
      if (!revision || !selectedAgentId || !normalizedObjective || targets.length === 0) {
        throw new Error(invalidRequestMessage);
      }
      return createProjectBuilderCompositionSaga(
        projectId,
        {
          baseRevisionId: revision.siteRevision.id,
          baseEtag: revision.siteRevision.manifestHash,
          agentId: selectedAgentId,
          objective: normalizedObjective,
          locale: revision.contentStructureRevision.snapshot.locales[0] ?? "zh-CN",
          candidateCount,
          targets: [...targets],
        },
        `composition-saga:${globalThis.crypto.randomUUID()}`,
      );
    },
    onSuccess: (saga) => {
      setSagaId(saga.sagaId);
      setDismissedSagaId(null);
      queryClient.setQueryData(sagaQueryKey(projectId, saga.sagaId), saga);
    },
  });

  const saga =
    sagaQuery.data ??
    (startSaga.data?.sagaId === resolvedSagaId ? startSaga.data : null) ??
    visibleRecoveredSaga;
  const active = Boolean(saga && !TERMINAL_SAGA_STATUSES.has(saga.status));
  const reviewPhase: "planning" | "composition" | null =
    saga?.status === "planning_review_pending"
      ? "planning"
      : saga?.status === "composition_review_pending"
        ? "composition"
        : null;

  const cancelSaga = useMutation({
    mutationFn: () => {
      if (!saga) throw new Error(invalidRequestMessage);
      return cancelProjectBuilderCompositionSaga(projectId, saga.sagaId, {
        reason: cancelReason,
      });
    },
    onSuccess: (cancelled) => {
      setSagaId(cancelled.sagaId);
      queryClient.setQueryData(sagaQueryKey(projectId, cancelled.sagaId), cancelled);
    },
  });

  const transitionPhase = useMutation({
    mutationFn: ({
      phase,
      appliedChangeSetId,
      appliedSiteRevisionId,
    }: Readonly<{
      phase: "planning" | "composition";
      appliedChangeSetId: string;
      appliedSiteRevisionId: string;
    }>) => {
      if (!saga) throw new Error(invalidRequestMessage);
      return transitionProjectBuilderCompositionSagaPhase(projectId, saga.sagaId, {
        expectedPhase: phase,
        appliedChangeSetId,
        appliedSiteRevisionId,
      });
    },
    onSuccess: (transitioned) => {
      setSagaId(transitioned.sagaId);
      queryClient.setQueryData(sagaQueryKey(projectId, transitioned.sagaId), transitioned);
    },
  });

  useEffect(() => {
    setSagaId(null);
    setDismissedSagaId(null);
    startSaga.reset();
    cancelSaga.reset();
    transitionPhase.reset();
  }, [scopeKey]);

  return {
    saga,
    active,
    reviewPhase,
    generation: compositionSagaGeneration(saga),
    recoveryQuery,
    sagaQuery,
    startSaga,
    cancelSaga,
    transitionPhase,
    dismissSaga: () => {
      if (saga) setDismissedSagaId(saga.sagaId);
      setSagaId(null);
    },
    error:
      startSaga.error ??
      cancelSaga.error ??
      transitionPhase.error ??
      sagaQuery.error ??
      recoveryQuery.error,
  };
}
