import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  BuilderRevisionOut,
  DesignSystemConceptGenerationRecoveryOut,
  DesignSystemConceptGenerationStatus,
  ProjectDesignSystemAssignmentOut,
} from "@arclayer/openapi";
import { listAIWorkspaceAgents } from "@/api/ai";
import {
  cancelProjectDesignSystemConceptGeneration,
  createProjectDesignSystemConceptGeneration,
  PROJECT_DESIGN_SYSTEM_QUERY_KEY,
  recoverProjectDesignSystemConceptGenerations,
} from "@/api/project-design-systems";

const STYLE_GUIDE_GENERATION_TOOL = "builder.style_guide.generate";
const RECOMMENDED_AGENT_SLUG = "visual-designer";
const TERMINAL_STATUSES = new Set<DesignSystemConceptGenerationStatus>([
  "partial",
  "succeeded",
  "failed",
  "cancelled",
]);

interface StyleGuideGenerationInput {
  readonly projectId: string;
  readonly workspaceId: string | null;
  readonly assignment: ProjectDesignSystemAssignmentOut | null;
  readonly revision: BuilderRevisionOut | null;
  readonly enabled: boolean;
  readonly canWrite: boolean;
  readonly online: boolean;
}

function commandKey(prefix: string): string {
  return `${prefix}:${globalThis.crypto.randomUUID()}`;
}

export function useProjectStyleGuideGeneration(input: StyleGuideGenerationInput) {
  const { t, i18n } = useTranslation("account");
  const queryClient = useQueryClient();
  const [objective, setObjective] = useState("");
  const [candidateCount, setCandidateCount] = useState(2);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState<number | null>(null);

  const agentsQuery = useQuery({
    queryKey: ["ai", "workspace-agents", input.workspaceId, input.projectId, "builder"],
    queryFn: ({ signal }) =>
      listAIWorkspaceAgents({
        workspaceId: input.workspaceId!,
        projectId: input.projectId,
        signal,
      }),
    enabled: input.enabled && Boolean(input.workspaceId),
    staleTime: 60_000,
    retry: false,
  });
  const eligibleAgents = useMemo(
    () =>
      (agentsQuery.data?.agents ?? []).filter(
        (agent) =>
          agent.available &&
          agent.supportedExecutionModes.includes("build") &&
          agent.toolGrants.includes(STYLE_GUIDE_GENERATION_TOOL),
      ),
    [agentsQuery.data?.agents],
  );
  const recommendedAgentId =
    eligibleAgents.find((agent) => agent.slug === RECOMMENDED_AGENT_SLUG)?.agentId ?? null;

  useEffect(() => {
    if (selectedAgentId && eligibleAgents.some((agent) => agent.agentId === selectedAgentId)) {
      return;
    }
    const defaultAgent = eligibleAgents.find(
      (agent) => agent.agentId === agentsQuery.data?.defaultAgentId,
    );
    setSelectedAgentId(
      recommendedAgentId ?? defaultAgent?.agentId ?? eligibleAgents[0]?.agentId ?? null,
    );
  }, [agentsQuery.data?.defaultAgentId, eligibleAgents, recommendedAgentId, selectedAgentId]);

  useEffect(() => {
    setSelectedCandidateIndex(null);
  }, [input.revision?.siteRevision.id]);

  const recoveryQueryKey = [
    ...PROJECT_DESIGN_SYSTEM_QUERY_KEY,
    input.projectId,
    input.assignment?.designSystemId,
    "concept-generation-recovery",
  ] as const;
  const recoveryQuery = useQuery({
    queryKey: recoveryQueryKey,
    queryFn: ({ signal }) => {
      if (!input.assignment) {
        throw new Error("CREATION_EDITOR_STYLE_AI_GENERATION_REQUIRED");
      }
      return recoverProjectDesignSystemConceptGenerations(
        input.projectId,
        input.assignment.designSystemId,
        signal,
      );
    },
    enabled: input.enabled && Boolean(input.assignment),
    retry: false,
    refetchInterval: (query) => (query.state.data?.active ? 1_250 : false),
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const assignment = input.assignment;
      const revision = input.revision;
      const normalizedObjective = objective.trim();
      if (
        !input.online ||
        !input.workspaceId ||
        !assignment ||
        assignment.ownerKind !== "project" ||
        !revision ||
        !selectedAgentId ||
        !normalizedObjective
      ) {
        throw new Error(t("CREATION_EDITOR_STYLE_AI_REQUEST_INVALID"));
      }
      return createProjectDesignSystemConceptGeneration(
        input.projectId,
        assignment.designSystemId,
        {
          agentId: selectedAgentId,
          baseEtag: revision.siteRevision.manifestHash,
          baseRevisionId: revision.siteRevision.id,
          baseVersionId: assignment.versionId,
          candidateCount,
          expectedBaseChecksum: assignment.manifestChecksum,
          locale:
            i18n.resolvedLanguage ??
            i18n.language ??
            revision.contentStructureRevision.snapshot.locales[0] ??
            "zh-CN",
          objective: normalizedObjective,
        },
        commandKey("style-guide-generation"),
      );
    },
    onSuccess: (generation) => {
      queryClient.setQueryData<DesignSystemConceptGenerationRecoveryOut>(
        recoveryQueryKey,
        (current) => ({
          active: generation,
          latestTerminal: current?.latestTerminal ?? null,
        }),
      );
      setSelectedCandidateIndex(null);
    },
  });

  const recoveredGeneration = recoveryQuery.data?.active ?? recoveryQuery.data?.latestTerminal;
  const generation = recoveredGeneration ?? startMutation.data ?? null;
  const active = Boolean(generation && !TERMINAL_STATUSES.has(generation.status));
  const cancelMutation = useMutation({
    mutationFn: () => {
      const assignment = input.assignment;
      if (!assignment || !generation || TERMINAL_STATUSES.has(generation.status)) {
        throw new Error(t("CREATION_EDITOR_STYLE_AI_GENERATION_REQUIRED"));
      }
      return cancelProjectDesignSystemConceptGeneration(
        input.projectId,
        assignment.designSystemId,
        generation.generationId,
        { reason: t("CREATION_EDITOR_STYLE_AI_CANCEL_REASON") },
      );
    },
    onSuccess: (cancelled) => {
      queryClient.setQueryData<DesignSystemConceptGenerationRecoveryOut>(
        recoveryQueryKey,
        (current) => ({
          active: TERMINAL_STATUSES.has(cancelled.status) ? null : cancelled,
          latestTerminal: TERMINAL_STATUSES.has(cancelled.status)
            ? cancelled
            : (current?.latestTerminal ?? null),
        }),
      );
    },
  });

  const canStart = Boolean(
    input.canWrite &&
    input.online &&
    input.workspaceId &&
    input.revision &&
    input.assignment?.ownerKind === "project" &&
    selectedAgentId &&
    objective.trim() &&
    !agentsQuery.isPending &&
    !active &&
    !startMutation.isPending,
  );

  return {
    objective,
    setObjective,
    candidateCount,
    setCandidateCount,
    eligibleAgents,
    recommendedAgentId,
    selectedAgentId,
    setSelectedAgentId,
    agentsQuery,
    generation,
    recoveryQuery,
    generationId: generation?.generationId ?? null,
    active,
    selectedCandidateIndex,
    setSelectedCandidateIndex,
    startMutation,
    cancelMutation,
    canStart,
    startDisabledReason: resolveDisabledReason({
      ...input,
      selectedAgentId,
      objective,
      agentsQuery,
      active,
      starting: startMutation.isPending,
    }),
    error: agentsQuery.error ?? recoveryQuery.error ?? startMutation.error ?? cancelMutation.error,
  };
}

function resolveDisabledReason(input: {
  readonly workspaceId: string | null;
  readonly assignment: ProjectDesignSystemAssignmentOut | null;
  readonly revision: BuilderRevisionOut | null;
  readonly canWrite: boolean;
  readonly online: boolean;
  readonly selectedAgentId: string | null;
  readonly objective: string;
  readonly agentsQuery: { readonly isPending: boolean };
  readonly active: boolean;
  readonly starting: boolean;
}): string {
  if (!input.online) return "CREATION_EDITOR_STYLE_OFFLINE_DESC";
  if (!input.canWrite) return "CREATION_EDITOR_STYLE_READ_ONLY_DESC";
  if (!input.workspaceId || !input.revision) return "CREATION_EDITOR_STYLE_AI_CONTEXT_REQUIRED";
  if (input.assignment?.ownerKind !== "project") return "CREATION_EDITOR_STYLE_AI_FORK_REQUIRED";
  if (input.agentsQuery.isPending) return "CREATION_EDITOR_STYLE_AI_AGENTS_LOADING";
  if (!input.selectedAgentId) return "CREATION_EDITOR_STYLE_AI_AGENT_REQUIRED";
  if (!input.objective.trim()) return "CREATION_EDITOR_STYLE_AI_OBJECTIVE_REQUIRED";
  if (input.starting) return "CREATION_EDITOR_STYLE_AI_STARTING";
  if (input.active) return "CREATION_EDITOR_STYLE_AI_ALREADY_RUNNING";
  return "CREATION_EDITOR_STYLE_AI_READY";
}

export type ProjectStyleGuideGeneration = ReturnType<typeof useProjectStyleGuideGeneration>;
