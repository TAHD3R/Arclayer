import {
  Bell,
  MailPlus,
  Shield,
  SlidersHorizontal,
  SquareStack,
  UserRound,
  Users,
} from "lucide-react";

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
    key: "settings.personal.preferences",
    label: "Preferences",
    labelKey: "account:ACCOUNT_NAV_APPEARANCE",
    to: "/settings/personal/preferences",
    icon: SlidersHorizontal,
  },
  {
    key: "settings.personal.notifications",
    label: "Notifications",
    labelKey: "account:ACCOUNT_NAV_NOTIFICATIONS",
    to: "/settings/personal/notifications",
    icon: Bell,
  },
] as const;

export const SETTINGS_WORKSPACE_PLACEHOLDER_NAV_ITEMS: readonly AdminNavItem[] = [
  {
    key: "settings.workspace.general",
    label: "General",
    labelKey: "account:SETTINGS_NAV_WORKSPACE_GENERAL",
    icon: SquareStack,
    disabled: true,
    groupLabelBeforeKey: "account:SETTINGS_NAV_SECTION_WORKSPACE",
  },
  {
    key: "settings.workspace.people",
    label: "People",
    labelKey: "account:SETTINGS_NAV_WORKSPACE_PEOPLE",
    icon: Users,
    disabled: true,
  },
  {
    key: "settings.workspace.invites",
    label: "Invitations",
    labelKey: "account:SETTINGS_NAV_WORKSPACE_INVITES",
    icon: MailPlus,
    disabled: true,
  },
  {
    key: "settings.workspace.permissions",
    label: "Permissions",
    labelKey: "account:SETTINGS_NAV_WORKSPACE_PERMISSIONS",
    icon: Shield,
    disabled: true,
  },
] as const;

export const SETTINGS_NAV_ITEMS: readonly AdminNavItem[] = [
  ...SETTINGS_PERSONAL_NAV_ITEMS,
  ...SETTINGS_WORKSPACE_PLACEHOLDER_NAV_ITEMS,
] as const;
