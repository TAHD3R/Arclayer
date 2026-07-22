import { describe, expect, it } from "vitest";

import { resolveGlobalNavItems } from "@/constants/menu/global";
import { resolveProjectSceneNavItems } from "@/constants/menu/project-scene";
import { buildAdminTopbarBreadcrumbs } from "@/lib/admin-topbar-breadcrumbs";

describe("buildAdminTopbarBreadcrumbs", () => {
  it("maps the projects index directly to All projects", () => {
    const breadcrumbs = buildAdminTopbarBreadcrumbs(
      resolveGlobalNavItems({ isSuperAdmin: false }),
      "/projects",
    );

    expect(breadcrumbs.map((item) => item.labelKey)).toEqual(["nav:NAV_ALL_PROJECTS"]);
    expect(breadcrumbs[0]?.menuItems).toBeUndefined();
  });

  it("maps project assets into the Website group", () => {
    const breadcrumbs = buildAdminTopbarBreadcrumbs(
      resolveProjectSceneNavItems("project-alpha"),
      "/projects/project-alpha/assets",
    );

    expect(breadcrumbs.map((item) => item.labelKey)).toEqual([
      "nav:NAV_GROUP_WEBSITE",
      "nav:NAV_ASSETS",
    ]);
  });

  it("maps project and releases to the Website group", () => {
    const breadcrumbs = buildAdminTopbarBreadcrumbs(
      resolveProjectSceneNavItems("project-alpha"),
      "/projects/project-alpha/website/project-releases",
    );

    expect(breadcrumbs.map((item) => item.labelKey)).toEqual([
      "nav:NAV_GROUP_WEBSITE",
      "nav:NAV_WEBSITE_DOMAINS",
    ]);
    expect(breadcrumbs[0]?.menuItems?.map((item) => item.labelKey)).toEqual([
      "nav:NAV_ASSETS",
      "nav:NAV_WEBSITE_DOMAINS",
      "nav:NAV_CONTENT",
      "nav:NAV_SECTION_SEO",
      "nav:NAV_WEBSITE_CONFIG",
    ]);
  });
});
