import { describe, expect, test, vi } from "vitest";

import { resolveUnifiedNavItems, type UnifiedNavProject } from "@/constants/menu/unified";

const projects: UnifiedNavProject[] = [
  {
    projectId: "project-alpha",
    workspaceId: "workspace-alpha",
    name: "Project Alpha",
    description: "Alpha site",
    enterable: true,
  },
  {
    projectId: "project-beta",
    workspaceId: "workspace-alpha",
    name: "Project Beta",
    description: null,
    enterable: true,
  },
  {
    projectId: "project-gamma",
    workspaceId: "workspace-alpha",
    name: "Project Gamma",
    description: null,
    enterable: false,
  },
];

function projectsNode(items = resolveUnifiedNavItems({ isSuperAdmin: false, projects })) {
  const node = items.find((item) => item.key === "global.projects");
  if (!node) throw new Error("Missing projects node");
  return node;
}

function flatten(items: NonNullable<ReturnType<typeof projectsNode>["children"]>) {
  const out = [...items];
  for (const item of items) {
    if (item.children?.length) out.push(...flatten(item.children));
  }
  return out;
}

describe("resolveUnifiedNavItems", () => {
  test("keeps all projects as the first child under projects", () => {
    const node = projectsNode();

    expect(node.defaultExpanded).toBe(true);
    expect(node.groupLabelBeforeKey).toBe("nav:NAV_SECTION_PROJECTS");
    expect(node.dividerBefore).toBeUndefined();
    expect(node.children?.[0]).toMatchObject({
      key: "global.projects.all",
      labelKey: "nav:NAV_ALL_PROJECTS",
      to: "/projects",
    });
  });

  test("mounts the active project's full project menu under the projects tree", () => {
    const node = projectsNode(
      resolveUnifiedNavItems({
        isSuperAdmin: false,
        projects,
        activeProjectId: "project-alpha",
      }),
    );
    const currentProject = node.children?.find(
      (item) => item.key === "global.projects.current.project-alpha",
    );
    const websiteGroup = currentProject?.children?.find((item) => item.key.endsWith(".website"));

    expect(currentProject).toMatchObject({
      label: "Project Alpha",
      to: "/projects/project-alpha",
      groupBehavior: "navigate-self-and-expand",
      defaultExpanded: true,
    });
    expect(currentProject?.groupLabelBeforeKey).toBeUndefined();
    expect(currentProject?.children?.[0]).toMatchObject({
      labelKey: "nav:NAV_DASHBOARD",
      to: "/projects/project-alpha/",
    });
    expect(websiteGroup).toMatchObject({
      labelKey: "nav:NAV_GROUP_WEBSITE",
      defaultExpanded: true,
    });
    expect(flatten(currentProject?.children ?? []).some((item) => item.dividerBefore)).toBe(false);
    expect(flatten(currentProject?.children ?? []).some((item) => item.dividerAfter)).toBe(false);
    expect(websiteGroup?.children?.map((item) => item.to)).toContain(
      "/projects/project-alpha/content/library",
    );
  });

  test("keeps non-active projects as compact switch entries", () => {
    const node = projectsNode(
      resolveUnifiedNavItems({
        isSuperAdmin: false,
        projects,
        activeProjectId: "project-alpha",
      }),
    );
    const beta = node.children?.find((item) => item.key === "global.projects.other.project-beta");
    const gamma = node.children?.find((item) => item.key === "global.projects.other.project-gamma");

    expect(beta).toMatchObject({
      label: "Project Beta",
      to: "/projects/project-beta",
    });
    expect(beta?.groupLabelBeforeKey).toBeUndefined();
    expect(beta?.children).toBeUndefined();
    expect(gamma).toMatchObject({
      label: "Project Gamma",
      to: "/projects/project-gamma",
      disabled: true,
    });
  });

  test("shows compact project entries when there is no active project", () => {
    const node = projectsNode();
    const currentProject = node.children?.find((item) =>
      item.key.startsWith("global.projects.current."),
    );
    const beta = node.children?.find((item) => item.key === "global.projects.other.project-beta");

    expect(currentProject).toBeUndefined();
    expect(beta).toMatchObject({
      label: "Project Beta",
      to: "/projects/project-beta",
    });
  });

  test("adds view all projects when other projects exceed the compact limit", () => {
    const node = projectsNode(
      resolveUnifiedNavItems({
        isSuperAdmin: false,
        projects,
        activeProjectId: "project-alpha",
        otherProjectLimit: 1,
      }),
    );

    expect(node.children?.map((item) => item.key)).toContain("global.projects.other.view-all");
  });

  test("preserves project renderers for sidebar inline edit and action menus", () => {
    const renderLabel = vi.fn();
    const actionRenderer = vi.fn();
    const node = projectsNode(
      resolveUnifiedNavItems({
        isSuperAdmin: false,
        projects: [{ ...projects[0], renderLabel, actionRenderer }],
        activeProjectId: null,
      }),
    );
    const alpha = node.children?.find((item) => item.key === "global.projects.other.project-alpha");

    expect(alpha?.renderLabel).toBe(renderLabel);
    expect(alpha?.actionRenderer).toBe(actionRenderer);
  });
});
