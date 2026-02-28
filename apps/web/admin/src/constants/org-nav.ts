import {
  Activity,
  BarChart3,
  Blocks,
  Boxes,
  Cable,
  CreditCard,
  Home,
  Puzzle,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";

import type { AdminNavItem } from "@/types/admin-nav";

/**
 * Organization navigation uses canonical scope routes without `/w/:workspaceId`.
 */
export const ORG_NAV_ITEMS: AdminNavItem[] = [
  // ── Group 1 ──
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
    to: "/workspaces",
    icon: Boxes,
    dividerAfter: true,
  },
  // ── Group 2 ──
  {
    key: "org.extensionsIntegrations",
    label: "Extensions & integrations",
    labelKey: "nav:NAV_EXTENSIONS_INTEGRATIONS",
    icon: Blocks,
    children: [
      {
        key: "org.extensionsIntegrations.extensions",
        label: "Extensions",
        labelKey: "nav:NAV_EXTENSIONS",
        to: "/extensions",
        icon: Puzzle,
      },
      {
        key: "org.extensionsIntegrations.integrations",
        label: "Integrations",
        labelKey: "nav:NAV_INTEGRATIONS",
        to: "/integrations",
        icon: Cable,
        disabled: true,
      },
    ],
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
        to: "/team/members",
        icon: Users,
      },
      {
        key: "org.team.invitations",
        label: "Member invitations",
        labelKey: "nav:NAV_SETTINGS_TEAM_MEMBERS",
        to: "/team/invitations",
        icon: UserPlus,
      },
      {
        key: "org.team.roles",
        label: "Roles & permissions",
        labelKey: "nav:NAV_SETTINGS_TEAM_ROLES",
        to: "/team/roles",
        icon: ShieldCheck,
      },
    ],
  },
  {
    key: "org.activity",
    label: "Activity",
    labelKey: "nav:NAV_ORG_ACTIVITY",
    to: "/activity",
    icon: Activity,
  },
  // ── Group 3 ──
  {
    key: "org.usage",
    label: "Usage",
    labelKey: "nav:NAV_ORG_USAGE",
    to: "/usage",
    icon: BarChart3,
  },
  {
    key: "org.billing",
    label: "Billing",
    labelKey: "nav:NAV_ORG_BILLING",
    to: "/billing",
    icon: CreditCard,
  },
  {
    key: "org.settings",
    label: "Settings",
    labelKey: "nav:NAV_ORG_SETTINGS",
    to: "/settings",
    icon: Settings,
  },
] as const;
