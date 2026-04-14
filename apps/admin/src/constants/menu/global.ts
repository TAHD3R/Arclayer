import { House, Settings2, Users } from "lucide-react";

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
    key: "global.workspaces",
    label: "Workspaces",
    labelKey: "account:ACCOUNT_NAV_WORKSPACES",
    to: "/workspaces",
    icon: Users,
  },
  {
    key: "global.system",
    label: "System Settings",
    labelKey: "nav:NAV_SYSTEM_SETTINGS",
    to: "/system",
    activeMatchPaths: ["/system"],
    icon: Settings2,
  },
] as const;

export function resolveGlobalNavItems(params: { isSuperAdmin: boolean }): AdminNavItem[] {
  return GLOBAL_NAV_ITEMS.filter((item) => {
    if (item.key === "global.system") return params.isSuperAdmin;
    return true;
  });
}
