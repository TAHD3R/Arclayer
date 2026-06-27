import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangleIcon, NetworkIcon, WandSparklesIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  buildAIAgentApprovalsQueryKey,
  createAIAgentContentModelDraftProposal,
  formatAIChatError,
  listAIProjectAgents,
} from "@/api/ai";
import { aiAgentUnavailableReasonKey } from "@/components/ai/ai-agent-availability";
import { buildContentModelsQueryKey } from "@/api/content";
import { useAiChatStore } from "@/stores/use-ai-chat-store";
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
  const selectedModel = useAiChatStore((s) => s.selectedModel);
  const selectedReasoningEffort = useAiChatStore((s) => s.selectedReasoningEffort);
  const [instruction, setInstruction] = useState("");
  const [createdApprovalId, setCreatedApprovalId] = useState<string | null>(null);
  const agentsQuery = useQuery({
    queryKey: ["ai", "project-agents", projectId],
    queryFn: ({ signal }) => listAIProjectAgents({ projectId, signal }),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
  const modelerSkill = agentsQuery.data?.skills.find(
    (skill) => skill.skillId === "content.modeler",
  );
  const proposalMutation = useMutation({
    mutationFn: async (input: { instruction: string }) =>
      createAIAgentContentModelDraftProposal({
        projectId,
        payload: {
          targetId: modelId,
          instruction: input.instruction,
          model: selectedModel,
          reasoningEffort: selectedReasoningEffort,
        },
      }),
    onSuccess: (result) => {
      setInstruction("");
      setCreatedApprovalId(result.approval.id);
      void queryClient.invalidateQueries({
        queryKey: buildAIAgentApprovalsQueryKey(projectId),
      });
      void queryClient.invalidateQueries({ queryKey: buildContentModelsQueryKey(projectId) });
    },
  });

  if (!enabled) return null;

  if (agentsQuery.isError) {
    return <ProposalError message={formatAIChatError(agentsQuery.error)} className={className} />;
  }

  const unavailableDescription = t("ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_TARGET");

  if (agentsQuery.isLoading) {
    return (
      <ProposalUnavailable
        title={t("ai:AI_AGENT_CONTENT_MODEL_PROPOSAL")}
        message={t("ai:AI_CONTEXT_RECOMMENDATION_CATALOG_LOADING", {
          description: unavailableDescription,
        })}
        className={className}
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
        className={className}
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
        <NetworkIcon className="size-4 text-label-secondary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-footnote font-semibold text-label-primary">
            {t("ai:AI_AGENT_CONTENT_MODEL_PROPOSAL")}
          </div>
          <div className="truncate text-caption text-label-secondary">
            {createdApprovalId
              ? t("ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_CREATED")
              : t("ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_TARGET")}
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
            if (createdApprovalId) setCreatedApprovalId(null);
          }}
          className="min-h-24 resize-none rounded-md text-footnote"
        />
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!trimmedInstruction || pending}
            onClick={() => proposalMutation.mutate({ instruction: trimmedInstruction })}
            className="h-8 shrink-0 gap-1.5 rounded-md px-2.5 text-footnote font-semibold"
          >
            <WandSparklesIcon className="size-3.5" aria-hidden="true" />
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

function ProposalError(props: { message: string; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-caption text-destructive",
        props.className,
      )}
    >
      <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">{props.message}</span>
    </div>
  );
}

function ProposalUnavailable(props: { title: string; message: string; className?: string }) {
  return (
    <section
      aria-label={props.title}
      className={cn(
        "flex items-start gap-2 rounded-lg border border-border/60",
        "bg-background/80 px-2.5 py-2 text-caption text-label-secondary",
        props.className,
      )}
    >
      <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <div className="text-footnote font-semibold text-label-primary">{props.title}</div>
        <div className="break-words">{props.message}</div>
      </div>
    </section>
  );
}
