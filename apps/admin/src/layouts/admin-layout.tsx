import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { type PropsWithChildren, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { getProjectDetail, listProjects } from "@/api/projects";
import { resolveProjectSceneNavItems } from "@/constants/menu/project-scene";
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
import { extractWorkspaceBaseFromPath } from "@/layouts/admin-scene-utils";
import { buildAdminTopbarBreadcrumbs } from "@/lib/admin-topbar-breadcrumbs";
import { projectHomePath, projectsHomePath } from "@/lib/routing/workspace-routing";
import {
  mapProjectListItemToSidebarBrowseProject,
  mapProjectToListItem,
} from "@/pages/usercenter/projects/project-list-items";

export function AdminLayout({ children }: PropsWithChildren) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
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
  const projectIdFromPath = workspaceBase?.replace(/^\/projects\//, "") ?? null;
  const effectiveProjectId = projectIdFromPath ?? currentProjectId;

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

  const projectsQuery = useQuery({
    queryKey: ["workspace-nav", "projects", effectiveWorkspaceId, sessionVersion],
    enabled: Boolean(accessToken && effectiveWorkspaceId),
    queryFn: async () => {
      const items = await listProjects({
        archived: false,
        page: 1,
        size: 100,
        workspaceId: String(effectiveWorkspaceId),
      });

      return items.items
        .map(mapProjectToListItem)
        .sort((left, right) => left.name.localeCompare(right.name));
    },
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const projectDetailQuery = useQuery({
    queryKey: ["project", "detail", effectiveProjectId, sessionVersion],
    enabled: Boolean(accessToken && isWorkspaceScopeRoute && effectiveProjectId),
    queryFn: async () => getProjectDetail(String(effectiveProjectId)),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const listedBrowseProjects = useMemo(
    () => (projectsQuery.data ?? []).map(mapProjectListItemToSidebarBrowseProject),
    [projectsQuery.data],
  );

  const activeBrowseProject = useMemo(() => {
    const project = projectDetailQuery.data?.project;
    if (!project) return null;
    return {
      projectId: project.id,
      workspaceId: project.workspaceId,
      name: project.name,
      description: project.description,
      enterable: project.isActive,
      iconMode: project.iconMode,
      iconColor: project.iconColor,
      iconGlyph: project.iconGlyph ?? null,
      iconEmoji: project.iconEmoji ?? null,
      iconUrl: project.iconUrl,
    };
  }, [projectDetailQuery.data?.project]);

  const browseProjects = useMemo(() => {
    if (!activeBrowseProject) return listedBrowseProjects;
    if (
      listedBrowseProjects.some((project) => project.projectId === activeBrowseProject.projectId)
    ) {
      return listedBrowseProjects;
    }
    return [activeBrowseProject, ...listedBrowseProjects];
  }, [activeBrowseProject, listedBrowseProjects]);

  const topbarProject = useMemo(() => {
    if (!isWorkspaceScopeRoute || !effectiveProjectId) return null;
    return (
      browseProjects.find((project) => project.projectId === String(effectiveProjectId)) ?? null
    );
  }, [browseProjects, effectiveProjectId, isWorkspaceScopeRoute]);

  const mainItems = useMemo(
    () =>
      isWorkspaceScopeRoute && effectiveProjectId
        ? resolveProjectSceneNavItems(String(effectiveProjectId))
        : [],
    [effectiveProjectId, isWorkspaceScopeRoute],
  );
  const topbarBreadcrumbs = useMemo(
    () => buildAdminTopbarBreadcrumbs(mainItems, pathname),
    [mainItems, pathname],
  );
  const topbarProjectMenuProjects = useMemo(() => {
    if (!topbarProject) return [];
    return browseProjects.filter((project) => project.workspaceId === topbarProject.workspaceId);
  }, [browseProjects, topbarProject]);

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
        projectId: null,
        organizationId: null,
      } as const;
    }

    return {
      kind: "workspace",
      pathname,
      workspaceId: effectiveWorkspaceId ? String(effectiveWorkspaceId) : null,
      projectId: effectiveProjectId ? String(effectiveProjectId) : null,
      organizationId: workspaceDetailQuery.data?.organizationId ?? null,
    } as const;
  }, [
    effectiveProjectId,
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
      renderTopbar={() => (
        <AdminTopbar
          project={topbarProject}
          breadcrumbs={topbarBreadcrumbs}
          onNavigate={(to) => {
            void navigate({ to: to as never });
          }}
          projectMenu={{
            projects: topbarProjectMenuProjects,
            activeProjectId: effectiveProjectId,
            onProjectSelect: (projectId) => {
              void navigate({ to: projectHomePath(projectId) as never });
            },
            onAllProjectsSelect: () => {
              void navigate({ to: projectsHomePath() as never });
            },
            onHomeSelect: () => {
              void navigate({ to: "/" as never });
            },
          }}
        />
      )}
      mainItems={isWorkspaceScopeRoute ? mainItems : []}
      commandScope={commandScope}
      browseProjects={browseProjects}
      activeBrowseProjectId={isWorkspaceScopeRoute ? effectiveProjectId : null}
      favoriteWorkspaceBase={
        isWorkspaceScopeRoute
          ? effectiveProjectId
            ? `/projects/${effectiveProjectId}`
            : workspaceBase
          : null
      }
      resolvePermissionName={resolvePermissionName}
      showNavSkeleton={false}
      sidebarCollapsible="icon"
      loading={false}
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
