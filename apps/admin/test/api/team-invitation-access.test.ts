import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http", () => ({
  api: { post: vi.fn() },
}));

import { createTeamInvitation, createTeamInviteLink } from "@/api/team";
import { api } from "@/lib/http";

describe("team invitation access requests", () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset();
    vi.mocked(api.post).mockResolvedValue({});
  });

  it("omits roleCode entirely for Fixed Member email invitations", async () => {
    await createTeamInvitation({
      workspaceId: "workspace-1",
      email: "member@example.com",
      access: "fixed-member",
      expiresInSeconds: null,
    });

    expect(api.post).toHaveBeenCalledWith(
      "/workspaces/workspace-1/team/email-invites",
      expect.not.objectContaining({ roleCode: expect.anything() }),
    );
  });

  it("omits roleCode entirely for Fixed Member invitation links", async () => {
    await createTeamInviteLink({
      workspaceId: "workspace-1",
      access: "fixed-member",
      expiresInSeconds: 604800,
    });

    expect(api.post).toHaveBeenCalledWith(
      "/workspaces/workspace-1/team/invite-links",
      expect.not.objectContaining({ roleCode: expect.anything() }),
    );
  });

  it("preserves the explicit role-enabled request contract", async () => {
    await createTeamInvitation({
      workspaceId: "workspace-1",
      email: "editor@example.com",
      roleCode: "editor",
    });

    expect(api.post).toHaveBeenCalledWith(
      "/workspaces/workspace-1/team/email-invites",
      expect.objectContaining({ roleCode: "editor" }),
    );
  });
});
