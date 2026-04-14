import { History, House, Settings2, Users, Wrench } from "lucide-react";

import type { AdminNavItem } from "@/types/admin-nav";

export const GLOBAL_NAV_ITEMS: AdminNavItem[] = [
  {
    key: "global.home",
    label: "Home",
    labelKey: "nav:NAV_HOME",
    to: "/",
    icon: House,
  },
  {
    key: "global.recents",
    label: "Recents",
    labelKey: "nav:NAV_RECENTS",
    icon: History,
  },
  {
    key: "global.workspaces",
    label: "Workspaces",
    labelKey: "account:ACCOUNT_NAV_WORKSPACES",
    to: "/workspaces",
    icon: Users,
  },
  {
    key: "global.maintenance",
    label: "Maintenance",
    labelKey: "nav:NAV_SECTION_MAINTENANCE",
    icon: Wrench,
    children: [
      {
        key: "global.system",
        label: "System Settings",
        labelKey: "nav:NAV_SYSTEM_SETTINGS",
        to: "/system",
        activeMatchPaths: ["/system"],
        icon: Settings2,
      },
    ],
  },
] as const;

export function resolveGlobalNavItems(params: { isSuperAdmin: boolean }): AdminNavItem[] {
  const filterItems = (items: readonly AdminNavItem[]): AdminNavItem[] =>
    items.flatMap((item) => {
      if (item.key === "global.system" && !params.isSuperAdmin) return [];

      if (!item.children?.length) return [item];

      const children = filterItems(item.children);
      if (children.length === 0) return [];

      return [{ ...item, children }];
    });

  return filterItems(GLOBAL_NAV_ITEMS);
}
