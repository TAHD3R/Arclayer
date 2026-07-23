import {
  BotIcon,
  ChartNoAxesCombinedIcon,
  CheckIcon,
  ChevronDownIcon,
  FileTextIcon,
  PaletteIcon,
  SearchIcon,
  RouteIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { listAIWorkspaceAgents, type AIWorkspaceAgentCatalogItem } from "@/api/ai";
import { getProjectDetail, listProjects } from "@/api/projects";
import {
  ProjectAvatar,
  projectAvatarPropsFromIdentity,
  type ProjectAvatarIdentity,
} from "@/components/common/project-avatar";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import { Badge } from "@arclayer/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@arclayer/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@arclayer/ui/popover";

import { DEFAULT_AI_AGENT_ID, useAiChatStore } from "@/stores/use-ai-chat-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const AGENT_ICON_BY_ROLE = {
  orchestrator: BotIcon,
  information_architecture: RouteIcon,
  visual_design: PaletteIcon,
  content_strategy: FileTextIcon,
  seo_strategy: SearchIcon,
  data_analysis: ChartNoAxesCombinedIcon,
} as const;

type AIAgentOption = {
  value: string;
  label: string;
  description: string;
  icon: LucideIcon;
  available: boolean;
  provenance: AIWorkspaceAgentCatalogItem["provenance"];
  scope: AIWorkspaceAgentCatalogItem["scope"];
  unavailableReason: string | null;
  versionNumber: number;
};

type AIAgentSelectorProps = {
  className?: string;
  compact?: boolean;
};

type AIProjectOption = {
  value: string;
  label: string;
  description: string;
} & ProjectAvatarIdentity;

export function AIProjectSelector({ className, compact = false }: AIAgentSelectorProps) {
  const { t } = useTranslation(["ai"]);
  const [open, setOpen] = useState(false);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId ?? s.lastWorkspaceId);
  const projectId = useWorkspaceStore((s) => s.currentProjectId);
  const setCurrentProjectId = useWorkspaceStore((s) => s.setCurrentProjectId);
  const { data: projectsData, isLoading: projectsLoading } = useQuery({
    queryKey: ["ai", "project-selector", workspaceId],
    queryFn: () =>
      listProjects({
        workspaceId: String(workspaceId),
        archived: false,
        ordering: "-updated_at",
        page: 1,
        size: 12,
      }),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
    retry: false,
  });
  const { data: currentProject } = useQuery({
    queryKey: ["project", "detail", projectId],
    queryFn: () => getProjectDetail(String(projectId)),
    enabled: Boolean(projectId),
    staleTime: 60_000,
    retry: false,
  });
  const options = useMemo<AIProjectOption[]>(
    () =>
      (projectsData?.items ?? []).map((project) => ({
        value: project.id,
        label: project.name,
        description: project.description ?? project.slug,
        iconMode: project.iconMode,
        iconColor: project.iconColor,
        iconGlyph: project.iconGlyph,
        iconEmoji: project.iconEmoji,
        iconUrl: project.iconUrl,
      })),
    [projectsData?.items],
  );
  const selected =
    options.find((project) => project.value === projectId) ??
    (currentProject
      ? {
          value: currentProject.project.id,
          label: currentProject.project.name,
          description: currentProject.project.description ?? currentProject.project.slug,
          iconMode: currentProject.project.iconMode,
          iconColor: currentProject.project.iconColor,
          iconGlyph: currentProject.project.iconGlyph,
          iconEmoji: currentProject.project.iconEmoji,
          iconUrl: currentProject.project.iconUrl,
        }
      : null);
  const buttonLabel = selected?.label ?? t("ai:AI_CHAT_PROJECT_SELECT");
  const disabled = !workspaceId;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t("ai:AI_CHAT_PROJECT_SELECT")}
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-8 min-w-0 justify-start gap-2 rounded-md px-2.5 text-footnote font-semibold text-label-primary hover:bg-accent/70",
            compact ? "max-w-[11rem]" : "max-w-[14rem]",
            className,
          )}
        >
          {selected ? (
            <ProjectAvatar
              name={selected.label}
              size={16}
              decorative
              {...projectAvatarPropsFromIdentity(selected)}
            />
          ) : null}
          <span className={cn("truncate", !selected && "text-label-secondary")}>
            {projectsLoading ? t("ai:AI_CHAT_PROJECT_LOADING") : buttonLabel}
          </span>
          <ChevronDownIcon className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          "overflow-hidden p-1 [&_[cmdk-group-items]]:flex [&_[cmdk-group-items]]:w-full [&_[cmdk-group-items]]:flex-col [&_[cmdk-group]]:w-full [&_[cmdk-item]]:w-full [&_[cmdk-list-sizer]]:w-full",
          compact ? "w-[22rem] max-w-[calc(100vw-2rem)]" : "w-[min(24rem,calc(100vw-2rem))]",
        )}
      >
        <Command className="w-full rounded-none">
          <CommandList className="max-h-80 w-full p-0">
            <CommandGroup className="w-full p-0">
              {options.map((project) => {
                const active = projectId === project.value;
                return (
                  <CommandItem
                    key={project.value}
                    value={project.value}
                    onSelect={() => {
                      setCurrentProjectId(project.value);
                      setOpen(false);
                    }}
                    className="w-full cursor-pointer items-start gap-3"
                  >
                    <ProjectAvatar
                      name={project.label}
                      size={20}
                      className="mt-0.5"
                      decorative
                      {...projectAvatarPropsFromIdentity(project)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-callout font-semibold text-label-primary">
                        {project.label}
                      </span>
                      <span className="mt-0.5 block truncate text-footnote text-label-secondary">
                        {project.description}
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
              {!projectsLoading && options.length === 0 ? (
                <div className="px-3 py-3 text-footnote text-label-secondary">
                  {t("ai:AI_CHAT_PROJECT_EMPTY")}
                </div>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function AIAgentSelector({ className, compact = false }: AIAgentSelectorProps) {
  const { t } = useTranslation(["ai"]);
  const [open, setOpen] = useState(false);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId ?? s.lastWorkspaceId);
  const projectId = useWorkspaceStore((s) => s.currentProjectId);
  const selectedAgentId = useAiChatStore((s) => s.selectedAgentId ?? DEFAULT_AI_AGENT_ID);
  const setSelectedAgentId = useAiChatStore((s) => s.setSelectedAgentId);
  const {
    data: agentsData,
    isError: agentsIsError,
    isLoading: agentsIsLoading,
  } = useQuery({
    queryKey: ["ai", "workspace-agents", workspaceId, projectId],
    queryFn: ({ signal }) =>
      listAIWorkspaceAgents({ workspaceId: workspaceId ?? "", projectId, signal }),
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
    retry: false,
  });
  const options = useMemo(
    () => agentsData?.agents.map((agent) => toAgentOption(agent, t)) ?? [],
    [agentsData?.agents, t],
  );
  const selected = useMemo(
    () => options.find((agent) => agent.value === selectedAgentId),
    [options, selectedAgentId],
  );
  const SelectedIcon =
    selected && !selected.available
      ? TriangleAlertIcon
      : (selected?.icon ?? (agentsIsError ? TriangleAlertIcon : BotIcon));
  const availableOptions = options.filter((agent) => agent.available);
  const disabled = !workspaceId || agentsIsLoading || agentsIsError || options.length === 0;
  const buttonLabel = getButtonLabel({
    workspaceId,
    isLoading: agentsIsLoading,
    isError: agentsIsError,
    hasOptions: availableOptions.length > 0,
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
            "h-8 min-w-0 justify-start gap-2 rounded-md px-2.5 text-footnote font-semibold text-label-primary hover:bg-accent/70",
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
        <Command label={t("ai:AI_AGENT_SEARCH_LABEL")} className="w-full rounded-none">
          <CommandInput
            autoFocus
            placeholder={t("ai:AI_AGENT_SEARCH_PLACEHOLDER")}
            aria-label={t("ai:AI_AGENT_SEARCH_LABEL")}
          />
          <CommandList className="max-h-80 w-full p-1.5">
            <CommandEmpty>{t("ai:AI_AGENT_SEARCH_EMPTY")}</CommandEmpty>
            <CommandGroup heading={t("ai:AI_AGENT_ASSIGNED_GROUP")} className="w-full p-0">
              {options.map((agent) => {
                const Icon = agent.icon;
                const active = selectedAgentId === agent.value;
                return (
                  <CommandItem
                    key={agent.value}
                    value={`${agent.label} ${agent.description} ${agent.value}`}
                    disabled={!agent.available}
                    onSelect={() => {
                      setSelectedAgentId(agent.value);
                      setOpen(false);
                    }}
                    className="w-full cursor-pointer items-start gap-3 py-2.5"
                  >
                    <Icon className="mt-0.5 size-5 text-label-secondary" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-callout font-semibold text-label-primary">
                        {agent.label}
                      </span>
                      <span className="mt-0.5 block truncate text-footnote text-label-secondary">
                        {agent.description}
                      </span>
                      <span className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
                        <Badge
                          variant={
                            agent.provenance === "arclayer_official" ? "secondary" : "outline"
                          }
                        >
                          {agent.provenance === "arclayer_official"
                            ? t("ai:AI_AGENT_PROVENANCE_OFFICIAL")
                            : t("ai:AI_AGENT_PROVENANCE_WORKSPACE")}
                        </Badge>
                        <span className="text-caption tabular-nums text-label-tertiary">
                          {t("ai:AI_AGENT_VERSION", { version: String(agent.versionNumber) })}
                        </span>
                        <span className="text-caption text-label-tertiary">
                          {agent.scope === "system"
                            ? t("ai:AI_AGENT_SCOPE_SYSTEM")
                            : t("ai:AI_AGENT_SCOPE_WORKSPACE")}
                        </span>
                        {!agent.available ? (
                          <span className="inline-flex items-center gap-1 text-caption font-semibold text-destructive">
                            <TriangleAlertIcon aria-hidden="true" />
                            {unavailableReasonLabel(agent.unavailableReason, t)}
                          </span>
                        ) : null}
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

function toAgentOption(
  agent: AIWorkspaceAgentCatalogItem,
  t: (key: string) => string,
): AIAgentOption {
  return {
    value: agent.agentId,
    label: agent.nameI18nKey ? t(`ai:${agent.nameI18nKey}`) : agent.name,
    description: agent.descriptionI18nKey ? t(`ai:${agent.descriptionI18nKey}`) : agent.description,
    icon: AGENT_ICON_BY_ROLE[agent.role as keyof typeof AGENT_ICON_BY_ROLE] ?? BotIcon,
    available: agent.available,
    provenance: agent.provenance,
    scope: agent.scope,
    unavailableReason: agent.unavailableReason ?? null,
    versionNumber: agent.versionNumber,
  };
}

function unavailableReasonLabel(reason: string | null, t: (key: string) => string): string {
  if (reason === "agents_disabled") return t("ai:AI_AGENT_UNAVAILABLE_AGENTS_DISABLED");
  if (reason === "assignment_disabled") {
    return t("ai:AI_AGENT_UNAVAILABLE_ASSIGNMENT_DISABLED");
  }
  return t("ai:AI_AGENT_UNAVAILABLE");
}

function getButtonLabel(input: {
  workspaceId: string | null;
  isLoading: boolean;
  isError: boolean;
  hasOptions: boolean;
  selectedLabel?: string;
  t: (key: string, values?: Record<string, string>) => string;
}): string {
  if (!input.workspaceId) return input.t("ai:AI_AGENT_WORKSPACE_REQUIRED");
  if (input.isLoading) return input.t("ai:AI_AGENT_LOADING");
  if (input.isError) return input.t("ai:AI_AGENT_LOAD_FAILED");
  if (input.selectedLabel) return input.selectedLabel;
  if (!input.hasOptions) return input.t("ai:AI_AGENT_EMPTY");
  return input.t("ai:AI_AGENT_SELECT");
}
