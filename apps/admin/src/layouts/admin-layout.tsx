import { Outlet, useRouterState } from "@tanstack/react-router";
import { type PropsWithChildren, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { WORKSPACE_NAV_ITEMS } from "@/constants/menu/workspaces";
import { COMMON_FOOTER_NAV_ITEMS } from "@/constants/menu/common";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { getWorkspaceDetail } from "@/api/workspaces";
import { useWorkspaceLocalization } from "@/hooks/use-workspace-localization";
import { useSystemRuntime } from "@/hooks/use-system-runtime";
import { resolvePermissionNameI18nKey } from "@/lib/auth/rbac-permissions";
import { filterNavByScope } from "@/lib/filter-nav-by-scope";
import { AdminTopbar } from "@/components/layout/admin-topbar";
import { AdminSceneLayout } from "@/layouts/admin-scene-layout";
import {
  buildCommonFooterItems,
  extractWorkspaceBaseFromPath,
  mapWorkspaceNavItems,
} from "@/layouts/admin-scene-utils";

export function AdminLayout({ children }: PropsWithChildren) {
  const { t, i18n } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const accessToken = useAuthStore((s) => s.accessToken);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const localePreferenceMode = usePreferencesStore((s) => s.localePreferenceMode);
  const setEffectiveLocale = usePreferencesStore((s) => s.setEffectiveLocale);
  const cacheWorkspaceLocale = usePreferencesStore((s) => s.cacheWorkspaceLocale);
  const workspaceIdFromStore = useWorkspaceStore((s) => s.currentWorkspaceId);
  const systemRuntime = useSystemRuntime();

  const workspaceBase = useMemo(() => extractWorkspaceBaseFromPath(pathname), [pathname]);
  const workspaceId = useMemo(() => workspaceBase?.replace("/w/", "") ?? null, [workspaceBase]);
  const effectiveWorkspaceId = workspaceId ?? workspaceIdFromStore;

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
    return Boolean(workspaceBase);
  }, [workspaceBase]);

  const workspaceNav = useMemo(
    () => (workspaceBase ? mapWorkspaceNavItems(WORKSPACE_NAV_ITEMS, workspaceBase) : []),
    [workspaceBase],
  );

  const scopedNavItems = useMemo(() => {
    if (!systemRuntime.runtime) return [];
    return filterNavByScope(workspaceNav, systemRuntime.runtime.deploymentMode);
  }, [systemRuntime.runtime, workspaceNav]);

  const mainItems = useMemo(
    () => scopedNavItems.filter((item) => item.position !== "footer"),
    [scopedNavItems],
  );

  const footerItems = useMemo(() => buildCommonFooterItems(COMMON_FOOTER_NAV_ITEMS), []);

  const workspaceDetailQuery = useQuery({
    queryKey: ["workspace", "detail", effectiveWorkspaceId, sessionVersion],
    enabled: Boolean(accessToken && effectiveWorkspaceId && isWorkspaceScopeRoute),
    queryFn: async () => getWorkspaceDetail(String(effectiveWorkspaceId)),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const showNavSkeleton = Boolean(accessToken && !systemRuntime.runtime);
  const workspaceLocalization = useWorkspaceLocalization();

  useEffect(() => {
    if (!accessToken || !effectiveWorkspaceId) return;
    const next = workspaceLocalization.localization.locale;
    if (!next) return;
    cacheWorkspaceLocale(String(effectiveWorkspaceId), next);
    if (localePreferenceMode !== "workspace") return;
    setEffectiveLocale(next);
  }, [
    accessToken,
    cacheWorkspaceLocale,
    effectiveWorkspaceId,
    localePreferenceMode,
    setEffectiveLocale,
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
      workspaceId: effectiveWorkspaceId ? String(effectiveWorkspaceId) : null,
      organizationId: workspaceDetailQuery.data?.organizationId ?? null,
    } as const;
  }, [
    effectiveWorkspaceId,
    isWorkspaceScopeRoute,
    pathname,
    workspaceDetailQuery.data?.organizationId,
  ]);

  return (
    <AdminSceneLayout
      notificationQueryScope="admin"
      renderTopbar={(topbar) => (
        <AdminTopbar navItems={mainItems} commandScope={commandScope} {...topbar} />
      )}
      mainItems={isWorkspaceScopeRoute ? mainItems : []}
      favoriteWorkspaceBase={isWorkspaceScopeRoute ? workspaceBase : null}
      footerItems={footerItems}
      resolvePermissionName={resolvePermissionName}
      showNavSkeleton={showNavSkeleton}
      sidebarCollapsible="icon"
      loading={Boolean(isWorkspaceScopeRoute && workspaceDetailQuery.isLoading)}
      error={isWorkspaceScopeRoute ? workspaceDetailQuery.error : null}
      onRetry={
        isWorkspaceScopeRoute
          ? () => {
              void workspaceDetailQuery.refetch();
            }
          : undefined
      }
      guardContainer="admin-route"
      routeTransitionClassName="h-full min-h-0 w-full"
    >
      {children ?? <Outlet />}
    </AdminSceneLayout>
  );
}
