import {
  BadgeInfo,
  Bell,
  ChartPie,
  CircleUserRound,
  Paintbrush,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

import type { WorkspaceRolesAccessStatus } from "@/hooks/use-workspace-roles-access";
import type { SettingsScreen } from "@/lib/settings/settings-screen";
import type { AdminNavItem } from "@/types/admin-nav";

export type SettingsNavItem = Omit<AdminNavItem, "to"> & {
  screen: SettingsScreen;
  to?: string;
  unavailable?: boolean;
  badgeLabelKey?: string;
};

export const SETTINGS_PERSONAL_NAV_ITEMS: readonly SettingsNavItem[] = [
  {
    key: "settings.personal.profile",
    screen: "personal.profile",
    label: "Profile",
    labelKey: "account:ACCOUNT_NAV_PROFILE",
    icon: CircleUserRound,
    groupLabelBeforeKey: "account:SETTINGS_NAV_SECTION_PERSONAL",
  },
  {
    key: "settings.personal.preferences",
    screen: "personal.preferences",
    label: "Preferences",
    labelKey: "account:ACCOUNT_NAV_APPEARANCE",
    icon: Paintbrush,
  },
  {
    key: "settings.personal.notifications",
    screen: "personal.notifications",
    label: "Notifications",
    labelKey: "account:ACCOUNT_NAV_NOTIFICATIONS",
    icon: Bell,
  },
] as const;

export const SETTINGS_WORKSPACE_NAV_ITEMS: readonly SettingsNavItem[] = [
  {
    key: "settings.workspace.general",
    screen: "workspace.general",
    label: "General",
    labelKey: "account:SETTINGS_NAV_WORKSPACE_GENERAL",
    icon: BadgeInfo,
    groupLabelBeforeKey: "account:SETTINGS_NAV_SECTION_WORKSPACE",
  },
  {
    key: "settings.workspace.people",
    screen: "workspace.people",
    label: "People",
    labelKey: "account:SETTINGS_NAV_WORKSPACE_PEOPLE",
    icon: UsersRound,
  },
  {
    key: "settings.workspace.plan-usage",
    screen: "workspace.plan-usage",
    label: "Plan & Usage",
    labelKey: "account:SETTINGS_NAV_WORKSPACE_PLAN_USAGE",
    icon: ChartPie,
  },
  {
    key: "settings.workspace.roles",
    screen: "workspace.roles",
    label: "Roles & Permissions",
    labelKey: "account:SETTINGS_NAV_WORKSPACE_ROLES",
    icon: ShieldCheck,
  },
] as const;

export const SETTINGS_NAV_ITEMS: readonly SettingsNavItem[] = [
  ...SETTINGS_PERSONAL_NAV_ITEMS,
  ...SETTINGS_WORKSPACE_NAV_ITEMS,
] as const;

export function resolveSettingsNavItems(
  rolesStatus: WorkspaceRolesAccessStatus,
): readonly SettingsNavItem[] {
  if (rolesStatus === "available") return SETTINGS_NAV_ITEMS;

  const badgeLabelKey =
    rolesStatus === "loading"
      ? "workspaceAccess:ROLES_ACCESS_CHECKING_BADGE"
      : rolesStatus === "error"
        ? "workspaceAccess:ROLES_ACCESS_CHECK_FAILED_BADGE"
        : "workspaceAccess:ROLES_ELIGIBLE_PLAN_BADGE";
  return SETTINGS_NAV_ITEMS.map((item) =>
    item.screen === "workspace.roles" ? { ...item, unavailable: true, badgeLabelKey } : item,
  );
}
