import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangleIcon, NetworkIcon, ShieldCheckIcon, WandSparklesIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  buildAIAgentApprovalsQueryKey,
  createAIAgentContentModelDraftProposal,
  formatAIChatError,
  listAIProjectAgents,
  type AgentContentModelDraftProposalResponse,
} from "@/api/ai";
import { aiAgentUnavailableReasonKey } from "@/components/ai/ai-agent-availability";
import { resolveAIRequestModel, useAiChatStore } from "@/stores/use-ai-chat-store";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import { Textarea } from "@arclayer/ui/textarea";

type AIContentModelProposalCardProps = {
  enabled: boolean;
  projectId: string;
  modelId: string;
  className?: string;
};

export function AIContentModelProposalCard({
  enabled,
  projectId,
  modelId,
  className,
}: AIContentModelProposalCardProps) {
  const { t } = useTranslation(["ai"]);
  const queryClient = useQueryClient();
  const selectedModel = useAiChatStore((state) => state.selectedModel);
  const selectedReasoningEffort = useAiChatStore((state) => state.selectedReasoningEffort);
  const [instruction, setInstruction] = useState("");
  const [createdProposal, setCreatedProposal] =
    useState<AgentContentModelDraftProposalResponse | null>(null);
  const {
    data: agentsData,
    error: agentsError,
    isError: agentsIsError,
    isLoading: agentsIsLoading,
  } = useQuery({
    queryKey: ["ai", "project-agents", projectId],
    queryFn: ({ signal }) => listAIProjectAgents({ projectId, signal }),
    enabled: enabled && Boolean(projectId && modelId),
    staleTime: 60_000,
    retry: false,
  });
  const modelerSkill = agentsData?.skills.find((skill) => skill.skillId === "content.modeler");
  const proposalMutation = useMutation({
    mutationFn: (input: { instruction: string }) =>
      createAIAgentContentModelDraftProposal({
        projectId,
        payload: {
          targetId: modelId,
          instruction: input.instruction,
          model: resolveAIRequestModel(selectedModel),
          reasoningEffort: selectedReasoningEffort,
        },
      }),
    onSuccess: (result) => {
      setInstruction("");
      setCreatedProposal(result);
      void queryClient.invalidateQueries({
        queryKey: buildAIAgentApprovalsQueryKey(projectId),
      });
    },
  });

  if (!enabled || !projectId || !modelId) return null;

  if (agentsIsError) {
    return <ProposalError message={formatAIChatError(agentsError)} />;
  }

  const unavailableDescription = t("ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_TARGET");

  if (agentsIsLoading) {
    return (
      <ProposalUnavailable
        title={t("ai:AI_AGENT_CONTENT_MODEL_PROPOSAL")}
        message={t("ai:AI_CONTEXT_RECOMMENDATION_CATALOG_LOADING", {
          description: unavailableDescription,
        })}
      />
    );
  }

  if (!modelerSkill?.enabled) {
    return (
      <ProposalUnavailable
        title={t("ai:AI_AGENT_CONTENT_MODEL_PROPOSAL")}
        message={t(aiAgentUnavailableReasonKey(modelerSkill?.disabledReason), {
          description: unavailableDescription,
        })}
      />
    );
  }

  const trimmedInstruction = instruction.trim();
  const pending = proposalMutation.isPending;

  return (
    <section
      aria-label={t("ai:AI_AGENT_CONTENT_MODEL_PROPOSAL")}
      className={cn(
        "rounded-lg border border-border/60 bg-background/80 p-2.5 shadow-sm",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <NetworkIcon className="size-4 text-label-secondary" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="truncate text-footnote font-semibold text-label-primary">
            {t("ai:AI_AGENT_CONTENT_MODEL_PROPOSAL")}
          </div>
          <div className="truncate text-caption text-label-secondary">
            {t("ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_TARGET")}
          </div>
        </div>
      </div>
      <div className="mt-2 grid gap-2">
        <Textarea
          value={instruction}
          rows={4}
          aria-label={t("ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_INSTRUCTION")}
          placeholder={t("ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_PLACEHOLDER")}
          disabled={pending}
          onChange={(event) => {
            setInstruction(event.target.value);
            if (createdProposal) setCreatedProposal(null);
          }}
          className="min-h-24 resize-none rounded-md text-footnote"
        />
        {createdProposal ? <ModelProposalResult result={createdProposal} /> : null}
        <div className="flex items-center justify-end">
          <Button
            type="button"
            size="sm"
            disabled={!trimmedInstruction || pending}
            onClick={() => proposalMutation.mutate({ instruction: trimmedInstruction })}
            className="h-8 shrink-0 gap-1.5 rounded-md px-2.5 text-footnote font-semibold"
          >
            <WandSparklesIcon className="size-3.5" aria-hidden />
            {pending
              ? t("ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_CREATING")
              : t("ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_CREATE")}
          </Button>
        </div>
      </div>
      {proposalMutation.isError ? (
        <ProposalError message={formatAIChatError(proposalMutation.error)} />
      ) : null}
    </section>
  );
}

function ModelProposalResult(props: { result: AgentContentModelDraftProposalResponse }) {
  const { t } = useTranslation(["ai"]);
  const preview = props.result.impactPreview;

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-md border border-primary/20 bg-primary/[0.04] px-2.5 py-2"
    >
      <div className="flex items-start gap-2">
        <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0">
          <div className="text-caption font-medium text-label-primary">
            {t("ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_CREATED")}
          </div>
          <div className="truncate text-caption text-label-secondary">
            {t("ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_APPROVAL_ID", {
              approvalId: props.result.approval.id,
            })}
          </div>
        </div>
      </div>
      <div className="mt-2 grid gap-1 text-caption text-label-secondary">
        <span>
          {t("ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_AFFECTED", {
            count: preview.affectedItemsCount,
          })}
        </span>
        <span>
          {t("ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_RECOVERY", {
            count: preview.recoveryItemsCount,
          })}
        </span>
        <span>
          {t("ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_RESHAPE", {
            count: preview.reshapeItemsCount,
          })}
        </span>
        {preview.hasBlockingChanges ? (
          <span className="flex items-start gap-1.5 text-destructive">
            <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {t("ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_BLOCKED")}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ProposalError(props: { message: string; className?: string }) {
  return (
    <div
      className={cn(
        "mt-2 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-caption text-destructive",
        props.className,
      )}
    >
      <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 break-words">{props.message}</span>
    </div>
  );
}

function ProposalUnavailable(props: { title: string; message: string }) {
  return (
    <section
      aria-label={props.title}
      className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/80 px-2.5 py-2 text-caption text-label-secondary"
    >
      <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <div className="min-w-0">
        <div className="text-footnote font-semibold text-label-primary">{props.title}</div>
        <div className="break-words">{props.message}</div>
      </div>
    </section>
  );
}
