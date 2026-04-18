import {
  CreditCard,
  House,
  LayoutDashboard,
  LifeBuoy,
  ReceiptText,
  Rainbow,
  Settings2,
  Shield,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";

import type { AdminNavItem } from "@/types/admin-nav";
import { findActiveTrailNodes } from "@/lib/admin-nav-utils";

export const GLOBAL_NAV_ITEMS: AdminNavItem[] = [
  {
    key: "global.home",
    label: "Home",
    labelKey: "nav:NAV_HOME",
    to: "/",
    icon: House,
  },
  {
    key: "global.resources",
    label: "Resources",
    labelKey: "nav:NAV_RESOURCES",
    to: "/resources",
    icon: Rainbow,
    disabled: true,
    insertStarredAfter: true,
  },
  {
    key: "global.projects",
    label: "Projects",
    labelKey: "account:ACCOUNT_NAV_PROJECTS",
    to: "/projects",
    groupBehavior: "navigate-self-and-expand",
    icon: Users,
    dividerBefore: true,
  },
  {
    key: "global.platform",
    label: "Platform",
    labelKey: "nav:NAV_SECTION_PLATFORM",
    icon: Wrench,
    dividerBefore: true,
    children: [
      {
        key: "global.platform.tenants",
        label: "Tenants",
        labelKey: "nav:NAV_GLOBAL_PLATFORM_TENANTS",
        to: "/system/tenants",
        icon: Users,
        disabled: true,
      },
      {
        key: "global.platform.plans",
        label: "Plans & Limits",
        labelKey: "nav:NAV_GLOBAL_PLATFORM_PLANS_LIMITS",
        to: "/system/plans",
        icon: CreditCard,
        disabled: true,
      },
      {
        key: "global.platform.access",
        label: "Access Control",
        labelKey: "nav:NAV_GLOBAL_PLATFORM_ACCESS_CONTROL",
        to: "/system/access-control",
        icon: Shield,
        disabled: true,
      },
      {
        key: "global.platform.audit",
        label: "Audit Log",
        labelKey: "nav:NAV_GLOBAL_PLATFORM_AUDIT_LOG",
        to: "/system/audit-log",
        icon: ReceiptText,
        disabled: true,
      },
      {
        key: "global.platform.overview",
        label: "Platform Overview",
        labelKey: "nav:NAV_GLOBAL_PLATFORM_OVERVIEW",
        to: "/system/overview",
        icon: LayoutDashboard,
        disabled: true,
      },
      {
        key: "global.platform.jobs",
        label: "Jobs",
        labelKey: "nav:NAV_GLOBAL_PLATFORM_JOBS",
        to: "/system/jobs",
        icon: Wrench,
        disabled: true,
      },
      {
        key: "global.platform.configuration",
        label: "Configuration",
        labelKey: "nav:NAV_GLOBAL_PLATFORM_CONFIGURATION",
        to: "/system",
        icon: Settings2,
      },
      {
        key: "global.platform.revenue",
        label: "Revenue",
        labelKey: "nav:NAV_GLOBAL_PLATFORM_REVENUE",
        to: "/system/revenue",
        icon: Wallet,
        disabled: true,
      },
      {
        key: "global.platform.support",
        label: "Support Center",
        labelKey: "nav:NAV_GLOBAL_PLATFORM_SUPPORT_CENTER",
        to: "/system/support-center",
        icon: LifeBuoy,
        disabled: true,
      },
    ],
  },
] as const;

export function resolveGlobalNavItems(params: {
  isSuperAdmin: boolean;
  projectChildren?: AdminNavItem[];
}): AdminNavItem[] {
  const filterItems = (items: readonly AdminNavItem[]): AdminNavItem[] =>
    items.flatMap((item) => {
      const nextItem =
        item.key === "global.projects" && params.projectChildren?.length
          ? { ...item, children: params.projectChildren }
          : item;

      if (nextItem.key === "global.platform" && !params.isSuperAdmin) {
        return [];
      }

      if (!nextItem.children?.length) return [nextItem];

      const children = filterItems(nextItem.children);
      if (children.length === 0) return [];

      return [{ ...nextItem, children }];
    });

  return filterItems(GLOBAL_NAV_ITEMS);
}

export function matchesGlobalNavScene(pathname: string): boolean {
  return findActiveTrailNodes([...GLOBAL_NAV_ITEMS], pathname).length > 0;
}
