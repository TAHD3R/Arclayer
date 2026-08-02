import { useCallback } from "react";
import { useAui, useAuiState } from "@assistant-ui/react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { cn } from "@arclayer/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";
import { AI_PROMPT_STARTER_CATEGORIES } from "@/components/ai/ai-prompt-starters";
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
  {
    id: "edit-homepage",
    titleKey: "AI_CHAT_SUGGESTION_EDIT_HOMEPAGE",
    promptKey: "AI_CHAT_SUGGESTION_EDIT_HOMEPAGE_PROMPT",
    descriptionKey: "AI_CHAT_SUGGESTION_EDIT_HOMEPAGE_DESC",
  },
  {
    id: "update-site-source",
    titleKey: "AI_CHAT_SUGGESTION_UPDATE_SITE_SOURCE",
    promptKey: "AI_CHAT_SUGGESTION_UPDATE_SITE_SOURCE_PROMPT",
    descriptionKey: "AI_CHAT_SUGGESTION_UPDATE_SITE_SOURCE_DESC",
  },
  {
    id: "verify-and-publish",
    titleKey: "AI_CHAT_SUGGESTION_VERIFY_AND_PUBLISH",
    promptKey: "AI_CHAT_SUGGESTION_VERIFY_AND_PUBLISH_PROMPT",
    descriptionKey: "AI_CHAT_SUGGESTION_VERIFY_AND_PUBLISH_DESC",
  },
] satisfies readonly AISuggestion[];

const HOME_AI_CHAT_SUGGESTIONS = AI_PROMPT_STARTER_CATEGORIES.map((category) => ({
  id: `home-${category.id}`,
  titleKey: category.labelKey,
  promptKey: category.promptKeys[0],
  descriptionKey: category.promptKeys[0],
})) satisfies readonly AISuggestion[];

const CONTENT_SUGGESTIONS = [
  "check-content-quality",
  "plan-content-model",
  "prepare-launch-checklist",
];

type AISuggestionsProps = {
  className?: string;
  variant?: "contextual" | "home";
};

function selectSuggestions(input: {
  currentProjectId?: string | null;
  pathname?: string;
  variant: NonNullable<AISuggestionsProps["variant"]>;
}): readonly AISuggestion[] {
  if (input.variant === "home") return HOME_AI_CHAT_SUGGESTIONS;
  if (!input.currentProjectId || !input.pathname?.startsWith("/projects/")) return [];
  if (input.pathname.includes("/content")) return bySuggestionIds(CONTENT_SUGGESTIONS);
  return bySuggestionIds(["review-current-page", "plan-content-model", "prepare-launch-checklist"]);
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
  const suggestions = selectSuggestions({
    currentProjectId,
    pathname: typeof window === "undefined" ? "" : window.location.pathname,
    variant: props.variant ?? "contextual",
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
                    "h-9 max-w-full border border-border/60 bg-background/20 px-3.5 text-sm font-medium text-foreground shadow-none transition-colors hover:bg-muted",
                    props.variant === "home"
                      ? "h-11 !rounded-md bg-card min-[769px]:h-9"
                      : "!rounded-full",
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
