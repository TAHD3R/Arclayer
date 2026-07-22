import {
  BadgeInfo,
  Bell,
  Blocks,
  BookOpenText,
  ChartPie,
  CircleUserRound,
  MailPlus,
  Paintbrush,
  ShieldCheck,
  SwatchBook,
  UsersRound,
} from "lucide-react";

import type { AdminNavItem } from "@/types/admin-nav";
import type { SettingsScreen } from "@/lib/settings/settings-screen";

export type SettingsNavItem = Omit<AdminNavItem, "to"> & {
  screen: SettingsScreen;
  to?: string;
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
    key: "settings.workspace.plan-usage",
    screen: "workspace.plan-usage",
    label: "Plan & Usage",
    labelKey: "account:SETTINGS_NAV_WORKSPACE_PLAN_USAGE",
    icon: ChartPie,
  },
  {
    key: "settings.workspace.knowledge",
    screen: "workspace.knowledge",
    label: "Workspace Knowledge",
    labelKey: "account:SETTINGS_NAV_WORKSPACE_KNOWLEDGE",
    icon: BookOpenText,
  },
  {
    key: "settings.workspace.skills",
    screen: "workspace.skills",
    label: "Workspace Skills",
    labelKey: "account:SETTINGS_NAV_WORKSPACE_SKILLS",
    icon: Blocks,
  },
  {
    key: "settings.workspace.design-systems",
    screen: "workspace.design-systems",
    label: "Design Systems",
    labelKey: "account:SETTINGS_NAV_WORKSPACE_DESIGN_SYSTEMS",
    icon: SwatchBook,
  },
  {
    key: "settings.workspace.members",
    screen: "workspace.members",
    label: "Members",
    labelKey: "account:SETTINGS_NAV_WORKSPACE_MEMBERS",
    icon: UsersRound,
  },
  {
    key: "settings.workspace.invitations",
    screen: "workspace.invitations",
    label: "Invitations",
    labelKey: "account:SETTINGS_NAV_WORKSPACE_INVITATIONS",
    icon: MailPlus,
  },
  {
    key: "settings.workspace.roles",
    screen: "workspace.roles",
    label: "Permissions",
    labelKey: "account:SETTINGS_NAV_WORKSPACE_ROLES",
    icon: ShieldCheck,
  },
] as const;

export const SETTINGS_NAV_ITEMS: readonly SettingsNavItem[] = [
  ...SETTINGS_PERSONAL_NAV_ITEMS,
  ...SETTINGS_WORKSPACE_NAV_ITEMS,
] as const;
