import { describe, expect, test } from "vitest";

import { ADMIN_NAV_ITEMS, getProjectNavItems } from "@/constants/menu/project";

function listWorkspaceNavTargets(items = ADMIN_NAV_ITEMS): string[] {
  const out: string[] = [];
  const walk = (navItems: typeof ADMIN_NAV_ITEMS) => {
    for (const item of navItems) {
      if (item.to && !item.disabled) out.push(item.to);
      if (item.children?.length) walk(item.children);
    }
  };
  walk(items);
  return out;
}

function listWorkspaceNavKeys(items = ADMIN_NAV_ITEMS): string[] {
  const out: string[] = [];
  const walk = (navItems: typeof ADMIN_NAV_ITEMS) => {
    for (const item of navItems) {
      out.push(item.key);
      if (item.children?.length) walk(item.children);
    }
  };
  walk(items);
  return out;
}

describe("workspace nav regression", () => {
  test("keeps workspace nav aligned with live workspace routes", () => {
    expect(listWorkspaceNavTargets()).toEqual([
      "/",
      "/assets",
      "/content/library",
      "/content/models",
      "/content/releases",
      "/content/general",
      "/activity",
      "/settings/general",
    ]);
  });

  test("keeps hidden content routes out of the workspace sidebar", () => {
    expect(listWorkspaceNavTargets()).not.toContain("/content/site-builder");
    expect(listWorkspaceNavTargets()).not.toContain("/settings/seo");
  });

  test("keeps workspace nav keys unique across the full tree", () => {
    const keys = listWorkspaceNavKeys();
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("keeps workspace nav tree aligned with the approved IA", () => {
    expect(ADMIN_NAV_ITEMS.map((item) => item.key)).toEqual([
      "dashboard",
      "assets",
      "content.library",
      "content.models",
      "content.releases",
      "settings.site",
      "analytics.highlights",
      "analytics.real-time",
      "analytics.traffic",
      "analytics.insights",
      "apps.manage",
      "apps.market",
      "automations",
      "activity",
      "settings.project",
    ]);

    expect(ADMIN_NAV_ITEMS.find((item) => item.key === "assets")).toMatchObject({
      groupLabelBeforeKey: "nav:NAV_GROUP_WEBSITE",
    });
    expect(ADMIN_NAV_ITEMS.find((item) => item.key === "analytics.highlights")).toMatchObject({
      groupLabelBeforeKey: "nav:NAV_SECTION_ANALYTICS",
    });
    expect(ADMIN_NAV_ITEMS.find((item) => item.key === "apps.manage")).toMatchObject({
      groupLabelBeforeKey: "nav:NAV_SECTION_APPS",
    });
    expect(ADMIN_NAV_ITEMS.find((item) => item.key === "activity")).toMatchObject({
      groupLabelBeforeKey: "nav:NAV_SECTION_OPERATIONS",
    });
    expect(ADMIN_NAV_ITEMS.find((item) => item.key === "settings.project")).toMatchObject({
      groupLabelBeforeKey: "nav:NAV_SECTION_CONFIGURATION",
    });

    expect(ADMIN_NAV_ITEMS.some((item) => item.children?.length)).toBe(false);
  });

  test("returns the project-first workspace nav tree", () => {
    const projectNav = getProjectNavItems();

    expect(projectNav.map((item) => item.key)).toEqual([
      "dashboard",
      "assets",
      "content.library",
      "content.models",
      "content.releases",
      "settings.site",
      "analytics.highlights",
      "analytics.real-time",
      "analytics.traffic",
      "analytics.insights",
      "apps.manage",
      "apps.market",
      "automations",
      "activity",
      "settings.project",
    ]);
    expect(listWorkspaceNavTargets(projectNav)).toContain("/content/general");
    expect(listWorkspaceNavTargets(projectNav)).toContain("/settings/general");
  });
});
