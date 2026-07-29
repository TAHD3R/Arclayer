import { describe, expect, it } from "vitest";

import { mapWorkspaceManageListItemToListItem } from "@/pages/usercenter/workspaces/workspace-list-items";

describe("workspace-list-items", () => {
  it("maps workspace metadata through the shared list-item shape", () => {
    const item = mapWorkspaceManageListItemToListItem({
      id: "ws-team",
      workspaceId: "ws-team",
      projectId: null,
      project: null,
      name: "Team Space",
      description: null,
      iconMode: "glyph",
      iconColor: "#337ea9",
      iconGlyph: "rocket",
      iconEmoji: null,
      iconUrl: null,
      isArchived: false,
      archivedAt: null,
      archivedByUserId: null,
      memberCount: 1,
      membersPreview: [],
      createdAt: "2026-04-14T12:00:00Z",
      enterable: true,
    });

    expect(item.description).toBeNull();
    expect(item.createdAt).toBe("2026-04-14T12:00:00Z");
  });
});
