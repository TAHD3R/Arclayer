import { useCallback, useState } from "react";
import { useNavigate, useRouter, useRouterState, useSearch } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  buildUsercenterOverlayNavigate,
  isSettingsOverlayTab,
  resolveSettingsOverlayTabFromPath,
} from "@/lib/routing/usercenter-overlay";
import { projectHomePath } from "@/lib/routing/workspace-routing";
import { getUsercenterOverlayItem } from "@/pages/usercenter/shared/usercenter-overlay-registry";
import { SettingsFrame } from "@/pages/settings/settings-shell";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type { AdminNavItem } from "@/types/admin-nav";
import { Button } from "@arclayer/ui/button";
import { ExpandableScreen, ExpandableScreenContent } from "@arclayer/ui/expandable-screen";
import { TeamMembersView } from "@/pages/workspaces/team/members/components/team-members-view";
import { TeamInvitationsPage } from "@/pages/workspaces/team/invitations/page";
import { TeamRolesPage } from "@/pages/workspaces/team/roles/page";

export function UsercenterOverlayHost() {
  const { t } = useTranslation("team");
  const { personalSettings } = useSearch({ from: "__root__" });
  const navigate = useNavigate();
  const router = useRouter();
  const location = useRouterState({
    select: (state) => ({
      pathname: state.location.pathname,
      hash: state.location.hash,
    }),
    structuralSharing: true,
  });

  const activeTab = personalSettings ?? null;
  const activeItem = activeTab ? getUsercenterOverlayItem(activeTab) : null;
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const lastWorkspaceId = useWorkspaceStore((state) => state.lastWorkspaceId);
  const workspaceId = currentWorkspaceId ?? lastWorkspaceId;
  const [workspaceMembersInviteOpen, setWorkspaceMembersInviteOpen] = useState(false);
  const [workspaceInvitationLinkOpen, setWorkspaceInvitationLinkOpen] = useState(false);
  const [workspaceInvitationEmailOpen, setWorkspaceInvitationEmailOpen] = useState(false);
  const [workspaceRoleCreateOpen, setWorkspaceRoleCreateOpen] = useState(false);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open || !activeTab) return;
      const historyIndex =
        typeof window !== "undefined"
          ? (window.history.state as { __TSR_index?: number } | null)?.__TSR_index
          : undefined;
      if (historyIndex === 0) {
        const projectId =
          useWorkspaceStore.getState().currentProjectId ??
          useWorkspaceStore.getState().lastProjectId;
        void navigate({
          to: (projectId ? `${projectHomePath(projectId)}/` : "/") as never,
          replace: true,
        });
        return;
      }
      router.history.back();
    },
    [activeTab, navigate, router],
  );

  const handleTabChange = useCallback(
    (nextValue: string) => {
      if (!isSettingsOverlayTab(nextValue)) return;
      void navigate(
        buildUsercenterOverlayNavigate({
          currentLocation: location,
          tab: nextValue,
          replace: true,
        }),
      );
    },
    [location, navigate],
  );

  const handleItemSelect = useCallback(
    (item: AdminNavItem) => {
      const nextTab = item.to ? resolveSettingsOverlayTabFromPath(item.to) : null;
      if (!nextTab) return;
      handleTabChange(nextTab);
    },
    [handleTabChange],
  );

  if (!activeItem) return null;
  const action =
    activeTab === "workspace-members" ? (
      <Button onClick={() => setWorkspaceMembersInviteOpen(true)}>
        <Plus size={16} />
        {t("TEAM_INVITE_MEMBER")}
      </Button>
    ) : activeTab === "workspace-invitations" ? (
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => setWorkspaceInvitationLinkOpen(true)}>
          {t("TEAM_INVITE_CREATE_LINK_ACTION")}
        </Button>
        <Button onClick={() => setWorkspaceInvitationEmailOpen(true)}>
          <Plus size={16} />
          {t("common:ORG_MEMBERS_INVITE")}
        </Button>
      </div>
    ) : activeTab === "workspace-roles" ? (
      <Button onClick={() => setWorkspaceRoleCreateOpen(true)}>
        <Plus size={16} />
        {t("TEAM_ROLES_ADD_ROLE")}
      </Button>
    ) : undefined;
  const renderedContent =
    activeTab === "workspace-members" ? (
      <TeamMembersView
        workspaceIdOverride={workspaceId ?? null}
        inviteOpen={workspaceMembersInviteOpen}
        onInviteOpenChange={setWorkspaceMembersInviteOpen}
        embedded
      />
    ) : activeTab === "workspace-invitations" ? (
      <TeamInvitationsPage
        workspaceIdOverride={workspaceId ?? null}
        inviteLinkOpen={workspaceInvitationLinkOpen}
        onInviteLinkOpenChange={setWorkspaceInvitationLinkOpen}
        inviteEmailOpen={workspaceInvitationEmailOpen}
        onInviteEmailOpenChange={setWorkspaceInvitationEmailOpen}
        embedded
      />
    ) : activeTab === "workspace-roles" ? (
      <TeamRolesPage
        workspaceIdOverride={workspaceId ?? null}
        createOpen={workspaceRoleCreateOpen}
        onCreateOpenChange={setWorkspaceRoleCreateOpen}
        embedded
      />
    ) : (
      activeItem.render()
    );

  return (
    <ExpandableScreen
      expanded
      onExpandChange={handleOpenChange}
      layoutId="global-usercenter-overlay"
    >
      <ExpandableScreenContent
        showCloseButton={false}
        className="border border-border/80 bg-background shadow-2xl"
      >
        <SettingsFrame
          activePath={activeItem.to}
          activeTab={activeItem.tab}
          action={action}
          expandedGutters
          onClose={() => handleOpenChange(false)}
          onSelectItem={handleItemSelect}
          className="h-full w-full max-w-none rounded-none border-0 shadow-none"
        >
          {renderedContent}
        </SettingsFrame>
      </ExpandableScreenContent>
    </ExpandableScreen>
  );
}
