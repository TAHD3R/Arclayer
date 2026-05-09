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
      "/activity",
      "/assets",
      "/content/library",
      "/content/models",
      "/content/general",
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
      "activity",
      "assets",
      "content.library",
      "content.models",
      "website.analytics",
      "settings.site",
      "apps.manage",
      "apps.market",
      "automations",
      "settings.project",
    ]);

    expect(ADMIN_NAV_ITEMS.find((item) => item.key === "assets")).toMatchObject({
      groupLabelBeforeKey: "nav:NAV_GROUP_WEBSITE",
    });
    expect(ADMIN_NAV_ITEMS.find((item) => item.key === "website.analytics")).toMatchObject({
      labelKey: "nav:NAV_SECTION_ANALYTICS",
      children: [
        expect.objectContaining({ key: "analytics.highlights", disabled: true }),
        expect.objectContaining({ key: "analytics.real-time", disabled: true }),
        expect.objectContaining({ key: "analytics.traffic", disabled: true }),
        expect.objectContaining({ key: "analytics.insights", disabled: true }),
      ],
    });
    expect(ADMIN_NAV_ITEMS.find((item) => item.key === "apps.manage")).toMatchObject({
      groupLabelBeforeKey: "nav:NAV_SECTION_APPS",
    });
    expect(ADMIN_NAV_ITEMS.find((item) => item.key === "settings.site")).toMatchObject({
      labelKey: "nav:NAV_SETTINGS_SITE",
    });
    expect(ADMIN_NAV_ITEMS.find((item) => item.key === "settings.project")).toMatchObject({
      groupLabelBeforeKey: "nav:NAV_SECTION_CONFIGURATION",
    });

    expect(ADMIN_NAV_ITEMS.find((item) => item.key === "website.analytics")?.children).toHaveLength(
      4,
    );
  });

  test("returns the project-first workspace nav tree", () => {
    const projectNav = getProjectNavItems();

    expect(projectNav.map((item) => item.key)).toEqual([
      "dashboard",
      "activity",
      "assets",
      "content.library",
      "content.models",
      "website.analytics",
      "settings.site",
      "apps.manage",
      "apps.market",
      "automations",
      "settings.project",
    ]);
    expect(listWorkspaceNavTargets(projectNav)).toContain("/content/general");
    expect(listWorkspaceNavTargets(projectNav)).toContain("/settings/general");
  });
});
