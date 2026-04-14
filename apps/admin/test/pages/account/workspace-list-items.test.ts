import { describe, expect, it } from "vitest";

import { mapPersonalWorkspaceToListItem } from "@/pages/usercenter/workspaces/workspace-list-items";

describe("workspace-list-items", () => {
  it("maps personal workspace metadata through the shared list-item shape", () => {
    const item = mapPersonalWorkspaceToListItem({
      workspaceId: "ws-personal",
      organizationId: "org-personal",
      slug: "personal-space",
      name: "Personal Space",
      kind: "personal",
      description: null,
      iconUrl: null,
      memberCount: 1,
      membersPreview: [],
      createdAt: "2026-04-14T12:00:00Z",
      visibleOnly: false,
      isCreatorAdmin: true,
      isLegacy: false,
    });

    expect(item.description).toBeNull();
    expect(item.createdAt).toBe("2026-04-14T12:00:00Z");
    expect(item.kind).toBe("personal");
  });
});
