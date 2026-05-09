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
    expect(items[0]).toMatchObject({
      labelKey: "nav:NAV_DASHBOARD",
      to: "/projects/project-alpha/",
    });
    expect(items.find((item) => item.key === "assets")).toMatchObject({
      labelKey: "nav:NAV_ASSETS",
      groupLabelBeforeKey: "nav:NAV_GROUP_WEBSITE",
      to: "/projects/project-alpha/assets",
    });
    expect(items.find((item) => item.key === "website.analytics")).toMatchObject({
      labelKey: "nav:NAV_SECTION_ANALYTICS",
      children: [
        expect.objectContaining({ key: "analytics.highlights", disabled: true }),
        expect.objectContaining({ key: "analytics.real-time", disabled: true }),
        expect.objectContaining({ key: "analytics.traffic", disabled: true }),
        expect.objectContaining({ key: "analytics.insights", disabled: true }),
      ],
    });
    expect(items.find((item) => item.key === "apps.manage")).toMatchObject({
      groupLabelBeforeKey: "nav:NAV_SECTION_APPS",
    });
    expect(items.find((item) => item.key === "settings.site")).toMatchObject({
      labelKey: "nav:NAV_SETTINGS_SITE",
    });
    expect(items.find((item) => item.key === "settings.project")).toMatchObject({
      groupLabelBeforeKey: "nav:NAV_SECTION_CONFIGURATION",
    });
    expect(flatten(items).some((item) => item.key.startsWith("global.projects"))).toBe(false);
  });
});
