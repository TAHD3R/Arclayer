import {
  Activity,
  Bot,
  ChartNoAxesCombined,
  Gauge,
  House,
  LayoutDashboard,
  MessageSquareText,
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
    groupLabelBeforeKey: "nav:NAV_SECTION_PLATFORM",
  },
  {
    key: "global.platform.tenants",
    label: "Tenants",
    labelKey: "nav:NAV_GLOBAL_PLATFORM_TENANTS",
    to: "/system/tenants",
    icon: Users,
  },
  {
    key: "global.platform.audit",
    label: "Audit Log",
    labelKey: "nav:NAV_GLOBAL_PLATFORM_AUDIT_LOG",
    to: "/system/audit-log",
    icon: ReceiptText,
  },
  {
    key: "global.platform.feedback",
    label: "Feedback Center",
    labelKey: "nav:NAV_GLOBAL_PLATFORM_FEEDBACK",
    to: "/system/feedback",
    icon: MessageSquareText,
  },
  {
    key: "global.platform.observability",
    label: "Observability",
    labelKey: "nav:NAV_GLOBAL_PLATFORM_OBSERVABILITY",
    to: "/system/observability/overview",
    icon: ChartNoAxesCombined,
    groupBehavior: "navigate-self-and-expand",
    activeMatchPaths: ["/system/observability"],
    children: [
      {
        key: "global.platform.observability.overview",
        label: "Operations Overview",
        labelKey: "nav:NAV_GLOBAL_PLATFORM_OBSERVABILITY_OVERVIEW",
        to: "/system/observability/overview",
        icon: Gauge,
      },
      {
        key: "global.platform.observability.requests",
        label: "Requests & Performance",
        labelKey: "nav:NAV_GLOBAL_PLATFORM_OBSERVABILITY_REQUESTS",
        to: "/system/observability/requests",
        icon: Activity,
      },
      {
        key: "global.platform.observability.ai-usage",
        label: "AI Usage & Cost",
        labelKey: "nav:NAV_GLOBAL_PLATFORM_OBSERVABILITY_AI_USAGE",
        to: "/system/observability/ai-usage",
        icon: Bot,
      },
      {
        key: "global.platform.observability.activity",
        label: "Activity Trends",
        labelKey: "nav:NAV_GLOBAL_PLATFORM_OBSERVABILITY_ACTIVITY",
        to: "/system/observability/activity",
        icon: ChartNoAxesCombined,
      },
    ],
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
