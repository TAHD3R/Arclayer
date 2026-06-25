import {
  CheckIcon,
  ChevronDownIcon,
  BotIcon,
  MessageSquareTextIcon,
  SearchIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import { Command, CommandGroup, CommandItem, CommandList } from "@arclayer/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@arclayer/ui/popover";

import { DEFAULT_AI_AGENT_ID, useAiChatStore } from "@/stores/use-ai-chat-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const AGENT_OPTIONS = [
  {
    value: "content_analyzer",
    labelKey: "ai:AI_AGENT_CONTENT_ANALYZER",
    descriptionKey: "ai:AI_AGENT_CONTENT_ANALYZER_DESC",
    icon: SearchIcon,
  },
  {
    value: "content_advisor",
    labelKey: "ai:AI_AGENT_CONTENT_ADVISOR",
    descriptionKey: "ai:AI_AGENT_CONTENT_ADVISOR_DESC",
    icon: MessageSquareTextIcon,
  },
  {
    value: "content_model_advisor",
    labelKey: "ai:AI_AGENT_CONTENT_MODEL_ADVISOR",
    descriptionKey: "ai:AI_AGENT_CONTENT_MODEL_ADVISOR_DESC",
    icon: BotIcon,
  },
] as const;

type AIAgentSelectorProps = {
  className?: string;
  compact?: boolean;
};

export function AIAgentSelector({ className, compact = false }: AIAgentSelectorProps) {
  const { t } = useTranslation(["ai"]);
  const [open, setOpen] = useState(false);
  const projectId = useWorkspaceStore((s) => s.currentProjectId);
  const selectedAgentId = useAiChatStore((s) => s.selectedAgentId || DEFAULT_AI_AGENT_ID);
  const setSelectedAgentId = useAiChatStore((s) => s.setSelectedAgentId);
  const selected = useMemo(
    () => AGENT_OPTIONS.find((agent) => agent.value === selectedAgentId) ?? AGENT_OPTIONS[0],
    [selectedAgentId],
  );
  const SelectedIcon = selected.icon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t("ai:AI_AGENT_SELECT")}
          aria-expanded={open}
          disabled={!projectId}
          className={cn(
            "h-8 min-w-0 justify-start gap-2 rounded-xl px-2.5 text-footnote font-semibold text-label-primary hover:bg-accent/70",
            compact ? "max-w-[11rem]" : "max-w-[14rem]",
            className,
          )}
        >
          <SelectedIcon className="size-3.5 shrink-0 text-label-secondary" aria-hidden="true" />
          <span className="truncate">{t(selected.labelKey)}</span>
          <ChevronDownIcon className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          "overflow-hidden p-0 [&_[cmdk-group-items]]:flex [&_[cmdk-group-items]]:w-full [&_[cmdk-group-items]]:flex-col [&_[cmdk-group]]:w-full [&_[cmdk-item]]:w-full [&_[cmdk-list-sizer]]:w-full",
          compact ? "w-[22rem] max-w-[calc(100vw-2rem)]" : "w-[min(24rem,calc(100vw-2rem))]",
        )}
      >
        <Command className="w-full rounded-none">
          <CommandList className="max-h-80 w-full p-1.5">
            <CommandGroup className="w-full p-0">
              {AGENT_OPTIONS.map((agent) => {
                const Icon = agent.icon;
                const active = selectedAgentId === agent.value;
                return (
                  <CommandItem
                    key={agent.value}
                    value={agent.value}
                    onSelect={() => {
                      setSelectedAgentId(agent.value);
                      setOpen(false);
                    }}
                    className="w-full cursor-pointer items-start gap-3 rounded-xl px-3 py-3"
                  >
                    <Icon className="mt-0.5 size-5 text-label-secondary" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-callout font-semibold text-label-primary">
                        {t(agent.labelKey)}
                      </span>
                      <span className="mt-0.5 block truncate text-footnote text-label-secondary">
                        {t(agent.descriptionKey)}
                      </span>
                    </span>
                    <CheckIcon
                      className={cn(
                        "mt-1 size-4 text-label-secondary",
                        active ? "opacity-100" : "opacity-0",
                      )}
                      aria-hidden="true"
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
