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
    groupBehavior: "navigate-self-and-expand",
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

export function resolveGlobalNavItems(params: {
  isSuperAdmin: boolean;
  workspaceChildren?: AdminNavItem[];
}): AdminNavItem[] {
  const filterItems = (items: readonly AdminNavItem[]): AdminNavItem[] =>
    items.flatMap((item) => {
      const nextItem =
        item.key === "global.workspaces" && params.workspaceChildren?.length
          ? { ...item, children: params.workspaceChildren }
          : item;

      if (nextItem.key === "global.system" && !params.isSuperAdmin) return [];

      if (!nextItem.children?.length) return [nextItem];

      const children = filterItems(nextItem.children);
      if (children.length === 0) return [];

      return [{ ...nextItem, children }];
    });

  return filterItems(GLOBAL_NAV_ITEMS);
}
