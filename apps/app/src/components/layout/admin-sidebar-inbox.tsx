import { useEffect, useMemo, useRef, useState } from "react";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Archive, BellRing, CircleDot, Rows3, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";

import { listNotifications } from "@/api/notifications";
import { NotificationCard } from "@/components/common/notification-card";
import { useSettingsScreen } from "@/components/layout/settings-screen-provider";
import { useNotificationActions } from "@/hooks/use-notification-actions";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { buildNotificationsSourceSearch } from "@/lib/routing/notifications-source";
import type { NotificationOut as NotificationItem } from "@arclayer/openapi";
import { useNowTick } from "@arclayer/hooks/use-now-tick";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@arclayer/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@arclayer/ui/select";
import { Skeleton } from "@arclayer/ui/skeleton";
import { Spinner } from "@arclayer/ui/spinner";

type SidebarInboxFilterMode = "mixed" | "unread-only" | "archived-only" | "all-updates";

const PAGE_SIZE = 20;
function SidebarInboxItemSkeleton() {
  return (
    <div
      className={cn(
        "flex w-full min-w-0 items-start gap-2.5 rounded-md px-3 py-3",
        "bg-transparent",
      )}
      aria-hidden="true"
    >
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-36" />
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-52" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <Skeleton className="h-3 w-14" />
        <div className="flex items-center gap-1">
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="size-8 rounded-md" />
        </div>
      </div>
    </div>
  );
}

function SidebarInboxListSkeleton(props: { count?: number }) {
  const count = props.count ?? 5;
  return (
    <div className="space-y-1 px-1 py-1">
      {Array.from({ length: count }).map((_, index) => (
        <SidebarInboxItemSkeleton key={index} />
      ))}
    </div>
  );
}

function filterModeToPrimaryStatus(
  filterMode: SidebarInboxFilterMode,
): "unread" | "all" | "archived" {
  if (filterMode === "unread-only") return "unread";
  if (filterMode === "archived-only") return "archived";
  return "all";
}

function dedupeNotifications(items: readonly NotificationItem[]): NotificationItem[] {
  const next = new Map<string, NotificationItem>();
  for (const item of items) {
    next.set(item.id, item);
  }
  return Array.from(next.values());
}

function sortNotifications(items: readonly NotificationItem[]): NotificationItem[] {
  return [...items].sort((left, right) => {
    const leftUnread = !left.readAt && !left.archivedAt;
    const rightUnread = !right.readAt && !right.archivedAt;
    if (leftUnread !== rightUnread) return leftUnread ? -1 : 1;
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

export function AdminSidebarInbox() {
  const { t } = useTranslation("notifications");
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const settingsScreen = useSettingsScreen();
  const nowMs = useNowTick(60_000);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [filterMode, setFilterMode] = useState<SidebarInboxFilterMode>("unread-only");
  const [filterOpen, setFilterOpen] = useState(false);
  const { archiveItem, deleteItem, markRead, openTarget } = useNotificationActions();

  const primaryStatus = filterModeToPrimaryStatus(filterMode);
  const includeArchivedUpdates = filterMode === "all-updates";

  const inboxSourceSearch = useMemo(
    () =>
      buildNotificationsSourceSearch(pathname, {
        settingsScreen: settingsScreen.state.open ? settingsScreen.state.screen : undefined,
      }),
    [pathname, settingsScreen.state.open, settingsScreen.state.screen],
  );

  const primaryListQuery = useInfiniteQuery({
    queryKey: ["notifications", "sidebar-inbox", primaryStatus, PAGE_SIZE],
    queryFn: async ({ pageParam }) =>
      listNotifications({
        status: primaryStatus,
        page: typeof pageParam === "number" ? pageParam : 1,
        size: PAGE_SIZE,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    staleTime: 15 * 1000,
    meta: { silent: true },
  });

  const archivedListQuery = useInfiniteQuery({
    queryKey: ["notifications", "sidebar-inbox", "all-updates", "archived", PAGE_SIZE],
    enabled: includeArchivedUpdates,
    queryFn: async ({ pageParam }) =>
      listNotifications({
        status: "archived",
        page: typeof pageParam === "number" ? pageParam : 1,
        size: PAGE_SIZE,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    staleTime: 15 * 1000,
    meta: { silent: true },
  });

  const primaryItems = useMemo(
    () => (primaryListQuery.data?.pages ?? []).flatMap((page) => page.items ?? []),
    [primaryListQuery.data?.pages],
  );
  const archivedItems = useMemo(
    () => (archivedListQuery.data?.pages ?? []).flatMap((page) => page.items ?? []),
    [archivedListQuery.data?.pages],
  );

  const items = useMemo(() => {
    if (filterMode === "mixed") return sortNotifications(primaryItems);
    if (filterMode === "unread-only") return sortNotifications(primaryItems);
    if (filterMode === "archived-only") return sortNotifications(primaryItems);
    return sortNotifications(dedupeNotifications([...primaryItems, ...archivedItems]));
  }, [archivedItems, filterMode, primaryItems]);

  const isInitialLoading =
    (primaryListQuery.isLoading && !primaryListQuery.data) ||
    (includeArchivedUpdates && archivedListQuery.isLoading && !archivedListQuery.data);
  const effectiveError =
    (primaryListQuery.isError && !primaryListQuery.data ? primaryListQuery.error : null) ||
    (includeArchivedUpdates && archivedListQuery.isError && !archivedListQuery.data
      ? archivedListQuery.error
      : null);
  const isFetchingNextPage =
    primaryListQuery.isFetchingNextPage || archivedListQuery.isFetchingNextPage;

  const emptyTitle =
    filterMode === "unread-only"
      ? t("NOTIFICATIONS_EMPTY_UNREAD_TITLE")
      : filterMode === "archived-only"
        ? t("NOTIFICATIONS_EMPTY_ARCHIVED_TITLE")
        : t("NOTIFICATIONS_EMPTY_ALL_TITLE");
  const emptyDescription =
    filterMode === "unread-only"
      ? t("NOTIFICATIONS_EMPTY_UNREAD_DESC")
      : filterMode === "archived-only"
        ? t("NOTIFICATIONS_EMPTY_ARCHIVED_DESC")
        : t("NOTIFICATIONS_EMPTY_ALL_DESC");

  const filterOptions = useMemo(
    () => [
      {
        value: "unread-only" as const,
        label: t("NOTIFICATIONS_FILTER_UNREAD_ONLY"),
        icon: CircleDot,
      },
      {
        value: "mixed" as const,
        label: t("NOTIFICATIONS_FILTER_MIXED"),
        icon: Rows3,
      },
      {
        value: "archived-only" as const,
        label: t("NOTIFICATIONS_FILTER_ARCHIVED_ONLY"),
        icon: Archive,
      },
      {
        value: "all-updates" as const,
        label: t("NOTIFICATIONS_FILTER_ALL_UPDATES"),
        icon: BellRing,
      },
    ],
    [t],
  );

  const selectedFilterOption =
    filterOptions.find((option) => option.value === filterMode) ?? filterOptions[0];
  const showEmptyState = !isInitialLoading && !effectiveError && items.length === 0;

  useEffect(() => {
    const element = sentinelRef.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (primaryListQuery.isFetchingNextPage || archivedListQuery.isFetchingNextPage) return;

        if (primaryListQuery.hasNextPage) {
          primaryListQuery.fetchNextPage().catch(() => {});
          return;
        }

        if (includeArchivedUpdates && archivedListQuery.hasNextPage) {
          archivedListQuery.fetchNextPage().catch(() => {});
        }
      },
      { root: null, rootMargin: "400px", threshold: 0 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [archivedListQuery, includeArchivedUpdates, primaryListQuery]);

  const handleMarkRead = async (item: NotificationItem) => {
    await markRead(item);
  };

  const handleArchive = async (item: NotificationItem) => {
    await archiveItem(item);
  };

  const handleOpenTarget = async (item: NotificationItem) => {
    await openTarget(item);
  };

  const filterContent = (
    <SelectContent align="end" position="popper">
      {filterOptions.map((option) => {
        const Icon = option.icon;

        return (
          <SelectItem key={option.value} value={option.value}>
            <Icon className="size-4" aria-hidden="true" />
            <span>{option.label}</span>
          </SelectItem>
        );
      })}
    </SelectContent>
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <Select
        open={filterOpen}
        onOpenChange={setFilterOpen}
        value={filterMode}
        onValueChange={(value) => setFilterMode(value as SidebarInboxFilterMode)}
      >
        {!showEmptyState ? (
          <div className="flex w-full min-w-0 shrink-0 items-center justify-end px-2 pb-1">
            <SelectTrigger asChild aria-label={selectedFilterOption.label}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 max-w-full gap-2 px-2 text-label-primary"
              >
                <SlidersHorizontal className="size-4" aria-hidden="true" />
                <span className="truncate">{selectedFilterOption.label}</span>
              </Button>
            </SelectTrigger>
            {filterContent}
          </div>
        ) : null}

        <div className="min-h-0 w-full min-w-0 flex-1 overflow-auto scrollbar-none">
          {isInitialLoading ? (
            <SidebarInboxListSkeleton />
          ) : showEmptyState ? (
            <Empty className="min-h-full gap-0 px-4 py-6">
              <EmptyHeader className="max-w-[14rem] gap-0">
                <EmptyMedia variant="icon" className="mb-4 text-label-secondary">
                  <BellRing className="size-5" aria-hidden="true" />
                </EmptyMedia>
                <h3>
                  <EmptyTitle className="text-callout font-semibold text-label-primary">
                    {emptyTitle}
                  </EmptyTitle>
                </h3>
                <EmptyDescription className="mt-2 text-footnote">
                  {emptyDescription}
                </EmptyDescription>
                <SelectTrigger asChild aria-label={t("NOTIFICATIONS_EDIT_FILTER")}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-4 h-9 gap-2 px-3 text-label-primary"
                  >
                    <span>{t("NOTIFICATIONS_EDIT_FILTER")}</span>
                  </Button>
                </SelectTrigger>
              </EmptyHeader>
            </Empty>
          ) : (
            <ContentGuard
              loading={false}
              variant="compact"
              className="w-full min-w-0 px-1 py-1"
              error={effectiveError}
              onRetry={effectiveError ? () => void primaryListQuery.refetch() : undefined}
              empty={false}
            >
              <div className="w-full min-w-0 px-1 py-1">
                {items.map((item) => (
                  <NotificationCard
                    key={item.id}
                    item={item}
                    nowMs={nowMs}
                    isRead={Boolean(item.readAt)}
                    compact
                    layoutMode="sidebar-inbox"
                    onNavigate={() => void handleOpenTarget(item)}
                    onMarkRead={item.readAt ? undefined : () => void handleMarkRead(item)}
                    onArchive={item.archivedAt ? undefined : () => void handleArchive(item)}
                    onDelete={() => void deleteItem(item)}
                  />
                ))}

                <div className="flex justify-center py-3">
                  <div className="flex h-6 w-6 items-center justify-center">
                    {isFetchingNextPage ? (
                      <Spinner className="size-4 text-label-secondary" />
                    ) : null}
                  </div>
                </div>
                <div ref={sentinelRef} />
              </div>
            </ContentGuard>
          )}
        </div>

        {showEmptyState ? null : (
          <div className="flex w-full min-w-0 shrink-0 items-center border-t border-border/60 px-2 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 w-full justify-start gap-2 px-3"
              onClick={() => {
                void navigate({ to: "/notifications", search: inboxSourceSearch });
              }}
            >
              <BellRing className="size-4" aria-hidden="true" />
              <span>{t("NOTIFICATIONS_OPEN_CENTER_CTA")}</span>
            </Button>
          </div>
        )}
        {showEmptyState ? filterContent : null}
      </Select>
    </div>
  );
}
