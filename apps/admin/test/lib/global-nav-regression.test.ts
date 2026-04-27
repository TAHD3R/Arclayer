import { describe, expect, test } from "vitest";

import { GLOBAL_NAV_ITEMS, resolveGlobalNavItems } from "@/constants/menu/global";

describe("global nav regression", () => {
  test("registers all projects and platform global entries", () => {
    const projectsItem = GLOBAL_NAV_ITEMS.find((item) => item.key === "global.projects");
    const platformItem = GLOBAL_NAV_ITEMS.find((item) => item.key === "global.platform");
    const platformChildren = platformItem?.children?.map((item) => item.key);
    const configurationItem = platformItem?.children?.find(
      (item) => item.key === "global.platform.configuration",
    );

    expect(projectsItem).toMatchObject({
      key: "global.projects",
      label: "All projects",
      labelKey: "nav:NAV_ALL_PROJECTS",
      to: "/projects",
    });
    expect(projectsItem?.children).toBeUndefined();
    expect(platformItem).toMatchObject({
      key: "global.platform",
      label: "Platform",
    });
    expect(platformChildren).toEqual([
      "global.platform.overview",
      "global.platform.tenants",
      "global.platform.plans",
      "global.platform.audit",
      "global.platform.jobs",
      "global.platform.configuration",
    ]);
    expect(configurationItem).toMatchObject({
      key: "global.platform.configuration",
      to: "/system",
    });
    expect(configurationItem?.disabled).toBeUndefined();
    const tenantsItem = platformItem?.children?.find(
      (item) => item.key === "global.platform.tenants",
    );
    expect(tenantsItem?.to).toBe("/system/tenants");
    expect(tenantsItem?.disabled).toBeUndefined();
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

  test("marks all projects as a leaf link with a projects section label", () => {
    const projectsItem = GLOBAL_NAV_ITEMS.find((item) => item.key === "global.projects");

    expect(projectsItem).toMatchObject({
      key: "global.projects",
      label: "All projects",
      labelKey: "nav:NAV_ALL_PROJECTS",
      groupLabelBeforeKey: "nav:NAV_SECTION_PROJECTS",
      to: "/projects",
    });
    expect(projectsItem?.groupBehavior).toBeUndefined();
    expect(projectsItem?.children).toBeUndefined();
  });
});
