import { House, Users } from "lucide-react";

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
] as const;
