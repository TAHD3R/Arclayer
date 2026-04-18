import {
  Bell,
  Globe,
  KeyRound,
  MailPlus,
  PanelsTopLeft,
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

export const SETTINGS_PROJECT_NAV_ITEMS: readonly AdminNavItem[] = [
  {
    key: "settings.project.general",
    label: "General",
    labelKey: "account:SETTINGS_NAV_PROJECT_GENERAL",
    to: "/settings/general",
    icon: SquareStack,
    groupLabelBeforeKey: "account:SETTINGS_NAV_SECTION_PROJECT",
  },
  {
    key: "settings.project.members",
    label: "Members",
    labelKey: "account:SETTINGS_NAV_PROJECT_MEMBERS",
    to: "/settings/members",
    icon: Users,
  },
  {
    key: "settings.project.domain",
    label: "Domain",
    labelKey: "account:SETTINGS_NAV_PROJECT_DOMAIN",
    to: "/settings/domain",
    icon: Globe,
  },
  {
    key: "settings.project.localization",
    label: "Localization",
    labelKey: "account:SETTINGS_NAV_PROJECT_LOCALIZATION",
    to: "/settings/localization",
    icon: PanelsTopLeft,
  },
  {
    key: "settings.project.seo",
    label: "SEO",
    labelKey: "account:SETTINGS_NAV_PROJECT_SEO",
    to: "/settings/seo",
    icon: SlidersHorizontal,
  },
  {
    key: "settings.project.apiKeys",
    label: "API Keys",
    labelKey: "account:SETTINGS_NAV_PROJECT_API_KEYS",
    to: "/settings/api-keys",
    icon: KeyRound,
  },
  {
    key: "settings.project.runtime",
    label: "Runtime",
    labelKey: "account:SETTINGS_NAV_PROJECT_RUNTIME",
    to: "/settings/runtime",
    icon: Globe,
  },
] as const;

export const SETTINGS_NAV_ITEMS: readonly AdminNavItem[] = [
  ...SETTINGS_PERSONAL_NAV_ITEMS,
  ...SETTINGS_WORKSPACE_NAV_ITEMS,
] as const;
