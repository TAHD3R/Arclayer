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
  },
  // ── Group 2 ──
  {
    key: "org.directory",
    label: "People",
    labelKey: "nav:NAV_ORG_DIRECTORY",
    icon: Users,
    children: [
      {
        key: "org.directory.members",
        label: "All members",
        labelKey: "nav:NAV_ORG_DIRECTORY_MEMBERS",
        to: "/team/members",
        icon: Users,
      },
      {
        key: "org.directory.invitations",
        label: "Invites",
        labelKey: "nav:NAV_ORG_DIRECTORY_INVITATIONS",
        to: "/team/invitations",
        icon: UserPlus,
      },
      {
        key: "org.directory.roles",
        label: "Access",
        labelKey: "nav:NAV_ORG_DIRECTORY_ROLES",
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
  {
    key: "org.platform",
    label: "Shared extensions",
    labelKey: "nav:NAV_ORG_PLATFORM",
    icon: Blocks,
    children: [
      {
        key: "org.platform.extensions",
        label: "Extension library",
        labelKey: "nav:NAV_ORG_PLATFORM_EXTENSIONS",
        to: "/extensions",
        icon: Puzzle,
      },
      {
        key: "org.platform.integrations",
        label: "Connections",
        labelKey: "nav:NAV_ORG_PLATFORM_INTEGRATIONS",
        to: "/integrations",
        icon: Cable,
        disabled: true,
      },
    ],
  },
  // ── Group 3 ──
  {
    key: "org.usage",
    label: "Usage",
    labelKey: "nav:NAV_ORG_USAGE",
    to: "/usage",
    icon: BarChart3,
    scope: "saas",
  },
  {
    key: "org.billing",
    label: "Billing",
    labelKey: "nav:NAV_ORG_BILLING",
    to: "/billing",
    icon: CreditCard,
    scope: "saas",
  },
  {
    key: "org.settings",
    label: "Settings",
    labelKey: "nav:NAV_ORG_SETTINGS",
    to: "/settings",
    icon: Settings,
  },
] as const;
