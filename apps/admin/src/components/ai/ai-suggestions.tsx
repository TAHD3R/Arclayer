import { useCallback } from "react";
import { useAui, useAuiState } from "@assistant-ui/react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { cn } from "@arclayer/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";
import {
  useAiChatStore,
  type AIAgentMessageArtifact,
  type AIWorkspaceActionArtifact,
} from "@/stores/use-ai-chat-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

type AISuggestion = {
  id: string;
  titleKey: string;
  promptKey: string;
  descriptionKey: string;
};

export const AI_CHAT_SUGGESTIONS = [
  {
    id: "review-current-page",
    titleKey: "AI_CHAT_SUGGESTION_REVIEW_PAGE",
    promptKey: "AI_CHAT_SUGGESTION_REVIEW_PAGE_PROMPT",
    descriptionKey: "AI_CHAT_SUGGESTION_REVIEW_PAGE_DESC",
  },
  {
    id: "check-content-quality",
    titleKey: "AI_CHAT_SUGGESTION_CHECK_CONTENT",
    promptKey: "AI_CHAT_SUGGESTION_CHECK_CONTENT_PROMPT",
    descriptionKey: "AI_CHAT_SUGGESTION_CHECK_CONTENT_DESC",
  },
  {
    id: "plan-content-model",
    titleKey: "AI_CHAT_SUGGESTION_PLAN_MODEL",
    promptKey: "AI_CHAT_SUGGESTION_PLAN_MODEL_PROMPT",
    descriptionKey: "AI_CHAT_SUGGESTION_PLAN_MODEL_DESC",
  },
  {
    id: "prepare-launch-checklist",
    titleKey: "AI_CHAT_SUGGESTION_LAUNCH_CHECKLIST",
    promptKey: "AI_CHAT_SUGGESTION_LAUNCH_CHECKLIST_PROMPT",
    descriptionKey: "AI_CHAT_SUGGESTION_LAUNCH_CHECKLIST_DESC",
  },
  {
    id: "improve-page-flow",
    titleKey: "AI_CHAT_SUGGESTION_IMPROVE_FLOW",
    promptKey: "AI_CHAT_SUGGESTION_IMPROVE_FLOW_PROMPT",
    descriptionKey: "AI_CHAT_SUGGESTION_IMPROVE_FLOW_DESC",
  },
  {
    id: "refine-plan",
    titleKey: "AI_CHAT_SUGGESTION_REFINE_PLAN",
    promptKey: "AI_CHAT_SUGGESTION_REFINE_PLAN_PROMPT",
    descriptionKey: "AI_CHAT_SUGGESTION_REFINE_PLAN_DESC",
  },
  {
    id: "plan-next-step",
    titleKey: "AI_CHAT_SUGGESTION_PLAN_NEXT_STEP",
    promptKey: "AI_CHAT_SUGGESTION_PLAN_NEXT_STEP_PROMPT",
    descriptionKey: "AI_CHAT_SUGGESTION_PLAN_NEXT_STEP_DESC",
  },
] satisfies readonly AISuggestion[];

const CONTENT_SUGGESTIONS = [
  "check-content-quality",
  "plan-content-model",
  "prepare-launch-checklist",
];

type AISuggestionSource = "thread" | "message";

type AISuggestionsProps = {
  className?: string;
  source?: AISuggestionSource;
  agentArtifact?: AIAgentMessageArtifact | null;
  workspaceAction?: AIWorkspaceActionArtifact | null;
};

function selectSuggestions(input: {
  source: AISuggestionSource;
  agentArtifact?: AIAgentMessageArtifact | null;
  workspaceAction?: AIWorkspaceActionArtifact | null;
  currentProjectId?: string | null;
  pathname?: string;
}): readonly AISuggestion[] {
  const artifactSuggestions = suggestionIdsForArtifacts(input.agentArtifact, input.workspaceAction);
  if (artifactSuggestions.length > 0) return bySuggestionIds(artifactSuggestions);
  if (input.source === "message") return [];
  if (!input.currentProjectId || !input.pathname?.startsWith("/projects/")) return [];
  if (input.pathname.includes("/content")) return bySuggestionIds(CONTENT_SUGGESTIONS);
  return bySuggestionIds(["review-current-page", "plan-content-model", "prepare-launch-checklist"]);
}

function suggestionIdsForArtifacts(
  agentArtifact?: AIAgentMessageArtifact | null,
  workspaceAction?: AIWorkspaceActionArtifact | null,
): readonly string[] {
  if (agentArtifact?.type === "agent_execution_plan") {
    if (agentArtifact.status === "planned") return ["refine-plan", "plan-next-step"];
    return ["plan-next-step"];
  }
  if (workspaceAction?.type === "workspace_project_created") {
    return ["plan-content-model", "prepare-launch-checklist"];
  }
  if (workspaceAction?.type === "workspace_content_model_created") {
    return ["prepare-launch-checklist", "check-content-quality"];
  }
  return [];
}

function bySuggestionIds(ids: readonly string[]): readonly AISuggestion[] {
  return ids
    .map((id) => AI_CHAT_SUGGESTIONS.find((suggestion) => suggestion.id === id))
    .filter((suggestion): suggestion is AISuggestion => Boolean(suggestion));
}

export function AISuggestions(props: AISuggestionsProps) {
  const { t } = useTranslation(["ai"]);
  const aui = useAui();
  const disabled = useAuiState((s) => s.thread.isDisabled);
  const running = useAuiState((s) => s.thread.isRunning);
  const currentProjectId = useWorkspaceStore((s) => s.currentProjectId);
  const activeConversation = useAiChatStore((s) =>
    s.conversations.find((conversation) => conversation.id === s.activeId),
  );
  const latestAssistant = [...(activeConversation?.messages ?? [])]
    .reverse()
    .find((message) => message.role === "assistant");
  const source = props.source ?? "thread";
  const suggestions = selectSuggestions({
    source,
    agentArtifact:
      props.agentArtifact ?? (source === "thread" ? latestAssistant?.agentArtifact : null),
    workspaceAction:
      props.workspaceAction ?? (source === "thread" ? latestAssistant?.workspaceAction : null),
    currentProjectId,
    pathname: typeof window === "undefined" ? "" : window.location.pathname,
  });
  const submitSuggestion = useCallback(
    (prompt: string) => {
      if (disabled) return;
      if (aui.thread().getState().isRunning) {
        aui.composer().setText(prompt);
        return;
      }
      aui.thread().append({
        content: [{ type: "text", text: prompt }],
        runConfig: aui.composer().getState().runConfig,
      });
      aui.composer().setText("");
    },
    [aui, disabled],
  );

  if (suggestions.length === 0) return null;

  return (
    <div className={props.className} data-testid="ai-suggestions">
      {suggestions.map((suggestion) => {
        const title = t(`ai:${suggestion.titleKey}`);
        const prompt = t(`ai:${suggestion.promptKey}`);
        const description = normalizeTooltipText(t(`ai:${suggestion.descriptionKey}`));
        return (
          <div
            key={suggestion.id}
            className="fade-in slide-in-from-bottom-2 animate-in fill-mode-both duration-200"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={title}
                  disabled={disabled}
                  onClick={() => submitSuggestion(prompt)}
                  className={cn(
                    "h-9 max-w-full !rounded-full border border-border/60 bg-background/20 px-3.5 text-sm font-medium text-foreground shadow-none transition-colors hover:bg-muted",
                    running && "text-label-secondary",
                  )}
                >
                  <span className="truncate">{title}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-72 whitespace-normal leading-snug" layout={false}>
                {description}
              </TooltipContent>
            </Tooltip>
          </div>
        );
      })}
    </div>
  );
}

function normalizeTooltipText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
