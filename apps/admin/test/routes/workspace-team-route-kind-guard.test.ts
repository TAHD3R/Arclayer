import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((payload: { to: string }) => payload);

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    () =>
    (config: Record<string, unknown>) =>
      config,
  redirect: (payload: { to: string }) => redirectMock(payload),
}));

vi.mock("@/api/workspaces", () => ({
  getWorkspaceDetail: vi.fn(),
}));

import { getWorkspaceDetail } from "@/api/workspaces";
import { Route } from "@/routes/w/$workspaceId/team/index";

describe("workspace team route kind guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects personal workspaces away from team routes", async () => {
    const beforeLoad = (Route as unknown as {
      beforeLoad?: (context: { params: { workspaceId: string } }) => Promise<void>;
    }).beforeLoad;
    vi.mocked(getWorkspaceDetail).mockResolvedValue({
      id: "ws-personal",
      organizationId: "org-1",
      slug: "personal-space",
      name: "Personal Space",
      kind: "personal",
      iconUrl: null,
    });

    await expect(
      beforeLoad?.({ params: { workspaceId: "ws-personal" } }),
    ).rejects.toEqual({
      to: "/w/$workspaceId",
      params: { workspaceId: "ws-personal" },
    });
    expect(redirectMock).toHaveBeenCalledWith({
      to: "/w/$workspaceId",
      params: { workspaceId: "ws-personal" },
    });
  });

  it("keeps team workspaces on team routes", async () => {
    const beforeLoad = (Route as unknown as {
      beforeLoad?: (context: { params: { workspaceId: string } }) => Promise<void>;
    }).beforeLoad;
    vi.mocked(getWorkspaceDetail).mockResolvedValue({
      id: "ws-team",
      organizationId: "org-1",
      slug: "team-space",
      name: "Team Space",
      kind: "team",
      iconUrl: null,
    });

    await expect(
      beforeLoad?.({ params: { workspaceId: "ws-team" } }),
    ).resolves.toBeUndefined();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
