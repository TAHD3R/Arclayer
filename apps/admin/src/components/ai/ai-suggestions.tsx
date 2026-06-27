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

export const AI_CHAT_SUGGESTIONS = [
  {
    id: "review-current-page",
    titleKey: "AI_CHAT_SUGGESTION_REVIEW_PAGE",
    promptKey: "AI_CHAT_SUGGESTION_REVIEW_PAGE_PROMPT",
    icon: FileSearchIcon,
  },
  {
    id: "check-content-quality",
    titleKey: "AI_CHAT_SUGGESTION_CHECK_CONTENT",
    promptKey: "AI_CHAT_SUGGESTION_CHECK_CONTENT_PROMPT",
    icon: ClipboardCheckIcon,
  },
  {
    id: "plan-content-model",
    titleKey: "AI_CHAT_SUGGESTION_PLAN_MODEL",
    promptKey: "AI_CHAT_SUGGESTION_PLAN_MODEL_PROMPT",
    icon: Layers3Icon,
  },
  {
    id: "prepare-launch-checklist",
    titleKey: "AI_CHAT_SUGGESTION_LAUNCH_CHECKLIST",
    promptKey: "AI_CHAT_SUGGESTION_LAUNCH_CHECKLIST_PROMPT",
    icon: RocketIcon,
  },
  {
    id: "improve-page-flow",
    titleKey: "AI_CHAT_SUGGESTION_IMPROVE_FLOW",
    promptKey: "AI_CHAT_SUGGESTION_IMPROVE_FLOW_PROMPT",
    icon: RouteIcon,
  },
] satisfies readonly {
  id: string;
  titleKey: string;
  promptKey: string;
  icon: LucideIcon;
}[];

export function AISuggestions(props: { className?: string }) {
  const { t } = useTranslation(["ai"]);
  const aui = useAui();
  const disabled = useAuiState((s) => s.thread.isDisabled);
  const running = useAuiState((s) => s.thread.isRunning);
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
      {AI_CHAT_SUGGESTIONS.map((suggestion) => {
        const Icon = suggestion.icon;
        const title = t(`ai:${suggestion.titleKey}`);
        const prompt = t(`ai:${suggestion.promptKey}`);
        return (
          <div
            key={suggestion.id}
            className="fade-in slide-in-from-bottom-2 animate-in fill-mode-both duration-200"
          >
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
          </div>
        );
      })}
    </div>
  );
}
