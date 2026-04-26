import { PanelsTopLeft } from "lucide-react";

import { resolveGlobalNavItems } from "@/constants/menu/global";
import { getProjectNavItems } from "@/constants/menu/project";
import { mapWorkspaceNavItems } from "@/layouts/admin-scene-utils";
import { projectHomePath, projectsHomePath } from "@/lib/routing/workspace-routing";
import type { AdminNavItem } from "@/types/admin-nav";

const DEFAULT_OTHER_PROJECT_LIMIT = 5;

export type UnifiedNavProject = {
  projectId: string;
  workspaceId: string;
  name: string;
  description?: string | null;
  enterable: boolean;
  renderLabel?: AdminNavItem["renderLabel"];
  actionRenderer?: AdminNavItem["actionRenderer"];
};

type ResolveUnifiedNavItemsParams = {
  isSuperAdmin: boolean;
  projects?: readonly UnifiedNavProject[];
  activeProjectId?: string | null;
  otherProjectLimit?: number;
};

function prefixNavItemKeys(items: readonly AdminNavItem[], prefix: string): AdminNavItem[] {
  return items.map((item) => ({
    ...item,
    key: `${prefix}.${item.key}`,
    ...(item.children?.length
      ? { children: prefixNavItemKeys(item.children, `${prefix}.${item.key}`) }
      : {}),
  }));
}

function removeNavDividers(items: readonly AdminNavItem[]): AdminNavItem[] {
  return items.map((item) => ({
    ...item,
    dividerBefore: false,
    dividerAfter: false,
    ...(item.children?.length ? { children: removeNavDividers(item.children) } : {}),
  }));
}

function projectSwitchItem(project: UnifiedNavProject, keyPrefix: string): AdminNavItem {
  return {
    key: `${keyPrefix}.${project.projectId}`,
    label: project.name,
    to: projectHomePath(project.projectId),
    icon: PanelsTopLeft,
    disabled: !project.enterable,
    renderLabel: project.renderLabel,
    actionRenderer: project.actionRenderer,
  };
}

function currentProjectItem(project: UnifiedNavProject): AdminNavItem {
  const projectBase = projectHomePath(project.projectId);
  const projectNavItems = prefixNavItemKeys(
    removeNavDividers(mapWorkspaceNavItems(getProjectNavItems(), projectBase)),
    `global.projects.current.${project.projectId}`,
  );

  return {
    ...projectSwitchItem(project, "global.projects.current"),
    groupBehavior: "navigate-self-and-expand",
    defaultExpanded: true,
    children: projectNavItems,
  };
}

function buildProjectChildren(params: {
  projects: readonly UnifiedNavProject[];
  activeProjectId: string | null | undefined;
  otherProjectLimit: number;
}): AdminNavItem[] {
  const activeProject =
    params.activeProjectId == null
      ? null
      : (params.projects.find((project) => project.projectId === params.activeProjectId) ?? null);
  const otherProjects = params.projects.filter(
    (project) => project.projectId !== activeProject?.projectId,
  );
  const visibleOtherProjects = otherProjects.slice(0, params.otherProjectLimit);
  const hiddenOtherProjectCount = otherProjects.length - visibleOtherProjects.length;
  const projectChildren: AdminNavItem[] = [
    {
      key: "global.projects.all",
      label: "All projects",
      labelKey: "nav:NAV_ALL_PROJECTS",
      to: projectsHomePath(),
      icon: PanelsTopLeft,
    },
  ];

  if (activeProject) {
    projectChildren.push(currentProjectItem(activeProject));
  }

  projectChildren.push(
    ...visibleOtherProjects.map((project) => projectSwitchItem(project, "global.projects.other")),
  );

  if (hiddenOtherProjectCount > 0) {
    projectChildren.push({
      key: "global.projects.other.view-all",
      label: "View all projects",
      labelKey: "common:WORKSPACE_SWITCHER_VIEW_ALL_PROJECTS",
      to: projectsHomePath(),
      icon: PanelsTopLeft,
    });
  }

  return projectChildren;
}

export function resolveUnifiedNavItems(params: ResolveUnifiedNavItemsParams): AdminNavItem[] {
  return resolveGlobalNavItems({
    isSuperAdmin: params.isSuperAdmin,
    projectChildren: buildProjectChildren({
      projects: params.projects ?? [],
      activeProjectId: params.activeProjectId,
      otherProjectLimit: params.otherProjectLimit ?? DEFAULT_OTHER_PROJECT_LIMIT,
    }),
  });
}
