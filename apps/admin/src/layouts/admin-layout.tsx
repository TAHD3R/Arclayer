import { Outlet, useRouterState } from "@tanstack/react-router";
import { type PropsWithChildren, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { getProjectNavItems } from "@/constants/menu/project";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { getWorkspaceDetail } from "@/api/workspaces";
import { useWorkspaceLocalization } from "@/hooks/use-workspace-localization";
import { resolvePermissionNameI18nKey } from "@/lib/auth/rbac-permissions";
import { isFavoriteOverlayContentOnly } from "@/lib/routing/favorite-overlay";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { RouteTransition } from "@/components/layout/route-transition";
import { AdminTopbar } from "@/components/layout/admin-topbar";
import { AdminSceneLayout } from "@/layouts/admin-scene-layout";
import { SidebarInset, SidebarProvider } from "@arclayer/ui/sidebar";
import { extractWorkspaceBaseFromPath, mapWorkspaceNavItems } from "@/layouts/admin-scene-utils";

export function AdminLayout({ children }: PropsWithChildren) {
  const { t, i18n } = useTranslation();
  const { pathname, searchStr } = useRouterState({
    select: (s) => ({
      pathname: s.location.pathname,
      searchStr: s.location.searchStr,
    }),
    structuralSharing: true,
  });
  const accessToken = useAuthStore((s) => s.accessToken);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const localePreferenceMode = usePreferencesStore((s) => s.localePreferenceMode);
  const sidebarWidthPx = usePreferencesStore((s) => s.sidebarWidthPx);
  const setEffectiveLocale = usePreferencesStore((s) => s.setEffectiveLocale);
  const setSidebarWidthPx = usePreferencesStore((s) => s.setSidebarWidthPx);
  const cacheWorkspaceLocale = usePreferencesStore((s) => s.cacheWorkspaceLocale);
  const workspaceIdFromStore = useWorkspaceStore((s) => s.currentWorkspaceId);
  const currentProjectId = useWorkspaceStore((s) => s.currentProjectId);

  const workspaceBase = useMemo(() => extractWorkspaceBaseFromPath(pathname), [pathname]);
  const effectiveWorkspaceId = workspaceIdFromStore;

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

  const workspaceDetailQuery = useQuery({
    queryKey: ["workspace", "detail", effectiveWorkspaceId, sessionVersion],
    enabled: Boolean(accessToken && effectiveWorkspaceId && isWorkspaceScopeRoute),
    queryFn: async () => getWorkspaceDetail(String(effectiveWorkspaceId)),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const workspaceNav = useMemo(
    () =>
      workspaceBase && currentProjectId
        ? mapWorkspaceNavItems(getProjectNavItems(), `/projects/${currentProjectId}`)
        : workspaceBase
          ? mapWorkspaceNavItems(getProjectNavItems(), workspaceBase)
          : [],
    [currentProjectId, workspaceBase],
  );

  const mainItems = useMemo(
    () => workspaceNav.filter((item) => item.position !== "footer"),
    [workspaceNav],
  );

  const workspaceLocalization = useWorkspaceLocalization();
  const contentOnlyMode = isFavoriteOverlayContentOnly(searchStr);

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

  const routeContent = (
    <SidebarProvider
      open
      defaultOpen
      onOpenChange={() => undefined}
      defaultWidthPx={sidebarWidthPx}
      widthPx={sidebarWidthPx}
      onWidthChange={setSidebarWidthPx}
      className="h-screen overflow-hidden"
    >
      <div className="flex h-screen min-h-0 w-full flex-1 flex-col bg-background">
        <div className="relative flex min-h-0 flex-1">
          <SidebarInset className="w-auto min-w-0 flex-1 overflow-hidden bg-background">
            <div className="flex-1 min-h-0 overflow-auto">
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
                <RouteTransition className="h-full min-h-0 w-full">
                  {children ?? <Outlet />}
                </RouteTransition>
              </ContentGuard>
            </div>
          </SidebarInset>
        </div>
      </div>
    </SidebarProvider>
  );

  if (contentOnlyMode) {
    return routeContent;
  }

  return (
    <AdminSceneLayout
      notificationQueryScope="admin"
      renderTopbar={(topbar) => <AdminTopbar {...topbar} />}
      mainItems={isWorkspaceScopeRoute ? mainItems : []}
      commandScope={commandScope}
      favoriteWorkspaceBase={
        isWorkspaceScopeRoute
          ? currentProjectId
            ? `/projects/${currentProjectId}`
            : workspaceBase
          : null
      }
      resolvePermissionName={resolvePermissionName}
      showNavSkeleton={false}
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
