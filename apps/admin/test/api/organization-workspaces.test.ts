import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import { api } from "@/lib/http";
import { createOrganizationWorkspace } from "@/api/organization-workspaces";

describe("api/organization-workspaces", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it("posts workspace creation payloads without slug fields", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      workspaceId: "ws-1",
      organizationId: "org-1",
      name: "Blog Team",
      description: "Publishing workspace",
      iconMode: "initials",
      iconColor: "#337ea9",
      iconUrl: null,
      isArchived: false,
      archivedAt: null,
      archivedByUserId: null,
      memberCount: 1,
      membersPreview: [],
      createdAt: "2026-04-17T00:00:00Z",
      enterable: true,
    });

    await createOrganizationWorkspace(undefined, {
      name: "Blog Team",
      description: "Publishing workspace",
      template: "blank",
    });

    expect(api.post).toHaveBeenCalledWith("/organizations/me/workspaces", {
      name: "Blog Team",
      description: "Publishing workspace",
      template: "blank",
    });
  });
});
