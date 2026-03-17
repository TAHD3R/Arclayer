import { Outlet } from "@tanstack/react-router";
import { type CSSProperties, type PropsWithChildren, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { WORKSPACE_NAV_HOME_ITEM, WORKSPACE_NAV_SECTIONS } from "@/constants/menu/workspaces";
import type { AdminNavItem, AdminNavSection } from "@/types/admin-nav";
import { COMMON_FOOTER_NAV_ITEMS } from "@/constants/menu/common";
import { useToggle } from "@arclayer/hooks/use-toggle";
import { normalizePath } from "@/lib/admin-nav-utils";
import { RouteProgress } from "@/components/layout/route-progress";
import { RouteTransition } from "@/components/layout/route-transition";
import { ContentGuard } from "@/components/common/content-guard";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { getWorkspaceDetail } from "@/api/workspaces";
import { getUnreadNotificationPreview } from "@/api/notifications";
import { useWorkspaceLocalization } from "@/hooks/use-workspace-localization";
import { useSystemRuntime } from "@/hooks/use-system-runtime";
import { resolvePermissionNameI18nKey } from "@/lib/auth/rbac-permissions";
import { filterNavByScope } from "@/lib/filter-nav-by-scope";
import { SidebarInset, SidebarProvider } from "@arclayer/ui/sidebar";
import { AdminSidebarShell } from "@/components/layout/admin-sidebar-shell";
import { AdminNotificationsShell } from "@/components/layout/admin-notifications-shell";
import { AdminTopbar } from "@/components/layout/admin-topbar";

const SIDEBAR_EXPANDED_WIDTH_PX = 270;
const SIDEBAR_COLLAPSED_WIDTH_PX = 56;
const TOPBAR_HEIGHT_REM = "3.5rem";

export function AdminLayout({ children }: PropsWithChildren) {
  const { t, i18n } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const accessToken = useAuthStore((s) => s.accessToken);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const localePreferenceMode = usePreferencesStore((s) => s.localePreferenceMode);
  const setEffectiveLocale = usePreferencesStore((s) => s.setEffectiveLocale);
  const cacheWorkspaceLocale = usePreferencesStore((s) => s.cacheWorkspaceLocale);
  const notificationPanelPinned = usePreferencesStore((s) => s.notificationPanelPinned);
  const showNotificationsBadge = usePreferencesStore((s) => s.showNotificationsBadge);
  const sidebarOpen = usePreferencesStore((s) => s.sidebarOpen);
  const setNotificationPanelPinned = usePreferencesStore((s) => s.setNotificationPanelPinned);
  const setSidebarOpen = usePreferencesStore((s) => s.setSidebarOpen);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const systemRuntime = useSystemRuntime();

  const workspaceBase = useMemo(() => {
    const id = String(workspaceId ?? "").trim();
    return id ? `/w/${id}` : null;
  }, [workspaceId]);

  const resolvePermissionName = useMemo(() => {
    return (code: string) => {
      const i18nKey = resolvePermissionNameI18nKey(code);
      if (!i18nKey) return null;
      const text = t(i18nKey);
      if (!text || text === i18nKey) return null;
      return text;
    };
  }, [i18n.resolvedLanguage, i18n.language, t]);

  const isWorkspaceScopeRoute = useMemo(() => {
    if (!workspaceBase) return false;
    return normalizePath(pathname).startsWith(normalizePath(workspaceBase));
  }, [pathname, workspaceBase]);

  const workspaceNav = useMemo((): {
    homeItem: AdminNavItem | null;
    sections: AdminNavSection[];
    items: AdminNavItem[];
  } => {
    if (!workspaceBase) {
      return { homeItem: null, sections: [], items: [] };
    }

    const base = workspaceBase.endsWith("/") ? workspaceBase.slice(0, -1) : workspaceBase;

    const mapItems = (items: AdminNavItem[]): AdminNavItem[] =>
      items.map((it) => {
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

    const [homeItem] = mapItems([WORKSPACE_NAV_HOME_ITEM]);
    const sections = WORKSPACE_NAV_SECTIONS.map((section) =>
      Object.assign({}, section, { items: mapItems(section.items) }),
    );

    return {
      homeItem,
      sections,
      items: [homeItem, ...sections.flatMap((section) => section.items)],
    };
  }, [workspaceBase]);

  const navItems = useMemo(() => workspaceNav.items, [workspaceNav.items]);
  const scopedNavItems = useMemo(() => {
    if (!systemRuntime.runtime) return [];
    return filterNavByScope(navItems, systemRuntime.runtime.deploymentMode);
  }, [navItems, systemRuntime.runtime]);

  const mainItems = useMemo(
    () => scopedNavItems.filter((it) => it.position !== "footer"),
    [scopedNavItems],
  );

  const mainHomeItem = useMemo(() => {
    if (!systemRuntime.runtime || !workspaceNav.homeItem) return null;
    return (
      filterNavByScope([workspaceNav.homeItem], systemRuntime.runtime.deploymentMode).find(
        (item) => item.position !== "footer",
      ) ?? null
    );
  }, [systemRuntime.runtime, workspaceNav.homeItem]);

  const mainSections = useMemo(() => {
    const runtime = systemRuntime.runtime;
    if (!runtime) return [];
    return workspaceNav.sections
      .map((section) => ({
        ...section,
        items: filterNavByScope(section.items, runtime.deploymentMode).filter(
          (item) => item.position !== "footer",
        ),
      }))
      .filter((section) => section.items.length > 0);
  }, [systemRuntime.runtime, workspaceNav.sections]);

  const [notificationPanelOpen, , setNotificationPanelOpen] = useToggle(false);

  const notificationPreviewQuery = useQuery({
    queryKey: ["notifications", "preview", sessionVersion],
    enabled: Boolean(accessToken),
    queryFn: () => getUnreadNotificationPreview({ limit: 1 }),
    staleTime: 30 * 1000,
    meta: { silent: true },
  });
  const unreadCount = notificationPreviewQuery.data?.unreadCount ?? 0;

  const footerItems = useMemo(
    () =>
      COMMON_FOOTER_NAV_ITEMS.flatMap((item) => {
        if (item.key === "notifications") return [];
        if (item.key === "help-center") {
          return [
            Object.assign({}, item, {
              onAction: () => {
                window.location.assign("#");
              },
            }),
          ];
        }
        return [item];
      }),
    [],
  );

  const workspaceDetailQuery = useQuery({
    queryKey: ["workspace", "detail", workspaceId, sessionVersion],
    enabled: Boolean(accessToken && workspaceId && isWorkspaceScopeRoute),
    queryFn: async () => getWorkspaceDetail(String(workspaceId)),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const showNavSkeleton = Boolean(accessToken && !systemRuntime.runtime);
  const workspaceLocalization = useWorkspaceLocalization();

  useEffect(() => {
    if (!accessToken || !workspaceId) return;
    const next = workspaceLocalization.localization.locale;
    if (!next) return;
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

  const commandScope = useMemo(() => {
    if (!isWorkspaceScopeRoute) {
      return {
        kind: "none",
        pathname,
        workspaceId: null,
        organizationId: null,
      } as const;
    }

    return {
      kind: "workspace",
      pathname,
      workspaceId: workspaceId ? String(workspaceId) : null,
      organizationId: workspaceDetailQuery.data?.organizationId ?? null,
    } as const;
  }, [isWorkspaceScopeRoute, pathname, workspaceDetailQuery.data?.organizationId, workspaceId]);

  return (
    <SidebarProvider
      defaultOpen={sidebarOpen}
      open={sidebarOpen}
      onOpenChange={setSidebarOpen}
      className="h-screen overflow-hidden"
      style={
        {
          "--sidebar-width": `${SIDEBAR_EXPANDED_WIDTH_PX}px`,
          "--sidebar-width-icon": `${SIDEBAR_COLLAPSED_WIDTH_PX}px`,
          "--admin-topbar-height": TOPBAR_HEIGHT_REM,
        } as CSSProperties
      }
    >
      <RouteProgress />
      <div className="flex h-screen min-h-0 w-full flex-1 flex-col bg-background">
        <AdminTopbar
          navItems={mainItems}
          commandScope={commandScope}
          notificationOpen={notificationPanelOpen}
          showNotificationsBadge={showNotificationsBadge}
          unreadCount={unreadCount}
          onNotificationToggle={() => setNotificationPanelOpen(!notificationPanelOpen)}
        />

        <div className="flex min-h-0 flex-1">
          <AdminSidebarShell
            showNavSkeleton={showNavSkeleton}
            showOrgNavErrorOverlay={false}
            mainItems={mainItems}
            mainHomeItem={isWorkspaceScopeRoute ? mainHomeItem : null}
            mainSections={isWorkspaceScopeRoute ? mainSections : []}
            favoriteWorkspaceBase={isWorkspaceScopeRoute ? workspaceBase : null}
            footerItems={footerItems}
            resolvePermissionName={resolvePermissionName}
            className="top-[var(--admin-topbar-height)] inset-y-auto bottom-0 h-[calc(100svh-var(--admin-topbar-height))]"
          />

          <div className="relative flex min-w-0 flex-1">
            <SidebarInset className="w-auto min-w-0 flex-1 overflow-hidden">
              <div className="min-h-0 flex-1 overflow-auto">
                <ContentGuard
                  loading={Boolean(isWorkspaceScopeRoute && workspaceDetailQuery.isLoading)}
                  error={isWorkspaceScopeRoute ? workspaceDetailQuery.error : null}
                  container="admin-route"
                  onRetry={
                    isWorkspaceScopeRoute
                      ? () => {
                          void workspaceDetailQuery.refetch();
                        }
                      : undefined
                  }
                  loadingVariant="form"
                >
                  <RouteTransition className="min-h-full w-full">
                    {children ?? <Outlet />}
                  </RouteTransition>
                </ContentGuard>
              </div>
            </SidebarInset>

            <AdminNotificationsShell
              open={notificationPanelOpen}
              pinned={notificationPanelPinned}
              closeAriaLabel={t("notifications:NOTIFICATIONS_PANEL_CLOSE")}
              onPinnedChange={setNotificationPanelPinned}
              onClose={() => setNotificationPanelOpen(false)}
            />
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
