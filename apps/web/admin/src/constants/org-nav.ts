import type { LucideIcon } from "lucide-react";
import { History, Package, Settings, Store } from "lucide-react";

import type { AdminNavItem } from "@/constants/admin-nav";

export type OrgNavItem = {
  key: string;
  label: string;
  labelKey?: string;
  to?: string;
  icon: LucideIcon;
  children?: OrgNavItem[];
};

/**
 * Organization navigation uses canonical scope routes without `/w/:workspaceId`.
 */
export const ORG_NAV_ITEMS: AdminNavItem[] = [
  {
    key: "org.activity",
    label: "Activity",
    labelKey: "nav:NAV_ORG_ACTIVITY",
    to: "/settings/organization/activity",
    icon: History,
  },
  {
    key: "org.settings",
    label: "Settings",
    labelKey: "nav:NAV_ORG_SETTINGS",
    to: "/settings/organization",
    icon: Settings,
  },
  {
    key: "org.plugins",
    label: "Plugin center",
    labelKey: "nav:NAV_ORG_PLUGIN_CENTER",
    icon: Package,
    children: [
      {
        key: "org.plugins.installed",
        label: "Installed",
        labelKey: "nav:NAV_PLUGINS_INSTALLED",
        to: "/plugins/installed",
        icon: Package,
      },
      {
        key: "org.plugins.marketplace",
        label: "Marketplace",
        labelKey: "nav:NAV_PLUGINS_MARKETPLACE",
        to: "/plugins/marketplace",
        icon: Store,
      },
    ],
  },
] as const;
