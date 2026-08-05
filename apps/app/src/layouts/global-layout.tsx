import { useQuery } from "@tanstack/react-query";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import { listProjects } from "@/api/projects";
import { AdminTopbar } from "@/components/layout/admin-topbar";
import {
  mapProjectListItemToSidebarBrowseProject,
  mapProjectToListItem,
} from "@/pages/usercenter/projects/project-list-items";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { RouteTransition } from "@/components/layout/route-transition";
import { GLOBAL_RECENT_PROJECT_LIMIT, resolveGlobalNavItems } from "@/constants/menu/global";
import { isFavoriteOverlayContentOnly } from "@/lib/routing/favorite-overlay";
import { resolveNotificationsSourcePath } from "@/lib/routing/notifications-source";
import { AdminSceneLayout } from "@/layouts/admin-scene-layout";
import { buildAdminTopbarBreadcrumbs } from "@/lib/admin-topbar-breadcrumbs";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { SidebarInset, SidebarProvider } from "@arclayer/ui/sidebar";

const GLOBAL_COMMAND_SCOPE = {
  kind: "none",
  pathname: "/",
  workspaceId: null,
  projectId: null,
} as const;

export function GlobalLayout() {
  const navigate = useNavigate();
  const { pathname, searchStr } = useRouterState({
    select: (s) => ({
      pathname: s.resolvedLocation?.pathname ?? s.location.pathname,
      searchStr: s.location.searchStr,
    }),
    structuralSharing: true,
  });
  const accessToken = useAuthStore((state) => state.accessToken);
  const sessionVersion = useAuthStore((state) => state.sessionVersion);
  const sidebarWidthPx = usePreferencesStore((state) => state.sidebarWidthPx);
  const setSidebarWidthPx = usePreferencesStore((state) => state.setSidebarWidthPx);
  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const setCurrentProjectId = useWorkspaceStore((state) => state.setCurrentProjectId);
  const contentOnlyMode = isFavoriteOverlayContentOnly(searchStr);
  const sidebarPathname = resolveNotificationsSourcePath(pathname, searchStr) ?? pathname;

  useEffect(() => {
    setCurrentProjectId(null);
  }, [setCurrentProjectId]);

  const projectsQuery = useQuery({
    queryKey: ["global-nav", "projects", workspaceId, sessionVersion],
    enabled: Boolean(accessToken && workspaceId),
    queryFn: async () => {
      const items = await listProjects({
        workspaceId: String(workspaceId),
        archived: false,
        ordering: "-updated_at",
        page: 1,
        size: 100,
      });

      return items.items.map(mapProjectToListItem);
    },
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const browseProjects = useMemo(
    () =>
      [...(projectsQuery.data ?? [])]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(mapProjectListItemToSidebarBrowseProject),
    [projectsQuery.data],
  );
  const recentProjects = useMemo(
    () =>
      (projectsQuery.data ?? [])
        .filter((project) => project.enterable)
        .slice(0, GLOBAL_RECENT_PROJECT_LIMIT)
        .map((project) => ({
          projectId: project.projectId,
          name: project.name,
          iconMode: project.iconMode,
          iconColor: project.iconColor,
          iconGlyph: project.iconGlyph,
          iconEmoji: project.iconEmoji,
          iconUrl: project.iconUrl,
        })),
    [projectsQuery.data],
  );

  const navItems = useMemo(() => resolveGlobalNavItems({ recentProjects }), [recentProjects]);
  const topbarBreadcrumbs = useMemo(
    () => buildAdminTopbarBreadcrumbs(navItems, sidebarPathname),
    [navItems, sidebarPathname],
  );

  if (contentOnlyMode) {
    return (
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
                <ContentGuard loading={false} error={null} container="raw" loadingVariant="form">
                  <RouteTransition className="h-full min-h-0 w-full">
                    <Outlet />
                  </RouteTransition>
                </ContentGuard>
              </div>
            </SidebarInset>
          </div>
        </div>
      </SidebarProvider>
    );
  }

  return (
    <AdminSceneLayout
      renderTopbar={() => (
        <AdminTopbar
          breadcrumbs={topbarBreadcrumbs}
          onNavigate={(to) => {
            void navigate({ to: to as never });
          }}
        />
      )}
      mainItems={navItems}
      commandScope={GLOBAL_COMMAND_SCOPE}
      browseProjects={browseProjects}
      activeBrowseProjectId={null}
      sidebarCollapsible="icon"
      sidebarPathnameOverride={sidebarPathname}
    >
      <Outlet />
    </AdminSceneLayout>
  );
}
