import { useRouterState } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SETTINGS_WORKSPACE_NAV_ITEMS } from "@/constants/menu/settings";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { ProjectDomainSettingsPage as ProjectDomainSettingsSurface } from "@/pages/projects/settings/domain/page";
import { ProjectSettingsPage as ProjectSettingsSurface } from "@/pages/projects/settings/project/page";
import { GeneralLocalizationSettingsPage } from "@/pages/projects/settings/site/localization/page";
import { WorkspacePermissionsSettingsPage } from "@/pages/workspaces/settings/workspace/permissions/page";
import { WorkspaceSettingsBasicsView } from "@/pages/workspaces/settings/workspace/basics/components/workspace-settings-basics-view";
import { TeamInvitationsPage } from "@/pages/workspaces/team/invitations/page";
import { TeamMembersView } from "@/pages/workspaces/team/members/components/team-members-view";
import { Button } from "@arclayer/ui/button";

import { ContextSettingsShell } from "./context-settings-shell";

export function WorkspaceGeneralSettingsPage(props: { workspaceId: string }) {
  const { t } = useTranslation("settings");
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
    structuralSharing: true,
  });

  return (
    <ContextSettingsShell
      title={t("SETTINGS_WORKSPACE_GENERAL_TITLE")}
      pathname={pathname}
      items={SETTINGS_WORKSPACE_NAV_ITEMS}
    >
      <WorkspaceSettingsBasicsView workspaceId={props.workspaceId} embedded />
    </ContextSettingsShell>
  );
}

export function WorkspaceMembersSettingsPage(props: {
  workspaceId: string;
  initialSearchQuery?: string;
  initialInspectMemberId?: string;
}) {
  const { t } = useTranslation("settings");
  const { t: tTeam } = useTranslation("team");
  const [inviteOpen, setInviteOpen] = useState(false);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
    structuralSharing: true,
  });

  return (
    <ContextSettingsShell
      title={t("SETTINGS_WORKSPACE_MEMBERS_TITLE")}
      pathname={pathname}
      items={SETTINGS_WORKSPACE_NAV_ITEMS}
      action={
        <Button onClick={() => setInviteOpen(true)}>
          <Plus size={16} />
          {tTeam("TEAM_INVITE_MEMBER")}
        </Button>
      }
    >
      <TeamMembersView
        workspaceIdOverride={props.workspaceId}
        initialSearchQuery={props.initialSearchQuery}
        initialInspectMemberId={props.initialInspectMemberId}
        inviteOpen={inviteOpen}
        onInviteOpenChange={setInviteOpen}
        embedded
      />
    </ContextSettingsShell>
  );
}

export function WorkspaceInvitationsSettingsPage(props: { workspaceId: string }) {
  const { t } = useTranslation("settings");
  const { t: tTeam } = useTranslation(["team", "common"]);
  const [inviteLinkOpen, setInviteLinkOpen] = useState(false);
  const [inviteEmailOpen, setInviteEmailOpen] = useState(false);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
    structuralSharing: true,
  });

  return (
    <ContextSettingsShell
      title={t("SETTINGS_WORKSPACE_INVITATIONS_TITLE")}
      pathname={pathname}
      items={SETTINGS_WORKSPACE_NAV_ITEMS}
      action={
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setInviteLinkOpen(true)}>
            {tTeam("TEAM_INVITE_CREATE_LINK_ACTION")}
          </Button>
          <Button onClick={() => setInviteEmailOpen(true)}>
            <Plus size={16} />
            {tTeam("common:ORG_MEMBERS_INVITE")}
          </Button>
        </div>
      }
    >
      <TeamInvitationsPage
        workspaceIdOverride={props.workspaceId}
        inviteLinkOpen={inviteLinkOpen}
        onInviteLinkOpenChange={setInviteLinkOpen}
        inviteEmailOpen={inviteEmailOpen}
        onInviteEmailOpenChange={setInviteEmailOpen}
        embedded
      />
    </ContextSettingsShell>
  );
}

export function WorkspaceRolesSettingsPage(props: { workspaceId: string }) {
  const { t } = useTranslation("settings");
  const { t: tTeam } = useTranslation("team");
  const [createOpen, setCreateOpen] = useState(false);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
    structuralSharing: true,
  });

  return (
    <ContextSettingsShell
      title={t("SETTINGS_WORKSPACE_ROLES_TITLE")}
      pathname={pathname}
      items={SETTINGS_WORKSPACE_NAV_ITEMS}
      action={
        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={16} />
          {tTeam("TEAM_ROLES_ADD_ROLE")}
        </Button>
      }
    >
      <WorkspacePermissionsSettingsPage
        workspaceId={props.workspaceId}
        createOpen={createOpen}
        onCreateOpenChange={setCreateOpen}
      />
    </ContextSettingsShell>
  );
}

export function ProjectGeneralSettingsPage(props: { projectId: string }) {
  return <ProjectSettingsSurface activeTab="general" projectId={props.projectId} />;
}

export function ProjectLocalizationSettingsPage(props: { projectId: string }) {
  return <GeneralLocalizationSettingsPage projectId={props.projectId} />;
}

function ProjectStandalonePage(props: { titleKey: string; descriptionKey?: string }) {
  const { t } = useTranslation(["account", "common"]);

  return (
    <DefaultPage
      title={t(props.titleKey)}
      description={t(props.descriptionKey ?? "common:PAGE_COMING_SOON_DESC")}
      showFavoriteToggle={false}
      pageFrame="full"
      largeViewportGutters={false}
      className="min-h-full"
      contentClassName="min-h-full"
      contentContainerClassName="min-h-full"
    />
  );
}

export function ProjectDomainSettingsPage(props: { projectId: string }) {
  return <ProjectDomainSettingsSurface projectId={props.projectId} />;
}

export function ProjectSeoSettingsPage() {
  return <ProjectStandalonePage titleKey="account:SETTINGS_NAV_PROJECT_SEO" />;
}

export function ProjectApiKeysSettingsPage(props: { projectId: string }) {
  return <ProjectSettingsSurface activeTab="api" projectId={props.projectId} />;
}

export function ProjectRuntimeSettingsPage() {
  return <ProjectStandalonePage titleKey="account:SETTINGS_NAV_PROJECT_RUNTIME" />;
}
