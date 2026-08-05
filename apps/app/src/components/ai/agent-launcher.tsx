"use client";

import { useAui } from "@assistant-ui/react";
import { useQuery } from "@tanstack/react-query";
import { CheckIcon, RotateCcwIcon, TriangleAlertIcon, UsersRoundIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { listAIWorkspaceAgents, type AIWorkspaceAgentCatalogItem } from "@/api/ai";
import { useAiChatStore } from "@/stores/use-ai-chat-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { cn } from "@arclayer/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@arclayer/ui/avatar";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@arclayer/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@arclayer/ui/popover";
import { Skeleton } from "@arclayer/ui/skeleton";

// Keeps the sidebar launcher scannable; the complete catalog remains available beside it.
const MAX_PINNED_AGENTS = 5;

type Translate = (key: string, values?: Record<string, string>) => string;

function agentMonogram(name: string): string {
  return Array.from(name.trim()).slice(0, 2).join("").toUpperCase();
}

function agentName(agent: AIWorkspaceAgentCatalogItem, t: Translate): string {
  return agent.nameI18nKey ? t(`ai:${agent.nameI18nKey}`) : agent.name;
}

function agentDescription(agent: AIWorkspaceAgentCatalogItem, t: Translate): string {
  return agent.descriptionI18nKey ? t(`ai:${agent.descriptionI18nKey}`) : agent.description;
}

function unavailableReason(reason: string | null | undefined, t: Translate): string {
  if (reason === "agents_disabled") return t("ai:AI_AGENT_UNAVAILABLE_AGENTS_DISABLED");
  if (reason === "assignment_disabled") {
    return t("ai:AI_AGENT_UNAVAILABLE_ASSIGNMENT_DISABLED");
  }
  return t("ai:AI_AGENT_UNAVAILABLE");
}

function AgentAvatarButton({
  agent,
  selected,
  launching,
  launchLocked,
  onStart,
  t,
}: {
  agent: AIWorkspaceAgentCatalogItem;
  selected: boolean;
  launching: boolean;
  launchLocked: boolean;
  onStart: () => void;
  t: Translate;
}) {
  const name = agentName(agent, t);
  const description = agentDescription(agent, t);
  const disabledReason = unavailableReason(agent.unavailableReason, t);

  return (
    <button
      type="button"
      aria-label={
        agent.available
          ? t("ai:AI_AGENT_LAUNCHER_START", { name })
          : t("ai:AI_AGENT_LAUNCHER_UNAVAILABLE", { name, reason: disabledReason })
      }
      aria-pressed={selected}
      title={`${name} · ${description}`}
      disabled={!agent.available || launchLocked}
      onClick={onStart}
      className={cn(
        "group flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-full outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-55",
      )}
    >
      <Avatar
        size="lg"
        className={cn(
          "border bg-background transition-[border-color,background-color,color,box-shadow] duration-100 motion-reduce:transition-none",
          "group-hover:border-border group-hover:bg-accent",
          selected && "border-primary/40 bg-primary/10 text-primary shadow-sm",
          launching && "animate-pulse motion-reduce:animate-none",
        )}
      >
        {agent.avatarUrl ? <AvatarImage src={agent.avatarUrl} alt="" /> : null}
        <AvatarFallback className={cn(selected && "bg-primary/10 text-primary")}>
          {agentMonogram(name)}
        </AvatarFallback>
      </Avatar>
    </button>
  );
}

function AgentSearchItem({
  agent,
  selected,
  launchLocked,
  onStart,
  t,
}: {
  agent: AIWorkspaceAgentCatalogItem;
  selected: boolean;
  launchLocked: boolean;
  onStart: () => void;
  t: Translate;
}) {
  const name = agentName(agent, t);
  const description = agentDescription(agent, t);

  return (
    <CommandItem
      value={`${name} ${description} ${agent.role} ${agent.agentId}`}
      disabled={!agent.available || launchLocked}
      onSelect={onStart}
      className="w-full items-start gap-3 py-2.5"
    >
      <Avatar className="mt-0.5 border bg-background">
        {agent.avatarUrl ? <AvatarImage src={agent.avatarUrl} alt="" /> : null}
        <AvatarFallback>{agentMonogram(name)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-callout font-semibold text-label-primary">{name}</span>
        <span className="mt-0.5 block truncate text-footnote text-label-secondary">
          {description}
        </span>
        <span className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
          <Badge variant={agent.provenance === "arclayer_official" ? "secondary" : "outline"}>
            {agent.provenance === "arclayer_official"
              ? t("ai:AI_AGENT_PROVENANCE_OFFICIAL")
              : t("ai:AI_AGENT_PROVENANCE_WORKSPACE")}
          </Badge>
          <span className="text-caption tabular-nums text-label-tertiary">
            {t("ai:AI_AGENT_VERSION", { version: String(agent.versionNumber) })}
          </span>
          {!agent.available ? (
            <span className="inline-flex items-center gap-1 text-caption font-semibold text-destructive">
              <TriangleAlertIcon aria-hidden="true" />
              {unavailableReason(agent.unavailableReason, t)}
            </span>
          ) : null}
        </span>
      </span>
      <CheckIcon
        className={cn("mt-1 text-label-secondary", selected ? "opacity-100" : "opacity-0")}
        aria-hidden="true"
      />
    </CommandItem>
  );
}

function AllAgentsPopover({
  agents,
  selectedAgentId,
  launchingAgentId,
  onStart,
  t,
}: {
  agents: readonly AIWorkspaceAgentCatalogItem[];
  selectedAgentId: string | null;
  launchingAgentId: string | null;
  onStart: (agentId: string) => Promise<boolean>;
  t: Translate;
}) {
  const [open, setOpen] = useState(false);

  const startFromCatalog = async (agentId: string) => {
    if (await onStart(agentId)) setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={t("ai:AI_AGENT_LAUNCHER_ALL")}
          aria-expanded={open}
          disabled={launchingAgentId !== null}
          className="h-10 shrink-0 gap-2 rounded-full border-dashed px-3 text-footnote text-label-secondary"
        >
          <UsersRoundIcon aria-hidden="true" />
          {t("ai:AI_AGENT_LAUNCHER_ALL")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(25rem,calc(100vw-2rem))] overflow-hidden p-0">
        <Command label={t("ai:AI_AGENT_LAUNCHER_SEARCH_LABEL")} className="rounded-none">
          <CommandInput autoFocus placeholder={t("ai:AI_AGENT_LAUNCHER_SEARCH_PLACEHOLDER")} />
          <CommandList className="max-h-80 p-1.5">
            <CommandEmpty>{t("ai:AI_AGENT_LAUNCHER_SEARCH_EMPTY")}</CommandEmpty>
            <CommandGroup heading={t("ai:AI_AGENT_LAUNCHER_ALL_GROUP")} className="p-0">
              {agents.map((agent) => (
                <AgentSearchItem
                  key={agent.agentId}
                  agent={agent}
                  selected={selectedAgentId === agent.agentId}
                  launchLocked={launchingAgentId !== null}
                  onStart={() => void startFromCatalog(agent.agentId)}
                  t={t}
                />
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function AgentLauncher() {
  const { t } = useTranslation(["ai"]);
  const api = useAui();
  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const projectId = useWorkspaceStore((state) => state.currentProjectId);
  const selectedAgentId = useAiChatStore((state) => state.selectedAgentId);
  const setSelectedAgentId = useAiChatStore((state) => state.setSelectedAgentId);
  const openDrawer = useAiChatStore((state) => state.openDrawer);
  const [launchingAgentId, setLaunchingAgentId] = useState<string | null>(null);
  const [launchFailed, setLaunchFailed] = useState(false);
  const catalog = useQuery({
    queryKey: ["ai", "workspace-agents", workspaceId, projectId],
    queryFn: ({ signal }) =>
      listAIWorkspaceAgents({ workspaceId: workspaceId ?? "", projectId, signal }),
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
    retry: false,
  });

  const startWithAgent = async (agentId: string): Promise<boolean> => {
    setLaunchingAgentId(agentId);
    setLaunchFailed(false);
    try {
      setSelectedAgentId(agentId);
      await api.threads().switchToNewThread();
      openDrawer();
      return true;
    } catch (error) {
      console.error("Failed to start an Agent conversation", error);
      setLaunchFailed(true);
      return false;
    } finally {
      setLaunchingAgentId(null);
    }
  };

  if (!workspaceId) {
    return (
      <p className="px-2 py-2 text-footnote text-label-secondary">
        {t("ai:AI_AGENT_LAUNCHER_PROJECT_REQUIRED")}
      </p>
    );
  }

  if (catalog.isLoading) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label={t("ai:AI_AGENT_LAUNCHER_LOADING")}
        className="flex min-h-14 items-center gap-2 overflow-hidden px-2"
      >
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="size-10 shrink-0 rounded-full" />
        ))}
      </div>
    );
  }

  if (catalog.isError) {
    return (
      <div role="alert" className="flex items-center gap-2 px-2 py-2 text-footnote">
        <span className="min-w-0 flex-1 text-destructive">{t("ai:AI_AGENT_LAUNCHER_FAILED")}</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => void catalog.refetch()}>
          <RotateCcwIcon aria-hidden="true" />
          {t("ai:AI_AGENT_LAUNCHER_RETRY")}
        </Button>
      </div>
    );
  }

  const agents = catalog.data?.agents ?? [];
  if (agents.length === 0) {
    return (
      <p className="px-2 py-2 text-footnote text-label-secondary">
        {t("ai:AI_AGENT_LAUNCHER_EMPTY")}
      </p>
    );
  }

  const pinnedAgents = agents.filter((agent) => agent.isPinned).slice(0, MAX_PINNED_AGENTS);

  return (
    <section aria-label={t("ai:AI_AGENT_LAUNCHER_LABEL")} className="min-w-0 px-2 py-2">
      <h3 className="px-1 pb-1.5 text-footnote font-semibold text-label-secondary">
        {t("ai:AI_AGENT_LAUNCHER_LABEL")}
      </h3>
      <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {pinnedAgents.map((agent) => (
          <AgentAvatarButton
            key={agent.agentId}
            agent={agent}
            selected={selectedAgentId === agent.agentId}
            launching={launchingAgentId === agent.agentId}
            launchLocked={launchingAgentId !== null}
            onStart={() => void startWithAgent(agent.agentId)}
            t={t}
          />
        ))}
        <AllAgentsPopover
          agents={agents}
          selectedAgentId={selectedAgentId}
          launchingAgentId={launchingAgentId}
          onStart={startWithAgent}
          t={t}
        />
      </div>
      {launchFailed ? (
        <p role="alert" className="px-1 pt-1 text-footnote text-destructive">
          {t("ai:AI_AGENT_LAUNCH_FAILED")}
        </p>
      ) : null}
    </section>
  );
}
