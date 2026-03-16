import { describe, expect, test } from "vitest";

import { ADMIN_NAV_ITEMS } from "@/constants/menu/workspaces";

function listWorkspaceNavTargets(): string[] {
  return ADMIN_NAV_ITEMS.flatMap((item) => (item.to ? [item.to] : []));
}

describe("workspace nav regression", () => {
  test("keeps workspace nav aligned with live workspace routes", () => {
    expect(listWorkspaceNavTargets()).toEqual([
      "/",
      "/assets",
      "/content/site-builder",
      "/content/library",
      "/content/models",
      "/team/members",
      "/team/invitations",
      "/team/roles",
      "/settings/maintenance/activity",
      "/extensions",
      "/settings/workspace",
      "/settings/site",
      "/settings/seo",
    ]);
  });

  test("includes reserved routes that must stay wired for upcoming work", () => {
    expect(listWorkspaceNavTargets()).toEqual(
      expect.arrayContaining([
        "/content/site-builder",
        "/content/library",
        "/content/models",
        "/settings/site",
        "/settings/seo",
      ]),
    );
  });
});
