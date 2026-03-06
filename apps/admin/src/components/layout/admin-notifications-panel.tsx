import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Pin, PinOff, X } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "antd";

import { archiveNotification, listNotifications, markNotificationRead } from "@/api/notifications";
import type { NotificationItem } from "@/types/api";
import { listMyWorkspaces } from "@/api/workspaces";
import { NotificationCard } from "@/components/common/notification-card";
import { ContentGuard } from "@/components/common/content-guard";
import { Skeleton } from "@celestial/ui/skeleton";
import {
  ChromeTabs,
  ChromeTabsList,
  ChromeTabsTrigger,
  ChromeTabsContent,
} from "@celestial/ui/chrome-tabs";
import { LoaderOne } from "@celestial/ui/loader";
import { useNowTick } from "@celestial/hooks/use-now-tick";
import { notifyErrorText } from "@/lib/notifications";
import { resolveNotificationTarget } from "@/lib/routing/notification-target";
import { cn } from "@celestial/lib/utils";
import { Button as ButtonPrimitive } from "@celestial/ui/button-primitive";

type NotificationPanelTab = "unread" | "all" | "read" | "archived";

const PANEL_PAGE_SIZE = 20;

const PANEL_VARIANTS = {
  open: { opacity: 1, x: 0 },
  closed: { opacity: 0, x: -16 },
};

const PANEL_TRANSITION = {
  type: "spring" as const,
  stiffness: 380,
  damping: 36,
  mass: 0.8,
};

function tabToApiStatus(tab: NotificationPanelTab): "unread" | "all" | "archived" {
  if (tab === "unread") return "unread";
  if (tab === "archived") return "archived";
  return "all";
}

interface AdminNotificationsPanelProps {
  isPinned: boolean;
  onPinChange: (pinned: boolean) => void;
  onClose: () => void;
  className?: string;
  style?: CSSProperties;
}

export function AdminNotificationsPanel({
  isPinned,
  onPinChange,
  onClose,
  className,
  style,
}: AdminNotificationsPanelProps) {
  const { t, i18n } = useTranslation("notifications");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const nowMs = useNowTick(60_000);
  const [tab, setTab] = useState<NotificationPanelTab>("unread");
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // No global outside-click listener here — AdminLayout renders a transparent backdrop for closing.

  function NotificationPanelItemSkeleton() {
    return (
      <div
        className={cn("flex items-start gap-2.5 px-4 py-3", "rounded-md", "bg-transparent")}
        aria-hidden="true"
      >
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-40" />
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-56" />
            <Skeleton className="h-3 w-44" />
          </div>
        </div>

        <div className="shrink-0 flex flex-col items-end gap-2">
          <Skeleton className="h-3 w-14" />
          <div className="flex items-center gap-1">
            <Skeleton className="size-8 rounded-md" />
            <Skeleton className="size-8 rounded-md" />
          </div>
        </div>
      </div>
    );
  }

  function NotificationPanelListSkeleton(props: { count?: number }) {
    const count = props.count ?? 6;
    return (
      <div className="px-1 py-1 space-y-1">
        {Array.from({ length: count }).map((_, i) => (
          <NotificationPanelItemSkeleton key={i} />
        ))}
      </div>
    );
  }

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

  const apiStatus = tabToApiStatus(tab);

  const listQuery = useInfiniteQuery({
    queryKey: ["notifications", "panel", tab, PANEL_PAGE_SIZE],
    queryFn: async ({ pageParam }) =>
      listNotifications({
        status: apiStatus,
        page: typeof pageParam === "number" ? pageParam : 1,
        size: PANEL_PAGE_SIZE,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    staleTime: 15 * 1000,
    meta: { silent: true },
  });

  const rawItems = useMemo(
    () => (listQuery.data?.pages ?? []).flatMap((p) => p.items ?? []),
    [listQuery.data?.pages],
  );

  const items = useMemo(() => {
    if (tab === "read") return rawItems.filter((n) => n.readAt && !n.archivedAt);
    return rawItems;
  }, [rawItems, tab]);

  const invalidateNotifications = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notifications", "preview"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications", "list"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications", "panel"] }),
    ]);
  };

  const markRead = async (item: NotificationItem) => {
    if (item.readAt) return;
    queryClient.setQueryData(
      ["notifications", "preview"],
      (old: { unreadCount: number } | undefined) => {
        if (!old) return old;
        return { ...old, unreadCount: Math.max(0, old.unreadCount - 1) };
      },
    );
    queryClient.setQueryData(
      ["notifications", "panel", tab, PANEL_PAGE_SIZE],
      (old: typeof listQuery.data | undefined) => {
        if (!old) return old;
        const readAt = new Date().toISOString();
        return {
          ...old,
          pages: old.pages.map((p) => ({
            ...p,
            items:
              tab === "unread"
                ? p.items.filter((it) => it.id !== item.id)
                : p.items.map((it) => (it.id === item.id ? { ...it, readAt } : it)),
          })),
        };
      },
    );
    try {
      await markNotificationRead(item.id);
    } finally {
      await invalidateNotifications();
    }
  };

  const archiveItem = async (item: NotificationItem) => {
    queryClient.setQueryData(
      ["notifications", "panel", tab, PANEL_PAGE_SIZE],
      (old: typeof listQuery.data | undefined) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((p) => ({
            ...p,
            items: p.items.filter((it) => it.id !== item.id),
          })),
        };
      },
    );
    if (!item.readAt) {
      queryClient.setQueryData(
        ["notifications", "preview"],
        (old: { unreadCount: number } | undefined) => {
          if (!old) return old;
          return { ...old, unreadCount: Math.max(0, old.unreadCount - 1) };
        },
      );
    }
    try {
      await archiveNotification(item.id);
    } finally {
      await invalidateNotifications();
    }
  };

  const openTarget = async (item: NotificationItem) => {
    const target = resolveNotificationTarget(item);
    if (!target) return;
    const isAccessibleWorkspace = accessibleWorkspaceIds.has(String(item.workspaceId));
    if (workspacesQuery.isSuccess && !isAccessibleWorkspace) {
      notifyErrorText(t("NOTIFICATIONS_TARGET_FORBIDDEN"));
      return;
    }
    await markRead(item);
    void navigate({ to: target as never });
  };

  const effectiveError = listQuery.isError && !listQuery.data ? listQuery.error : null;
  const loading = listQuery.isLoading && !listQuery.data;

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
      { root: null, rootMargin: "400px", threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [
    listQuery.fetchNextPage,
    listQuery.hasNextPage,
    listQuery.isError,
    listQuery.isFetchingNextPage,
  ]);

  const emptyTitle =
    tab === "unread"
      ? t("NOTIFICATIONS_EMPTY_UNREAD_TITLE")
      : tab === "archived"
        ? t("NOTIFICATIONS_EMPTY_ARCHIVED_TITLE")
        : t("NOTIFICATIONS_EMPTY_ALL_TITLE");
  const emptyDescription =
    tab === "unread"
      ? t("NOTIFICATIONS_EMPTY_UNREAD_DESC")
      : tab === "archived"
        ? t("NOTIFICATIONS_EMPTY_ARCHIVED_DESC")
        : t("NOTIFICATIONS_EMPTY_ALL_DESC");

  const initialState = isPinned ? "open" : "closed";

  return (
    <motion.div
      className={cn("flex flex-col bg-background border-r border-border shadow-lg", className)}
      variants={PANEL_VARIANTS}
      transition={PANEL_TRANSITION}
      initial={initialState}
      animate="open"
      exit="closed"
      style={style}
    >
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 pt-4 pb-3">
        <div className="flex items-center gap-1">
          <span className="min-w-0 flex-1 truncate text-title3 font-semibold">
            {t("NOTIFICATIONS_PAGE_TITLE")}
          </span>
          <Button
            type="text"
            icon={
              isPinned ? (
                <PinOff className="size-4" aria-hidden="true" />
              ) : (
                <Pin className="size-4" aria-hidden="true" />
              )
            }
            aria-label={isPinned ? t("NOTIFICATIONS_PANEL_UNPIN") : t("NOTIFICATIONS_PANEL_PIN")}
            onClick={() => onPinChange(!isPinned)}
            autoInsertSpace={false}
          />
          <Button
            type="text"
            icon={<X className="size-4" aria-hidden="true" />}
            aria-label={t("NOTIFICATIONS_PANEL_CLOSE")}
            onClick={onClose}
            autoInsertSpace={false}
          />
        </div>
        <p className="mt-0.5 text-label-secondary">{t("NOTIFICATIONS_PANEL_DESC")}</p>
      </div>

      {/* Tabs */}
      <ChromeTabs
        value={tab}
        onValueChange={(v) => setTab(v as NotificationPanelTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="shrink-0 border-b border-border px-2">
          <ChromeTabsList>
            <ChromeTabsTrigger value="unread">{t("NOTIFICATIONS_TAB_UNREAD")}</ChromeTabsTrigger>
            <ChromeTabsTrigger value="all">{t("NOTIFICATIONS_TAB_ALL")}</ChromeTabsTrigger>
            <ChromeTabsTrigger value="read">{t("NOTIFICATIONS_TAB_READ")}</ChromeTabsTrigger>
            <ChromeTabsTrigger value="archived">
              {t("NOTIFICATIONS_TAB_ARCHIVED")}
            </ChromeTabsTrigger>
          </ChromeTabsList>
        </div>

        {(["unread", "all", "read", "archived"] as const).map((tabValue) => (
          <ChromeTabsContent
            key={tabValue}
            value={tabValue}
            className="mt-0 min-h-0 flex-1 overflow-y-auto pt-0"
          >
            {loading ? (
              <div className="py-2">
                <NotificationPanelListSkeleton />
              </div>
            ) : (
              <ContentGuard
                loading={false}
                variant="compact"
                className="py-2"
                error={effectiveError}
                onRetry={effectiveError ? () => void listQuery.refetch() : undefined}
                empty={!effectiveError && items.length === 0}
                emptyTitle={emptyTitle}
                emptyDescription={emptyDescription}
              >
                <div className="px-1 py-1">
                  {items.map((n) => (
                    <NotificationCard
                      key={n.id}
                      item={n}
                      nowMs={nowMs}
                      locale={i18n.language}
                      isRead={Boolean(n.readAt)}
                      compact
                      onNavigate={() => void openTarget(n)}
                      onMarkRead={n.readAt ? undefined : () => void markRead(n)}
                      onArchive={n.archivedAt ? undefined : () => void archiveItem(n)}
                    />
                  ))}
                  <div className="flex justify-center py-3">
                    {listQuery.isFetchingNextPage ? <LoaderOne /> : <div className="h-6 w-6" />}
                  </div>
                  <div ref={sentinelRef} />
                </div>
              </ContentGuard>
            )}
          </ChromeTabsContent>
        ))}
      </ChromeTabs>

      {/* Footer */}
      <div className="shrink-0 border-t border-border/60 p-2">
        <ButtonPrimitive
          type="button"
          hoverScale={1}
          tapScale={1}
          className={cn(
            "w-full rounded-md px-3 py-2 text-left",
            "text-footnote text-label-secondary",
            "hover:bg-muted hover:text-foreground",
            "transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          onClick={() => {
            onClose();
            void navigate({ to: "/me/inbox" });
          }}
        >
          {t("NOTIFICATIONS_OPEN_CENTER")}
        </ButtonPrimitive>
      </div>
    </motion.div>
  );
}
