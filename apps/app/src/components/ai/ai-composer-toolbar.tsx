import { ComposerPrimitive, AuiIf } from "@assistant-ui/react";
import {
  ArrowUpIcon,
  AudioLinesIcon,
  CheckIcon,
  ChevronDownIcon,
  GlobeIcon,
  HammerIcon,
  MessageSquareTextIcon,
  PaperclipIcon,
  PlusIcon,
  SquareIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { AIProjectSelector } from "@/components/ai/ai-agent-selector";
import { AIModelSelector } from "@/components/ai/ai-model-selector";
import { AIComposerSkillMenu } from "@/components/ai/ai-composer-skill-menu";
import {
  DEFAULT_AI_COMPOSER_MODE,
  useAiChatStore,
  type AIComposerMode,
} from "@/stores/use-ai-chat-store";
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
}[] = [
  {
    value: "build",
    labelKey: "ai:AI_CHAT_MODE_BUILD",
    descriptionKey: "ai:AI_CHAT_MODE_BUILD_DESC",
    icon: HammerIcon,
  },
  {
    value: "plan",
    labelKey: "ai:AI_CHAT_MODE_PLAN",
    descriptionKey: "ai:AI_CHAT_MODE_PLAN_DESC",
    icon: MessageSquareTextIcon,
  },
];

type AIComposerToolbarProps = {
  compact?: boolean;
  surface?: "default" | "home" | "sidebar";
};

type AIComposerTriggerProps = {
  compact?: boolean;
  iconOnly?: boolean;
};

export function AIComposerToolbar({
  compact = false,
  surface = "default",
}: AIComposerToolbarProps) {
  if (surface === "home") {
    return (
      <div className="aui-composer-action-wrapper relative flex min-h-8 min-w-0 items-center gap-1">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <AIComposerAttachmentMenu />
          <AIProjectSelector compact />
          <AIComposerSkillMenu compact scope="home" />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <AIModelSelector compact />
          <AIComposerModeSelect compact />
          <AIComposerPrimaryAction />
        </div>
      </div>
    );
  }

  if (surface === "sidebar") {
    return (
      <div className="aui-composer-action-wrapper relative flex min-h-8 min-w-0 items-center gap-1">
        <AIComposerAttachmentMenu />
        <AIModelSelector compact iconOnly />
        <AIComposerSkillMenu compact iconOnly scope="thread" />
        <div className="min-w-0 flex-1" />
        <AIComposerModeSelect compact iconOnly />
        <AIComposerPrimaryAction />
      </div>
    );
  }

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
  return (
    <div className="aui-composer-action-wrapper relative flex min-h-8 min-w-0 items-center gap-1">
      <AIComposerAttachmentMenu />
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
          className="h-8 w-8 rounded-md text-label-primary hover:bg-accent/70"
        >
          <PlusIcon className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <ComposerPrimitive.AddAttachment asChild>
          <DropdownMenuItem className="cursor-pointer">
            <PaperclipIcon className="size-4 text-label-secondary" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{t("ai:AI_CHAT_UPLOAD_FILE")}</span>
          </DropdownMenuItem>
        </ComposerPrimitive.AddAttachment>
        <DropdownMenuItem
          className="cursor-pointer"
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

function AIComposerModeSelect({ compact = false, iconOnly = false }: AIComposerTriggerProps) {
  const { t } = useTranslation(["ai", "common"]);
  const selectedMode = useAiChatStore((s) => s.composerMode || DEFAULT_AI_COMPOSER_MODE);
  const setComposerMode = useAiChatStore((s) => s.setComposerMode);
  const selected = COMPOSER_MODES.find((mode) => mode.value === selectedMode) ?? COMPOSER_MODES[0];
  const SelectedIcon = selected.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={iconOnly ? "icon-sm" : "sm"}
          aria-label={t("ai:AI_CHAT_MODE_SELECT")}
          title={iconOnly ? t(selected.labelKey) : undefined}
          className={cn(
            "h-8 min-w-0 rounded-md px-2.5 text-footnote font-semibold text-label-primary hover:bg-accent/70",
            iconOnly ? "w-8 justify-center gap-0 px-0" : compact && "max-w-[8.5rem]",
          )}
        >
          <SelectedIcon className="size-3.5" aria-hidden="true" />
          {iconOnly ? null : (
            <>
              <span className="truncate">{t(selected.labelKey)}</span>
              <ChevronDownIcon className="size-3.5 opacity-70" aria-hidden="true" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" collisionPadding={16} className="w-72">
        {COMPOSER_MODES.map((mode) => {
          const Icon = mode.icon;
          const active = selectedMode === mode.value;
          return (
            <DropdownMenuItem
              key={mode.value}
              onSelect={() => setComposerMode(mode.value)}
              className="items-start gap-3"
            >
              <Icon className="mt-0.5 size-4 text-label-secondary" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-callout font-semibold text-label-primary">
                  {t(mode.labelKey)}
                </span>
                <span className="mt-0.5 block text-footnote text-label-secondary">
                  {t(mode.descriptionKey)}
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
