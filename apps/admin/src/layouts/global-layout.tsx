import { useQuery } from "@tanstack/react-query";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";

import { listProjects } from "@/api/projects";
import { AdminTopbar } from "@/components/layout/admin-topbar";
import {
  mapProjectListItemToSidebarBrowseProject,
  mapProjectToListItem,
} from "@/pages/usercenter/projects/project-list-items";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { RouteTransition } from "@/components/layout/route-transition";
import { resolveGlobalNavItems } from "@/constants/menu/global";
import { useCurrentUserProfile } from "@/hooks/use-current-user-profile";
import { isFavoriteOverlayContentOnly } from "@/lib/routing/favorite-overlay";
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
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const lastWorkspaceId = useWorkspaceStore((state) => state.lastWorkspaceId);
  const { isSuperAdmin } = useCurrentUserProfile();
  const contentOnlyMode = isFavoriteOverlayContentOnly(searchStr);
  const effectiveWorkspaceId = currentWorkspaceId ?? lastWorkspaceId;

  const projectsQuery = useQuery({
    queryKey: ["global-nav", "projects", effectiveWorkspaceId, sessionVersion],
    enabled: Boolean(accessToken && effectiveWorkspaceId),
    queryFn: async () => {
      const items = await listProjects({
        workspaceId: String(effectiveWorkspaceId),
        archived: false,
        page: 1,
        size: 100,
      });

      return items.items
        .map(mapProjectToListItem)
        .sort((left, right) => left.name.localeCompare(right.name));
    },
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const browseProjects = useMemo(
    () => (projectsQuery.data ?? []).map(mapProjectListItemToSidebarBrowseProject),
    [projectsQuery.data],
  );

  const navItems = useMemo(() => resolveGlobalNavItems({ isSuperAdmin }), [isSuperAdmin]);
  const topbarBreadcrumbs = useMemo(
    () => buildAdminTopbarBreadcrumbs(navItems, pathname),
    [navItems, pathname],
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
      sidebarPathnameOverride={pathname}
    >
      <Outlet />
    </AdminSceneLayout>
  );
}
