import { isValidElement } from "react";
import {
  Activity,
  BrainCircuit,
  Boxes,
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
} from "lucide-react";
import { describe, expect, test } from "vitest";

import {
  GLOBAL_NAV_ITEMS,
  GLOBAL_RECENT_PROJECT_LIMIT,
  resolveGlobalNavItems,
} from "@/constants/menu/global";
import { findActiveTrailNodes } from "@/lib/admin-nav-utils";

describe("global nav regression", () => {
  test("registers all projects and platform global entries", () => {
    const projectsItem = GLOBAL_NAV_ITEMS.find((item) => item.key === "global.projects");
    const platformItems = GLOBAL_NAV_ITEMS.filter((item) =>
      item.key.startsWith("global.platform."),
    );
    const platformKeys = platformItems.map((item) => item.key);
    const platformOverview = GLOBAL_NAV_ITEMS.find(
      (item) => item.key === "global.platform.overview",
    );
    const resourcesItem = GLOBAL_NAV_ITEMS.find((item) => item.key === "global.resources");
    const configurationItem = GLOBAL_NAV_ITEMS.find(
      (item) => item.key === "global.platform.configuration",
    );

    expect(projectsItem).toMatchObject({
      key: "global.projects",
      label: "All projects",
      labelKey: "nav:NAV_ALL_PROJECTS",
      to: "/projects",
      insertStarredAfter: true,
    });
    expect(projectsItem?.groupLabelBeforeKey).toBeUndefined();
    expect(projectsItem?.children).toBeUndefined();
    expect(resourcesItem).toMatchObject({
      key: "global.resources",
      label: "Inspiration",
      labelKey: "nav:NAV_RESOURCES",
      to: "/inspriation",
    });
    expect(resourcesItem?.disabled).toBeUndefined();
    expect(platformOverview).toMatchObject({
      key: "global.platform.overview",
      groupLabelBeforeKey: "nav:NAV_SECTION_PLATFORM",
    });
    expect(platformKeys).toEqual([
      "global.platform.overview",
      "global.platform.tenants",
      "global.platform.audit",
      "global.platform.feedback",
      "global.platform.plugins",
      "global.platform.observability",
      "global.platform.configuration",
    ]);
    expect(configurationItem).toMatchObject({
      key: "global.platform.configuration",
      to: "/system",
    });
    expect(configurationItem?.disabled).toBeUndefined();
    const tenantsItem = GLOBAL_NAV_ITEMS.find((item) => item.key === "global.platform.tenants");
    expect(tenantsItem?.to).toBe("/system/tenants");
    expect(tenantsItem?.disabled).toBeUndefined();
    const observabilityItem = GLOBAL_NAV_ITEMS.find(
      (item) => item.key === "global.platform.observability",
    );
    expect(observabilityItem?.children?.map((item) => item.to)).toEqual([
      "/system/observability/requests",
      "/system/observability/ai-usage",
      "/system/observability/activity",
    ]);
    expect(platformOverview?.disabled).toBeUndefined();
  });

  test("only exposes platform to super admins while keeping projects visible", () => {
    const regularKeys = resolveGlobalNavItems({ isSuperAdmin: false }).map((item) => item.key);
    const superAdminItems = resolveGlobalNavItems({ isSuperAdmin: true });
    const superAdminKeys = superAdminItems.map((item) => item.key);
    const projectsItem = superAdminItems.find((item) => item.key === "global.projects");

    expect(regularKeys).toContain("global.projects");
    expect(regularKeys.some((key) => key.startsWith("global.platform."))).toBe(false);
    expect(superAdminKeys).toContain("global.projects");
    expect(superAdminKeys).toContain("global.platform.overview");
    expect(superAdminKeys).toContain("global.platform.tenants");
    expect(projectsItem?.to).toBe("/projects");
  });

  test("uses product-specific icons for every static global menu item", () => {
    const iconByKey = new Map(GLOBAL_NAV_ITEMS.map((item) => [item.key, item.icon]));
    const observabilityChildren =
      GLOBAL_NAV_ITEMS.find((item) => item.key === "global.platform.observability")?.children ?? [];

    expect(iconByKey).toEqual(
      new Map([
        ["global.home", House],
        ["global.resources", Boxes],
        ["global.projects", FolderKanban],
        ["global.platform.overview", LayoutDashboard],
        ["global.platform.tenants", Building2],
        ["global.platform.audit", ScrollText],
        ["global.platform.feedback", MessageSquareHeart],
        ["global.platform.plugins", Plug],
        ["global.platform.observability", Activity],
        ["global.platform.configuration", SlidersHorizontal],
      ]),
    );
    expect(new Map(observabilityChildren.map((item) => [item.key, item.icon]))).toEqual(
      new Map([
        ["global.platform.observability.requests", ChartNoAxesCombined],
        ["global.platform.observability.ai-usage", BrainCircuit],
        ["global.platform.observability.activity", ChartSpline],
      ]),
    );
  });

  test("keeps all projects directly below inspiration without a section label", () => {
    const projectsItem = GLOBAL_NAV_ITEMS.find((item) => item.key === "global.projects");
    const resourcesIndex = GLOBAL_NAV_ITEMS.findIndex((item) => item.key === "global.resources");
    const projectsIndex = GLOBAL_NAV_ITEMS.findIndex((item) => item.key === "global.projects");

    expect(projectsItem).toMatchObject({
      key: "global.projects",
      label: "All projects",
      labelKey: "nav:NAV_ALL_PROJECTS",
      to: "/projects",
    });
    expect(projectsIndex).toBe(resourcesIndex + 1);
    expect(projectsItem?.groupLabelBeforeKey).toBeUndefined();
    expect(projectsItem?.groupBehavior).toBeUndefined();
    expect(projectsItem?.children).toBeUndefined();
  });

  test("adds a recent projects section only when navigable projects exist", () => {
    const withoutRecentProjects = resolveGlobalNavItems({ isSuperAdmin: false });
    const withRecentProjects = resolveGlobalNavItems({
      isSuperAdmin: false,
      recentProjects: [
        {
          projectId: "project-alpha",
          name: "Project Alpha",
          iconMode: "emoji",
          iconColor: "#123456",
          iconEmoji: "🚀",
        },
        { projectId: "project-beta", name: "Project Beta" },
        { projectId: "project-gamma", name: "Project Gamma" },
        { projectId: "project-delta", name: "Project Delta" },
      ],
    });
    const recentItems = withRecentProjects.filter((item) =>
      item.key.startsWith("global.recent-project."),
    );
    const allProjectsItem = withRecentProjects.find((item) => item.key === "global.projects");

    expect(
      withoutRecentProjects.some((item) => item.key.startsWith("global.recent-project.")),
    ).toBe(false);
    expect(GLOBAL_RECENT_PROJECT_LIMIT).toBe(3);
    expect(recentItems).toHaveLength(GLOBAL_RECENT_PROJECT_LIMIT);
    expect(recentItems).toMatchObject([
      {
        key: "global.recent-project.project-alpha",
        label: "Project Alpha",
        to: "/projects/project-alpha",
        icon: FolderKanban,
        groupLabelBeforeKey: "nav:NAV_SECTION_PROJECTS",
      },
      {
        key: "global.recent-project.project-beta",
        label: "Project Beta",
        to: "/projects/project-beta",
      },
      {
        key: "global.recent-project.project-gamma",
        label: "Project Gamma",
        to: "/projects/project-gamma",
      },
    ]);
    const firstProjectIcon = recentItems[0]?.iconNode;
    expect(isValidElement(firstProjectIcon)).toBe(true);
    if (!isValidElement(firstProjectIcon)) throw new Error("Expected a project avatar icon node");
    expect(firstProjectIcon.props).toMatchObject({
      name: "Project Alpha",
      size: 20,
      decorative: true,
      iconMode: "emoji",
      iconColor: "#123456",
      iconEmoji: "🚀",
    });
    expect(allProjectsItem?.insertStarredAfter).toBe(true);
  });

  test("marks the requests child active when it shares the observability parent target", () => {
    const trail = findActiveTrailNodes(GLOBAL_NAV_ITEMS, "/system/observability/requests");

    expect(trail.map((item) => item.key)).toEqual([
      "global.platform.observability",
      "global.platform.observability.requests",
    ]);
  });
});
