import { Activity, Boxes, Home, Package, Settings, ShieldCheck, UserPlus, Users } from "lucide-react";

import type { AdminNavItem } from "@/constants/admin-nav";

/**
 * Organization navigation uses canonical scope routes without `/w/:workspaceId`.
 */
export const ORG_NAV_ITEMS: AdminNavItem[] = [
  {
    key: "org.overview",
    label: "Overview",
    labelKey: "nav:NAV_ORG_OVERVIEW",
    to: "/",
    icon: Home,
  },
  {
    key: "org.workspaces",
    label: "Workspaces",
    labelKey: "nav:NAV_ORG_WORKSPACES",
    to: "/organization/workspaces",
    icon: Boxes,
  },
  {
    key: "org.team",
    label: "Team",
    labelKey: "nav:NAV_SETTINGS_TEAM",
    icon: Users,
    children: [
      {
        key: "org.team.members",
        label: "Members",
        labelKey: "nav:NAV_SETTINGS_TEAM_MEMBER_LIST",
        to: "/organization/team/members",
        icon: Users,
      },
      {
        key: "org.team.invitations",
        label: "Member invitations",
        labelKey: "nav:NAV_SETTINGS_TEAM_MEMBERS",
        to: "/organization/team/invitations",
        icon: UserPlus,
      },
      {
        key: "org.team.roles",
        label: "Roles & permissions",
        labelKey: "nav:NAV_SETTINGS_TEAM_ROLES",
        to: "/organization/team/roles",
        icon: ShieldCheck,
      },
    ],
  },
  {
    key: "org.activity",
    label: "Activity",
    labelKey: "nav:NAV_ORG_ACTIVITY",
    to: "/organization/activity",
    icon: Activity,
  },
  {
    key: "org.plugins",
    label: "Plugins Center",
    labelKey: "nav:NAV_ORG_PLUGIN_CENTER",
    to: "/plugins/installed",
    icon: Package,
  },
  {
    key: "org.settings",
    label: "Settings",
    labelKey: "nav:NAV_ORG_SETTINGS",
    to: "/settings/organization",
    icon: Settings,
  },
] as const;
