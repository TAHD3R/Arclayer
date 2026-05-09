import { describe, expect, it } from "vitest";

import { resolveGlobalNavItems } from "@/constants/menu/global";
import { resolveProjectSceneNavItems } from "@/constants/menu/project-scene";
import { buildAdminTopbarBreadcrumbs } from "@/lib/admin-topbar-breadcrumbs";

describe("buildAdminTopbarBreadcrumbs", () => {
  it("maps the projects index to Projects > All projects", () => {
    const breadcrumbs = buildAdminTopbarBreadcrumbs(
      resolveGlobalNavItems({ isSuperAdmin: false }),
      "/projects",
    );

    expect(breadcrumbs.map((item) => item.labelKey)).toEqual([
      "nav:NAV_SECTION_PROJECTS",
      "nav:NAV_ALL_PROJECTS",
    ]);
    expect(breadcrumbs[0]?.menuItems?.map((item) => item.labelKey)).toEqual([
      "nav:NAV_ALL_PROJECTS",
    ]);
  });

  it("maps project assets to Website > Assets", () => {
    const breadcrumbs = buildAdminTopbarBreadcrumbs(
      resolveProjectSceneNavItems("project-alpha"),
      "/projects/project-alpha/assets",
    );

    expect(breadcrumbs.map((item) => item.labelKey)).toEqual([
      "nav:NAV_GROUP_WEBSITE",
      "nav:NAV_ASSETS",
    ]);
    expect(breadcrumbs[0]?.menuItems?.map((item) => item.labelKey)).toEqual([
      "nav:NAV_ASSETS",
      "nav:NAV_CONTENT_LIBRARY",
      "nav:NAV_CONTENT_MODELS",
      "nav:NAV_SECTION_ANALYTICS",
      "nav:NAV_SETTINGS_SITE",
    ]);
  });
});
