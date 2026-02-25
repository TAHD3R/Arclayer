import { Badge, Radio, Select } from "antd";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  getUnreadNotificationPreview,
  listNotifications,
  markNotificationRead,
  type NotificationItem,
} from "@/api/notifications";
import { listMyWorkspaces } from "@/api/workspaces";
import { NotificationCard } from "@/components/common/notification-card";
import { ContentGuard } from "@/components/common/content-guard";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@/components/ui/chrome-tabs";
import {
  FloatingPanelBody,
  FloatingPanelButton,
  FloatingPanelContent,
  FloatingPanelRoot,
  FloatingPanelTrigger,
  useFloatingPanel,
} from "@/components/ui/floating-panel";
import BellIcon from "@/components/ui/icons/bell-icon";
import SettingsIcon from "@/components/ui/icons/settings-icon";
import SupportIcon from "@/components/ui/icons/support-icon";
import { setThemePreferenceWithTransition } from "@/components/ui/theme-transition";
import { LoaderOne } from "@/components/ui/loader";
import { useNowTick } from "@/hooks/use-now-tick";
import { type AppLocale, SUPPORTED_LOCALES } from "@/lib/i18n";
import { notifyErrorText } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/stores/use-preference-store";

type NotificationPanelTab = "unread" | "all";

const PANEL_PAGE_SIZE = 20;

function resolveNotificationTarget(item: NotificationItem): string | null {
  const workspaceId = String(item.workspaceId || "").trim();
  const targetTo = String(item.targetTo || "").trim();
  if (!workspaceId || !targetTo) return null;

  if (targetTo === "/") return `/w/${workspaceId}/`;
  if (targetTo.startsWith("/w/") || targetTo.startsWith("/o/")) return targetTo;

  return `/w/${workspaceId}${targetTo.startsWith("/") ? targetTo : `/${targetTo}`}`;
}

function HeaderActionTrigger(props: { title: string; children: (hovered: boolean) => ReactNode }) {
  const [hovered, setHovered] = useState(false);

  return (
    <FloatingPanelTrigger
      title={props.title}
      className={cn(
        "relative size-9 justify-center rounded-lg border-0 bg-background text-label-secondary",
        "hover:bg-muted hover:text-foreground",
        "data-[state=open]:bg-muted data-[state=open]:text-foreground",
        "transition-colors duration-150",
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={props.title}
    >
      <span className="inline-flex items-center justify-center">{props.children(hovered)}</span>
    </FloatingPanelTrigger>
  );
}

function HeaderNotificationsPanel() {
  const { t, i18n } = useTranslation("notifications");
  const { closeFloatingPanel, isOpen } = useFloatingPanel();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const nowMs = useNowTick(60_000);
  const [tab, setTab] = useState<NotificationPanelTab>("unread");
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const workspacesQuery = useQuery({
    queryKey: ["workspaces", "me", "list", "notifications"],
    queryFn: listMyWorkspaces,
    staleTime: 60 * 1000,
    enabled: isOpen,
    meta: { silent: true },
  });

  const accessibleWorkspaceIds = useMemo(
    () => new Set((workspacesQuery.data?.items ?? []).map((item) => String(item.workspaceId))),
    [workspacesQuery.data?.items],
  );

  const listQuery = useInfiniteQuery({
    queryKey: ["notifications", "panel", tab, PANEL_PAGE_SIZE],
    queryFn: async ({ pageParam }) =>
      listNotifications({
        status: tab,
        page: typeof pageParam === "number" ? pageParam : 1,
        size: PANEL_PAGE_SIZE,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    enabled: isOpen,
    staleTime: 15 * 1000,
    meta: { silent: true },
  });

  const rawItems = useMemo(
    () => (listQuery.data?.pages ?? []).flatMap((p) => p.items ?? []),
    [listQuery.data?.pages],
  );

  const items = useMemo(() => {
    if (tab !== "all") return rawItems;
    return [...rawItems].sort((a, b) => {
      const aUnread = !a.readAt;
      const bUnread = !b.readAt;
      if (aUnread !== bUnread) return aUnread ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
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

  const openTarget = async (item: NotificationItem) => {
    const target = resolveNotificationTarget(item);
    if (!target) return;

    const isAccessibleWorkspace = accessibleWorkspaceIds.has(String(item.workspaceId));
    if (workspacesQuery.isSuccess && !isAccessibleWorkspace) {
      notifyErrorText(t("NOTIFICATIONS_TARGET_FORBIDDEN"));
      return;
    }

    await markRead(item);
    closeFloatingPanel();
    void navigate({ to: target as never });
  };

  const emptyTitle =
    tab === "unread" ? t("NOTIFICATIONS_EMPTY_UNREAD_TITLE") : t("NOTIFICATIONS_EMPTY_ALL_TITLE");
  const emptyDescription =
    tab === "unread" ? t("NOTIFICATIONS_EMPTY_UNREAD_DESC") : t("NOTIFICATIONS_EMPTY_ALL_DESC");

  const effectiveError = listQuery.isError && !listQuery.data ? listQuery.error : null;
  const loading = listQuery.isLoading && !listQuery.data;

  // Infinite scroll observer
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

  return (
    <FloatingPanelBody className="w-[24rem] max-h-[70vh] flex flex-col p-0">
      <ChromeTabs
        value={tab}
        onValueChange={(next) => setTab(next as NotificationPanelTab)}
        className="flex flex-col min-h-0 flex-1"
      >
        <div className="px-3 pt-2 shrink-0">
          <ChromeTabsList>
            <ChromeTabsTrigger value="unread">{t("NOTIFICATIONS_TAB_UNREAD")}</ChromeTabsTrigger>
            <ChromeTabsTrigger value="all">{t("NOTIFICATIONS_TAB_ALL")}</ChromeTabsTrigger>
          </ChromeTabsList>
        </div>

        <ChromeTabsContent value={tab} className="pt-2 overflow-y-auto">
          <ContentGuard
            loading={loading}
            loadingVariant="table"
            variant="compact"
            className="py-2"
            error={effectiveError}
            onRetry={effectiveError ? () => void listQuery.refetch() : undefined}
            empty={!loading && !effectiveError && items.length === 0}
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
                />
              ))}

              <div className="flex justify-center py-3">
                {listQuery.isFetchingNextPage ? <LoaderOne /> : <div className="h-6 w-6" />}
              </div>
              <div ref={sentinelRef} />
            </div>
          </ContentGuard>
        </ChromeTabsContent>
      </ChromeTabs>

      <div className="border-t border-border/60 p-2 shrink-0">
        <FloatingPanelButton
          className="rounded-md"
          onClick={() => {
            closeFloatingPanel();
            void navigate({ to: "/me/notifications" });
          }}
        >
          <div className="flex w-full items-center justify-between text-footnote">
            <span>{t("NOTIFICATIONS_OPEN_CENTER")}</span>
          </div>
        </FloatingPanelButton>
      </div>
    </FloatingPanelBody>
  );
}

function HeaderSupportPanel() {
  const { t } = useTranslation("account");

  return (
    <FloatingPanelBody className="w-82 p-4 space-y-3">
      <button
        type="button"
        disabled
        className="w-full rounded-md border border-dashed border-border px-3 py-2 text-left text-footnote text-label-secondary disabled:cursor-not-allowed"
      >
        {t("ACCOUNT_SUPPORT_CONTACT_PLACEHOLDER")}
      </button>

      <button
        type="button"
        disabled
        className="w-full rounded-md border border-dashed border-border px-3 py-2 text-left text-footnote text-label-secondary disabled:cursor-not-allowed"
      >
        {t("ACCOUNT_SUPPORT_DOCS_PLACEHOLDER")}
      </button>
    </FloatingPanelBody>
  );
}

function HeaderSettingsPanel() {
  const { t } = useTranslation("account");
  const locale = usePreferencesStore((s) => s.locale);
  const localePreferenceMode = usePreferencesStore((s) => s.localePreferenceMode);
  const themePreference = usePreferencesStore((s) => s.themePreference);
  const setLocale = usePreferencesStore((s) => s.setLocale);
  const setBrowserLocale = usePreferencesStore((s) => s.setBrowserLocale);

  const localeValue = localePreferenceMode === "browser" ? "browser" : locale;

  return (
    <FloatingPanelBody className="w-88 p-4 space-y-4">
      <div>
        <div className="mb-2 text-footnote font-semibold text-label-secondary">
          {t("ACCOUNT_SETTINGS_LANGUAGE_LABEL")}
        </div>
        <Select
          className="w-full"
          value={localeValue}
          options={[
            { value: "browser", label: t("ACCOUNT_LANGUAGE_BROWSER") },
            ...SUPPORTED_LOCALES.map((item) => ({
              value: item,
              label: item === "zh-CN" ? t("ACCOUNT_LANGUAGE_ZH") : t("ACCOUNT_LANGUAGE_EN"),
            })),
          ]}
          onChange={(next) => {
            if (next === "browser") {
              setBrowserLocale();
              return;
            }
            setLocale(next as AppLocale);
          }}
        />
      </div>

      <div>
        <div className="mb-2 text-footnote font-semibold text-label-secondary">
          {t("ACCOUNT_SETTINGS_THEME_LABEL")}
        </div>
        <Radio.Group
          value={themePreference}
          className="w-full"
          onChange={(event) => {
            void setThemePreferenceWithTransition(event.target.value, { direction: "ltr" });
          }}
        >
          <div className="flex w-full flex-col gap-2">
            <Radio value="light" className="m-0! text-footnote">
              {t("ACCOUNT_THEME_LIGHT")}
            </Radio>
            <Radio value="dark" className="m-0! text-footnote">
              {t("ACCOUNT_THEME_DARK")}
            </Radio>
            <Radio value="system" className="m-0! text-footnote">
              {t("ACCOUNT_THEME_SYSTEM")}
            </Radio>
          </div>
        </Radio.Group>
      </div>
    </FloatingPanelBody>
  );
}

function NotificationTriggerWithBadge(props: { unreadCount: number; title: string }) {
  return (
    <HeaderActionTrigger title={props.title}>
      {(hovered) => (
        <Badge dot={props.unreadCount > 0}>
          <BellIcon size={18} isHovered={hovered} className="text-current" />
        </Badge>
      )}
    </HeaderActionTrigger>
  );
}

export function AdminHeaderActions() {
  const { t } = useTranslation(["account", "notifications"]);
  const previewQuery = useQuery({
    queryKey: ["notifications", "preview"],
    queryFn: async () => getUnreadNotificationPreview({ limit: 1 }),
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
    meta: { silent: true },
  });

  return (
    <div className="flex items-center gap-2">
      <FloatingPanelRoot>
        <NotificationTriggerWithBadge
          title={t("notifications:NOTIFICATIONS_PAGE_TITLE")}
          unreadCount={previewQuery.data?.unreadCount ?? 0}
        />
        <FloatingPanelContent
          placement="bottom"
          offset={10}
          showTitle
          titleClassName="text-title2"
          descriptionClassName="text-body"
          description={t("notifications:NOTIFICATIONS_PANEL_DESC")}
          className="p-0"
        >
          <HeaderNotificationsPanel />
        </FloatingPanelContent>
      </FloatingPanelRoot>

      <FloatingPanelRoot>
        <HeaderActionTrigger title={t("account:ACCOUNT_HEADER_SUPPORT")}>
          {(hovered) => <SupportIcon size={18} isHovered={hovered} className="text-current" />}
        </HeaderActionTrigger>
        <FloatingPanelContent
          placement="bottom"
          offset={10}
          showTitle
          titleClassName="text-title2"
          descriptionClassName="text-body"
          description={t("account:ACCOUNT_SUPPORT_PANEL_DESC")}
          className="p-0"
        >
          <HeaderSupportPanel />
        </FloatingPanelContent>
      </FloatingPanelRoot>

      <FloatingPanelRoot>
        <HeaderActionTrigger title={t("account:ACCOUNT_HEADER_SETTINGS")}>
          {(hovered) => <SettingsIcon size={18} isHovered={hovered} className="text-current" />}
        </HeaderActionTrigger>
        <FloatingPanelContent
          placement="bottom"
          offset={10}
          showTitle
          titleClassName="text-title2"
          descriptionClassName="text-body"
          description={t("account:ACCOUNT_SETTINGS_PANEL_DESC")}
          className="p-0"
        >
          <HeaderSettingsPanel />
        </FloatingPanelContent>
      </FloatingPanelRoot>
    </div>
  );
}
