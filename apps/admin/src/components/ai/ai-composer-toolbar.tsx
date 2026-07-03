import { ComposerPrimitive, AuiIf } from "@assistant-ui/react";
import {
  ArrowUpIcon,
  AudioLinesIcon,
  CheckIcon,
  ChevronDownIcon,
  BotIcon,
  GlobeIcon,
  HammerIcon,
  MessageSquareTextIcon,
  PaperclipIcon,
  PlusIcon,
  SquareIcon,
  type LucideIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { listAIProjectAgents } from "@/api/ai";
import { AIProjectSelector } from "@/components/ai/ai-agent-selector";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { AIModelSelector } from "@/components/ai/ai-model-selector";
import {
  DEFAULT_AI_COMPOSER_MODE,
  useAiChatStore,
  type AIComposerMode,
} from "@/stores/use-ai-chat-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { Switch } from "@arclayer/ui/switch";

const COMPOSER_MODES: readonly {
  value: AIComposerMode;
  labelKey: string;
  descriptionKey: string;
  icon: LucideIcon;
  agentId?: string;
}[] = [
  {
    value: "build",
    labelKey: "ai:AI_CHAT_MODE_BUILD",
    descriptionKey: "ai:AI_CHAT_MODE_BUILD_DESC",
    icon: HammerIcon,
    agentId: "content_builder",
  },
  {
    value: "plan",
    labelKey: "ai:AI_CHAT_MODE_PLAN",
    descriptionKey: "ai:AI_CHAT_MODE_PLAN_DESC",
    icon: MessageSquareTextIcon,
    agentId: "content_advisor",
  },
  {
    value: "agent",
    labelKey: "ai:AI_CHAT_MODE_AGENT",
    descriptionKey: "ai:AI_CHAT_MODE_AGENT_DESC",
    icon: BotIcon,
  },
];

type AIComposerToolbarProps = {
  compact?: boolean;
};

export function AIComposerToolbar({ compact = false }: AIComposerToolbarProps) {
  return (
    <div
      className={cn(
        "aui-composer-action-wrapper relative flex min-h-8 min-w-0 items-center",
        compact ? "gap-1" : "gap-2",
      )}
    >
      <AIComposerAttachmentMenu />
      <AIComposerModeSelect />
      <div className="min-w-0 flex-1" />
      <AIModelSelector compact={compact} />
      <AIComposerPrimaryAction />
    </div>
  );
}

export function AIComposerContextControls({ compact = false }: AIComposerToolbarProps) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1">
        <AIComposerModeSelect compact={compact} />
      </div>
      <AIModelSelector compact={compact} />
    </div>
  );
}

export function AIComposerInputActions() {
  const selectedMode = useAiChatStore((s) => s.composerMode || DEFAULT_AI_COMPOSER_MODE);

  return (
    <div className="aui-composer-action-wrapper relative flex min-h-8 min-w-0 items-center gap-1">
      <AIComposerAttachmentMenu />
      {selectedMode === "agent" ? <AIProjectSelector compact /> : null}
      <div className="min-w-0 flex-1" />
      <AIComposerPrimaryAction />
    </div>
  );
}

function AIComposerAttachmentMenu() {
  const { t } = useTranslation(["ai", "common"]);
  const webSearchEnabled = useAiChatStore((s) => s.webSearchEnabled);
  const setWebSearchEnabled = useAiChatStore((s) => s.setWebSearchEnabled);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("ai:AI_CHAT_COMPOSER_ADD_MENU")}
          className="h-8 w-8 rounded-xl text-label-primary hover:bg-accent/70"
        >
          <PlusIcon className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 rounded-xl p-2">
        <ComposerPrimitive.AddAttachment asChild>
          <DropdownMenuItem className="cursor-pointer rounded-lg px-3 py-2.5 text-callout">
            <PaperclipIcon className="size-4 text-label-secondary" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{t("ai:AI_CHAT_UPLOAD_FILE")}</span>
          </DropdownMenuItem>
        </ComposerPrimitive.AddAttachment>
        <DropdownMenuItem
          className="cursor-pointer rounded-lg px-3 py-2.5 text-callout"
          onSelect={(event) => {
            event.preventDefault();
            setWebSearchEnabled(!webSearchEnabled);
          }}
        >
          <GlobeIcon className="size-4 text-label-secondary" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{t("ai:AI_CHAT_WEB_SEARCH")}</span>
          <Switch
            aria-hidden="true"
            checked={webSearchEnabled}
            className="pointer-events-none"
            tabIndex={-1}
          />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AIComposerModeSelect({ compact = false }: AIComposerToolbarProps) {
  const { t } = useTranslation(["ai", "common"]);
  const projectId = useWorkspaceStore((s) => s.currentProjectId);
  const selectedMode = useAiChatStore((s) => s.composerMode || DEFAULT_AI_COMPOSER_MODE);
  const setComposerMode = useAiChatStore((s) => s.setComposerMode);
  const { data: agentsData } = useQuery({
    queryKey: ["ai", "project-agents", projectId],
    queryFn: ({ signal }) => listAIProjectAgents({ projectId: projectId ?? "", signal }),
    enabled: Boolean(projectId),
    staleTime: 60_000,
    retry: false,
  });
  const availableAgentIds = useMemo(
    () => new Set((agentsData?.agents ?? []).map((agent) => agent.agentId)),
    [agentsData?.agents],
  );
  const hasCatalog = Boolean(agentsData);
  const availableModes = useMemo(
    () =>
      COMPOSER_MODES.filter((mode) =>
        isComposerModeAvailable({
          availableAgentIds,
          hasCatalog,
          mode: mode.value,
          modeAgentId: mode.agentId,
        }),
      ),
    [availableAgentIds, hasCatalog],
  );
  const selected = COMPOSER_MODES.find((mode) => mode.value === selectedMode) ?? COMPOSER_MODES[0];
  const SelectedIcon = selected.icon;

  useEffect(() => {
    if (!hasCatalog || availableModes.length === 0) return;
    if (availableModes.some((mode) => mode.value === selectedMode)) return;
    setComposerMode(availableModes[0].value, "default");
  }, [availableModes, hasCatalog, selectedMode, setComposerMode]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t("ai:AI_CHAT_MODE_SELECT")}
          className={cn(
            "h-8 min-w-0 rounded-xl px-2.5 text-footnote font-semibold text-label-primary hover:bg-accent/70",
            compact && "max-w-[8.5rem]",
          )}
        >
          <SelectedIcon className="size-3.5" aria-hidden="true" />
          <span className="truncate">{t(selected.labelKey)}</span>
          <ChevronDownIcon className="size-3.5 opacity-70" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 rounded-xl p-2">
        {COMPOSER_MODES.map((mode) => {
          const Icon = mode.icon;
          const active = selectedMode === mode.value;
          const available = isComposerModeAvailable({
            availableAgentIds,
            hasCatalog,
            mode: mode.value,
            modeAgentId: mode.agentId,
          });
          return (
            <DropdownMenuItem
              key={mode.value}
              disabled={!available}
              onSelect={() => setComposerMode(mode.value)}
              className="items-start gap-3 rounded-lg px-3 py-2.5"
            >
              <Icon className="mt-0.5 size-4 text-label-secondary" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-callout font-semibold text-label-primary">
                  {t(mode.labelKey)}
                </span>
                <span className="mt-0.5 block text-footnote text-label-secondary">
                  {available
                    ? t(mode.descriptionKey)
                    : t("ai:AI_CHAT_MODE_UNAVAILABLE_DESC", {
                        description: t(mode.descriptionKey),
                      })}
                </span>
              </span>
              <CheckIcon
                className={cn(
                  "mt-1 size-4 text-label-secondary",
                  active ? "opacity-100" : "opacity-0",
                )}
                aria-hidden="true"
              />
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function isComposerModeAvailable(input: {
  availableAgentIds: ReadonlySet<string>;
  hasCatalog: boolean;
  mode: AIComposerMode;
  modeAgentId?: string;
}): boolean {
  if (input.mode === "build" || input.mode === "plan") return true;
  if (!input.hasCatalog) return true;
  if (input.mode === "agent") return input.availableAgentIds.size > 0;
  if (!input.modeAgentId) return true;
  return input.availableAgentIds.has(input.modeAgentId);
}

function AIComposerPrimaryAction() {
  const { t } = useTranslation(["ai", "common"]);

  return (
    <div className="flex shrink-0 items-center">
      <AuiIf condition={(s) => s.thread.isRunning}>
        <ComposerPrimitive.Cancel asChild>
          <TooltipIconButton
            tooltip={t("ai:AI_CHAT_STOP")}
            side="bottom"
            type="button"
            variant="default"
            size="icon"
            className="aui-composer-cancel size-8 !rounded-full"
            aria-label={t("ai:AI_CHAT_STOP")}
          >
            <SquareIcon className="aui-composer-cancel-icon size-3.5 fill-current" />
          </TooltipIconButton>
        </ComposerPrimitive.Cancel>
      </AuiIf>
      <AuiIf condition={(s) => !s.thread.isRunning && s.composer.dictation != null}>
        <ComposerPrimitive.StopDictation asChild>
          <TooltipIconButton
            tooltip={t("ai:AI_CHAT_STOP_VOICE_INPUT")}
            side="bottom"
            type="button"
            variant="default"
            size="icon"
            className="aui-composer-stop-dictation size-8 !rounded-full"
            aria-label={t("ai:AI_CHAT_STOP_VOICE_INPUT")}
          >
            <SquareIcon className="aui-composer-stop-dictation-icon size-3.5 fill-current" />
          </TooltipIconButton>
        </ComposerPrimitive.StopDictation>
      </AuiIf>
      <AuiIf
        condition={(s) =>
          !s.thread.isRunning && s.composer.dictation == null && !s.composer.isEmpty
        }
      >
        <ComposerPrimitive.Send asChild>
          <TooltipIconButton
            tooltip={t("ai:AI_CHAT_SEND")}
            side="bottom"
            type="button"
            variant="default"
            size="icon"
            className="aui-composer-send size-8 !rounded-full"
            aria-label={t("ai:AI_CHAT_SEND")}
          >
            <ArrowUpIcon className="aui-composer-send-icon size-4.5" />
          </TooltipIconButton>
        </ComposerPrimitive.Send>
      </AuiIf>
      <AuiIf
        condition={(s) => !s.thread.isRunning && s.composer.dictation == null && s.composer.isEmpty}
      >
        <ComposerPrimitive.Dictate asChild>
          <TooltipIconButton
            tooltip={t("ai:AI_CHAT_VOICE_INPUT")}
            side="bottom"
            type="button"
            variant="default"
            size="icon"
            className="aui-composer-dictate size-8 !rounded-full"
            aria-label={t("ai:AI_CHAT_VOICE_INPUT")}
          >
            <AudioLinesIcon className="aui-composer-dictate-icon size-4" />
          </TooltipIconButton>
        </ComposerPrimitive.Dictate>
      </AuiIf>
    </div>
  );
}
