import { useCallback } from "react";
import { useAui, useAuiState } from "@assistant-ui/react";
import { useTranslation } from "react-i18next";

import { Suggestions } from "@/components/assistant-ui/elements/suggestions";
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
  const currentProjectId = useWorkspaceStore((s) => s.currentProjectId);
  const suggestions = selectSuggestions({
    currentProjectId,
    pathname: typeof window === "undefined" ? "" : window.location.pathname,
    variant: props.variant ?? "contextual",
  });
  const submitSuggestion = useCallback(
    (prompt: string) => {
      if (disabled) return;
      aui.composer().setText(prompt);
    },
    [aui, disabled],
  );

  if (suggestions.length === 0) return null;

  return (
    <div className={props.className} data-testid="ai-suggestions">
      <Suggestions
        suggestions={suggestions.map((suggestion) => t(`ai:${suggestion.titleKey}`))}
        selectedSuggestion={null}
        cycle={0}
        variant={props.variant === "home" ? "list" : "pills"}
        onSuggestion={(title) => {
          const suggestion = suggestions.find(
            (candidate) => t(`ai:${candidate.titleKey}`) === title,
          );
          if (suggestion !== undefined) submitSuggestion(t(`ai:${suggestion.promptKey}`));
        }}
      />
    </div>
  );
}
