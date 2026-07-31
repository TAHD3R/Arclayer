import { beforeEach, describe, expect, it, vi } from "vitest";

const { generatedClient, readGenerated, assignGenerated, moveGenerated, revokeGenerated } =
  vi.hoisted(() => ({
    generatedClient: {
      interceptors: { request: { use: vi.fn() } },
    },
    readGenerated: vi.fn(),
    assignGenerated: vi.fn(),
    moveGenerated: vi.fn(),
    revokeGenerated: vi.fn(),
  }));

vi.mock("@arclayer/openapi", () => ({
  createApiClient: () => generatedClient,
  domainWorkspacesReadFeatureAccess: readGenerated,
  domainWorkspacesAssignFeatureAccess: assignGenerated,
  domainWorkspacesMoveFeatureAccess: moveGenerated,
  domainWorkspacesRevokeFeatureAccess: revokeGenerated,
}));

const readResult = { workspaceId: "workspace-1", capabilities: [] };
const mutationResult = {
  operation: "assign" as const,
  replayed: false,
  allocation: {
    workspaceId: "workspace-1",
    featureKey: "agents.use",
    revision: 4,
    capacity: { kind: "limited" as const, limit: 2 },
    assignedCount: 1,
    availableCount: 1,
    assignedMembershipIds: ["membership-1"],
  },
};

describe("feature access generated SDK adapter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads through the generated Product SDK and unwraps its response envelope", async () => {
    readGenerated.mockResolvedValue({
      data: { data: readResult },
      response: new Response(null, { status: 200 }),
    });
    const { readWorkspaceFeatureAccess } = await import("@/api/feature-access");

    await expect(readWorkspaceFeatureAccess("workspace-1")).resolves.toEqual(readResult);
    expect(readGenerated).toHaveBeenCalledWith(
      expect.objectContaining({
        client: generatedClient,
        path: { workspace_id: "workspace-1" },
      }),
    );
  });

  it("passes exact revision and idempotency for assign, move, and revoke", async () => {
    assignGenerated.mockResolvedValue({ data: { data: mutationResult }, response: new Response() });
    moveGenerated.mockResolvedValue({ data: { data: mutationResult }, response: new Response() });
    revokeGenerated.mockResolvedValue({ data: { data: mutationResult }, response: new Response() });
    const {
      assignWorkspaceFeatureAccess,
      moveWorkspaceFeatureAccess,
      revokeWorkspaceFeatureAccess,
    } = await import("@/api/feature-access");

    await assignWorkspaceFeatureAccess(
      "workspace-1",
      "agents.use",
      { membershipId: "membership-1", expectedRevision: 3 },
      "assign-command",
    );
    await moveWorkspaceFeatureAccess(
      "workspace-1",
      "agents.use",
      {
        sourceMembershipId: "membership-1",
        targetMembershipId: "membership-2",
        expectedRevision: 4,
      },
      "move-command",
    );
    await revokeWorkspaceFeatureAccess(
      "workspace-1",
      "agents.use",
      "membership-2",
      5,
      "revoke-command",
    );

    expect(assignGenerated).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { membershipId: "membership-1", expectedRevision: 3 },
        headers: { "Idempotency-Key": "assign-command" },
      }),
    );
    expect(moveGenerated).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          sourceMembershipId: "membership-1",
          targetMembershipId: "membership-2",
          expectedRevision: 4,
        },
        headers: { "Idempotency-Key": "move-command" },
      }),
    );
    expect(revokeGenerated).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.objectContaining({ membership_id: "membership-2" }),
        query: { expectedRevision: 5 },
        headers: { "Idempotency-Key": "revoke-command" },
      }),
    );
  });

  it("surfaces HTTP conflicts as ApiError instead of returning mock success", async () => {
    revokeGenerated.mockResolvedValue({
      error: { error: "FEATURE_ACCESS_REVISION_STALE", message: "Access changed" },
      response: new Response(null, { status: 409 }),
    });
    const { revokeWorkspaceFeatureAccess } = await import("@/api/feature-access");

    const request = revokeWorkspaceFeatureAccess(
      "workspace-1",
      "agents.use",
      "membership-1",
      3,
      "revoke-command",
    );

    await expect(request).rejects.toMatchObject({
      status: 409,
      error: "FEATURE_ACCESS_REVISION_STALE",
      message: "Access changed",
    });
  });

  it("rejects a successful response that omits canonical data", async () => {
    readGenerated.mockResolvedValue({ data: {}, response: new Response(null, { status: 200 }) });
    const { readWorkspaceFeatureAccess } = await import("@/api/feature-access");

    await expect(readWorkspaceFeatureAccess("workspace-1")).rejects.toMatchObject({
      error: "PRODUCT_API_RESPONSE_INVALID",
    });
  });
});
