import { describe, expect, test } from "vitest";

import { ADMIN_NAV_ITEMS } from "@/constants/menu/workspaces";

function listWorkspaceNavTargets(): string[] {
  const out: string[] = [];
  const walk = (items: typeof ADMIN_NAV_ITEMS) => {
    for (const item of items) {
      if (item.to) out.push(item.to);
      if (item.children?.length) walk(item.children);
    }
  };
  walk(ADMIN_NAV_ITEMS);
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
});
