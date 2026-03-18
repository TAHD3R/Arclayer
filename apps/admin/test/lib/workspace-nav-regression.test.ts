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
      "/content/library",
      "/settings/seo",
      "/settings/site",
      "/team/members",
      "/team/invitations",
      "/team/roles",
      "/extensions",
      "/settings/workspace",
      "/settings/maintenance/activity",
    ]);
  });

  test("keeps hidden content routes out of the workspace sidebar", () => {
    expect(listWorkspaceNavTargets()).not.toContain("/content/site-builder");
    expect(listWorkspaceNavTargets()).not.toContain("/content/models");
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
    ).toEqual(["assets", "content.library", "settings.seo", "settings.general"]);

    expect(
      WORKSPACE_NAV_SECTIONS.find((section) => section.key === "workspace")?.items.map(
        (item) => item.key,
      ),
    ).toEqual(["extensions", "settings.workspace"]);
  });
});
