import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { AlertTriangleIcon, WandSparklesIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  buildAIAgentApprovalsQueryKey,
  createAIAgentContentDraftProposal,
  formatAIChatError,
  listAIProjectAgents,
} from "@/api/ai";
import { aiAgentUnavailableReasonKey } from "@/components/ai/ai-agent-availability";
import { useAiChatStore } from "@/stores/use-ai-chat-store";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import { Textarea } from "@arclayer/ui/textarea";

type ContentItemRouteContext = {
  projectId: string;
  itemId: string;
};

type AIContentProposalCardProps = {
  enabled: boolean;
};

const CONTENT_ITEM_PATH_PATTERN = /^\/projects\/([^/]+)\/content\/library\/([^/]+)\/?$/;

export function AIContentProposalCard({ enabled }: AIContentProposalCardProps) {
  const { t } = useTranslation(["ai"]);
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const routeContext = useMemo(() => parseContentItemRoute(pathname), [pathname]);
  const selectedModel = useAiChatStore((s) => s.selectedModel);
  const selectedReasoningEffort = useAiChatStore((s) => s.selectedReasoningEffort);
  const [instruction, setInstruction] = useState("");
  const [createdApprovalId, setCreatedApprovalId] = useState<string | null>(null);
  const agentsQuery = useQuery({
    queryKey: ["ai", "project-agents", routeContext?.projectId],
    queryFn: ({ signal }) =>
      listAIProjectAgents({ projectId: routeContext?.projectId ?? "", signal }),
    enabled: enabled && Boolean(routeContext?.projectId),
    staleTime: 60_000,
    retry: false,
  });
  const writerSkill = agentsQuery.data?.skills.find((skill) => skill.skillId === "content.writer");
  const proposalMutation = useMutation({
    mutationFn: async (input: { context: ContentItemRouteContext; instruction: string }) =>
      createAIAgentContentDraftProposal({
        projectId: input.context.projectId,
        payload: {
          targetId: input.context.itemId,
          instruction: input.instruction,
          model: selectedModel,
          reasoningEffort: selectedReasoningEffort,
        },
      }),
    onSuccess: (result, input) => {
      setInstruction("");
      setCreatedApprovalId(result.approval.id);
      void queryClient.invalidateQueries({
        queryKey: buildAIAgentApprovalsQueryKey(input.context.projectId),
      });
    },
  });

  if (!enabled || !routeContext) return null;

  if (agentsQuery.isError) {
    return <ProposalError message={formatAIChatError(agentsQuery.error)} />;
  }

  const unavailableDescription = t("ai:AI_AGENT_CONTENT_PROPOSAL_TARGET");

  if (agentsQuery.isLoading) {
    return (
      <ProposalUnavailable
        title={t("ai:AI_AGENT_CONTENT_PROPOSAL")}
        message={t("ai:AI_CONTEXT_RECOMMENDATION_CATALOG_LOADING", {
          description: unavailableDescription,
        })}
      />
    );
  }

  if (!writerSkill?.enabled) {
    return (
      <ProposalUnavailable
        title={t("ai:AI_AGENT_CONTENT_PROPOSAL")}
        message={t(aiAgentUnavailableReasonKey(writerSkill?.disabledReason), {
          description: unavailableDescription,
        })}
      />
    );
  }

  const trimmedInstruction = instruction.trim();
  const pending = proposalMutation.isPending;

  return (
    <section
      aria-label={t("ai:AI_AGENT_CONTENT_PROPOSAL")}
      className="mb-3 rounded-lg border border-border/60 bg-background/80 p-2.5 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <WandSparklesIcon className="size-4 text-label-secondary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-footnote font-semibold text-label-primary">
            {t("ai:AI_AGENT_CONTENT_PROPOSAL")}
          </div>
        </div>
      </div>
      <div className="mt-2 grid gap-2">
        <Textarea
          value={instruction}
          rows={3}
          aria-label={t("ai:AI_AGENT_CONTENT_PROPOSAL_INSTRUCTION")}
          placeholder={t("ai:AI_AGENT_CONTENT_PROPOSAL_PLACEHOLDER")}
          disabled={pending}
          onChange={(event) => {
            setInstruction(event.target.value);
            if (createdApprovalId) setCreatedApprovalId(null);
          }}
          className="min-h-20 resize-none rounded-md text-footnote"
        />
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 text-caption text-label-secondary">
            {createdApprovalId
              ? t("ai:AI_AGENT_CONTENT_PROPOSAL_CREATED")
              : t("ai:AI_AGENT_CONTENT_PROPOSAL_TARGET")}
          </div>
          <Button
            type="button"
            size="sm"
            disabled={!trimmedInstruction || pending}
            onClick={() =>
              proposalMutation.mutate({ context: routeContext, instruction: trimmedInstruction })
            }
            className="h-8 shrink-0 gap-1.5 rounded-md px-2.5 text-footnote font-semibold"
          >
            <WandSparklesIcon className="size-3.5" aria-hidden="true" />
            {pending
              ? t("ai:AI_AGENT_CONTENT_PROPOSAL_CREATING")
              : t("ai:AI_AGENT_CONTENT_PROPOSAL_CREATE")}
          </Button>
        </div>
      </div>
      {proposalMutation.isError ? (
        <ProposalError message={formatAIChatError(proposalMutation.error)} />
      ) : null}
    </section>
  );
}

function parseContentItemRoute(pathname: string): ContentItemRouteContext | null {
  const match = CONTENT_ITEM_PATH_PATTERN.exec(pathname);
  if (!match) return null;
  return {
    projectId: decodeURIComponent(match[1]),
    itemId: decodeURIComponent(match[2]),
  };
}

function ProposalError(props: { message: string }) {
  return (
    <div className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-caption text-destructive">
      <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">{props.message}</span>
    </div>
  );
}

function ProposalUnavailable(props: { title: string; message: string }) {
  return (
    <section
      aria-label={props.title}
      className={cn(
        "mb-3 flex items-start gap-2 rounded-lg border border-border/60",
        "bg-background/80 px-2.5 py-2 text-caption text-label-secondary",
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
