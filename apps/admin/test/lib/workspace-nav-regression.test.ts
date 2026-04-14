import { describe, expect, test } from "vitest";

import { ADMIN_NAV_ITEMS, getWorkspaceNavItems } from "@/constants/menu/workspaces";

function listWorkspaceNavTargets(items = ADMIN_NAV_ITEMS): string[] {
  const out: string[] = [];
  const walk = (navItems: typeof ADMIN_NAV_ITEMS) => {
    for (const item of navItems) {
      if (item.to) out.push(item.to);
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
      "/settings/site",
      "/team/members",
      "/team/invitations",
      "/team/roles",
      "/extensions",
      "/activity",
      "/settings/workspace",
    ]);
  });

  test("keeps hidden content routes out of the workspace sidebar", () => {
    expect(listWorkspaceNavTargets()).not.toContain("/content/site-builder");
    expect(listWorkspaceNavTargets()).not.toContain("/content/models");
  });

  test("keeps workspace nav tree aligned with the approved IA", () => {
    expect(ADMIN_NAV_ITEMS.map((item) => item.key)).toEqual([
      "dashboard",
      "content",
      "team",
      "workspace",
    ]);

    expect(
      ADMIN_NAV_ITEMS.find((item) => item.key === "content")?.children?.map((item) => item.key),
    ).toEqual(["assets", "content.library", "settings.site"]);

    expect(
      ADMIN_NAV_ITEMS.find((item) => item.key === "workspace")?.children?.map((item) => item.key),
    ).toEqual(["extensions", "activity", "settings.workspace"]);
  });

  test("removes the Team nav group for personal workspaces", () => {
    const personalNav = getWorkspaceNavItems("personal");

    expect(personalNav.map((item) => item.key)).toEqual(["dashboard", "content", "workspace"]);
    expect(listWorkspaceNavTargets(personalNav)).not.toContain("/team/members");
    expect(listWorkspaceNavTargets(personalNav)).not.toContain("/team/invitations");
    expect(listWorkspaceNavTargets(personalNav)).not.toContain("/team/roles");
  });

  test("keeps the Team nav group for team workspaces", () => {
    const teamNav = getWorkspaceNavItems("team");

    expect(teamNav.map((item) => item.key)).toEqual(["dashboard", "content", "team", "workspace"]);
    expect(listWorkspaceNavTargets(teamNav)).toContain("/team/members");
    expect(listWorkspaceNavTargets(teamNav)).toContain("/team/invitations");
    expect(listWorkspaceNavTargets(teamNav)).toContain("/team/roles");
  });
});
