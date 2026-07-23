import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { type PropsWithChildren, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { buildContentModelsQueryKey, listAllContentModels } from "@/api/content";
import { getProjectDetail, listProjects } from "@/api/projects";
import { resolveProjectSceneNavItems } from "@/constants/menu/project-scene";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { useFavoritesStore } from "@/stores/use-favorites-store";
import { getWorkspaceDetail } from "@/api/workspaces";
import { useWorkspaceLocalization } from "@/hooks/use-workspace-localization";
import { resolvePermissionNameI18nKey } from "@/lib/auth/rbac-permissions";
import { isFavoriteOverlayContentOnly } from "@/lib/routing/favorite-overlay";
import { resolveNotificationsSourcePath } from "@/lib/routing/notifications-source";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { RouteTransition } from "@/components/layout/route-transition";
import { AdminTopbar } from "@/components/layout/admin-topbar";
import { AdminSceneLayout } from "@/layouts/admin-scene-layout";
import { SidebarInset, SidebarProvider } from "@arclayer/ui/sidebar";
import { extractWorkspaceBaseFromPath } from "@/layouts/admin-scene-utils";
import { buildAdminTopbarBreadcrumbs } from "@/lib/admin-topbar-breadcrumbs";
import { projectContentModelsEditPath } from "@/lib/routing/project-content-routing";
import { projectHomePath, projectsHomePath } from "@/lib/routing/workspace-routing";
import {
  mapProjectListItemToSidebarBrowseProject,
  mapProjectToListItem,
} from "@/pages/usercenter/projects/project-list-items";

function readContentModelEditModelId(path: string): string | null {
  const [pathname, search = ""] = path.split("?", 2);
  if (!/\/content\/models\/edit\/?$/.test(pathname)) return null;
  const modelId = new URLSearchParams(search).get("modelId")?.trim();
  return modelId || null;
}

export function AdminLayout({ children }: PropsWithChildren) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { pathname, searchStr } = useRouterState({
    select: (s) => ({
      pathname: s.resolvedLocation?.pathname ?? s.location.pathname,
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
  const favoritePaths = useFavoritesStore((s) => s.paths);
  const workspaceIdFromStore = useWorkspaceStore((s) => s.currentWorkspaceId);
  const currentProjectId = useWorkspaceStore((s) => s.currentProjectId);

  const sidebarPathname = resolveNotificationsSourcePath(pathname, searchStr) ?? pathname;
  const workspaceBase = useMemo(
    () => extractWorkspaceBaseFromPath(sidebarPathname),
    [sidebarPathname],
  );
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

  const contentModelEditModelId = useMemo(() => {
    return readContentModelEditModelId(`${pathname}${searchStr}`);
  }, [pathname, searchStr]);
  const hasContentModelEditFavorite = useMemo(
    () => favoritePaths.some((path) => Boolean(readContentModelEditModelId(path))),
    [favoritePaths],
  );

  const contentModelBreadcrumbQuery = useQuery({
    queryKey: effectiveProjectId
      ? buildContentModelsQueryKey(String(effectiveProjectId))
      : ["content", "models", "missing-project"],
    enabled: Boolean(
      accessToken && effectiveProjectId && (contentModelEditModelId || hasContentModelEditFavorite),
    ),
    queryFn: () => listAllContentModels(String(effectiveProjectId)),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const topbarBreadcrumbs = useMemo(() => {
    const baseBreadcrumbs = buildAdminTopbarBreadcrumbs(mainItems, sidebarPathname);
    if (!contentModelEditModelId) return baseBreadcrumbs;

    const model = (contentModelBreadcrumbQuery.data ?? []).find(
      (item) => item.id === contentModelEditModelId,
    );
    return [
      ...baseBreadcrumbs.map((item) => Object.assign({}, item, { isCurrent: false })),
      {
        key: `content-model:${contentModelEditModelId}`,
        label: model?.name ?? t("content:CONTENT_MODELS_EDIT_BREADCRUMB_FALLBACK"),
        disabled: true,
        isCurrent: true,
      },
    ];
  }, [contentModelBreadcrumbQuery.data, contentModelEditModelId, mainItems, sidebarPathname, t]);
  const favoriteDynamicLabels = useMemo(() => {
    if (!effectiveProjectId) return undefined;
    const labels = new Map<string, string>();
    for (const model of contentModelBreadcrumbQuery.data ?? []) {
      labels.set(projectContentModelsEditPath(String(effectiveProjectId), model.id), model.name);
    }
    return labels;
  }, [contentModelBreadcrumbQuery.data, effectiveProjectId]);
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
        pathname: sidebarPathname,
        workspaceId: null,
        projectId: null,
      } as const;
    }

    return {
      kind: "workspace",
      pathname: sidebarPathname,
      workspaceId: effectiveWorkspaceId ? String(effectiveWorkspaceId) : null,
      projectId: effectiveProjectId ? String(effectiveProjectId) : null,
    } as const;
  }, [effectiveProjectId, effectiveWorkspaceId, isWorkspaceScopeRoute, sidebarPathname]);

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
            <div className="flex-1 min-h-0 overflow-auto [scrollbar-gutter:auto]">
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
      sidebarPathnameOverride={sidebarPathname}
      favoriteWorkspaceBase={
        isWorkspaceScopeRoute
          ? effectiveProjectId
            ? `/projects/${effectiveProjectId}`
            : workspaceBase
          : null
      }
      favoriteDynamicLabels={favoriteDynamicLabels}
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
