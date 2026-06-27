import {
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  HammerIcon,
  MessageSquareTextIcon,
  SearchIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { listAIProjectAgents, type AIAgentCatalogItem } from "@/api/ai";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import { Command, CommandGroup, CommandItem, CommandList } from "@arclayer/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@arclayer/ui/popover";

import { DEFAULT_AI_AGENT_ID, useAiChatStore } from "@/stores/use-ai-chat-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const AGENT_ICON_BY_ID = {
  content_analyzer: SearchIcon,
  content_advisor: MessageSquareTextIcon,
  content_builder: HammerIcon,
  content_model_advisor: BotIcon,
} as const;

const STATIC_AGENT_OPTIONS = [
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
    value: "content_builder",
    labelKey: "ai:AI_AGENT_CONTENT_BUILDER",
    descriptionKey: "ai:AI_AGENT_CONTENT_BUILDER_DESC",
    icon: HammerIcon,
  },
  {
    value: "content_model_advisor",
    labelKey: "ai:AI_AGENT_CONTENT_MODEL_ADVISOR",
    descriptionKey: "ai:AI_AGENT_CONTENT_MODEL_ADVISOR_DESC",
    icon: BotIcon,
  },
] as const;

type AIAgentOption = {
  value: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

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
  const {
    data: agentsData,
    isError: agentsIsError,
    isLoading: agentsIsLoading,
  } = useQuery({
    queryKey: ["ai", "project-agents", projectId],
    queryFn: ({ signal }) => listAIProjectAgents({ projectId: projectId ?? "", signal }),
    enabled: Boolean(projectId),
    staleTime: 60_000,
    retry: false,
  });
  const options = useMemo(
    () =>
      agentsData?.agents.map((agent) => toAgentOption(agent)) ??
      STATIC_AGENT_OPTIONS.map((agent) => ({
        value: agent.value,
        label: t(agent.labelKey),
        description: t(agent.descriptionKey),
        icon: agent.icon,
      })),
    [agentsData?.agents, t],
  );
  const selected = useMemo(
    () => options.find((agent) => agent.value === selectedAgentId) ?? options[0],
    [options, selectedAgentId],
  );
  useEffect(() => {
    if (!agentsData || options.length === 0) return;
    if (options.some((agent) => agent.value === selectedAgentId)) return;
    setSelectedAgentId(options[0].value);
  }, [agentsData, options, selectedAgentId, setSelectedAgentId]);
  const SelectedIcon = selected?.icon ?? (agentsIsError ? TriangleAlertIcon : BotIcon);
  const disabled = !projectId || agentsIsLoading || agentsIsError || options.length === 0;
  const buttonLabel = getButtonLabel({
    projectId,
    isLoading: agentsIsLoading,
    isError: agentsIsError,
    hasOptions: options.length > 0,
    selectedLabel: selected?.label,
    t,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t("ai:AI_AGENT_SELECT")}
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-8 min-w-0 justify-start gap-2 rounded-xl px-2.5 text-footnote font-semibold text-label-primary hover:bg-accent/70",
            compact ? "max-w-[11rem]" : "max-w-[14rem]",
            className,
          )}
        >
          <SelectedIcon className="size-3.5 shrink-0 text-label-secondary" aria-hidden="true" />
          <span className="truncate">{buttonLabel}</span>
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
              {options.map((agent) => {
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
                        {agent.label}
                      </span>
                      <span className="mt-0.5 block truncate text-footnote text-label-secondary">
                        {agent.description}
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

function toAgentOption(agent: AIAgentCatalogItem): AIAgentOption {
  return {
    value: agent.agentId,
    label: agent.name,
    description: agent.description,
    icon: AGENT_ICON_BY_ID[agent.agentId as keyof typeof AGENT_ICON_BY_ID] ?? BotIcon,
  };
}

function getButtonLabel(input: {
  projectId: string | null;
  isLoading: boolean;
  isError: boolean;
  hasOptions: boolean;
  selectedLabel?: string;
  t: (key: string) => string;
}): string {
  if (!input.projectId) return input.t("ai:AI_AGENT_WORKSPACE_REQUIRED");
  if (input.isLoading) return input.t("ai:AI_AGENT_LOADING");
  if (input.isError) return input.t("ai:AI_AGENT_LOAD_FAILED");
  if (!input.hasOptions) return input.t("ai:AI_AGENT_EMPTY");
  return input.selectedLabel ?? input.t("ai:AI_AGENT_SELECT");
}
