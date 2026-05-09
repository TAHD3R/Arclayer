import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

import { api } from "@/lib/http";
import { createWorkspace } from "@/api/workspace-management";

describe("api/workspace-management", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.delete).mockReset();
  });

  it("posts workspace creation payloads without legacy scope fields", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      workspaceId: "ws-1",
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

    await createWorkspace({
      name: "Blog Team",
      description: "Publishing workspace",
      template: "blank",
    } as never);

    expect(api.post).toHaveBeenCalledWith("/workspaces", {
      name: "Blog Team",
      description: "Publishing workspace",
      template: "blank",
    });
  });
});
