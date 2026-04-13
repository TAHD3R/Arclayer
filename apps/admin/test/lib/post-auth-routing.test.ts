import { beforeEach, describe, expect, test, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  listMyWorkspaces: vi.fn(),
}));

vi.mock("@/api/workspaces", () => ({
  listMyWorkspaces: mocked.listMyWorkspaces,
}));

import { resolvePostAuthRoute } from "@/lib/routing/post-auth-routing";

describe("post-auth-routing", () => {
  beforeEach(() => {
    mocked.listMyWorkspaces.mockReset();
  });

  test("lands on organization overview when no workspace is available", async () => {
    mocked.listMyWorkspaces.mockResolvedValue({
      items: [],
      switcher: {
        teams: [],
        personalSpace: {
          status: "pending",
          workspace: null,
          retryAvailable: false,
          lastError: null,
        },
      },
      instanceSetup: { status: "ready", repairReason: null },
    });

    const decision = await resolvePostAuthRoute({ lastWorkspaceId: null });
    expect(decision.path).toBe("/");
    expect(decision.workspaceId).toBeNull();
  });

  test("uses the remembered workspace when it still exists", async () => {
    const workspace = {
      workspaceId: "w-a",
      organizationId: "org-a",
      slug: "a",
      name: "A",
      kind: "team" as const,
      visibleOnly: false,
      isCreatorAdmin: true,
      isLegacy: false,
    };

    mocked.listMyWorkspaces.mockResolvedValue({
      items: [workspace],
      switcher: {
        teams: [workspace],
        personalSpace: {
          status: "pending",
          workspace: null,
          retryAvailable: false,
          lastError: null,
        },
      },
      instanceSetup: { status: "ready", repairReason: null },
    });

    const decision = await resolvePostAuthRoute({ lastWorkspaceId: "w-a" });
    expect(decision.path).toBe("/");
    expect(decision.workspaceId).toBe("w-a");
  });

  test("falls back to root when no workspace can be resolved", async () => {
    mocked.listMyWorkspaces.mockResolvedValue({
      items: [],
      switcher: {
        teams: [],
        personalSpace: {
          status: "pending",
          workspace: null,
          retryAvailable: false,
          lastError: null,
        },
      },
      instanceSetup: { status: "ready", repairReason: null },
    });

    const decision = await resolvePostAuthRoute({ lastWorkspaceId: null });
    expect(decision.path).toBe("/");
    expect(decision.workspaceId).toBeNull();
  });
});
