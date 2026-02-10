import { Activity, Boxes, Home, Package, Settings, Users } from "lucide-react";

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
    key: "org.members",
    label: "Members",
    labelKey: "nav:NAV_ORG_MEMBERS",
    to: "/organization/members",
    icon: Users,
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
