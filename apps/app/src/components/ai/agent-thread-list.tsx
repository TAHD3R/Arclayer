"use client";

import {
  ThreadListItemByIndexProvider,
  ThreadListPrimitive,
  useAuiState,
  type ThreadListItemState,
} from "@assistant-ui/react";
import { ArchiveIcon, MessageCircleIcon } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import {
  groupAgentThreadEntries,
  type AgentThreadGroup,
  type AgentThreadGroupingMode,
  type AgentThreadListEntry,
  type AgentThreadTimeGroupKey,
} from "@/components/ai/agent-thread-list-groups";
import { AgentThreadListGroup } from "@/components/ai/agent-thread-list-group";
import { AgentThreadListItem } from "@/components/ai/agent-thread-list-item";
import { useNowTick } from "@arclayer/hooks/use-now-tick";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@arclayer/ui/empty";
import { Skeleton } from "@arclayer/ui/skeleton";
import { Spinner } from "@arclayer/ui/spinner";

export type AgentThreadStatusFilter = "active" | "archived" | "all";

export type AgentThreadProject = Readonly<{
  projectId: string;
  name: string;
}>;

interface AgentThreadListProps {
  readonly className?: string;
  readonly projects?: readonly AgentThreadProject[];
  readonly statusFilter?: AgentThreadStatusFilter;
  readonly groupingMode?: AgentThreadGroupingMode;
  readonly onThreadSelect?: () => void;
}

type ThreadState = Pick<ThreadListItemState, "id" | "title" | "lastMessageAt" | "custom">;

function readCustomString(custom: Record<string, unknown> | undefined, key: string): string | null {
  const value = custom?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function readThreadTimestamp(item: ThreadState, archived: boolean): Date | null {
  const archivedAt = archived ? readCustomString(item.custom, "archivedAt") : null;
  const updatedAt = readCustomString(item.custom, "updatedAt");
  const candidate = archivedAt ?? updatedAt;
  if (candidate) {
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return item.lastMessageAt && !Number.isNaN(item.lastMessageAt.getTime())
    ? item.lastMessageAt
    : null;
}

function buildEntries(
  threadIds: readonly string[],
  archivedThreadIds: readonly string[],
  threadItems: readonly ThreadState[],
  statusFilter: AgentThreadStatusFilter,
): readonly AgentThreadListEntry[] {
  const itemsById = new Map(threadItems.map((item) => [item.id, item]));
  const descriptors = [
    ...(statusFilter === "archived"
      ? []
      : threadIds.map((id, index) => ({ id, index, archived: false }))),
    ...(statusFilter === "active"
      ? []
      : archivedThreadIds.map((id, index) => ({ id, index, archived: true }))),
  ];

  return descriptors.flatMap((descriptor) => {
    const item = itemsById.get(descriptor.id);
    if (!item) return [];
    const timestamp = readThreadTimestamp(item, descriptor.archived);
    if (!timestamp) return [];
    return [
      {
        ...descriptor,
        pinned: item.custom?.pinned === true,
        projectId: readCustomString(item.custom, "projectId"),
        timestamp,
      },
    ];
  });
}

function formatThreadTimestamp(date: Date, nowMs: number, locale: string): string {
  const sameDay = new Date(nowMs).toDateString() === date.toDateString();
  return new Intl.DateTimeFormat(
    locale,
    sameDay ? { timeStyle: "short" } : { dateStyle: "medium" },
  ).format(date);
}

function ThreadListSkeleton({ label }: { readonly label: string }) {
  return (
    <div role="status" className="space-y-5 px-2 py-3" aria-label={label}>
      <span className="sr-only">{label}</span>
      {[0, 1].map((group) => (
        <div key={group} className="space-y-2">
          <Skeleton className="h-4 w-28" />
          {[0, 1, 2].map((item) => (
            <div key={item} className="flex min-h-11 items-center gap-2 rounded-md px-2 py-2">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="size-8 rounded-md" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function timeGroupLabel(key: AgentThreadTimeGroupKey): string {
  const keys = {
    today: "ai:AI_CHAT_THREAD_TIME_TODAY",
    yesterday: "ai:AI_CHAT_THREAD_TIME_YESTERDAY",
    "previous-7-days": "ai:AI_CHAT_THREAD_TIME_PREVIOUS_7_DAYS",
    "previous-30-days": "ai:AI_CHAT_THREAD_TIME_PREVIOUS_30_DAYS",
    older: "ai:AI_CHAT_THREAD_TIME_OLDER",
  } as const;
  return keys[key];
}

function visibleThreadCount(
  activeCount: number,
  archivedCount: number,
  statusFilter: AgentThreadStatusFilter,
): number {
  if (statusFilter === "active") return activeCount;
  if (statusFilter === "archived") return archivedCount;
  return activeCount + archivedCount;
}

function projectLabel(
  projectId: string | null,
  projectNames: ReadonlyMap<string, string>,
  t: (key: string) => string,
): string {
  if (projectId === null) return t("ai:AI_CHAT_THREAD_PROJECT_WORKSPACE");
  return projectNames.get(projectId) ?? t("ai:AI_CHAT_THREAD_PROJECT_UNAVAILABLE");
}

function groupLabel(
  group: AgentThreadGroup,
  projectNames: ReadonlyMap<string, string>,
  t: (key: string) => string,
): string {
  if (group.kind === "pinned") return t("ai:AI_CHAT_THREAD_PINNED");
  if (group.kind === "time" && group.timeKey) return t(timeGroupLabel(group.timeKey));
  return projectLabel(group.projectId, projectNames, t);
}

export function AgentThreadList({
  className,
  projects,
  statusFilter = "all",
  groupingMode = "time",
  onThreadSelect,
}: AgentThreadListProps) {
  const { t, i18n } = useTranslation(["ai"]);
  const nowMs = useNowTick(60_000);
  const threads = useAuiState((state) => state.threads);
  const projectNames = useMemo(
    () => new Map((projects ?? []).map((project) => [project.projectId, project.name])),
    [projects],
  );
  const entries = useMemo(
    () =>
      buildEntries(threads.threadIds, threads.archivedThreadIds, threads.threadItems, statusFilter),
    [statusFilter, threads.archivedThreadIds, threads.threadIds, threads.threadItems],
  );
  const groups = useMemo(
    () => groupAgentThreadEntries(entries, new Date(nowMs), groupingMode),
    [entries, groupingMode, nowMs],
  );

  if (threads.isLoading) {
    return <ThreadListSkeleton label={t("ai:AI_CHAT_THREAD_LOADING")} />;
  }

  const threadCount = visibleThreadCount(
    threads.threadIds.length,
    threads.archivedThreadIds.length,
    statusFilter,
  );
  if (threadCount > 0 && entries.length === 0) {
    return <ThreadListSkeleton label={t("ai:AI_CHAT_THREAD_LOADING")} />;
  }

  if (entries.length === 0) {
    const archived = statusFilter === "archived";
    return (
      <Empty className={cn("min-h-full gap-0 px-4 py-8", className)}>
        <EmptyHeader className="max-w-[14rem] gap-0">
          <EmptyMedia variant="icon" className="mb-4 text-label-secondary">
            {archived ? (
              <ArchiveIcon className="size-5" aria-hidden="true" />
            ) : (
              <MessageCircleIcon className="size-5" aria-hidden="true" />
            )}
          </EmptyMedia>
          <h3>
            <EmptyTitle className="text-callout font-semibold text-label-primary">
              {t(archived ? "ai:AI_CHAT_THREAD_ARCHIVED_EMPTY" : "ai:AI_CHAT_THREAD_ACTIVE_EMPTY")}
            </EmptyTitle>
          </h3>
          <EmptyDescription className="mt-2 text-caption">
            {t(
              archived
                ? "ai:AI_CHAT_THREAD_ARCHIVED_EMPTY_DESCRIPTION"
                : "ai:AI_CHAT_THREAD_ACTIVE_EMPTY_DESCRIPTION",
            )}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className={cn("min-h-0 overflow-y-auto px-1 pb-2 scrollbar-none", className)}>
      {groups.map((group) => (
        <AgentThreadListGroup key={group.key} label={groupLabel(group, projectNames, t)}>
          {group.entries.map((entry) => {
            const timeText = formatThreadTimestamp(
              entry.timestamp,
              nowMs,
              i18n.resolvedLanguage ?? i18n.language,
            );
            const metaText =
              groupingMode === "time" && projects !== undefined
                ? `${projectLabel(entry.projectId, projectNames, t)} · ${timeText}`
                : timeText;
            return (
              <ThreadListItemByIndexProvider
                key={entry.id}
                index={entry.index}
                archived={entry.archived}
              >
                <AgentThreadListItem
                  archived={entry.archived}
                  pinned={entry.pinned}
                  timeText={metaText}
                  onThreadSelect={onThreadSelect}
                />
              </ThreadListItemByIndexProvider>
            );
          })}
        </AgentThreadListGroup>
      ))}

      {threads.hasMore ? (
        <div className="px-2 py-2">
          <ThreadListPrimitive.LoadMore asChild>
            <Button type="button" variant="ghost" size="sm" className="w-full">
              {threads.isLoadingMore ? <Spinner className="size-4" aria-hidden="true" /> : null}
              {t(
                threads.isLoadingMore
                  ? "ai:AI_CHAT_THREAD_LOADING_MORE"
                  : "ai:AI_CHAT_THREAD_LOAD_MORE",
              )}
            </Button>
          </ThreadListPrimitive.LoadMore>
        </div>
      ) : null}
    </div>
  );
}
