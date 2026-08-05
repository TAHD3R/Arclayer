"use client";

import { useAui, useAuiState } from "@assistant-ui/react";
import { GlobeIcon, XIcon } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import {
  agentIdsForComposerScope,
  filterTrustedAIComposerDirectives,
  parseAIComposerDirectives,
  skillInstallationIdsForComposerScope,
  useAIComposerDirectiveStore,
  type AIComposerDirectiveChip,
  type AIComposerDirectiveScope,
} from "@/components/ai/ai-composer-directives";
import { useAiChatStore } from "@/stores/use-ai-chat-store";
import { Button } from "@arclayer/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";

export function AIComposerDirectiveSync({ scope }: { scope: AIComposerDirectiveScope }) {
  const aui = useAui();
  const composerText = useAuiState((state) => state.composer.text);
  const directives = useAIComposerDirectiveStore((state) => state.directivesByScope[scope]);
  const setDirectives = useAIComposerDirectiveStore((state) => state.setDirectives);

  useEffect(() => {
    const parsed = parseAIComposerDirectives(composerText);
    const accepted = filterTrustedAIComposerDirectives(parsed, directives).map((directive) =>
      mergeRegisteredDirectiveMetadata(directive, directives),
    );
    setDirectives(scope, accepted);
  }, [composerText, directives, scope, setDirectives]);

  useEffect(() => {
    const composer = aui.composer();
    const current = composer.getState().runConfig;
    const mentionedAgentIds = [...agentIdsForComposerScope(scope)];
    const selectedSkillInstallationIds = [...skillInstallationIdsForComposerScope(scope)];
    const previousAgentIds = current.custom?.mentionedAgentIds;
    const previousSkillInstallationIds = current.custom?.selectedSkillInstallationIds;
    if (
      equalStringArrays(previousAgentIds, mentionedAgentIds) &&
      equalStringArrays(previousSkillInstallationIds, selectedSkillInstallationIds)
    ) {
      return;
    }
    composer.setRunConfig({
      ...current,
      custom: { ...current.custom, mentionedAgentIds, selectedSkillInstallationIds },
    });
  }, [aui, directives, scope]);

  return null;
}

export function AIComposerDirectiveChips({ scope: _scope }: { scope: AIComposerDirectiveScope }) {
  const { t } = useTranslation("ai");
  const webSearchEnabled = useAiChatStore((state) => state.webSearchEnabled);
  const setWebSearchEnabled = useAiChatStore((state) => state.setWebSearchEnabled);

  if (!webSearchEnabled) return null;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 px-1">
      <span className="group/tag relative inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-background/70 py-1 pr-2 pl-2 text-caption font-semibold text-label-primary">
        <GlobeIcon className="size-3.5 shrink-0 text-label-secondary" aria-hidden="true" />
        <span className="min-w-0 truncate">{t("AI_CHAT_WEB_SEARCH_ENABLED")}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("AI_CHAT_WEB_SEARCH")}
              className="size-5 rounded-full p-0 text-label-tertiary hover:bg-muted hover:text-label-primary"
              onClick={() => setWebSearchEnabled(false)}
            >
              <XIcon className="size-3" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("AI_CHAT_WEB_SEARCH")}</TooltipContent>
        </Tooltip>
      </span>
    </div>
  );
}

function mergeRegisteredDirectiveMetadata(
  directive: AIComposerDirectiveChip,
  registered: readonly AIComposerDirectiveChip[],
): AIComposerDirectiveChip {
  const match = registered.find(
    (candidate) => candidate.type === directive.type && candidate.id === directive.id,
  );
  if (!match) return directive;
  return {
    ...directive,
    command: match.command,
    previewUrl: match.previewUrl,
    mime: match.mime,
  };
}

function equalStringArrays(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => item === expected[index])
  );
}
