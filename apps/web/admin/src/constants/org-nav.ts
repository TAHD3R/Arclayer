import {
  Activity,
  Boxes,
  Home,
  Puzzle,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";

import type { AdminNavItem } from "@/constants/admin-nav";
import { COMMON_FOOTER_NAV_ITEMS } from "@/constants/common-footer-nav";

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
  {
    key: "org.extensions",
    label: "Extensions",
    labelKey: "nav:NAV_EXTENSIONS",
    to: "/extensions",
    icon: Puzzle,
    dividerAfter: true,
  },
  // ── Group 3 ──
  {
    key: "org.settings",
    label: "Settings",
    labelKey: "nav:NAV_ORG_SETTINGS",
    to: "/settings",
    icon: Settings,
  },
  // ── Footer ──
  ...COMMON_FOOTER_NAV_ITEMS,
] as const;
