import { useCallback } from "react";
import {
  ClipboardCheckIcon,
  FileSearchIcon,
  Layers3Icon,
  RocketIcon,
  RouteIcon,
  type LucideIcon,
} from "lucide-react";
import { useAui, useAuiState } from "@assistant-ui/react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { cn } from "@arclayer/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";

type AISuggestion = {
  id: string;
  titleKey: string;
  promptKey: string;
  descriptionKey: string;
  icon: LucideIcon;
};

export const AI_CHAT_SUGGESTIONS = [
  {
    id: "review-current-page",
    titleKey: "AI_CHAT_SUGGESTION_REVIEW_PAGE",
    promptKey: "AI_CHAT_SUGGESTION_REVIEW_PAGE_PROMPT",
    descriptionKey: "AI_CHAT_SUGGESTION_REVIEW_PAGE_DESC",
    icon: FileSearchIcon,
  },
  {
    id: "check-content-quality",
    titleKey: "AI_CHAT_SUGGESTION_CHECK_CONTENT",
    promptKey: "AI_CHAT_SUGGESTION_CHECK_CONTENT_PROMPT",
    descriptionKey: "AI_CHAT_SUGGESTION_CHECK_CONTENT_DESC",
    icon: ClipboardCheckIcon,
  },
  {
    id: "plan-content-model",
    titleKey: "AI_CHAT_SUGGESTION_PLAN_MODEL",
    promptKey: "AI_CHAT_SUGGESTION_PLAN_MODEL_PROMPT",
    descriptionKey: "AI_CHAT_SUGGESTION_PLAN_MODEL_DESC",
    icon: Layers3Icon,
  },
  {
    id: "prepare-launch-checklist",
    titleKey: "AI_CHAT_SUGGESTION_LAUNCH_CHECKLIST",
    promptKey: "AI_CHAT_SUGGESTION_LAUNCH_CHECKLIST_PROMPT",
    descriptionKey: "AI_CHAT_SUGGESTION_LAUNCH_CHECKLIST_DESC",
    icon: RocketIcon,
  },
  {
    id: "improve-page-flow",
    titleKey: "AI_CHAT_SUGGESTION_IMPROVE_FLOW",
    promptKey: "AI_CHAT_SUGGESTION_IMPROVE_FLOW_PROMPT",
    descriptionKey: "AI_CHAT_SUGGESTION_IMPROVE_FLOW_DESC",
    icon: RouteIcon,
  },
] satisfies readonly AISuggestion[];

const CONTENT_SUGGESTIONS = [
  "check-content-quality",
  "plan-content-model",
  "prepare-launch-checklist",
];
const SYSTEM_AI_SUGGESTIONS = [
  "review-current-page",
  "improve-page-flow",
  "prepare-launch-checklist",
];
const GENERAL_SUGGESTIONS = [
  "review-current-page",
  "plan-content-model",
  "prepare-launch-checklist",
];

function selectSuggestions(latestUserText: string): readonly AISuggestion[] {
  const normalized = latestUserText.toLocaleLowerCase();
  if (/模型|schema|model/.test(normalized)) {
    return bySuggestionIds(["plan-content-model", "improve-page-flow", "prepare-launch-checklist"]);
  }
  if (/发布|上线|launch|seo|风险/.test(normalized)) {
    return bySuggestionIds([
      "prepare-launch-checklist",
      "check-content-quality",
      "review-current-page",
    ]);
  }
  if (/内容|文案|entry|content/.test(normalized)) {
    return bySuggestionIds(["check-content-quality", "plan-content-model", "review-current-page"]);
  }
  if (typeof window === "undefined") return AI_CHAT_SUGGESTIONS.slice(0, 3);
  const pathname = window.location.pathname;
  const ids = pathname.includes("/content")
    ? CONTENT_SUGGESTIONS
    : pathname.startsWith("/system/settings/agents")
      ? SYSTEM_AI_SUGGESTIONS
      : GENERAL_SUGGESTIONS;
  return bySuggestionIds(ids);
}

function bySuggestionIds(ids: readonly string[]): readonly AISuggestion[] {
  return ids
    .map((id) => AI_CHAT_SUGGESTIONS.find((suggestion) => suggestion.id === id))
    .filter((suggestion): suggestion is AISuggestion => Boolean(suggestion));
}

export function AISuggestions(props: { className?: string }) {
  const { t } = useTranslation(["ai"]);
  const aui = useAui();
  const disabled = useAuiState((s) => s.thread.isDisabled);
  const running = useAuiState((s) => s.thread.isRunning);
  const latestUserText = useAuiState((s) => {
    const messages = Array.isArray(s.thread.messages) ? s.thread.messages : [];
    const latestUser = [...messages].reverse().find((message) => message.role === "user");
    const content = latestUser?.content;
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";
    return content.map((part) => (part.type === "text" ? part.text : "")).join("");
  });
  const suggestions = selectSuggestions(latestUserText ?? "");
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

  return (
    <div className={props.className} data-testid="ai-suggestions">
      {suggestions.map((suggestion) => {
        const Icon = suggestion.icon;
        const title = t(`ai:${suggestion.titleKey}`);
        const prompt = t(`ai:${suggestion.promptKey}`);
        const description = t(`ai:${suggestion.descriptionKey}`);
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
                    "h-9 max-w-full gap-2 !rounded-full border border-border/60 bg-background/20 px-3.5 text-sm font-medium text-foreground shadow-none transition-colors hover:bg-muted",
                    running && "text-label-secondary",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{title}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-72">{description}</TooltipContent>
            </Tooltip>
          </div>
        );
      })}
    </div>
  );
}
