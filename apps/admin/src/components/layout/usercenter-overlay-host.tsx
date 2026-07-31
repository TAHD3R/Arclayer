import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { resolveSettingsNavItems } from "@/constants/menu/settings";
import { useSettingsScreen } from "@/components/layout/settings-screen-provider";
import { useWorkspaceRolesAccess } from "@/hooks/use-workspace-roles-access";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { getUsercenterOverlayItem } from "@/pages/usercenter/shared/usercenter-overlay-registry";
import { SettingsFrame } from "@/pages/settings/settings-shell";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { Button } from "@arclayer/ui/button";
import { ExpandableScreen, ExpandableScreenContent } from "@arclayer/ui/expandable-screen";
import { TeamMembersView } from "@/pages/workspaces/team/members/components/team-members-view";
import { TeamInvitationsPage } from "@/pages/workspaces/team/invitations/page";
import { TeamRolesPage } from "@/pages/workspaces/team/roles/page";

export function SettingsScreenHost() {
  const { t } = useTranslation("team");
  const settingsScreen = useSettingsScreen();
  const isOpen = settingsScreen.state.open;
  const activeScreen = settingsScreen.state.screen;
  const activeItem = getUsercenterOverlayItem(activeScreen);
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const lastWorkspaceId = useWorkspaceStore((state) => state.lastWorkspaceId);
  const workspaceId = currentWorkspaceId ?? lastWorkspaceId;
  const rolesAccess = useWorkspaceRolesAccess(workspaceId ?? null);
  const settingsNavItems = resolveSettingsNavItems(rolesAccess.status);
  const [workspaceMembersInviteOpen, setWorkspaceMembersInviteOpen] = useState(false);
  const [workspaceInvitationLinkOpen, setWorkspaceInvitationLinkOpen] = useState(false);
  const [workspaceInvitationEmailOpen, setWorkspaceInvitationEmailOpen] = useState(false);
  const [workspaceRoleCreateOpen, setWorkspaceRoleCreateOpen] = useState(false);

  useEffect(() => {
    if (!settingsScreen.state.open) return;
    if (activeScreen === "workspace.members" && settingsScreen.state.section === "invite-member") {
      setWorkspaceMembersInviteOpen(true);
    }
    if (
      activeScreen === "workspace.invitations" &&
      settingsScreen.state.section === "create-invitation"
    ) {
      setWorkspaceInvitationEmailOpen(true);
    }
    if (
      activeScreen === "workspace.invitations" &&
      settingsScreen.state.section === "invite-links"
    ) {
      setWorkspaceInvitationLinkOpen(true);
    }
    if (activeScreen === "workspace.roles" && settingsScreen.state.section === "create-role") {
      setWorkspaceRoleCreateOpen(true);
    }
  }, [activeScreen, settingsScreen.state.open, settingsScreen.state.section]);

  useEffect(() => {
    if (!isOpen || activeScreen !== "workspace.roles") return;
    if (rolesAccess.status !== "unavailable") return;
    settingsScreen.switchSettingsScreen("workspace.plan-usage");
  }, [activeScreen, isOpen, rolesAccess.status, settingsScreen]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) settingsScreen.closeSettings();
    },
    [settingsScreen],
  );

  const action = !isOpen ? undefined : activeScreen === "workspace.members" ? (
    <Button onClick={() => setWorkspaceMembersInviteOpen(true)}>
      <Plus size={16} />
      {t("TEAM_INVITE_MEMBER")}
    </Button>
  ) : activeScreen === "workspace.invitations" ? (
    <div className="flex items-center gap-2">
      <Button variant="outline" onClick={() => setWorkspaceInvitationLinkOpen(true)}>
        {t("TEAM_INVITE_CREATE_LINK_ACTION")}
      </Button>
      <Button onClick={() => setWorkspaceInvitationEmailOpen(true)}>
        <Plus size={16} />
        {t("common:ORG_MEMBERS_INVITE")}
      </Button>
    </div>
  ) : activeScreen === "workspace.roles" && rolesAccess.status === "available" ? (
    <Button onClick={() => setWorkspaceRoleCreateOpen(true)}>
      <Plus size={16} />
      {t("TEAM_ROLES_ADD_ROLE")}
    </Button>
  ) : undefined;
  const renderedContent = !isOpen ? null : activeScreen === "workspace.members" ? (
    <TeamMembersView
      workspaceIdOverride={workspaceId ?? null}
      inviteOpen={workspaceMembersInviteOpen}
      onInviteOpenChange={setWorkspaceMembersInviteOpen}
      embedded
    />
  ) : activeScreen === "workspace.invitations" ? (
    <TeamInvitationsPage
      workspaceIdOverride={workspaceId ?? null}
      inviteLinkOpen={workspaceInvitationLinkOpen}
      onInviteLinkOpenChange={setWorkspaceInvitationLinkOpen}
      inviteEmailOpen={workspaceInvitationEmailOpen}
      onInviteEmailOpenChange={setWorkspaceInvitationEmailOpen}
      embedded
    />
  ) : activeScreen === "workspace.roles" && rolesAccess.status === "available" ? (
    <TeamRolesPage
      workspaceIdOverride={workspaceId ?? null}
      createOpen={workspaceRoleCreateOpen}
      onCreateOpenChange={setWorkspaceRoleCreateOpen}
      embedded
    />
  ) : activeScreen === "workspace.roles" ? (
    <ContentGuard
      loading={rolesAccess.status === "loading"}
      error={rolesAccess.status === "error" ? rolesAccess.error : null}
      onRetry={() => void rolesAccess.refetch()}
      container="raw"
      loadingVariant="form"
    >
      <div />
    </ContentGuard>
  ) : (
    activeItem.render({
      targetSection: settingsScreen.state.section,
      payload: settingsScreen.state.payload,
      focusRequestId: settingsScreen.state.focusRequestId,
    })
  );

  return (
    <ExpandableScreen
      expanded={isOpen}
      onExpandChange={handleOpenChange}
      layoutId="global-usercenter-overlay"
    >
      <ExpandableScreenContent
        showCloseButton={false}
        className="border border-border/80 bg-background shadow-2xl"
      >
        <SettingsFrame
          activeScreen={activeScreen}
          items={settingsNavItems}
          action={action}
          onClose={() => handleOpenChange(false)}
          onSelectItem={(item) =>
            settingsScreen.switchSettingsScreen(
              item.screen === "workspace.roles" && rolesAccess.status === "unavailable"
                ? "workspace.plan-usage"
                : item.screen,
            )
          }
          className="h-full w-full max-w-none rounded-none border-0 shadow-none"
        >
          {renderedContent}
        </SettingsFrame>
      </ExpandableScreenContent>
    </ExpandableScreen>
  );
}

export const UsercenterOverlayHost = SettingsScreenHost;
