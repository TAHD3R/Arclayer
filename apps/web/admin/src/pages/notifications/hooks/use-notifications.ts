import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  deleteNotification,
  seedDemoNotifications,
} from "@/api/notifications";
import type { NotificationItem } from "@/types/api";
import { listMyWorkspaces } from "@/api/workspaces";
import { useNowTick } from "@/hooks/use-now-tick";
import { notifyErrorText } from "@/lib/notifications";
import { resolveNotificationTarget } from "@/lib/routing/notification-target";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

import type { ListStatus } from "../types";

const PAGE_SIZE = 20;

export function useNotifications() {
  const { t, i18n } = useTranslation("notifications");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const [status, setStatus] = useState<ListStatus>("unread");
  const [isSeeding, setIsSeeding] = useState(false);
  const isDev = import.meta.env.DEV;
  const nowMs = useNowTick(60_000);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // --- Queries ---

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
    queryKey: ["notifications", "list", status, PAGE_SIZE],
    queryFn: async ({ pageParam }) =>
      listNotifications({
        status,
        page: typeof pageParam === "number" ? pageParam : 1,
        size: PAGE_SIZE,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    staleTime: 10 * 1000,
    meta: { silent: true },
  });

  // --- Derived data ---

  const rawItems = useMemo(
    () => (listQuery.data?.pages ?? []).flatMap((p) => p.items ?? []),
    [listQuery.data?.pages],
  );

  const items = useMemo(() => {
    if (status !== "all") return rawItems;
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

  // --- Handlers ---

  const invalidateNotificationQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notifications", "preview"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications", "list"] }),
    ]);
  };

  const markRead = async (n: NotificationItem) => {
    const readAt = new Date().toISOString();
    queryClient.setQueryData(
      ["notifications", "list", status, PAGE_SIZE],
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
    queryClient.setQueryData(
      ["notifications", "list", status, PAGE_SIZE],
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

  const navigateToTarget = async (n: NotificationItem) => {
    const target = resolveNotificationTarget(n);
    if (!target) return;
    const isAccessible = accessibleWorkspaceIds.has(String(n.workspaceId));
    if (workspacesQuery.data && !isAccessible) {
      notifyErrorText(t("NOTIFICATIONS_TARGET_FORBIDDEN"));
      return;
    }
    await markRead(n);
    void navigate({ to: target as never });
  };

  const navigateToReadTarget = (n: NotificationItem) => {
    const target = resolveNotificationTarget(n);
    if (!target) return;
    const isAccessible = accessibleWorkspaceIds.has(String(n.workspaceId));
    if (workspacesQuery.data && !isAccessible) {
      notifyErrorText(t("NOTIFICATIONS_TARGET_FORBIDDEN"));
      return;
    }
    void navigate({ to: target as never });
  };

  // --- Infinite scroll observer ---

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

  return {
    t,
    locale: i18n.language,
    status,
    setStatus,
    nowMs,
    sentinelRef,
    listQuery,
    items,
    unreadItems,
    readItems,
    loadError,
    isSeeding,
    isDev,
    workspaceId,
    markRead,
    markAllRead,
    removeItem,
    seedDemo,
    navigateToTarget,
    navigateToReadTarget,
  };
}
