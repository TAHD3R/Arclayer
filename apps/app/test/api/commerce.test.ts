import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiGetMock, apiPutMock } = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
  apiPutMock: vi.fn(),
}));

vi.mock("@/lib/http", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/http")>();
  return {
    ...original,
    api: {
      ...original.api,
      get: apiGetMock,
      put: apiPutMock,
    },
  };
});

import {
  listWorkspaceMemberCreditLimits,
  listWorkspaceMemberCreditUsage,
  setWorkspaceDefaultMemberCreditLimit,
  setWorkspaceMemberCreditOverride,
} from "@/api/commerce";
import { ApiError } from "@/lib/http";

const pagination = {
  total: 1,
  page: 1,
  size: 20,
  pages: 1,
  next: null,
  prev: null,
};

const member = {
  membershipId: "membership-1",
  user: {
    userId: "user-1",
    username: "member",
    displayName: "Member",
  },
  isOwner: false,
  effectiveLimit: { limitKind: "limited" as const, limitCredits: 100 },
  reservedCredits: 5,
  committedCredits: 20,
  availableCredits: 75,
};

const usagePage = {
  ...pagination,
  periodStart: "2026-08-01T00:00:00Z",
  periodEnd: "2026-09-01T00:00:00Z",
  items: [member],
};

const limitsPage = {
  ...usagePage,
  configurationRevision: 4,
  defaultLimit: { limitKind: "limited" as const, limitCredits: 100 },
  items: [{ ...member, overrideLimit: null }],
};

const mutationResult = {
  workspaceId: "workspace-1",
  membershipId: null,
  defaultLimit: { limitKind: "limited" as const, limitCredits: 100 },
  overrideLimit: null,
  effectiveLimit: { limitKind: "limited" as const, limitCredits: 100 },
  configurationRevision: 5,
  replayed: false,
};

describe("commerce member Credit API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists usage with encoded Workspace ID, default pagination, and AbortSignal", async () => {
    const controller = new AbortController();
    apiGetMock.mockResolvedValueOnce(usagePage);

    const result: Awaited<ReturnType<typeof listWorkspaceMemberCreditUsage>> =
      await listWorkspaceMemberCreditUsage("workspace/id", {}, controller.signal);

    expect(result.items[0]?.membershipId).toBe("membership-1");
    expect(apiGetMock).toHaveBeenCalledWith(
      "/workspaces/workspace%2Fid/commerce/member-usage?page=1&size=20",
      { signal: controller.signal },
    );
  });

  it("lists limits with explicit pagination and canonical camelCase output", async () => {
    apiGetMock.mockResolvedValueOnce(limitsPage);

    const result: Awaited<ReturnType<typeof listWorkspaceMemberCreditLimits>> =
      await listWorkspaceMemberCreditLimits("workspace-1", { page: 3, size: 40 });

    expect(result.configurationRevision).toBe(4);
    expect(result.items[0]?.effectiveLimit.limitCredits).toBe(100);
    expect(apiGetMock).toHaveBeenCalledWith(
      "/workspaces/workspace-1/commerce/member-limits?page=3&size=40",
      { signal: undefined },
    );
  });

  it("writes the default limit with revision and body-scoped idempotency", async () => {
    apiPutMock.mockResolvedValueOnce(mutationResult);

    await setWorkspaceDefaultMemberCreditLimit("workspace-1", {
      limitKind: "limited",
      limitCredits: 250,
      expectedRevision: 4,
      idempotencyKey: "default-250",
    });

    expect(apiPutMock).toHaveBeenCalledWith(
      "/workspaces/workspace-1/commerce/member-limits/default",
      {
        limitKind: "limited",
        limitCredits: 250,
        expectedRevision: 4,
        idempotencyKey: "default-250",
      },
    );
  });

  it("sets and clears an encoded member override without an idempotency header", async () => {
    apiPutMock.mockResolvedValue(mutationResult);

    await setWorkspaceMemberCreditOverride("workspace/id", "membership/id", {
      action: "set",
      limitKind: "unlimited",
      limitCredits: null,
      expectedRevision: 4,
      idempotencyKey: "member-unlimited",
    });
    await setWorkspaceMemberCreditOverride("workspace/id", "membership/id", {
      action: "clear",
      expectedRevision: 5,
      idempotencyKey: "member-clear",
    });

    const path = "/workspaces/workspace%2Fid/commerce/member-limits/membership%2Fid";
    expect(apiPutMock).toHaveBeenNthCalledWith(1, path, {
      action: "set",
      limitKind: "unlimited",
      limitCredits: null,
      expectedRevision: 4,
      idempotencyKey: "member-unlimited",
    });
    expect(apiPutMock).toHaveBeenNthCalledWith(2, path, {
      action: "clear",
      expectedRevision: 5,
      idempotencyKey: "member-clear",
    });
  });

  it("rejects successful page responses that omit canonical items", async () => {
    apiGetMock.mockResolvedValueOnce({ ...usagePage, items: undefined });
    apiGetMock.mockResolvedValueOnce({ ...limitsPage, items: undefined });

    await expect(listWorkspaceMemberCreditUsage("workspace-1")).rejects.toThrow(
      "Invalid member credit usage pagination response",
    );
    await expect(listWorkspaceMemberCreditLimits("workspace-1")).rejects.toThrow(
      "Invalid member credit limits pagination response",
    );
  });

  it("preserves 403 and revision-conflict ApiError instances", async () => {
    const forbidden = new ApiError({
      status: 403,
      error: "WORKSPACE_COMMERCE_MANAGE_REQUIRED",
      message: "Commerce management permission is required",
    });
    const conflict = new ApiError({
      status: 409,
      error: "MEMBER_CREDIT_CONFIGURATION_REVISION_STALE",
      message: "Member Credit configuration changed",
    });
    apiGetMock.mockRejectedValueOnce(forbidden);
    apiPutMock.mockRejectedValueOnce(conflict);

    await expect(listWorkspaceMemberCreditLimits("workspace-1")).rejects.toBe(forbidden);
    await expect(
      setWorkspaceDefaultMemberCreditLimit("workspace-1", {
        limitKind: "limited",
        limitCredits: 100,
        expectedRevision: 3,
        idempotencyKey: "stale-default",
      }),
    ).rejects.toBe(conflict);
  });
});
