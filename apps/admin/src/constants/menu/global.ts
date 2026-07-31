import { createElement } from "react";
import { Blocks, BookOpenText, Boxes, FolderKanban, House, SwatchBook } from "lucide-react";

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
    key: "global.customization.knowledge",
    label: "Knowledge",
    labelKey: "nav:NAV_CUSTOMIZATION_KNOWLEDGE",
    to: `${GLOBAL_ROUTE_PATHS.customization}/knowledge`,
    icon: BookOpenText,
    groupLabelBeforeKey: "nav:NAV_SECTION_CUSTOMIZATION",
  },
  {
    key: "global.customization.skills",
    label: "Skills",
    labelKey: "nav:NAV_CUSTOMIZATION_SKILLS",
    to: `${GLOBAL_ROUTE_PATHS.customization}/skills`,
    icon: Blocks,
  },
  {
    key: "global.customization.design-systems",
    label: "Design systems",
    labelKey: "nav:NAV_CUSTOMIZATION_DESIGN_SYSTEMS",
    to: `${GLOBAL_ROUTE_PATHS.customization}/design-systems`,
    icon: SwatchBook,
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
  recentProjects?: readonly GlobalRecentProject[];
}): AdminNavItem[] {
  const recentProjectItems = buildRecentProjectNavItems(params.recentProjects ?? []);
  const items = GLOBAL_NAV_ITEMS.flatMap((item) => {
    if (item.key !== "global.projects" || recentProjectItems.length === 0) return [item];

    return [item, ...recentProjectItems];
  });
  return items;
}

export function matchesGlobalNavScene(pathname: string): boolean {
  return findActiveTrailNodes([...GLOBAL_NAV_ITEMS], pathname).length > 0;
}
