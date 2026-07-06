import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangleIcon, NetworkIcon, WandSparklesIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  executeAIWorkspaceAction,
  formatAIChatError,
  type AIWorkspaceActionContentModel,
  type AIWorkspaceActionResponse,
} from "@/api/ai";
import { buildContentModelsQueryKey } from "@/api/content";
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
  const [instruction, setInstruction] = useState("");
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const updateMutation = useMutation({
    mutationFn: async (input: { instruction: string }) => {
      const response = await executeAIWorkspaceAction(
        [
          t("ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_ACTION_PREFIX", { modelId }),
          "",
          input.instruction,
        ].join("\n"),
        {
          mode: "build",
          projectId,
        },
      );
      const updatedModel = resolveWorkspaceUpdatedModel(response);
      if (!updatedModel) {
        throw new Error(t("ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_NO_UPDATE"));
      }
      return { response, updatedModel };
    },
    onSuccess: ({ response }) => {
      setInstruction("");
      setResultMessage(response.content || t("ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_UPDATED"));
      void queryClient.invalidateQueries({ queryKey: buildContentModelsQueryKey(projectId) });
    },
  });

  if (!enabled) return null;

  const trimmedInstruction = instruction.trim();
  const pending = updateMutation.isPending;

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
            {resultMessage ?? t("ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_TARGET")}
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
            if (resultMessage) setResultMessage(null);
          }}
          className="min-h-24 resize-none rounded-md text-footnote"
        />
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!trimmedInstruction || pending}
            onClick={() => updateMutation.mutate({ instruction: trimmedInstruction })}
            className="h-8 shrink-0 gap-1.5 rounded-md px-2.5 text-footnote font-semibold"
          >
            <WandSparklesIcon className="size-3.5" aria-hidden="true" />
            {pending
              ? t("ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_CREATING")
              : t("ai:AI_AGENT_CONTENT_MODEL_PROPOSAL_CREATE")}
          </Button>
        </div>
      </div>
      {updateMutation.isError ? (
        <ProposalError message={formatAIChatError(updateMutation.error)} />
      ) : null}
    </section>
  );
}

function resolveWorkspaceUpdatedModel(
  response: AIWorkspaceActionResponse,
): AIWorkspaceActionContentModel | null {
  if (
    response.kind !== "tool_call" ||
    response.status !== "completed" ||
    response.action !== "update_content_model"
  ) {
    return null;
  }
  return response.contentModel ?? response.contentModels[0] ?? null;
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
