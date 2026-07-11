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
      "editor",
      "assets",
      "website.domains",
      "content",
      "seo",
      "website.config",
      "activity",
      "settings.project",
    ]);
    expect(items[0]).toMatchObject({
      labelKey: "nav:NAV_DASHBOARD",
      to: "/projects/project-alpha/",
    });
    expect(items.find((item) => item.key === "assets")).toMatchObject({
      labelKey: "nav:NAV_ASSETS",
      to: "/projects/project-alpha/assets",
      groupLabelBeforeKey: "nav:NAV_GROUP_WEBSITE",
    });
    expect(items.find((item) => item.key === "website.domains")).toMatchObject({
      labelKey: "nav:NAV_WEBSITE_DOMAINS",
      to: "/projects/project-alpha/website/project-releases",
    });
    expect(items.find((item) => item.key === "content")).toMatchObject({
      labelKey: "nav:NAV_CONTENT",
      children: [
        expect.objectContaining({
          key: "content.library",
          to: "/projects/project-alpha/content/library",
        }),
        expect.objectContaining({
          key: "content.models",
          to: "/projects/project-alpha/content/models",
        }),
      ],
    });
    expect(items.find((item) => item.key === "seo")).toMatchObject({
      labelKey: "nav:NAV_SECTION_SEO",
      children: [
        expect.objectContaining({
          key: "seo.google-analytics",
          to: "/projects/project-alpha/seo/google-analytics",
        }),
        expect.objectContaining({ key: "seo.audit", to: "/projects/project-alpha/seo/audit" }),
      ],
    });
    expect(items.find((item) => item.key === "website.config")).toMatchObject({
      labelKey: "nav:NAV_WEBSITE_CONFIG",
      to: "/projects/project-alpha/website/config",
    });
    expect(items.find((item) => item.key === "activity")).toMatchObject({
      groupLabelBeforeKey: "nav:NAV_SECTION_PROJECT",
    });
    expect(flatten(items).some((item) => item.key.startsWith("global.projects"))).toBe(false);
  });
});
