import { Badge, Radio, Select } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  getUnreadNotificationPreview,
  listNotifications,
  markNotificationRead,
  type NotificationItem,
  type PageData,
} from "@/api/notifications";
import { listMyWorkspaces } from "@/api/workspaces";
import { PageState } from "@/components/common/page-state";
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
import { useNowTick } from "@/hooks/use-now-tick";
import { type AppLocale, SUPPORTED_LOCALES } from "@/lib/i18n";
import { notifyErrorText } from "@/lib/notifications";
import { formatRelativeTimeAt } from "@/lib/time/relative-time";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/stores/use-preference-store";

type NotificationPanelTab = "unread" | "all";

const HEADER_NOTIFICATION_LIMIT = 10;

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

  const unreadQuery = useQuery({
    queryKey: ["notifications", "panel", "unread"],
    queryFn: async () =>
      listNotifications({
        status: "unread",
        page: 1,
        size: HEADER_NOTIFICATION_LIMIT,
      }),
    enabled: isOpen,
    staleTime: 15 * 1000,
    meta: { silent: true },
  });

  const allQuery = useQuery({
    queryKey: ["notifications", "panel", "all"],
    queryFn: async () =>
      listNotifications({
        status: "all",
        page: 1,
        size: HEADER_NOTIFICATION_LIMIT,
      }),
    enabled: isOpen,
    staleTime: 15 * 1000,
    meta: { silent: true },
  });

  const invalidateNotifications = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notifications", "preview"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications", "list"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications", "panel", "unread"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications", "panel", "all"] }),
    ]);
  };

  const patchUnreadQuery = (
    old: PageData<NotificationItem> | undefined,
    notificationId: string,
  ): PageData<NotificationItem> | undefined => {
    if (!old) return old;
    return {
      ...old,
      total: Math.max(0, old.total - 1),
      items: old.items.filter((item) => item.id !== notificationId),
    };
  };

  const patchAllQuery = (
    old: PageData<NotificationItem> | undefined,
    notificationId: string,
  ): PageData<NotificationItem> | undefined => {
    if (!old) return old;
    const readAt = new Date().toISOString();
    return {
      ...old,
      items: old.items.map((item) => (item.id === notificationId ? { ...item, readAt } : item)),
    };
  };

  const markRead = async (item: NotificationItem) => {
    if (item.readAt) return;

    queryClient.setQueryData(
      ["notifications", "preview"],
      (old: { unreadCount: number } | undefined) => {
        if (!old) return old;
        return {
          ...old,
          unreadCount: Math.max(0, old.unreadCount - 1),
        };
      },
    );

    queryClient.setQueryData(
      ["notifications", "panel", "unread"],
      (old: PageData<NotificationItem> | undefined) => patchUnreadQuery(old, item.id),
    );

    queryClient.setQueryData(
      ["notifications", "panel", "all"],
      (old: PageData<NotificationItem> | undefined) => patchAllQuery(old, item.id),
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

  const renderList = (status: NotificationPanelTab) => {
    const query = status === "unread" ? unreadQuery : allQuery;
    const items = query.data?.items ?? [];
    const hasMore = (query.data?.total ?? 0) > items.length;

    const emptyTitle =
      status === "unread"
        ? t("NOTIFICATIONS_EMPTY_UNREAD_TITLE")
        : t("NOTIFICATIONS_EMPTY_ALL_TITLE");
    const emptyDescription =
      status === "unread"
        ? t("NOTIFICATIONS_EMPTY_UNREAD_DESC")
        : t("NOTIFICATIONS_EMPTY_ALL_DESC");

    const effectiveError = query.isError && !query.data ? query.error : null;
    const loading = query.isLoading && !query.data;

    return (
      <PageState
        loading={loading}
        loadingVariant="table"
        variant="compact"
        className="py-2"
        error={effectiveError}
        onRetry={effectiveError ? () => void query.refetch() : undefined}
        empty={!loading && !effectiveError && items.length === 0}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
      >
        <div className="space-y-2 px-3 py-3">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "w-full rounded-md border border-border/60 px-3 py-2 text-left",
                "hover:bg-muted/60 transition-colors",
              )}
              onClick={() => void openTarget(item)}
            >
              <div className="flex items-center justify-between gap-2">
                <div
                  className={cn(
                    "min-w-0 truncate text-footnote font-semibold",
                    item.readAt ? "text-label-secondary" : "text-foreground",
                  )}
                >
                  {item.title}
                </div>
                {!item.readAt ? (
                  <span className="inline-flex items-center gap-1 text-caption text-label-secondary">
                    <Check className="size-3" aria-hidden="true" />
                    {t("NOTIFICATIONS_MARK_AS_READ")}
                  </span>
                ) : null}
              </div>
              {item.body ? (
                <div className="mt-1 line-clamp-2 text-caption text-label-secondary">
                  {item.body}
                </div>
              ) : null}
              <div className="mt-1 text-caption text-label-secondary">
                {formatRelativeTimeAt(item.createdAt, i18n.language, nowMs)}
              </div>
            </button>
          ))}

          {hasMore ? (
            <div className="rounded-md border border-dashed border-border px-3 py-2 text-caption text-label-secondary">
              {t("NOTIFICATIONS_PREVIEW_MORE_HINT")}
            </div>
          ) : null}
        </div>
      </PageState>
    );
  };

  return (
    <FloatingPanelBody className="w-[24rem] p-0">
      <ChromeTabs value={tab} onValueChange={(next) => setTab(next as NotificationPanelTab)}>
        <div className="px-3 pt-2">
          <ChromeTabsList>
            <ChromeTabsTrigger value="unread">{t("NOTIFICATIONS_TAB_UNREAD")}</ChromeTabsTrigger>
            <ChromeTabsTrigger value="all">{t("NOTIFICATIONS_TAB_ALL")}</ChromeTabsTrigger>
          </ChromeTabsList>
        </div>

        <ChromeTabsContent value="unread" className="pt-2">
          {renderList("unread")}
        </ChromeTabsContent>
        <ChromeTabsContent value="all" className="pt-2">
          {renderList("all")}
        </ChromeTabsContent>
      </ChromeTabs>

      <div className="border-t border-border/60 p-2">
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
            <Radio value="light" className="!m-0 text-footnote">
              {t("ACCOUNT_THEME_LIGHT")}
            </Radio>
            <Radio value="dark" className="!m-0 text-footnote">
              {t("ACCOUNT_THEME_DARK")}
            </Radio>
            <Radio value="system" className="!m-0 text-footnote">
              {t("ACCOUNT_THEME_SYSTEM")}
            </Radio>
          </div>
        </Radio.Group>
      </div>
    </FloatingPanelBody>
  );
}

function NotificationTriggerWithRibbon(props: { unreadCount: number; title: string }) {
  const badgeText = props.unreadCount > 99 ? "99+" : String(props.unreadCount);

  const trigger = (
    <HeaderActionTrigger title={props.title}>
      {(hovered) => <BellIcon size={18} isHovered={hovered} className="text-current" />}
    </HeaderActionTrigger>
  );

  if (props.unreadCount <= 0) return trigger;

  return (
    <Badge.Ribbon
      text={badgeText}
      placement="end"
      color="var(--color-primary)"
      style={{ fontSize: 11, lineHeight: "16px", height: 16, paddingInline: 6 }}
    >
      <div className="inline-flex">{trigger}</div>
    </Badge.Ribbon>
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
        <NotificationTriggerWithRibbon
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
