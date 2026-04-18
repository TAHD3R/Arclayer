import { describe, expect, test } from "vitest";

import { GLOBAL_NAV_ITEMS, resolveGlobalNavItems } from "@/constants/menu/global";

describe("global nav regression", () => {
  test("registers projects and platform global groups", () => {
    const projectsItem = GLOBAL_NAV_ITEMS.find((item) => item.key === "global.projects");
    const platformItem = GLOBAL_NAV_ITEMS.find((item) => item.key === "global.platform");
    const platformChildren = platformItem?.children?.map((item) => item.key);
    const configurationItem = platformItem?.children?.find(
      (item) => item.key === "global.platform.configuration",
    );

    expect(projectsItem).toMatchObject({
      key: "global.projects",
      label: "Projects",
      to: "/projects",
    });
    expect(platformItem).toMatchObject({
      key: "global.platform",
      label: "Platform",
    });
    expect(platformChildren).toEqual([
      "global.platform.tenants",
      "global.platform.plans",
      "global.platform.access",
      "global.platform.audit",
      "global.platform.overview",
      "global.platform.jobs",
      "global.platform.configuration",
      "global.platform.revenue",
      "global.platform.support",
    ]);
    expect(configurationItem).toMatchObject({
      key: "global.platform.configuration",
      to: "/system",
    });
    expect(configurationItem?.disabled).toBeUndefined();
  });

  test("only exposes platform to super admins while keeping projects visible", () => {
    const regularKeys = resolveGlobalNavItems({ isSuperAdmin: false }).map((item) => item.key);
    const superAdminItems = resolveGlobalNavItems({ isSuperAdmin: true });
    const superAdminKeys = superAdminItems.map((item) => item.key);
    const platformItem = superAdminItems.find((item) => item.key === "global.platform");
    const projectsItem = superAdminItems.find((item) => item.key === "global.projects");

    expect(regularKeys).toContain("global.projects");
    expect(regularKeys).not.toContain("global.platform");
    expect(superAdminKeys).toContain("global.projects");
    expect(superAdminKeys).toContain("global.platform");
    expect(projectsItem?.to).toBe("/projects");
    expect(platformItem?.children?.map((item) => item.key)).toContain("global.platform.overview");
  });

  test("marks projects as a navigate-self-and-expand group", () => {
    const projectsItem = GLOBAL_NAV_ITEMS.find((item) => item.key === "global.projects");

    expect(projectsItem).toMatchObject({
      key: "global.projects",
      label: "Projects",
      to: "/projects",
      groupBehavior: "navigate-self-and-expand",
    });
  });

  test("injects runtime project children under the global projects node", () => {
    const projectsItemTemplate = GLOBAL_NAV_ITEMS.find((item) => item.key === "global.projects");

    const injectedItems = resolveGlobalNavItems({
      isSuperAdmin: false,
      projectChildren: [
        {
          key: "global.projects.project-alpha",
          label: "Alpha",
          to: "/projects/project-alpha",
          icon: projectsItemTemplate!.icon,
        },
      ],
    });
    const projectsItem = injectedItems.find((item) => item.key === "global.projects");

    expect(projectsItem?.children).toHaveLength(1);
    expect(projectsItem?.children?.[0]).toMatchObject({
      key: "global.projects.project-alpha",
      label: "Alpha",
      to: "/projects/project-alpha",
    });
  });
});
