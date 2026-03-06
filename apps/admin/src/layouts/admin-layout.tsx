import { Outlet } from "@tanstack/react-router";
import { type CSSProperties, type PropsWithChildren, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { ADMIN_NAV_ITEMS } from "@/constants/menu/workspaces";
import type { AdminNavItem } from "@/types/admin-nav";
import { COMMON_FOOTER_NAV_ITEMS } from "@/constants/menu/common";
import { useToggle } from "@celestial/hooks/use-toggle";
import { ORG_NAV_ITEMS } from "@/constants/menu/organization";
import { mapOrgItemsWithPrefix, normalizePath } from "@/lib/admin-nav-utils";
import { RouteProgress } from "@/components/layout/route-progress";
import { RouteTransition } from "@/components/layout/route-transition";
import { ContentGuard } from "@/components/common/content-guard";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { getWorkspaceDetail } from "@/api/workspaces";
import { getUnreadNotificationPreview } from "@/api/notifications";
import { listMyOrganizations } from "@/api/me";
import { useWorkspaceLocalization } from "@/hooks/use-workspace-localization";
import { useSystemRuntime } from "@/hooks/use-system-runtime";
import { resolvePermissionNameI18nKey } from "@/lib/auth/rbac-permissions";
import { filterNavByScope } from "@/lib/filter-nav-by-scope";
import { parseOrganizationIdFromPath } from "@/lib/routing/organization-routing";
import { SidebarInset, SidebarProvider } from "@celestial/ui/sidebar";
import { AdminSidebarShell } from "@/components/layout/admin-sidebar-shell";
import { AdminNotificationsShell } from "@/components/layout/admin-notifications-shell";
import { ForbiddenView } from "@/components/builtin/forbidden-page";
import { WorkspaceSwitchDialogHost } from "@/components/layout/workspace-switch-dialog-host";
import { MeSettingsDialogHost } from "@/components/layout/me-settings-dialog-host";

const SIDEBAR_EXPANDED_WIDTH_PX = 270;
const SIDEBAR_COLLAPSED_WIDTH_PX = 56;

type AdminCenterAccessState = "loading" | "allowed" | "forbidden" | "error" | "not-admin-center";

function canEnterAdminCenter(role: string | null): boolean {
  return role === "owner" || role === "admin";
}

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

  const orgPathPrefix = useMemo(() => /^\/o\/[^/]+/.exec(pathname || "")?.[0] ?? null, [pathname]);
  const isAdminCenterRoute = useMemo(() => (pathname || "/").startsWith("/o/"), [pathname]);
  const isMeScopeRoute = useMemo(() => (pathname || "/").startsWith("/me/"), [pathname]);
  const adminCenterOrgId = useMemo(
    () => (isAdminCenterRoute ? parseOrganizationIdFromPath(pathname) : null),
    [isAdminCenterRoute, pathname],
  );

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
  }, [t]);

  const isWorkspaceScopeRoute = useMemo(() => {
    if (!workspaceBase) return false;
    return normalizePath(pathname).startsWith(normalizePath(workspaceBase));
  }, [pathname, workspaceBase]);

  const adminCenterOrganizationsQuery = useQuery({
    queryKey: ["organization", "me", "organizations", "admin-layout", sessionVersion],
    enabled: Boolean(accessToken && isAdminCenterRoute && adminCenterOrgId),
    queryFn: listMyOrganizations,
    staleTime: 5 * 60 * 1000,
    meta: { silent: true },
  });

  const adminCenterAccess = useMemo((): {
    state: AdminCenterAccessState;
    error: unknown | null;
  } => {
    if (!isAdminCenterRoute) return { state: "not-admin-center", error: null };
    if (!adminCenterOrgId) return { state: "forbidden", error: null };
    if (adminCenterOrganizationsQuery.isLoading) return { state: "loading", error: null };
    if (adminCenterOrganizationsQuery.error)
      return { state: "error", error: adminCenterOrganizationsQuery.error };

    const items = adminCenterOrganizationsQuery.data?.items ?? [];
    const match = items.find((it) => it.organization.id === adminCenterOrgId);
    const isActive = match?.membership.status === "active";
    const role = match?.membership.role ?? null;

    if (!isActive || !canEnterAdminCenter(role)) return { state: "forbidden", error: null };
    return { state: "allowed", error: null };
  }, [
    adminCenterOrgId,
    adminCenterOrganizationsQuery.data?.items,
    adminCenterOrganizationsQuery.error,
    adminCenterOrganizationsQuery.isLoading,
    isAdminCenterRoute,
  ]);

  const canRenderAdminCenterNav = isAdminCenterRoute && adminCenterAccess.state === "allowed";
  const shouldShowAdminCenterForbidden =
    isAdminCenterRoute && adminCenterAccess.state === "forbidden";

  const navItems = useMemo(() => {
    if (isAdminCenterRoute) {
      if (!orgPathPrefix) return [];
      if (!canRenderAdminCenterNav) return [];
      return mapOrgItemsWithPrefix(ORG_NAV_ITEMS, orgPathPrefix);
    }
    if (isMeScopeRoute) {
      return [];
    }
    if (!workspaceBase) {
      return [];
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
  }, [canRenderAdminCenterNav, isAdminCenterRoute, isMeScopeRoute, orgPathPrefix, workspaceBase]);

  const scopedNavItems = useMemo(() => {
    if (!systemRuntime.runtime) return [];
    return filterNavByScope(navItems, systemRuntime.runtime.deploymentMode);
  }, [navItems, systemRuntime.runtime]);

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
    enabled: Boolean(accessToken && workspaceId && isWorkspaceScopeRoute),
    queryFn: async () => getWorkspaceDetail(String(workspaceId)),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const showNavSkeleton =
    Boolean(accessToken) &&
    (!systemRuntime.runtime || (isAdminCenterRoute && adminCenterAccess.state === "loading"));
  const showOrgNavErrorOverlay = false;

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
    <SidebarProvider
      defaultOpen
      className="h-screen"
      style={
        {
          "--sidebar-width": `${SIDEBAR_EXPANDED_WIDTH_PX}px`,
          "--sidebar-width-icon": `${SIDEBAR_COLLAPSED_WIDTH_PX}px`,
        } as CSSProperties
      }
    >
      <RouteProgress />
      <WorkspaceSwitchDialogHost />
      <MeSettingsDialogHost />

      <AdminSidebarShell
        showNavSkeleton={showNavSkeleton}
        showOrgNavErrorOverlay={showOrgNavErrorOverlay}
        mainItems={mainItems}
        footerItems={footerItemsWithActions}
        resolvePermissionName={resolvePermissionName}
      />

      <AdminNotificationsShell
        open={notificationPanelOpen}
        pinned={notificationPanelPinned}
        sidebarExpandedWidthPx={SIDEBAR_EXPANDED_WIDTH_PX}
        sidebarCollapsedWidthPx={SIDEBAR_COLLAPSED_WIDTH_PX}
        closeAriaLabel={t("notifications:NOTIFICATIONS_PANEL_CLOSE")}
        onPinnedChange={setNotificationPanelPinned}
        onClose={() => setNotificationPanelOpen(false)}
      />

      <SidebarInset className="w-auto flex-1 min-w-0 overflow-hidden">
        <div className="flex-1 min-h-0 overflow-auto">
          <ContentGuard
            loading={Boolean(
              (isWorkspaceScopeRoute && workspaceDetailQuery.isLoading) ||
              (isAdminCenterRoute && adminCenterAccess.state === "loading"),
            )}
            error={
              isWorkspaceScopeRoute
                ? workspaceDetailQuery.error
                : isAdminCenterRoute
                  ? adminCenterAccess.error
                  : null
            }
            container="admin-route"
            containerWidth="fixed"
            onRetry={
              isWorkspaceScopeRoute
                ? () => {
                    void workspaceDetailQuery.refetch();
                  }
                : isAdminCenterRoute
                  ? () => {
                      void adminCenterOrganizationsQuery.refetch();
                    }
                  : undefined
            }
            loadingVariant="form"
          >
            <RouteTransition className="w-full">
              {shouldShowAdminCenterForbidden ? <ForbiddenView variant="admin" /> : null}
              {!shouldShowAdminCenterForbidden ? (children ?? <Outlet />) : null}
            </RouteTransition>
          </ContentGuard>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
