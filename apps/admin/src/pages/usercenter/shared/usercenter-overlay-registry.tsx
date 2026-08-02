import type { ReactNode } from "react";

import { UserAppearanceView } from "@/pages/usercenter/appearance/components/user-appearance-view";
import { UserNotificationSettingsView } from "@/pages/usercenter/notifications/components/user-notification-settings-view";
import { UserProfileView } from "@/pages/usercenter/profile/components/user-profile-view";
import type { SettingsScreen, SettingsScreenPayload } from "@/lib/settings/settings-screen";
import { WorkspaceSettingsBasicsView } from "@/pages/workspaces/settings/workspace/basics/components/workspace-settings-basics-view";
import { WorkspacePlanUsageView } from "@/pages/workspaces/settings/workspace/plan-usage/plan-usage-view";
import { WorkspacePeopleView } from "@/pages/workspaces/settings/workspace/people/workspace-people-view";
import { TeamRolesPage } from "@/pages/workspaces/team/roles/page";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export type UsercenterOverlayItem = {
  screen: SettingsScreen;
  labelKey: string;
  titleKey: string;
  descriptionKey: string;
  render: (context: SettingsScreenRenderContext) => ReactNode;
};

export type SettingsScreenRenderContext = {
  targetSection?: string;
  payload?: SettingsScreenPayload;
  focusRequestId: number;
};

function useCurrentWorkspaceId(): string {
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  if (!currentWorkspaceId) {
    throw new Error("WORKSPACE_NOT_SELECTED");
  }
  return currentWorkspaceId;
}

function WorkspaceGeneralOverlayView() {
  return <WorkspaceSettingsBasicsView workspaceId={useCurrentWorkspaceId()} embedded />;
}

function WorkspacePlanUsageOverlayView() {
  return <WorkspacePlanUsageView workspaceId={useCurrentWorkspaceId()} />;
}

function WorkspacePeopleOverlayView(context: SettingsScreenRenderContext) {
  return (
    <WorkspacePeopleView
      workspaceId={useCurrentWorkspaceId()}
      targetSection={context.targetSection}
      initialInspectMemberId={context.payload?.memberId}
    />
  );
}

function WorkspaceRolesOverlayView() {
  return <TeamRolesPage workspaceIdOverride={useCurrentWorkspaceId()} embedded />;
}

export const USERCENTER_OVERLAY_ITEMS: readonly UsercenterOverlayItem[] = [
  {
    screen: "personal.profile",
    labelKey: "account:ACCOUNT_NAV_PROFILE",
    titleKey: "account:ME_TAB_PROFILE",
    descriptionKey: "account:ME_TAB_PROFILE_DESC",
    render: () => <UserProfileView mode="dialog" />,
  },
  {
    screen: "personal.preferences",
    labelKey: "account:ACCOUNT_NAV_APPEARANCE",
    titleKey: "account:ME_TAB_PREFERENCES",
    descriptionKey: "account:ME_TAB_PREFERENCES_DESC",
    render: () => <UserAppearanceView mode="dialog" />,
  },
  {
    screen: "personal.notifications",
    labelKey: "account:ACCOUNT_NAV_NOTIFICATIONS",
    titleKey: "account:ME_TAB_NOTIFICATIONS",
    descriptionKey: "account:ME_TAB_NOTIFICATIONS_DESC",
    render: () => <UserNotificationSettingsView mode="dialog" />,
  },
] as const;

export const WORKSPACE_SETTINGS_OVERLAY_ITEMS: readonly UsercenterOverlayItem[] = [
  {
    screen: "workspace.general",
    labelKey: "account:SETTINGS_NAV_WORKSPACE_GENERAL",
    titleKey: "settings:SETTINGS_WORKSPACE_GENERAL_TITLE",
    descriptionKey: "settings:SETTINGS_WORKSPACE_GENERAL_DESC",
    render: () => <WorkspaceGeneralOverlayView />,
  },
  {
    screen: "workspace.plan-usage",
    labelKey: "account:SETTINGS_NAV_WORKSPACE_PLAN_USAGE",
    titleKey: "account:SETTINGS_WORKSPACE_PLAN_USAGE_TITLE",
    descriptionKey: "account:SETTINGS_WORKSPACE_PLAN_USAGE_DESCRIPTION",
    render: () => <WorkspacePlanUsageOverlayView />,
  },
  {
    screen: "workspace.people",
    labelKey: "account:SETTINGS_NAV_WORKSPACE_PEOPLE",
    titleKey: "settings:SETTINGS_WORKSPACE_PEOPLE_TITLE",
    descriptionKey: "settings:SETTINGS_WORKSPACE_PEOPLE_DESC",
    render: (context) => <WorkspacePeopleOverlayView {...context} />,
  },
  {
    screen: "workspace.roles",
    labelKey: "account:SETTINGS_NAV_WORKSPACE_ROLES",
    titleKey: "settings:SETTINGS_WORKSPACE_ROLES_TITLE",
    descriptionKey: "settings:SETTINGS_WORKSPACE_ROLES_DESC",
    render: () => <WorkspaceRolesOverlayView />,
  },
] as const;

export const SETTINGS_OVERLAY_ITEMS: readonly UsercenterOverlayItem[] = [
  ...USERCENTER_OVERLAY_ITEMS,
  ...WORKSPACE_SETTINGS_OVERLAY_ITEMS,
] as const;

export function getUsercenterOverlayItem(screen: SettingsScreen): UsercenterOverlayItem {
  const item = SETTINGS_OVERLAY_ITEMS.find((candidate) => candidate.screen === screen);
  if (!item) {
    throw new Error(`Unknown settings screen: ${screen}`);
  }
  return item;
}

export function getUsercenterOverlayTitleKey(screen: SettingsScreen): string {
  return getUsercenterOverlayItem(screen).titleKey;
}
