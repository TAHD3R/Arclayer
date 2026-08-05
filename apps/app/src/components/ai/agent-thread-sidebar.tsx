"use client";

import { ThreadListPrimitive, useAuiState } from "@assistant-ui/react";
import { ArchiveIcon, MessagesSquareIcon, SlidersHorizontalIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  AgentThreadList,
  type AgentThreadProject,
  type AgentThreadStatusFilter,
} from "@/components/ai/agent-thread-list";
import type { AgentThreadGroupingMode } from "@/components/ai/agent-thread-list-groups";
import { useAiChatStore } from "@/stores/use-ai-chat-store";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";

interface AgentThreadSidebarProps {
  readonly projects?: readonly AgentThreadProject[];
}

export function AgentThreadSidebar({ projects = [] }: AgentThreadSidebarProps) {
  const { t } = useTranslation(["ai"]);
  const openDrawer = useAiChatStore((state) => state.openDrawer);
  const [statusFilter, setStatusFilter] = useState<AgentThreadStatusFilter>("active");
  const [groupingMode, setGroupingMode] = useState<AgentThreadGroupingMode>("project");
  const [filterOpen, setFilterOpen] = useState(false);
  const hasConversations = useAuiState(
    (state) => state.threads.threadIds.length + state.threads.archivedThreadIds.length > 0,
  );
  const archived = statusFilter === "archived";
  const filterLabel = t(archived ? "ai:AI_CHAT_THREAD_ARCHIVED" : "ai:AI_CHAT_THREAD_ACTIVE");

  return (
    <ThreadListPrimitive.Root
      role="navigation"
      aria-label={t("ai:AI_CHAT_THREAD_HISTORY")}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      {hasConversations ? (
        <div className="flex min-w-0 shrink-0 items-center gap-2 px-2 pb-1 pt-1">
          <h2 className="min-w-0 flex-1 truncate px-1 text-caption font-semibold text-label-primary">
            {t("ai:AI_CHAT_THREAD_HISTORY")}
          </h2>
          <DropdownMenu open={filterOpen} onOpenChange={setFilterOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={t("ai:AI_CHAT_THREAD_FILTER_LABEL")}
                className="h-8 max-w-[10rem] gap-2 px-2 text-label-primary"
              >
                <SlidersHorizontalIcon className="size-4" aria-hidden="true" />
                <span className="truncate">{filterLabel}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>{t("ai:AI_CHAT_THREAD_FILTER_STATUS")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as AgentThreadStatusFilter)}
              >
                <DropdownMenuRadioItem value="active">
                  <MessagesSquareIcon className="size-4" aria-hidden="true" />
                  <span>{t("ai:AI_CHAT_THREAD_ACTIVE")}</span>
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="archived">
                  <ArchiveIcon className="size-4" aria-hidden="true" />
                  <span>{t("ai:AI_CHAT_THREAD_ARCHIVED")}</span>
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t("ai:AI_CHAT_THREAD_GROUPING")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={groupingMode}
                onValueChange={(value) => setGroupingMode(value as AgentThreadGroupingMode)}
              >
                <DropdownMenuRadioItem value="project">
                  {t("ai:AI_CHAT_THREAD_GROUP_BY_PROJECT")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="time">
                  {t("ai:AI_CHAT_THREAD_GROUP_BY_TIME")}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}

      <AgentThreadList
        className="flex-1"
        projects={projects}
        statusFilter={statusFilter}
        groupingMode={groupingMode}
        onThreadSelect={openDrawer}
      />
    </ThreadListPrimitive.Root>
  );
}
