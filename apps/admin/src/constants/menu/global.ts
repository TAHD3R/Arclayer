import { createElement } from "react";
import {
  Activity,
  BrainCircuit,
  Building2,
  ChartNoAxesCombined,
  ChartSpline,
  FolderKanban,
  House,
  LayoutDashboard,
  MessageSquareHeart,
  Plug,
  ScrollText,
  SlidersHorizontal,
  Boxes,
} from "lucide-react";

import {
  ProjectAvatar,
  projectAvatarPropsFromIdentity,
  type ProjectAvatarIdentity,
} from "@/components/common/project-avatar";
import type { AdminNavItem } from "@/types/admin-nav";
import { findActiveTrailNodes } from "@/lib/admin-nav-utils";
import { GLOBAL_ROUTE_PATHS } from "@/lib/routing/global-routes";
import { projectHomePath } from "@/lib/routing/workspace-routing";

export const GLOBAL_RECENT_PROJECT_LIMIT = 3;

export type GlobalRecentProject = ProjectAvatarIdentity & {
  projectId: string;
  name: string;
};

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
    icon: Boxes,
  },
  {
    key: "global.projects",
    label: "All projects",
    labelKey: "nav:NAV_ALL_PROJECTS",
    to: GLOBAL_ROUTE_PATHS.projects,
    icon: FolderKanban,
    insertStarredAfter: true,
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
    icon: Building2,
  },
  {
    key: "global.platform.audit",
    label: "Audit Log",
    labelKey: "nav:NAV_GLOBAL_PLATFORM_AUDIT_LOG",
    to: "/system/audit-log",
    icon: ScrollText,
  },
  {
    key: "global.platform.feedback",
    label: "Feedback Center",
    labelKey: "nav:NAV_GLOBAL_PLATFORM_FEEDBACK",
    to: "/system/feedback",
    icon: MessageSquareHeart,
  },
  {
    key: "global.platform.plugins",
    label: "Plugins",
    labelKey: "nav:NAV_GLOBAL_PLATFORM_PLUGINS",
    to: "/system/plugins",
    icon: Plug,
  },
  {
    key: "global.platform.observability",
    label: "Observability",
    labelKey: "nav:NAV_GLOBAL_PLATFORM_OBSERVABILITY",
    to: "/system/observability/requests",
    icon: Activity,
    groupBehavior: "navigate-self-and-expand",
    activeMatchPaths: ["/system/observability"],
    children: [
      {
        key: "global.platform.observability.requests",
        label: "Requests & Performance",
        labelKey: "nav:NAV_GLOBAL_PLATFORM_OBSERVABILITY_REQUESTS",
        to: "/system/observability/requests",
        icon: ChartNoAxesCombined,
      },
      {
        key: "global.platform.observability.ai-usage",
        label: "AI Usage & Cost",
        labelKey: "nav:NAV_GLOBAL_PLATFORM_OBSERVABILITY_AI_USAGE",
        to: "/system/observability/ai-usage",
        icon: BrainCircuit,
      },
      {
        key: "global.platform.observability.activity",
        label: "Activity Trends",
        labelKey: "nav:NAV_GLOBAL_PLATFORM_OBSERVABILITY_ACTIVITY",
        to: "/system/observability/activity",
        icon: ChartSpline,
      },
    ],
  },
  {
    key: "global.platform.configuration",
    label: "Configuration",
    labelKey: "nav:NAV_GLOBAL_PLATFORM_CONFIGURATION",
    to: GLOBAL_ROUTE_PATHS.system,
    icon: SlidersHorizontal,
  },
] as const;

function buildRecentProjectNavItems(projects: readonly GlobalRecentProject[]): AdminNavItem[] {
  return projects.slice(0, GLOBAL_RECENT_PROJECT_LIMIT).map((project, index) => {
    const item: AdminNavItem = {
      key: `global.recent-project.${project.projectId}`,
      label: project.name,
      to: projectHomePath(project.projectId),
      icon: FolderKanban,
      iconNode: createElement(ProjectAvatar, {
        name: project.name,
        size: 20,
        className: "rounded-sm ring-0",
        decorative: true,
        ...projectAvatarPropsFromIdentity(project),
      }),
    };
    return index === 0
      ? Object.assign({}, item, { groupLabelBeforeKey: "nav:NAV_SECTION_PROJECTS" })
      : item;
  });
}

export function resolveGlobalNavItems(params: {
  isSuperAdmin: boolean;
  recentProjects?: readonly GlobalRecentProject[];
}): AdminNavItem[] {
  const recentProjectItems = buildRecentProjectNavItems(params.recentProjects ?? []);
  const items = GLOBAL_NAV_ITEMS.flatMap((item) => {
    if (item.key !== "global.projects" || recentProjectItems.length === 0) return [item];

    return [item, ...recentProjectItems];
  });
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

  return filterItems(items);
}

export function matchesGlobalNavScene(pathname: string): boolean {
  return findActiveTrailNodes([...GLOBAL_NAV_ITEMS], pathname).length > 0;
}
