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

import { resolvePostAuthRoute } from "@/lib/routing/bootstrap-routing";

describe("bootstrap-routing", () => {
  beforeEach(() => {
    mocked.getBootstrapState.mockReset();
    mocked.repairBootstrapState.mockReset();
    mocked.listMyWorkspaces.mockReset();
  });

  test("lands on organization overview when bootstrap is ready", async () => {
    mocked.getBootstrapState.mockResolvedValue({
      ready: true,
      repairRequired: false,
      organizationId: "o1",
      workspaceId: "w1",
      siteId: "s1",
      nextPath: "/w/w1",
      reason: null,
    });
    mocked.listMyWorkspaces.mockResolvedValue({ items: [] });

    const decision = await resolvePostAuthRoute({ lastWorkspaceId: null, attemptRepair: true });
    expect(decision.path).toBe("/");
    expect(decision.workspaceId).toBeNull();
    expect(decision.repaired).toBe(false);
    expect(mocked.repairBootstrapState).not.toHaveBeenCalled();
  });

  test("attempts repair and still lands on organization overview", async () => {
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
    mocked.listMyWorkspaces.mockResolvedValue({ items: [] });

    const decision = await resolvePostAuthRoute({ lastWorkspaceId: null, attemptRepair: true });
    expect(mocked.repairBootstrapState).toHaveBeenCalledTimes(1);
    expect(decision.path).toBe("/");
    expect(decision.workspaceId).toBeNull();
    expect(decision.repaired).toBe(true);
  });

  test("falls back to organization overview when bootstrap endpoint fails but workspaces exist", async () => {
    mocked.getBootstrapState.mockRejectedValue(new Error("network"));
    mocked.listMyWorkspaces.mockResolvedValue({
      items: [{ workspaceId: "w-a", name: "A" }],
    });

    const decision = await resolvePostAuthRoute({ lastWorkspaceId: "w-a", attemptRepair: true });
    expect(decision.path).toBe("/");
    expect(decision.workspaceId).toBe("w-a");
    expect(decision.repaired).toBe(false);
  });

  test("falls back to root when no workspace can be resolved", async () => {
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
    expect(decision.path).toBe("/");
    expect(decision.workspaceId).toBeNull();
  });
});
