import { describe, expect, test } from "vitest";

import { ADMIN_NAV_ITEMS, WORKSPACE_NAV_SECTIONS } from "@/constants/menu/workspaces";

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
      "/settings/site",
      "/settings/seo",
      "/team/members",
      "/team/invitations",
      "/team/roles",
      "/settings/workspace",
      "/extensions",
      "/settings/maintenance/activity",
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

  test("keeps workspace nav sections aligned with the approved IA", () => {
    expect(WORKSPACE_NAV_SECTIONS.map((section) => section.key)).toEqual([
      "content",
      "team",
      "workspace",
      "maintenance",
    ]);

    expect(
      WORKSPACE_NAV_SECTIONS.find((section) => section.key === "content")?.items.map(
        (item) => item.key,
      ),
    ).toEqual([
      "assets",
      "content.siteBuilder",
      "content.library",
      "content.models",
      "settings.general",
      "settings.seo",
    ]);
  });
});
