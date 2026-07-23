"use client";

import { useAui, useAuiState } from "@assistant-ui/react";
import {
  BotIcon,
  CommandIcon,
  FileTextIcon,
  FolderIcon,
  GlobeIcon,
  ImageIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import {
  agentIdsForComposerScope,
  filterTrustedAIComposerDirectives,
  parseAIComposerDirectives,
  removeAIComposerDirectives,
  useAIComposerDirectiveStore,
  type AIComposerDirectiveChip,
  type AIComposerDirectiveScope,
} from "@/components/ai/ai-composer-directives";
import { useAiChatStore } from "@/stores/use-ai-chat-store";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@arclayer/ui/dialog";
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
    const accepted = filterTrustedAIComposerDirectives(parsed, directives);
    if (accepted.length === 0) return;
    addDirectives(scope, accepted);
    aui.composer().setText(removeAIComposerDirectives(composerText, accepted));
  }, [addDirectives, aui, composerText, directives, scope]);

  useEffect(() => {
    const composer = aui.composer();
    const current = composer.getState().runConfig;
    const mentionedAgentIds = [...agentIdsForComposerScope(scope)];
    const previous = current.custom?.mentionedAgentIds;
    if (
      Array.isArray(previous) &&
      previous.length === mentionedAgentIds.length &&
      previous.every((agentId, index) => agentId === mentionedAgentIds[index])
    ) {
      return;
    }
    composer.setRunConfig({
      ...current,
      custom: { ...current.custom, mentionedAgentIds },
    });
  }, [aui, directives, scope]);

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
  const { t } = useTranslation("ai");
  const Icon = props.icon ?? directiveIcon(props.directive.type);
  const canPreviewAsset =
    props.directive.type === "asset" &&
    props.directive.mime?.startsWith("image/") &&
    Boolean(props.directive.previewUrl);
  const label = (
    <span className="min-w-0 truncate">
      <span className="text-label-secondary">{props.label}</span>
      {props.showDirectiveLabel === false ? null : (
        <span className="ml-1">{props.directive.label}</span>
      )}
    </span>
  );

  return (
    <span className="group/tag inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-background/70 py-1 pr-1.5 pl-2 text-caption font-semibold text-label-primary">
      <Icon className="size-3.5 shrink-0 text-label-secondary" aria-hidden="true" />
      {canPreviewAsset ? (
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              className="min-w-0 cursor-zoom-in rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t("AI_CHAT_PREVIEW_ASSET", { name: props.directive.label })}
            >
              {label}
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl p-2">
            <DialogTitle className="sr-only">{props.directive.label}</DialogTitle>
            <div className="flex max-h-[80dvh] min-h-40 items-center justify-center overflow-hidden rounded-lg bg-muted/40">
              <img
                src={props.directive.previewUrl}
                alt={props.directive.label}
                className="max-h-[80dvh] max-w-full object-contain"
              />
            </div>
          </DialogContent>
        </Dialog>
      ) : (
        label
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={props.label}
            className="size-5 shrink-0 !rounded-full p-0 text-label-tertiary opacity-0 transition-opacity group-hover/tag:opacity-100 focus-visible:opacity-100 hover:bg-muted hover:text-label-primary"
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
  if (directive.type === "skill") return t("ai:AI_CHAT_DIRECTIVE_SKILL");
  if (directive.type === "asset") return t("ai:AI_CHAT_DIRECTIVE_ASSET");
  if (directive.type === "content") return t("ai:AI_CHAT_DIRECTIVE_CONTENT");
  return t("ai:AI_CHAT_DIRECTIVE_ACTION");
}

function directiveIcon(type: AIComposerDirectiveChip["type"]): LucideIcon {
  if (type === "project") return FolderIcon;
  if (type === "agent") return BotIcon;
  if (type === "skill") return CommandIcon;
  if (type === "asset") return ImageIcon;
  if (type === "content") return FileTextIcon;
  return CommandIcon;
}
