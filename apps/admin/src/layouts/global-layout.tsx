import { useQuery } from "@tanstack/react-query";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { PanelsTopLeft } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { listAllOrganizationWorkspaces } from "@/api/organization-workspaces";
import { AdminTopbar } from "@/components/layout/admin-topbar";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { RouteTransition } from "@/components/layout/route-transition";
import { resolveGlobalNavItems } from "@/constants/menu/global";
import { useCurrentUserProfile } from "@/hooks/use-current-user-profile";
import { isFavoriteOverlayContentOnly } from "@/lib/routing/favorite-overlay";
import { workspaceHomePath } from "@/lib/routing/workspace-routing";
import { AdminSceneLayout } from "@/layouts/admin-scene-layout";
import { WorkspaceActionDialogs } from "@/pages/usercenter/workspaces/components/usercenter-workspaces-dialogs";
import { WorkspaceActionsDropdown } from "@/pages/usercenter/workspaces/components/workspace-actions-dropdown";
import { WorkspaceInlineNameEditor } from "@/pages/usercenter/workspaces/components/workspace-inline-name-editor";
import { useWorkspaceMenuActions } from "@/pages/usercenter/workspaces/hooks/use-workspace-menu-actions";
import { mapOrganizationWorkspaceToListItem } from "@/pages/usercenter/workspaces/workspace-list-items";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { SidebarInset, SidebarProvider } from "@arclayer/ui/sidebar";

const GLOBAL_COMMAND_SCOPE = {
  kind: "none",
  pathname: "/",
  workspaceId: null,
  organizationId: null,
} as const;

const WORKSPACE_NAME_MAX_LENGTH = 128;

export function GlobalLayout() {
  const { t } = useTranslation(["account", "common"]);
  const navigate = useNavigate();
  const searchStr = useRouterState({
    select: (s) => s.location.searchStr,
    structuralSharing: true,
  });
  const accessToken = useAuthStore((state) => state.accessToken);
  const sessionVersion = useAuthStore((state) => state.sessionVersion);
  const setCurrentWorkspaceId = useWorkspaceStore((state) => state.setCurrentWorkspaceId);
  const { isSuperAdmin } = useCurrentUserProfile();
  const contentOnlyMode = isFavoriteOverlayContentOnly(searchStr);

  const handleEnterWorkspace = useCallback(
    (workspaceId: string) => {
      setCurrentWorkspaceId(workspaceId);
      void navigate({ to: workspaceHomePath(workspaceId) as never });
    },
    [navigate, setCurrentWorkspaceId],
  );

  const handleManageWorkspace = useCallback(
    (workspaceId: string) => {
      setCurrentWorkspaceId(workspaceId);
      void navigate({ to: `/w/${workspaceId}/settings/workspace/` as never });
    },
    [navigate, setCurrentWorkspaceId],
  );

  const workspaceMenuActions = useWorkspaceMenuActions({
    organizationId: undefined,
    t,
    onEnterWorkspace: handleEnterWorkspace,
    onManageWorkspace: handleManageWorkspace,
  });

  const workspacesQuery = useQuery({
    queryKey: ["global-nav", "workspaces", sessionVersion],
    enabled: Boolean(accessToken),
    queryFn: async () => {
      const items = await listAllOrganizationWorkspaces({ archived: false });

      return items
        .map(mapOrganizationWorkspaceToListItem)
        .sort((left, right) => left.name.localeCompare(right.name));
    },
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const workspaceChildren = useMemo(
    () =>
      (workspacesQuery.data ?? []).map((workspace) => ({
        key: `global.workspaces.${workspace.workspaceId}`,
        label: workspace.name,
        to: workspaceHomePath(workspace.workspaceId),
        icon: PanelsTopLeft,
        disabled: !workspace.enterable,
        renderLabel: () => (
          <WorkspaceInlineNameEditor
            editing={
              workspaceMenuActions.editingWorkspaceId === workspace.workspaceId &&
              workspaceMenuActions.editingWorkspaceField === "name"
            }
            value={workspace.name}
            draftValue={workspaceMenuActions.editingWorkspaceName}
            ariaLabel={t("common:ORG_WORKSPACES_RENAME_INPUT_LABEL")}
            maxLength={WORKSPACE_NAME_MAX_LENGTH}
            counterPlacement="suffix"
            className="block min-w-0 flex-1 truncate"
            containerClassName="min-w-0 flex-1"
            inputClassName="h-8 text-callout"
            counterClassName="right-2"
            onDraftChange={workspaceMenuActions.setEditingWorkspaceName}
            onCommit={() => void workspaceMenuActions.commitWorkspaceEdit(workspace, "name")}
            onCancel={workspaceMenuActions.cancelWorkspaceEdit}
          />
        ),
        actionRenderer: () => (
          <WorkspaceActionsDropdown
            menuItems={workspaceMenuActions
              .buildMenuItems(workspace)
              .map((item) => {
                if (item.type === "divider" || item.key !== "edit-workspace") {
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
              void workspaceMenuActions.prefetchWorkspaceDangerCapabilities(workspace.workspaceId);
            }}
            buttonClassName="size-6 rounded-sm text-label-secondary opacity-0 transition-opacity duration-150 hover:bg-accent/70 hover:text-label-primary group-hover/nav-item:opacity-100 group-focus-within/nav-item:opacity-100"
          />
        ),
      })),
    [
      t,
      workspaceMenuActions.buildMenuItems,
      workspaceMenuActions.cancelWorkspaceEdit,
      workspaceMenuActions.commitWorkspaceEdit,
      workspaceMenuActions.editingWorkspaceField,
      workspaceMenuActions.editingWorkspaceId,
      workspaceMenuActions.editingWorkspaceName,
      workspaceMenuActions.setEditingWorkspaceName,
      workspacesQuery.data,
    ],
  );

  const navItems = useMemo(
    () => resolveGlobalNavItems({ isSuperAdmin, workspaceChildren }),
    [isSuperAdmin, workspaceChildren],
  );

  if (contentOnlyMode) {
    return (
      <SidebarProvider
        open
        defaultOpen
        onOpenChange={() => undefined}
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
      notificationQueryScope="global-shell"
      renderTopbar={(topbar) => (
        <AdminTopbar
          navItems={navItems}
          commandScope={GLOBAL_COMMAND_SCOPE}
          notificationOpen={topbar.notificationOpen}
          showNotificationsBadge={topbar.showNotificationsBadge}
          unreadCount={topbar.unreadCount}
          onNotificationToggle={topbar.onNotificationToggle}
          leadingMode="logo"
          sidebarToggleMode="mobile-only"
        />
      )}
      mainItems={navItems}
      sidebarCollapsible="icon"
    >
      <Outlet />
      <WorkspaceActionDialogs
        t={t}
        archiveDialog={workspaceMenuActions.archiveDialog}
        deleteDialog={workspaceMenuActions.deleteDialog}
        iconDialog={workspaceMenuActions.iconDialog}
      />
    </AdminSceneLayout>
  );
}
