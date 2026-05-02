import { describe, expect, test } from "vitest";

import { resolveProjectSceneNavItems } from "@/constants/menu/project-scene";

function flatten(items: ReturnType<typeof resolveProjectSceneNavItems>) {
  const out = [...items];
  for (const item of items) {
    if (item.children?.length) out.push(...flatten(item.children));
  }
  return out;
}

describe("resolveProjectSceneNavItems", () => {
  test("maps the project menu directly to the active project route", () => {
    const items = resolveProjectSceneNavItems("project-alpha");

    expect(items.map((item) => item.key)).toEqual([
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
    expect(items[0]).toMatchObject({
      labelKey: "nav:NAV_DASHBOARD",
      to: "/projects/project-alpha/",
    });
    expect(items.find((item) => item.key === "assets")).toMatchObject({
      labelKey: "nav:NAV_ASSETS",
      groupLabelBeforeKey: "nav:NAV_GROUP_WEBSITE",
      to: "/projects/project-alpha/assets",
    });
    expect(items.find((item) => item.key === "analytics.highlights")).toMatchObject({
      groupLabelBeforeKey: "nav:NAV_SECTION_ANALYTICS",
    });
    expect(items.find((item) => item.key === "apps.manage")).toMatchObject({
      groupLabelBeforeKey: "nav:NAV_SECTION_APPS",
    });
    expect(items.find((item) => item.key === "activity")).toMatchObject({
      groupLabelBeforeKey: "nav:NAV_SECTION_OPERATIONS",
    });
    expect(items.find((item) => item.key === "settings.project")).toMatchObject({
      groupLabelBeforeKey: "nav:NAV_SECTION_CONFIGURATION",
    });
    expect(flatten(items).some((item) => item.key.startsWith("global.projects"))).toBe(false);
  });
});
