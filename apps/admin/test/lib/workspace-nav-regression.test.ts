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
      "/editor",
      "/assets",
      "/website/project-releases",
      "/content/library",
      "/content/models",
      "/seo/google-analytics",
      "/seo/audit",
      "/website/config",
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
      "editor",
      "assets",
      "website.domains",
      "content",
      "seo",
      "website.config",
      "activity",
      "settings.project",
    ]);

    expect(ADMIN_NAV_ITEMS.find((item) => item.key === "assets")).toMatchObject({
      groupLabelBeforeKey: "nav:NAV_GROUP_WEBSITE",
    });
    expect(ADMIN_NAV_ITEMS.find((item) => item.key === "website.domains")).toMatchObject({
      labelKey: "nav:NAV_WEBSITE_DOMAINS",
      to: "/website/project-releases",
    });
    expect(ADMIN_NAV_ITEMS.find((item) => item.key === "content")).toMatchObject({
      labelKey: "nav:NAV_CONTENT",
      children: [
        expect.objectContaining({ key: "content.library", to: "/content/library" }),
        expect.objectContaining({ key: "content.models", to: "/content/models" }),
      ],
    });
    expect(ADMIN_NAV_ITEMS.find((item) => item.key === "seo")).toMatchObject({
      labelKey: "nav:NAV_SECTION_SEO",
      children: [
        expect.objectContaining({ key: "seo.google-analytics", to: "/seo/google-analytics" }),
        expect.objectContaining({ key: "seo.audit", to: "/seo/audit" }),
      ],
    });
    expect(ADMIN_NAV_ITEMS.find((item) => item.key === "website.config")).toMatchObject({
      labelKey: "nav:NAV_WEBSITE_CONFIG",
      to: "/website/config",
    });
    expect(ADMIN_NAV_ITEMS.find((item) => item.key === "activity")).toMatchObject({
      groupLabelBeforeKey: "nav:NAV_SECTION_PROJECT",
    });

    expect(ADMIN_NAV_ITEMS.find((item) => item.key === "content")?.children).toHaveLength(2);
    expect(ADMIN_NAV_ITEMS.find((item) => item.key === "seo")?.children).toHaveLength(2);
  });

  test("returns the project-first workspace nav tree", () => {
    const projectNav = getProjectNavItems();

    expect(projectNav.map((item) => item.key)).toEqual([
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
    expect(listWorkspaceNavTargets(projectNav)).toContain("/website/project-releases");
    expect(listWorkspaceNavTargets(projectNav)).toContain("/website/config");
    expect(listWorkspaceNavTargets(projectNav)).toContain("/settings/general");
  });
});
