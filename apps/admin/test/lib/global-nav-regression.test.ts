import { describe, expect, test } from "vitest";

import { GLOBAL_NAV_ITEMS, resolveGlobalNavItems } from "@/constants/menu/global";

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
    const configurationItem = GLOBAL_NAV_ITEMS.find(
      (item) => item.key === "global.platform.configuration",
    );

    expect(projectsItem).toMatchObject({
      key: "global.projects",
      label: "All projects",
      labelKey: "nav:NAV_ALL_PROJECTS",
      to: "/projects",
    });
    expect(projectsItem?.children).toBeUndefined();
    expect(platformOverview).toMatchObject({
      key: "global.platform.overview",
      groupLabelBeforeKey: "nav:NAV_SECTION_PLATFORM",
    });
    expect(platformKeys).toEqual([
      "global.platform.overview",
      "global.platform.tenants",
      "global.platform.audit",
      "global.platform.jobs",
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
