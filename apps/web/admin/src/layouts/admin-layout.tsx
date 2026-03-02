import { Outlet } from "@tanstack/react-router";
import { type CSSProperties, type PropsWithChildren, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AnimatePresence } from "motion/react";

import { ADMIN_NAV_ITEMS } from "@/constants/menu/workspaces";
import type { AdminNavItem } from "@/types/admin-nav";
import { COMMON_FOOTER_NAV_ITEMS } from "@/constants/menu/common";
import { useToggle } from "@/hooks/use-toggle";
import { ORG_NAV_ITEMS } from "@/constants/menu/organization";
import { mapOrgItemsWithPrefix, normalizePath } from "@/lib/admin-nav-utils";
import { AdminSiderNav } from "@/components/layout/admin-side-nav";
import { AdminAccountMenu } from "@/components/layout/admin-account-menu";
import { AdminBrandMark } from "@/components/layout/admin-logo";
import { AdminNotificationsPanel } from "@/components/layout/admin-notifications-panel";
import { AdminHeader } from "@/components/layout/admin-header";
import { RouteProgress } from "@/components/layout/route-progress";
import { RouteTransition } from "@/components/layout/route-transition";
import { ContentGuard } from "@/components/common/content-guard";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { LightRays } from "@/components/ui/light-rays";
import { getMyOrganization } from "@/api/me";
import { getWorkspaceDetail } from "@/api/workspaces";
import { getUnreadNotificationPreview } from "@/api/notifications";
import { useWorkspaceLocalization } from "@/hooks/use-workspace-localization";
import { useSystemRuntime } from "@/hooks/use-system-runtime";
import { resolvePermissionNameI18nKey } from "@/lib/auth/rbac-permissions";
import { filterNavByScope } from "@/lib/filter-nav-by-scope";
import { Illust404BrokenLink } from "@/components/illustrations";
import { Button } from "antd";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";

export function AdminLayout({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const accessToken = useAuthStore((s) => s.accessToken);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const localePreferenceMode = usePreferencesStore((s) => s.localePreferenceMode);
  const setEffectiveLocale = usePreferencesStore((s) => s.setEffectiveLocale);
  const cacheWorkspaceLocale = usePreferencesStore((s) => s.cacheWorkspaceLocale);
  const notificationPanelPinned = usePreferencesStore((s) => s.notificationPanelPinned);
  const showNotificationsBadge = usePreferencesStore((s) => s.showNotificationsBadge);
  const setNotificationPanelPinned = usePreferencesStore((s) => s.setNotificationPanelPinned);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const systemRuntime = useSystemRuntime();

  const orgPathPrefix = useMemo(() => {
    const matched = /^\/o\/[^/]+/.exec(pathname || "");
    return matched?.[0] ?? null;
  }, [pathname]);

  const isOrgScopeRoute = useMemo(() => {
    const p = pathname || "/";
    return p === "/" || p.startsWith("/o/");
  }, [pathname]);
  const isMeScopeRoute = useMemo(() => (pathname || "/").startsWith("/me/"), [pathname]);

  const workspaceBase = useMemo(() => {
    if (!workspaceId) return null;
    const id = String(workspaceId).trim();
    if (!id) return null;
    return `/w/${id}`;
  }, [workspaceId]);

  const myOrganizationQuery = useQuery({
    queryKey: ["me", "organization", "layout", accessToken],
    enabled: Boolean(accessToken),
    queryFn: async () => getMyOrganization(),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const resolvedOrgPathPrefix = useMemo(() => {
    if (orgPathPrefix) return orgPathPrefix;
    const orgId = myOrganizationQuery.data?.organization?.id;
    if (!orgId) return null;
    return `/o/${encodeURIComponent(orgId)}`;
  }, [myOrganizationQuery.data?.organization?.id, orgPathPrefix]);

  const resolvePermissionName = useMemo(() => {
    return (code: string) => {
      const i18nKey = resolvePermissionNameI18nKey(code);
      if (!i18nKey) return null;
      // i18next returns the key itself when missing; treat that as "unmapped".
      const text = t(i18nKey);
      if (!text || text === i18nKey) return null;
      return text;
    };
  }, [t]);

  const isWorkspaceScopeRoute = useMemo(() => {
    if (!workspaceBase) return false;
    return normalizePath(pathname).startsWith(normalizePath(workspaceBase));
  }, [pathname, workspaceBase]);

  const navItems = useMemo(() => {
    if (isOrgScopeRoute || isMeScopeRoute) {
      if (!resolvedOrgPathPrefix) return [];
      return mapOrgItemsWithPrefix(ORG_NAV_ITEMS, resolvedOrgPathPrefix);
    }
    // When workspace is not selected (or currentWorkspaceId is temporarily unavailable),
    // keep a stable shell so error/not-found pages don't "drop" the layout.
    if (!workspaceBase) {
      if (resolvedOrgPathPrefix) return mapOrgItemsWithPrefix(ORG_NAV_ITEMS, resolvedOrgPathPrefix);
      return ORG_NAV_ITEMS;
    }
    const base = workspaceBase.endsWith("/") ? workspaceBase.slice(0, -1) : workspaceBase;

    const baseItems: AdminNavItem[] = ADMIN_NAV_ITEMS;

    const mapItems = (items: AdminNavItem[]): AdminNavItem[] => {
      return items.map((it) => {
        const to = it.to
          ? it.to === "/"
            ? `${base}/`
            : `${base}${it.to.startsWith("/") ? it.to : `/${it.to}`}`
          : undefined;
        return {
          ...it,
          ...(to ? { to } : {}),
          ...(it.children?.length ? { children: mapItems(it.children) } : {}),
        };
      });
    };

    return mapItems(baseItems);
  }, [isOrgScopeRoute, isMeScopeRoute, resolvedOrgPathPrefix, workspaceBase]);

  const scopedNavItems = useMemo(
    () => filterNavByScope(navItems, systemRuntime.runtime.deploymentMode),
    [navItems, systemRuntime.runtime.deploymentMode],
  );

  const mainItems = useMemo(
    () => scopedNavItems.filter((it) => it.position !== "footer"),
    [scopedNavItems],
  );

  const [notificationPanelOpen, , setNotificationPanelOpen] = useToggle(false);

  const notificationPreviewQuery = useQuery({
    queryKey: ["notifications", "preview", sessionVersion],
    enabled: Boolean(accessToken),
    queryFn: () => getUnreadNotificationPreview({ limit: 1 }),
    staleTime: 30 * 1000,
    meta: { silent: true },
  });
  const unreadCount = notificationPreviewQuery.data?.unreadCount ?? 0;

  const footerItemsWithActions = useMemo(
    () =>
      COMMON_FOOTER_NAV_ITEMS.map((item) => {
        if (item.key === "help-center") {
          return Object.assign({}, item, {
            onAction: () => {
              window.location.assign("#");
            },
          });
        }
        if (item.key !== "notifications") return item;
        return Object.assign({}, item, {
          onAction: () => setNotificationPanelOpen(!notificationPanelOpen),
          isActive: notificationPanelOpen,
          actionRenderer:
            showNotificationsBadge && unreadCount > 0
              ? () => (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] rounded-full bg-primary px-1  leading-none text-caption text-label-primary font-semibold">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )
              : undefined,
        });
      }),
    [notificationPanelOpen, setNotificationPanelOpen, showNotificationsBadge, unreadCount],
  );

  const workspaceDetailQuery = useQuery({
    queryKey: ["workspace", "detail", workspaceId, sessionVersion],
    enabled: Boolean(accessToken && workspaceId && !isOrgScopeRoute && isWorkspaceScopeRoute),
    queryFn: async () => getWorkspaceDetail(String(workspaceId)),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const orgContextMissing = (isOrgScopeRoute || isMeScopeRoute) && !resolvedOrgPathPrefix;
  const showOrgNavSkeleton = Boolean(accessToken) && orgContextMissing;
  const showOrgNavErrorOverlay = showOrgNavSkeleton && myOrganizationQuery.isError;

  const workspaceLocalization = useWorkspaceLocalization();

  useEffect(() => {
    // When user has no explicit preference, apply workspace default locale as the effective UI locale.
    // This keeps behavior consistent across sessions without persisting it as a personal choice.
    if (!accessToken || !workspaceId) return;
    const next = workspaceLocalization.localization.locale;
    if (!next) return;
    // Always cache workspace default locale for smoother refresh bootstrapping.
    cacheWorkspaceLocale(String(workspaceId), next);
    if (localePreferenceMode !== "workspace") return;
    setEffectiveLocale(next);
  }, [
    accessToken,
    cacheWorkspaceLocale,
    localePreferenceMode,
    setEffectiveLocale,
    workspaceId,
    workspaceLocalization.localization.locale,
  ]);

  return (
    <SidebarProvider defaultOpen className="h-screen">
      <RouteProgress />

      <Sidebar
        collapsible="none"
        animateOnHover={false}
        className="relative isolate shrink-0 h-full border-r"
        style={
          {
            width: 240,
            minWidth: 240,
            "--ant-color-link": "var(--color-muted-foreground)",
          } as CSSProperties
        }
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-80 opacity-90 [mask-image:linear-gradient(to_bottom,black,transparent)]"
        >
          <LightRays
            count={7}
            speed={16}
            blur={48}
            length="70vh"
            color="rgba(140, 200, 255, 0.18)"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent"
          />
        </div>

        <SidebarHeader className="relative z-10 flex flex-col items-center w-full px-4 pt-6 pb-2">
          <AdminBrandMark size={80} />
        </SidebarHeader>

        <SidebarContent className="relative z-10 mx-2 overflow-hidden scrollbar-none">
          <div className="relative flex min-h-0 flex-1">
            <div className="flex min-h-0 flex-1 flex-col overflow-auto scrollbar-none">
              {showOrgNavSkeleton ? (
                <div className="mt-4 mb-8">
                  <div className="px-3.5 py-2">
                    <SidebarMenuSkeleton showIcon />
                    <SidebarMenuSkeleton showIcon />
                    <SidebarMenuSkeleton showIcon />
                    <SidebarMenuSkeleton showIcon />
                    <SidebarMenuSkeleton showIcon />
                    <SidebarMenuSkeleton showIcon />
                    <SidebarMenuSkeleton showIcon />
                  </div>
                </div>
              ) : (
                <AdminSiderNav items={mainItems} resolvePermissionName={resolvePermissionName} />
              )}
            </div>

            {showOrgNavErrorOverlay ? (
              <div className="absolute inset-0 z-20 flex items-start justify-center p-3">
                <div className="absolute inset-0 bg-sidebar/70 supports-[backdrop-filter]:bg-sidebar/50 backdrop-blur-md" />
                <div className="relative w-full max-w-[280px]">
                  <div className="rounded-xl border border-border/60 bg-background/70 supports-[backdrop-filter]:bg-background/55 backdrop-blur-md shadow-sm">
                    <div className="px-4 pt-4 pb-3 text-center">
                      <Illust404BrokenLink className="mx-auto max-w-[160px]" />
                      <div className="mt-2 text-title text-label-primary">
                        {t("common:REQUEST_FAILED")}
                      </div>
                      <div className="mt-1 text-footnote text-label-secondary">
                        {t("common:PAGE_SERVER_ERROR_DESC")}
                      </div>
                      <div className="mt-3 flex items-center justify-center gap-2">
                        <Button
                          size="small"
                          type="primary"
                          onClick={() => void myOrganizationQuery.refetch()}
                        >
                          {t("common:RETRY")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {footerItemsWithActions.length > 0 ? (
            <div className="shrink-0 flex flex-col pb-2">
              <AdminSiderNav
                items={footerItemsWithActions}
                resolvePermissionName={resolvePermissionName}
                className="mt-0 mb-0"
              />
            </div>
          ) : null}
        </SidebarContent>

        <SidebarFooter className="border-t border-border relative z-10 isolate px-0 ">
          <AdminAccountMenu />
        </SidebarFooter>
      </Sidebar>

      {/* Pinned panel: in document flow, pushes content area */}
      {notificationPanelOpen && notificationPanelPinned && (
        <AdminNotificationsPanel
          className="h-screen shrink-0 border-r"
          isPinned={true}
          onPinChange={setNotificationPanelPinned}
          onClose={() => setNotificationPanelOpen(false)}
        />
      )}

      {/* Floating panel: fixed, overlays content area — unmount after exit animation */}
      {!notificationPanelPinned ? (
        <AnimatePresence initial={false}>
          {notificationPanelOpen
            ? [
                // Transparent backdrop (does not cover sidebar; left=240) — click to close floating panel
                <button
                  key="admin-notifications-backdrop"
                  type="button"
                  aria-label={t("notifications:NOTIFICATIONS_PANEL_CLOSE")}
                  className="fixed inset-y-0 right-0 z-20 bg-transparent"
                  style={{ left: 240 }}
                  onClick={() => setNotificationPanelOpen(false)}
                />,
                <AdminNotificationsPanel
                  key="admin-notifications-panel"
                  className="fixed top-0 h-screen z-30"
                  style={{ left: 240 }}
                  isPinned={false}
                  onPinChange={setNotificationPanelPinned}
                  onClose={() => setNotificationPanelOpen(false)}
                />,
              ]
            : null}
        </AnimatePresence>
      ) : null}

      <SidebarInset className="w-auto flex-1 min-w-0 overflow-hidden">
        <AdminHeader
          navItems={navItems}
          onRefresh={() => {
            window.location.reload();
          }}
        />
        <div className="flex-1 min-h-0 overflow-auto">
          <ContentGuard
            loading={Boolean(
              !isOrgScopeRoute && isWorkspaceScopeRoute && workspaceDetailQuery.isLoading,
            )}
            error={!isOrgScopeRoute && isWorkspaceScopeRoute ? workspaceDetailQuery.error : null}
            container="admin-route"
            containerWidth="fixed"
            onRetry={
              !isOrgScopeRoute && isWorkspaceScopeRoute
                ? () => {
                    void workspaceDetailQuery.refetch();
                  }
                : undefined
            }
            loadingVariant="form"
          >
            <RouteTransition className="w-full">{children ?? <Outlet />}</RouteTransition>
          </ContentGuard>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
