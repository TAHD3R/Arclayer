import { describe, expect, test } from "vitest";

import { ADMIN_NAV_ITEMS, getWorkspaceNavItems } from "@/constants/menu/workspaces";

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
      "/notifications",
      "/assets",
      "/content/models",
      "/content/library",
      "/settings/general",
      "/activity",
      "/settings/members",
      "/settings/workspace/general",
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
      "inbox",
      "website",
      "marketing",
      "analytics",
      "customers.leads",
      "apps",
      "automations",
      "activity",
      "settings.project",
      "settings.workspace",
    ]);

    expect(ADMIN_NAV_ITEMS.find((item) => item.key === "website")).toMatchObject({
      labelKey: "nav:NAV_GROUP_WEBSITE",
      dividerBefore: true,
    });
    expect(ADMIN_NAV_ITEMS.find((item) => item.key === "activity")).toMatchObject({
      dividerBefore: true,
    });

    expect(
      ADMIN_NAV_ITEMS.find((item) => item.key === "website")?.children?.map((item) => item.key),
    ).toEqual(["assets", "content.models", "content.library", "settings.site"]);
    expect(
      ADMIN_NAV_ITEMS.find((item) => item.key === "marketing")?.children?.every(
        (item) => item.disabled,
      ),
    ).toBe(true);
    expect(
      ADMIN_NAV_ITEMS.find((item) => item.key === "analytics")?.children?.every(
        (item) => item.disabled,
      ),
    ).toBe(true);
    expect(
      ADMIN_NAV_ITEMS.find((item) => item.key === "customers.leads")?.children?.every(
        (item) => item.disabled,
      ),
    ).toBe(true);
    expect(
      ADMIN_NAV_ITEMS.find((item) => item.key === "customers.leads")?.children?.map(
        (item) => item.key,
      ),
    ).toEqual(["customers.contacts", "customers.leads.list", "customers.forms-submissions"]);
    expect(ADMIN_NAV_ITEMS.find((item) => item.key === "automations")).toMatchObject({
      disabled: true,
      labelKey: "nav:NAV_AUTOMATIONS",
    });
  });

  test("returns the project-first workspace nav tree", () => {
    const workspaceNav = getWorkspaceNavItems();

    expect(workspaceNav.map((item) => item.key)).toEqual([
      "dashboard",
      "inbox",
      "website",
      "marketing",
      "analytics",
      "customers.leads",
      "apps",
      "automations",
      "activity",
      "settings.project",
      "settings.workspace",
    ]);
    expect(listWorkspaceNavTargets(workspaceNav)).toContain("/settings/general");
    expect(listWorkspaceNavTargets(workspaceNav)).toContain("/settings/workspace/general");
  });
});
