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
    const websiteGroup = items.find((item) => item.key === "website");

    expect(items.map((item) => item.key)).toEqual([
      "dashboard",
      "website",
      "analytics",
      "apps",
      "automations",
      "activity",
      "settings.project",
    ]);
    expect(items[0]).toMatchObject({
      labelKey: "nav:NAV_DASHBOARD",
      to: "/projects/project-alpha/",
    });
    expect(websiteGroup).toMatchObject({
      key: "website",
      labelKey: "nav:NAV_GROUP_WEBSITE",
      defaultExpanded: true,
      dividerBefore: true,
    });
    expect(websiteGroup?.children?.map((item) => item.to)).toContain(
      "/projects/project-alpha/content/library",
    );
    expect(flatten(items).some((item) => item.key.startsWith("global.projects"))).toBe(false);
  });
});
