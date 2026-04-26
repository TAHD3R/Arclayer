import { useQuery } from "@tanstack/react-query";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { listProjects } from "@/api/projects";
import { AdminTopbar } from "@/components/layout/admin-topbar";
import { ProjectActionDialogs } from "@/pages/usercenter/projects/components/usercenter-projects-dialogs";
import { ProjectActionsDropdown } from "@/pages/usercenter/projects/components/project-actions-dropdown";
import { ProjectInlineNameEditor } from "@/pages/usercenter/projects/components/project-inline-name-editor";
import { useProjectMenuActions } from "@/pages/usercenter/projects/hooks/use-project-menu-actions";
import {
  mapProjectListItemToSidebarBrowseProject,
  mapProjectToListItem,
} from "@/pages/usercenter/projects/project-list-items";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { RouteTransition } from "@/components/layout/route-transition";
import { resolveUnifiedNavItems } from "@/constants/menu/unified";
import { useCurrentUserProfile } from "@/hooks/use-current-user-profile";
import { isFavoriteOverlayContentOnly } from "@/lib/routing/favorite-overlay";
import { projectHomePath } from "@/lib/routing/workspace-routing";
import { AdminSceneLayout } from "@/layouts/admin-scene-layout";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { SidebarInset, SidebarProvider } from "@arclayer/ui/sidebar";

const GLOBAL_COMMAND_SCOPE = {
  kind: "none",
  pathname: "/",
  workspaceId: null,
  projectId: null,
  organizationId: null,
} as const;

const PROJECT_NAME_MAX_LENGTH = 128;

export function GlobalLayout() {
  const { t } = useTranslation(["account", "common"]);
  const navigate = useNavigate();
  const searchStr = useRouterState({
    select: (s) => s.location.searchStr,
    structuralSharing: true,
  });
  const accessToken = useAuthStore((state) => state.accessToken);
  const sessionVersion = useAuthStore((state) => state.sessionVersion);
  const sidebarWidthPx = usePreferencesStore((state) => state.sidebarWidthPx);
  const setSidebarWidthPx = usePreferencesStore((state) => state.setSidebarWidthPx);
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const lastWorkspaceId = useWorkspaceStore((state) => state.lastWorkspaceId);
  const currentProjectId = useWorkspaceStore((state) => state.currentProjectId);
  const setCurrentWorkspaceId = useWorkspaceStore((state) => state.setCurrentWorkspaceId);
  const setCurrentProjectId = useWorkspaceStore((state) => state.setCurrentProjectId);
  const { isSuperAdmin } = useCurrentUserProfile();
  const contentOnlyMode = isFavoriteOverlayContentOnly(searchStr);
  const effectiveWorkspaceId = currentWorkspaceId ?? lastWorkspaceId;

  const handleEnterProject = useCallback(
    (project: { workspaceId: string; projectId: string }) => {
      setCurrentWorkspaceId(project.workspaceId);
      setCurrentProjectId(project.projectId);
      void navigate({ to: projectHomePath(project.projectId) as never });
    },
    [navigate, setCurrentProjectId, setCurrentWorkspaceId],
  );

  const handleManageProject = useCallback(
    (project: { workspaceId: string; projectId: string }) => {
      setCurrentWorkspaceId(project.workspaceId);
      setCurrentProjectId(project.projectId);
      void navigate({ to: `/projects/${project.projectId}/settings/general/` as never });
    },
    [navigate, setCurrentProjectId, setCurrentWorkspaceId],
  );

  const projectMenuActions = useProjectMenuActions({
    workspaceId: effectiveWorkspaceId ?? undefined,
    t,
    onEnterProject: handleEnterProject,
    onManageProject: handleManageProject,
  });

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

  const unifiedProjects = useMemo(
    () =>
      (projectsQuery.data ?? []).map((project) => ({
        projectId: project.projectId,
        workspaceId: project.workspaceId,
        name: project.name,
        description: project.description,
        enterable: project.enterable,
        renderLabel: () => (
          <ProjectInlineNameEditor
            editing={
              projectMenuActions.editingProjectId === project.projectId &&
              projectMenuActions.editingProjectField === "name"
            }
            value={project.name}
            draftValue={projectMenuActions.editingProjectName}
            ariaLabel={t("account:ACCOUNT_PROJECTS_RENAME_INPUT_LABEL")}
            maxLength={PROJECT_NAME_MAX_LENGTH}
            counterPlacement="suffix"
            className="block min-w-0 flex-1 truncate"
            containerClassName="min-w-0 flex-1"
            inputClassName="h-8 text-callout"
            counterClassName="right-2"
            onDraftChange={projectMenuActions.setEditingProjectName}
            onCommit={() => void projectMenuActions.commitProjectEdit(project, "name")}
            onCancel={projectMenuActions.cancelProjectEdit}
          />
        ),
        actionRenderer: () => (
          <ProjectActionsDropdown
            menuItems={projectMenuActions
              .buildMenuItems(project)
              .map((item) => {
                if (item.type === "divider" || item.key !== "edit-project") {
                  return item;
                }

                const nextItem = Object.assign({}, item);
                nextItem.children =
                  item.children?.filter(
                    (child): child is Exclude<typeof child, { type: "divider" }> =>
                      child.key !== "edit-description",
                  ) ?? [];
                return nextItem;
              })
              .filter((item) =>
                item.type === "divider" ? true : (item.children?.length ?? 1) > 0,
              )}
            onPrepareMenu={() => {
              void projectMenuActions.prefetchProjectDangerCapabilities(project.projectId);
            }}
            buttonClassName="size-6 rounded-sm text-label-secondary opacity-0 transition-opacity duration-150 hover:bg-accent/70 hover:text-label-primary group-hover/nav-item:opacity-100 group-focus-within/nav-item:opacity-100"
          />
        ),
      })),
    [
      t,
      projectMenuActions.buildMenuItems,
      projectMenuActions.cancelProjectEdit,
      projectMenuActions.commitProjectEdit,
      projectMenuActions.editingProjectField,
      projectMenuActions.editingProjectId,
      projectMenuActions.editingProjectName,
      projectMenuActions.setEditingProjectName,
      projectsQuery.data,
    ],
  );

  const navItems = useMemo(
    () =>
      resolveUnifiedNavItems({
        isSuperAdmin,
        projects: unifiedProjects,
        activeProjectId: currentProjectId,
      }),
    [currentProjectId, isSuperAdmin, unifiedProjects],
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
              <div className="flex-1 min-h-0 overflow-auto">
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
      renderTopbar={() => <AdminTopbar />}
      mainItems={navItems}
      commandScope={GLOBAL_COMMAND_SCOPE}
      browseProjects={browseProjects}
      activeBrowseProjectId={currentProjectId}
      sidebarCollapsible="icon"
    >
      <Outlet />
      <ProjectActionDialogs
        t={t}
        archiveDialog={projectMenuActions.archiveDialog}
        deleteDialog={projectMenuActions.deleteDialog}
        iconDialog={projectMenuActions.iconDialog}
      />
    </AdminSceneLayout>
  );
}
