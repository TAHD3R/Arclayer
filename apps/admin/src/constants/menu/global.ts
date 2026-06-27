import {
  House,
  LayoutDashboard,
  PanelsTopLeft,
  ReceiptText,
  Rainbow,
  Settings2,
  Users,
} from "lucide-react";

import type { AdminNavItem } from "@/types/admin-nav";
import { findActiveTrailNodes } from "@/lib/admin-nav-utils";
import { GLOBAL_ROUTE_PATHS } from "@/lib/routing/global-routes";

export const GLOBAL_NAV_ITEMS: AdminNavItem[] = [
  {
    key: "global.home",
    label: "Home",
    labelKey: "nav:NAV_HOME",
    to: GLOBAL_ROUTE_PATHS.home,
    icon: House,
  },
  {
    key: "global.resources",
    label: "Inspiration",
    labelKey: "nav:NAV_RESOURCES",
    to: GLOBAL_ROUTE_PATHS.inspiration,
    icon: Rainbow,
    insertStarredAfter: true,
  },
  {
    key: "global.projects",
    label: "All projects",
    labelKey: "nav:NAV_ALL_PROJECTS",
    to: GLOBAL_ROUTE_PATHS.projects,
    icon: PanelsTopLeft,
    groupLabelBeforeKey: "nav:NAV_SECTION_PROJECTS",
  },
  {
    key: "global.platform.overview",
    label: "Platform Overview",
    labelKey: "nav:NAV_GLOBAL_PLATFORM_OVERVIEW",
    to: "/system/overview",
    icon: LayoutDashboard,
    disabled: true,
    groupLabelBeforeKey: "nav:NAV_SECTION_PLATFORM",
  },
  {
    key: "global.platform.tenants",
    label: "Tenants",
    labelKey: "nav:NAV_GLOBAL_PLATFORM_TENANTS",
    to: "/system/tenants",
    icon: Users,
  },
  // {
  //   key: "global.platform.plans",
  //   label: "Plans & Limits",
  //   labelKey: "nav:NAV_GLOBAL_PLATFORM_PLANS_LIMITS",
  //   to: "/system/plans",
  //   icon: CreditCard,
  //   disabled: true,
  // },
  {
    key: "global.platform.audit",
    label: "Audit Log",
    labelKey: "nav:NAV_GLOBAL_PLATFORM_AUDIT_LOG",
    to: "/system/audit-log",
    icon: ReceiptText,
    disabled: true,
  },
  {
    key: "global.platform.configuration",
    label: "Configuration",
    labelKey: "nav:NAV_GLOBAL_PLATFORM_CONFIGURATION",
    to: GLOBAL_ROUTE_PATHS.system,
    icon: Settings2,
  },
] as const;

export function resolveGlobalNavItems(params: { isSuperAdmin: boolean }): AdminNavItem[] {
  const filterItems = (items: readonly AdminNavItem[]): AdminNavItem[] =>
    items.flatMap((item) => {
      if (item.key.startsWith("global.platform.") && !params.isSuperAdmin) {
        return [];
      }

      if (!item.children?.length) return [item];

      const children = filterItems(item.children);
      if (children.length === 0) return [];

      return [{ ...item, children }];
    });

  return filterItems(GLOBAL_NAV_ITEMS);
}

export function matchesGlobalNavScene(pathname: string): boolean {
  return findActiveTrailNodes([...GLOBAL_NAV_ITEMS], pathname).length > 0;
}
