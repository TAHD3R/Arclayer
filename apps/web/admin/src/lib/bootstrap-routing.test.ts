import { beforeEach, describe, expect, test, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  getBootstrapState: vi.fn(),
  repairBootstrapState: vi.fn(),
  listMyWorkspaces: vi.fn(),
}));

vi.mock("@/api/bootstrap", () => ({
  getBootstrapState: mocked.getBootstrapState,
  repairBootstrapState: mocked.repairBootstrapState,
}));

vi.mock("@/api/workspaces", () => ({
  listMyWorkspaces: mocked.listMyWorkspaces,
}));

import { resolvePostAuthRoute } from "./bootstrap-routing";

describe("bootstrap-routing", () => {
  beforeEach(() => {
    mocked.getBootstrapState.mockReset();
    mocked.repairBootstrapState.mockReset();
    mocked.listMyWorkspaces.mockReset();
  });

  test("returns bootstrap path when state is ready", async () => {
    mocked.getBootstrapState.mockResolvedValue({
      ready: true,
      repairRequired: false,
      organizationId: "o1",
      workspaceId: "w1",
      siteId: "s1",
      nextPath: "/w/w1",
      reason: null,
    });

    const decision = await resolvePostAuthRoute({ lastWorkspaceId: null, attemptRepair: true });
    expect(decision.path).toBe("/w/w1");
    expect(decision.workspaceId).toBe("w1");
    expect(decision.repaired).toBe(false);
    expect(mocked.repairBootstrapState).not.toHaveBeenCalled();
  });

  test("attempts repair when bootstrap requires repair", async () => {
    mocked.getBootstrapState
      .mockResolvedValueOnce({
        ready: false,
        repairRequired: true,
        organizationId: "o1",
        workspaceId: null,
        siteId: null,
        nextPath: "/",
        reason: "WORKSPACE_MEMBERSHIP_MISSING",
      })
      .mockResolvedValueOnce({
        ready: true,
        repairRequired: false,
        organizationId: "o1",
        workspaceId: "w2",
        siteId: "s2",
        nextPath: "/w/w2",
        reason: null,
      });
    mocked.repairBootstrapState.mockResolvedValue({
      repaired: true,
      ready: true,
      actions: ["workspace_created"],
    });

    const decision = await resolvePostAuthRoute({ lastWorkspaceId: null, attemptRepair: true });
    expect(mocked.repairBootstrapState).toHaveBeenCalledTimes(1);
    expect(decision.path).toBe("/w/w2");
    expect(decision.workspaceId).toBe("w2");
    expect(decision.repaired).toBe(true);
  });

  test("falls back to workspace list when bootstrap endpoint fails", async () => {
    mocked.getBootstrapState.mockRejectedValue(new Error("network"));
    mocked.listMyWorkspaces.mockResolvedValue({
      items: [
        { workspaceId: "w-a", name: "A" },
        { workspaceId: "w-b", name: "B" },
      ],
    });

    const decision = await resolvePostAuthRoute({ lastWorkspaceId: "w-b", attemptRepair: true });
    expect(decision.path).toBe("/w/w-b");
    expect(decision.workspaceId).toBe("w-b");
    expect(decision.repaired).toBe(false);
  });

  test("routes to onboarding when no workspace can be resolved", async () => {
    mocked.getBootstrapState.mockResolvedValue({
      ready: false,
      repairRequired: false,
      organizationId: "o1",
      workspaceId: null,
      siteId: null,
      nextPath: "/",
      reason: "WORKSPACE_MEMBERSHIP_MISSING",
    });
    mocked.listMyWorkspaces.mockResolvedValue({ items: [] });

    const decision = await resolvePostAuthRoute({ lastWorkspaceId: null, attemptRepair: false });
    expect(decision.path).toBe("/onboarding");
    expect(decision.workspaceId).toBeNull();
  });
});
