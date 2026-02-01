import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "antd";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ShieldCheck, Trash2, Users, Wrench } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  deleteNotification,
  seedDemoNotifications,
  type NotificationCategory,
  type NotificationItem,
} from "@/api/notifications";
import { DefaultPage } from "@/components/app/defaultPage";
import { PageState } from "@/components/app/pageState";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@/components/ui/chrome-tabs";
import { Button as UiButton } from "@/components/ui/button";
import { LoaderOne } from "@/components/ui/loader";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { useNowTick } from "@/hooks/useNowTick";
import { formatRelativeTimeAt } from "@/lib/time/relativeTime";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

export const Route = createFileRoute("/notifications")({
  component: NotificationsPage,
});

type ListStatus = "unread" | "all";

function pickCategoryIcon(category: NotificationCategory) {
  const normalized = String(category || "").toLowerCase();
  if (normalized === "team") return Users;
  if (normalized === "security") return ShieldCheck;
  return Wrench;
}

export function NotificationsPage() {
  const { t, i18n } = useTranslation("notifications");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const workspaceBase = workspaceId ? `/w/${workspaceId}` : "";

  const [status, setStatus] = useState<ListStatus>("unread");
  const pageSize = 20;
  const [isSeeding, setIsSeeding] = useState(false);
  const isDev = import.meta.env.DEV;
  const nowMs = useNowTick(60_000);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const listQuery = useInfiniteQuery({
    queryKey: ["notifications", "list", workspaceId, status, pageSize],
    enabled: Boolean(workspaceId),
    queryFn: async ({ pageParam }) =>
      listNotifications(String(workspaceId), {
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

  const markRead = async (n: NotificationItem) => {
    if (!workspaceId) return;
    const readAt = new Date().toISOString();

    // Optimistic cache update: makes the "read moves below unread" feel instant in the All tab.
    queryClient.setQueryData(
      ["notifications", "list", workspaceId, status, pageSize],
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
      await markNotificationRead(String(workspaceId), n.id);
    } finally {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["notifications", "preview", workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ["notifications", "list", workspaceId] }),
      ]);
    }
  };

  const markAllRead = async () => {
    if (!workspaceId) return;
    await markAllNotificationsRead(String(workspaceId));
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notifications", "preview", workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ["notifications", "list", workspaceId] }),
    ]);
  };

  const removeItem = async (n: NotificationItem) => {
    if (!workspaceId) return;
    // Optimistic cache update: remove from current list immediately.
    queryClient.setQueryData(
      ["notifications", "list", workspaceId, status, pageSize],
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
      await deleteNotification(String(workspaceId), n.id);
    } finally {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["notifications", "preview", workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ["notifications", "list", workspaceId] }),
      ]);
    }
  };

  const seedDemo = async () => {
    if (!workspaceId) return;
    setIsSeeding(true);
    try {
      await seedDemoNotifications(String(workspaceId), { count: 12 });
      setStatus("unread");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["notifications", "preview", workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ["notifications", "list", workspaceId] }),
      ]);
    } finally {
      setIsSeeding(false);
    }
  };

  const canMarkAllRead = status === "unread";
  const showDevSeed = isDev;
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
          <PageState
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
                  <div className="px-4 py-2 text-xs font-semibold text-muted-foreground">
                    {t("NOTIFICATIONS_GROUP_UNREAD")}
                  </div>
                ) : null}

                <AnimatePresence initial={false}>
                  {(status === "all" ? unreadItems : items).map((n, idx) => {
                    const Icon = pickCategoryIcon(n.category);
                    const timeText = formatRelativeTimeAt(n.createdAt, i18n.language, nowMs);
                    const isRead = Boolean(n.readAt);
                    const showSeparator = idx < (status === "all" ? unreadItems : items).length - 1;

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
                          <Item
                            size="sm"
                            variant={isRead ? "muted" : "default"}
                            className={cn(
                              "rounded-md border-0 transition-[background-color,box-shadow,opacity] duration-150",
                              "hover:bg-accent/40 hover:shadow-sm active:bg-accent/60",
                            )}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key !== "Enter") return;
                              void markRead(n);
                              void navigate({ to: `${workspaceBase}${n.targetTo}` as never });
                            }}
                            onClick={() => {
                              void markRead(n);
                              void navigate({ to: `${workspaceBase}${n.targetTo}` as never });
                            }}
                          >
                            <ItemMedia variant="icon" className="size-12 rounded-md">
                              <Icon
                                className={cn(
                                  "size-4",
                                  isRead ? "text-muted-foreground/60" : "text-muted-foreground",
                                )}
                                aria-hidden="true"
                              />
                            </ItemMedia>

                            <ItemContent>
                              <ItemHeader>
                                <ItemTitle className="min-w-0 flex-1">
                                  <span
                                    className={cn(
                                      "min-w-0 text-base truncate",
                                      isRead ? "line-through text-muted-foreground" : undefined,
                                    )}
                                  >
                                    {n.title}
                                  </span>
                                </ItemTitle>
                              </ItemHeader>
                              {n.body ? (
                                <ItemDescription
                                  className={cn(
                                    "text-base",
                                    isRead ? "text-muted-foreground/80" : undefined,
                                  )}
                                >
                                  {n.body}
                                </ItemDescription>
                              ) : null}
                            </ItemContent>

                            <div className="ml-auto flex flex-col items-end gap-2">
                              {timeText ? (
                                <span className="shrink-0 text-md text-muted-foreground">
                                  {timeText}
                                </span>
                              ) : null}
                              <div className="flex items-center gap-1">
                                {!isRead ? (
                                  <UiButton
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label={t("NOTIFICATIONS_MARK_AS_READ")}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      void markRead(n);
                                    }}
                                  >
                                    <Check className="size-4" aria-hidden="true" />
                                  </UiButton>
                                ) : null}
                                <UiButton
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  aria-label={t("NOTIFICATIONS_DELETE")}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    void removeItem(n);
                                  }}
                                >
                                  <Trash2 className="size-4" aria-hidden="true" />
                                </UiButton>
                              </div>
                            </div>
                          </Item>
                        </motion.div>

                        {showSeparator ? <ItemSeparator /> : null}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

                {status === "all" && readItems.length ? (
                  <>
                    {unreadItems.length ? <ItemSeparator className="my-0" /> : null}
                    <div className="px-4 py-2 text-xs font-semibold text-muted-foreground">
                      {t("NOTIFICATIONS_GROUP_READ")}
                    </div>
                    <AnimatePresence initial={false}>
                      {readItems.map((n, idx) => {
                        const Icon = pickCategoryIcon(n.category);
                        const timeText = formatRelativeTimeAt(n.createdAt, i18n.language, nowMs);
                        const showSeparator = idx < readItems.length - 1;

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
                              <Item
                                size="sm"
                                variant="muted"
                                className={cn(
                                  "rounded-md border-0 transition-[background-color,box-shadow,opacity] duration-150",
                                  "hover:bg-accent/40 hover:shadow-sm active:bg-accent/60",
                                )}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key !== "Enter") return;
                                  void navigate({ to: `${workspaceBase}${n.targetTo}` as never });
                                }}
                                onClick={() => {
                                  void navigate({ to: `${workspaceBase}${n.targetTo}` as never });
                                }}
                              >
                                <ItemMedia variant="icon" className="size-12 rounded-md">
                                  <Icon
                                    className="size-4 text-muted-foreground/60"
                                    aria-hidden="true"
                                  />
                                </ItemMedia>

                                <ItemContent>
                                  <ItemHeader>
                                    <ItemTitle className="min-w-0 flex-1">
                                      <span className="min-w-0 text-base truncate line-through text-muted-foreground">
                                        {n.title}
                                      </span>
                                    </ItemTitle>
                                  </ItemHeader>
                                  {n.body ? (
                                    <ItemDescription className="text-base text-muted-foreground/80">
                                      {n.body}
                                    </ItemDescription>
                                  ) : null}
                                </ItemContent>

                                <div className="ml-auto flex flex-col items-end gap-2">
                                  {timeText ? (
                                    <span className="shrink-0 text-md text-muted-foreground">
                                      {timeText}
                                    </span>
                                  ) : null}
                                  <div className="flex items-center gap-1">
                                    <UiButton
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      aria-label={t("NOTIFICATIONS_DELETE")}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        void removeItem(n);
                                      }}
                                    >
                                      <Trash2 className="size-4" aria-hidden="true" />
                                    </UiButton>
                                  </div>
                                </div>
                              </Item>
                            </motion.div>

                            {showSeparator ? <ItemSeparator /> : null}
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
          </PageState>
        </ChromeTabsContent>
      </ChromeTabs>
    </DefaultPage>
  );
}
