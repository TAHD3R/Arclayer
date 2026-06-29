"use client";

import { useAui, useAuiState } from "@assistant-ui/react";
import { BotIcon, CommandIcon, FolderIcon, GlobeIcon, XIcon, type LucideIcon } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import {
  cleanAIComposerDirectiveText,
  parseAIComposerDirectives,
  useAIComposerDirectiveStore,
  type AIComposerDirectiveChip,
  type AIComposerDirectiveScope,
} from "@/components/ai/ai-composer-directives";
import { useAiChatStore } from "@/stores/use-ai-chat-store";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";

type AIComposerDirectiveChipsProps = {
  scope: AIComposerDirectiveScope;
  className?: string;
};

export function AIComposerDirectiveChips({ scope, className }: AIComposerDirectiveChipsProps) {
  const { t } = useTranslation(["ai"]);
  const aui = useAui();
  const composerText = useAuiState((s) => s.composer.text);
  const directives = useAIComposerDirectiveStore((s) => s.directivesByScope[scope]);
  const addDirectives = useAIComposerDirectiveStore((s) => s.addDirectives);
  const removeDirective = useAIComposerDirectiveStore((s) => s.removeDirective);
  const webSearchEnabled = useAiChatStore((s) => s.webSearchEnabled);
  const setWebSearchEnabled = useAiChatStore((s) => s.setWebSearchEnabled);

  useEffect(() => {
    const parsed = parseAIComposerDirectives(composerText);
    if (parsed.length === 0) return;
    addDirectives(scope, parsed);
    aui.composer().setText(cleanAIComposerDirectiveText(composerText));
  }, [addDirectives, aui, composerText, scope]);

  if (directives.length === 0 && !webSearchEnabled) return null;

  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-1.5 px-1", className)}>
      {webSearchEnabled ? (
        <DirectiveChip
          directive={{ type: "action", id: "web-search", label: t("ai:AI_CHAT_WEB_SEARCH") }}
          label={t("ai:AI_CHAT_WEB_SEARCH_ENABLED")}
          icon={GlobeIcon}
          showDirectiveLabel={false}
          onRemove={() => setWebSearchEnabled(false)}
        />
      ) : null}
      {directives.map((directive) => (
        <DirectiveChip
          key={`${directive.type}:${directive.id}`}
          directive={directive}
          label={directiveLabel(t, directive)}
          onRemove={() => removeDirective(scope, directive)}
        />
      ))}
    </div>
  );
}

function DirectiveChip(props: {
  directive: AIComposerDirectiveChip;
  label: string;
  icon?: LucideIcon;
  showDirectiveLabel?: boolean;
  onRemove: () => void;
}) {
  const Icon =
    props.icon ??
    (props.directive.type === "project"
      ? FolderIcon
      : props.directive.type === "agent"
        ? BotIcon
        : CommandIcon);

  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-background/70 px-2 py-1 text-caption font-semibold text-label-primary shadow-sm">
      <Icon className="size-3.5 shrink-0 text-label-secondary" aria-hidden="true" />
      <span className="min-w-0 truncate">
        <span className="text-label-secondary">{props.label}</span>
        {props.showDirectiveLabel === false ? null : (
          <span className="ml-1">{props.directive.label}</span>
        )}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={props.label}
            className="-mr-1 size-5 shrink-0 !rounded-full p-0 text-label-tertiary hover:bg-muted hover:text-label-primary"
            onClick={props.onRemove}
          >
            <XIcon className="size-3" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{props.label}</TooltipContent>
      </Tooltip>
    </span>
  );
}

function directiveLabel(
  t: (key: string, options?: Record<string, string>) => string,
  directive: AIComposerDirectiveChip,
): string {
  if (directive.type === "project") return t("ai:AI_CHAT_DIRECTIVE_PROJECT");
  if (directive.type === "agent") return t("ai:AI_CHAT_DIRECTIVE_AGENT");
  return t("ai:AI_CHAT_DIRECTIVE_ACTION");
}
