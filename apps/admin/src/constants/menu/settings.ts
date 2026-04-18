import { Bell, MailPlus, Shield, SquareStack, UserRound, Users } from "lucide-react";

import type { AdminNavItem } from "@/types/admin-nav";

export const SETTINGS_PERSONAL_NAV_ITEMS: readonly AdminNavItem[] = [
  {
    key: "settings.personal.profile",
    label: "Profile",
    labelKey: "account:ACCOUNT_NAV_PROFILE",
    to: "/settings/personal/profile",
    icon: UserRound,
    groupLabelBeforeKey: "account:SETTINGS_NAV_SECTION_PERSONAL",
  },
  {
    key: "settings.personal.notifications",
    label: "Notifications",
    labelKey: "account:ACCOUNT_NAV_NOTIFICATIONS",
    to: "/settings/personal/notifications",
    icon: Bell,
  },
] as const;

export const SETTINGS_WORKSPACE_NAV_ITEMS: readonly AdminNavItem[] = [
  {
    key: "settings.workspace.general",
    label: "General",
    labelKey: "account:SETTINGS_NAV_WORKSPACE_GENERAL",
    to: "/settings/workspace/general",
    icon: SquareStack,
    groupLabelBeforeKey: "account:SETTINGS_NAV_SECTION_WORKSPACE",
  },
  {
    key: "settings.workspace.members",
    label: "Members",
    labelKey: "account:SETTINGS_NAV_WORKSPACE_MEMBERS",
    to: "/settings/workspace/members",
    icon: Users,
  },
  {
    key: "settings.workspace.invitations",
    label: "Invitations",
    labelKey: "account:SETTINGS_NAV_WORKSPACE_INVITATIONS",
    to: "/settings/workspace/invitations",
    icon: MailPlus,
  },
  {
    key: "settings.workspace.roles",
    label: "Permissions",
    labelKey: "account:SETTINGS_NAV_WORKSPACE_ROLES",
    to: "/settings/workspace/roles",
    icon: Shield,
  },
] as const;

export const SETTINGS_NAV_ITEMS: readonly AdminNavItem[] = [
  ...SETTINGS_PERSONAL_NAV_ITEMS,
  ...SETTINGS_WORKSPACE_NAV_ITEMS,
] as const;
