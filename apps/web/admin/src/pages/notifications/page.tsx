import { Button } from "antd";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";

import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  deleteNotification,
  seedDemoNotifications,
} from "@/api/notifications";
import type { NotificationItem } from "@/types/api";
import { listMyWorkspaces } from "@/api/workspaces";
import { DefaultPage } from "@/components/common/default-page";
import { NotificationCard } from "@/components/common/notification-card";
import { ContentGuard } from "@/components/common/content-guard";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@/components/ui/chrome-tabs";
import { ItemGroup, ItemSeparator } from "@/components/ui/item";
import { LoaderOne } from "@/components/ui/loader";
import { useNowTick } from "@/hooks/use-now-tick";
import { notifyErrorText } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

type ListStatus = "unread" | "all";

function resolveNotificationTarget(item: NotificationItem): string | null {
  const workspaceId = String(item.workspaceId || "").trim();
  const targetTo = String(item.targetTo || "").trim();
  if (!workspaceId || !targetTo) return null;

  if (targetTo === "/") return `/w/${workspaceId}/`;
  if (targetTo.startsWith("/w/") || targetTo.startsWith("/o/")) return targetTo;

  return `/w/${workspaceId}${targetTo.startsWith("/") ? targetTo : `/${targetTo}`}`;
}

export function NotificationsPage() {
  const { t, i18n } = useTranslation("notifications");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const [status, setStatus] = useState<ListStatus>("unread");
  const pageSize = 20;
  const [isSeeding, setIsSeeding] = useState(false);
  const isDev = import.meta.env.DEV;
  const nowMs = useNowTick(60_000);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const workspacesQuery = useQuery({
    queryKey: ["workspaces", "me", "list", "notifications"],
    queryFn: listMyWorkspaces,
    staleTime: 60 * 1000,
    meta: { silent: true },
  });

  const accessibleWorkspaceIds = useMemo(
    () => new Set((workspacesQuery.data?.items ?? []).map((item) => String(item.workspaceId))),
    [workspacesQuery.data?.items],
  );

  const listQuery = useInfiniteQuery({
    queryKey: ["notifications", "list", status, pageSize],
    queryFn: async ({ pageParam }) =>
      listNotifications({
        status,
        page: typeof pageParam === "number" ? pageParam : 1,
        size: pageSize,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    staleTime: 10 * 1000,
    meta: { silent: true },
  });

  const rawItems = useMemo(
    () => (listQuery.data?.pages ?? []).flatMap((p) => p.items ?? []),
    [listQuery.data?.pages],
  );

  const items = useMemo(() => {
    if (status !== "all") return rawItems;

    // UX: show unread first so "read" items naturally settle after the last unread.
    return [...rawItems].sort((a, b) => {
      const aUnread = !a.readAt;
      const bUnread = !b.readAt;
      if (aUnread !== bUnread) return aUnread ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [rawItems, status]);

  const unreadItems = useMemo(() => items.filter((x) => !x.readAt), [items]);
  const readItems = useMemo(() => items.filter((x) => !!x.readAt), [items]);

  const loadError = useMemo(() => {
    if (listQuery.isError) return listQuery.error;
    if (!listQuery.isLoading && !listQuery.data) {
      return new Error(t("NOTIFICATIONS_LOAD_FAILED"));
    }
    return null;
  }, [listQuery.data, listQuery.error, listQuery.isError, listQuery.isLoading, t]);

  const emptyTitle =
    status === "unread"
      ? t("NOTIFICATIONS_EMPTY_UNREAD_TITLE")
      : t("NOTIFICATIONS_EMPTY_ALL_TITLE");
  const emptyDescription =
    status === "unread" ? t("NOTIFICATIONS_EMPTY_UNREAD_DESC") : t("NOTIFICATIONS_EMPTY_ALL_DESC");

  const invalidateNotificationQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notifications", "preview"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications", "list"] }),
    ]);
  };

  const markRead = async (n: NotificationItem) => {
    const readAt = new Date().toISOString();

    // Optimistic cache update: makes the "read moves below unread" feel instant in the All tab.
    queryClient.setQueryData(
      ["notifications", "list", status, pageSize],
      (old: typeof listQuery.data | undefined) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((p) => ({
            ...p,
            items:
              status === "unread"
                ? p.items.filter((it) => it.id !== n.id)
                : p.items.map((it) => (it.id === n.id ? { ...it, readAt } : it)),
          })),
        };
      },
    );

    try {
      await markNotificationRead(n.id);
    } finally {
      await invalidateNotificationQueries();
    }
  };

  const markAllRead = async () => {
    await markAllNotificationsRead();
    await invalidateNotificationQueries();
  };

  const removeItem = async (n: NotificationItem) => {
    // Optimistic cache update: remove from current list immediately.
    queryClient.setQueryData(
      ["notifications", "list", status, pageSize],
      (old: typeof listQuery.data | undefined) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((p) => ({
            ...p,
            items: p.items.filter((it) => it.id !== n.id),
          })),
        };
      },
    );

    try {
      await deleteNotification(n.id);
    } finally {
      await invalidateNotificationQueries();
    }
  };

  const seedDemo = async () => {
    if (!workspaceId) return;
    setIsSeeding(true);
    try {
      await seedDemoNotifications(String(workspaceId), { count: 12 });
      setStatus("unread");
      await invalidateNotificationQueries();
    } finally {
      setIsSeeding(false);
    }
  };

  const navigateToNotificationTarget = async (n: NotificationItem) => {
    const target = resolveNotificationTarget(n);
    if (!target) return;

    const isAccessibleWorkspace = accessibleWorkspaceIds.has(String(n.workspaceId));
    if (workspacesQuery.data && !isAccessibleWorkspace) {
      notifyErrorText(t("NOTIFICATIONS_TARGET_FORBIDDEN"));
      return;
    }

    await markRead(n);
    void navigate({ to: target as never });
  };

  const navigateToReadNotificationTarget = (n: NotificationItem) => {
    const target = resolveNotificationTarget(n);
    if (!target) return;

    const isAccessibleWorkspace = accessibleWorkspaceIds.has(String(n.workspaceId));
    if (workspacesQuery.data && !isAccessibleWorkspace) {
      notifyErrorText(t("NOTIFICATIONS_TARGET_FORBIDDEN"));
      return;
    }

    void navigate({ to: target as never });
  };

  const canMarkAllRead = status === "unread";
  const showDevSeed = isDev && Boolean(workspaceId);
  const action =
    !canMarkAllRead && !showDevSeed ? null : (
      <div className="flex items-center gap-2">
        {showDevSeed ? (
          <Button type="default" loading={isSeeding} onClick={() => void seedDemo()}>
            {t("NOTIFICATIONS_DEV_SEED")}
          </Button>
        ) : null}
        {canMarkAllRead ? (
          <Button
            type="primary"
            disabled={!unreadItems.length || listQuery.isFetching}
            loading={listQuery.isFetching && !listQuery.isRefetching}
            onClick={() => void markAllRead()}
          >
            {t("NOTIFICATIONS_MARK_ALL_AS_READ")}
          </Button>
        ) : null}
      </div>
    );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    if (listQuery.isError) return;
    if (listQuery.hasNextPage !== true) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (listQuery.isError) return;
        if (listQuery.isFetchingNextPage) return;
        listQuery.fetchNextPage().catch(() => {});
      },
      { root: null, rootMargin: "800px", threshold: 0 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [
    listQuery.fetchNextPage,
    listQuery.hasNextPage,
    listQuery.isError,
    listQuery.isFetchingNextPage,
  ]);

  return (
    <DefaultPage
      title={t("NOTIFICATIONS_PAGE_TITLE")}
      description={t("NOTIFICATIONS_PAGE_DESC")}
      action={action}
    >
      <ChromeTabs
        value={status}
        onValueChange={(next) => {
          setStatus(next as ListStatus);
        }}
      >
        <ChromeTabsList className="w-auto">
          <ChromeTabsTrigger value="unread">{t("NOTIFICATIONS_TAB_UNREAD")}</ChromeTabsTrigger>
          <ChromeTabsTrigger value="all">{t("NOTIFICATIONS_TAB_ALL")}</ChromeTabsTrigger>
        </ChromeTabsList>

        <ChromeTabsContent value={status}>
          <ContentGuard
            loading={listQuery.isLoading && !listQuery.data}
            loadingVariant="table"
            error={loadError}
            onRetry={loadError ? () => void listQuery.refetch() : undefined}
            empty={!loadError && !listQuery.isLoading && items.length === 0}
            emptyTitle={emptyTitle}
            emptyDescription={emptyDescription}
          >
            <div className="space-y-4">
              <ItemGroup className={cn("rounded-lg border border-border bg-card")}>
                {status === "all" && unreadItems.length ? (
                  <div className="px-4 py-2 text-caption font-semibold text-label-secondary">
                    {t("NOTIFICATIONS_GROUP_UNREAD")}
                  </div>
                ) : null}

                <AnimatePresence initial={false}>
                  {(status === "all" ? unreadItems : items).map((n, idx) => {
                    const isRead = Boolean(n.readAt);
                    const showSep = idx < (status === "all" ? unreadItems : items).length - 1;

                    return (
                      <motion.div
                        key={n.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8, height: 0, marginTop: 0, marginBottom: 0 }}
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      >
                        <motion.div whileTap={{ scale: 0.99 }}>
                          <NotificationCard
                            item={n}
                            nowMs={nowMs}
                            locale={i18n.language}
                            isRead={isRead}
                            onNavigate={() => void navigateToNotificationTarget(n)}
                            onMarkRead={isRead ? undefined : () => void markRead(n)}
                            onDelete={() => void removeItem(n)}
                          />
                        </motion.div>
                        {showSep ? <ItemSeparator /> : null}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

                {status === "all" && readItems.length ? (
                  <>
                    {unreadItems.length ? <ItemSeparator className="my-0" /> : null}
                    <div className="px-4 py-2 text-caption font-semibold text-label-secondary">
                      {t("NOTIFICATIONS_GROUP_READ")}
                    </div>
                    <AnimatePresence initial={false}>
                      {readItems.map((n, idx) => {
                        const showSep = idx < readItems.length - 1;

                        return (
                          <motion.div
                            key={n.id}
                            layout
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8, height: 0, marginTop: 0, marginBottom: 0 }}
                            transition={{ type: "spring", stiffness: 380, damping: 32 }}
                          >
                            <motion.div whileTap={{ scale: 0.99 }}>
                              <NotificationCard
                                item={n}
                                nowMs={nowMs}
                                locale={i18n.language}
                                isRead
                                onNavigate={() => navigateToReadNotificationTarget(n)}
                                onDelete={() => void removeItem(n)}
                              />
                            </motion.div>
                            {showSep ? <ItemSeparator /> : null}
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </>
                ) : null}
              </ItemGroup>

              <div className="flex justify-center py-4">
                {listQuery.isFetchingNextPage ? <LoaderOne /> : <div className="h-6 w-6" />}
              </div>
              <div ref={sentinelRef} />
            </div>
          </ContentGuard>
        </ChromeTabsContent>
      </ChromeTabs>
    </DefaultPage>
  );
}
