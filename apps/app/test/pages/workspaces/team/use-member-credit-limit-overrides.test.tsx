import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MemberCreditLimitsPage } from "@/api/commerce";
import {
  memberCreditConfigurationQueryKey,
  memberCreditLimitsQueryKey,
  peopleMemberCreditUsageQueryKey,
  planMemberCreditUsageQueryKey,
} from "@/lib/commerce/member-credit-contracts";
import { ApiError } from "@/lib/http";
import {
  listAllWorkspaceMemberCreditLimits,
  useMemberCreditLimitOverrides,
} from "@/pages/workspaces/team/members/use-member-credit-limit-overrides";

const { listMemberLimitsMock, managementAccessMock, setMemberOverrideMock } = vi.hoisted(() => ({
  listMemberLimitsMock: vi.fn(),
  managementAccessMock: vi.fn(),
  setMemberOverrideMock: vi.fn(),
}));

vi.mock("@/api/commerce", () => ({
  listWorkspaceMemberCreditLimits: (...args: unknown[]) => listMemberLimitsMock(...args),
  setWorkspaceMemberCreditOverride: (...args: unknown[]) => setMemberOverrideMock(...args),
}));

vi.mock("@/hooks/use-workspace-commerce-management-access", () => ({
  useWorkspaceCommerceManagementAccess: (...args: unknown[]) => managementAccessMock(...args),
}));

function limitItem(
  membershipId: string,
  overrideLimit: MemberCreditLimitsPage["items"][number]["overrideLimit"] = null,
) {
  return {
    membershipId,
    user: { userId: `user-${membershipId}`, username: membershipId },
    isOwner: membershipId === "owner-membership",
    overrideLimit,
    effectiveLimit: overrideLimit ?? { limitKind: "limited" as const, limitCredits: 100 },
    reservedCredits: 5,
    committedCredits: 20,
    availableCredits:
      overrideLimit?.limitKind === "limited" && overrideLimit.limitCredits !== null
        ? overrideLimit.limitCredits - 25
        : 75,
  };
}

function limitsPage(
  items: MemberCreditLimitsPage["items"],
  options: { revision?: number; page?: number; next?: number | null; total?: number } = {},
): MemberCreditLimitsPage {
  return {
    configurationRevision: options.revision ?? 4,
    defaultLimit: { limitKind: "limited", limitCredits: 100 },
    periodStart: "2026-08-01T00:00:00Z",
    periodEnd: "2026-09-01T00:00:00Z",
    items,
    total: options.total ?? items.length,
    page: options.page ?? 1,
    size: 200,
    pages: options.next ? 2 : 1,
    next: options.next ?? null,
    prev: options.page && options.page > 1 ? options.page - 1 : null,
  };
}

function managementAccess(canManageCommerce = true) {
  return {
    canManageCommerce,
    managementAccessStatus: canManageCommerce ? "manage" : "view",
    overviewQuery: {},
    permissionAccess: {},
    error: null,
    retry: vi.fn(),
  };
}

function renderController() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return {
    client,
    ...renderHook(() => useMemberCreditLimitOverrides("workspace-1"), { wrapper }),
  };
}

describe("useMemberCreditLimitOverrides", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "override-key-1") });
    managementAccessMock.mockReturnValue(managementAccess());
    listMemberLimitsMock.mockResolvedValue(limitsPage([limitItem("member-1")]));
  });

  it("loads the complete manager snapshot and indexes rows by membership ID", async () => {
    listMemberLimitsMock
      .mockResolvedValueOnce(limitsPage([limitItem("member-1")], { page: 1, next: 2, total: 2 }))
      .mockResolvedValueOnce(limitsPage([limitItem("owner-membership")], { page: 2, total: 2 }));

    const { result } = renderController();
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));

    expect(result.current.byMembershipId.has("member-1")).toBe(true);
    expect(result.current.byMembershipId.get("owner-membership")?.isOwner).toBe(true);
    expect(listMemberLimitsMock).toHaveBeenNthCalledWith(
      1,
      "workspace-1",
      { page: 1, size: 200 },
      expect.any(AbortSignal),
    );
    expect(listMemberLimitsMock).toHaveBeenNthCalledWith(
      2,
      "workspace-1",
      { page: 2, size: 200 },
      expect.any(AbortSignal),
    );
  });

  it("does not expose the manager-only limits query to ordinary members", async () => {
    managementAccessMock.mockReturnValue(managementAccess(false));

    const { result } = renderController();

    expect(result.current.query.fetchStatus).toBe("idle");
    expect(listMemberLimitsMock).not.toHaveBeenCalled();
  });

  it("writes an exact revision-bound set command and refreshes every canonical view", async () => {
    const updated = limitItem("member-1", { limitKind: "limited", limitCredits: 250 });
    listMemberLimitsMock
      .mockResolvedValueOnce(limitsPage([limitItem("member-1")]))
      .mockResolvedValue(limitsPage([updated], { revision: 5 }));
    setMemberOverrideMock.mockResolvedValue({
      workspaceId: "workspace-1",
      membershipId: "member-1",
      defaultLimit: { limitKind: "limited", limitCredits: 100 },
      overrideLimit: { limitKind: "limited", limitCredits: 250 },
      effectiveLimit: { limitKind: "limited", limitCredits: 250 },
      configurationRevision: 5,
      replayed: false,
    });
    const { client, result } = renderController();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    await waitFor(() => expect(result.current.query.data).toBeDefined());

    await act(async () => {
      await result.current.saveOverride("member-1", {
        action: "set",
        limitKind: "limited",
        limitCredits: 250,
      });
    });

    expect(setMemberOverrideMock).toHaveBeenCalledWith("workspace-1", "member-1", {
      action: "set",
      limitKind: "limited",
      limitCredits: 250,
      expectedRevision: 4,
      idempotencyKey: "override-key-1",
    });
    expect(result.current.feedback).toBe("saved");
    for (const queryKey of [
      memberCreditLimitsQueryKey("workspace-1"),
      memberCreditConfigurationQueryKey("workspace-1"),
      peopleMemberCreditUsageQueryKey("workspace-1"),
      planMemberCreditUsageQueryKey(),
    ]) {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey });
    }
  });

  it("keeps clear distinct from explicit unlimited and sends no limit fields", async () => {
    listMemberLimitsMock.mockResolvedValue(
      limitsPage([limitItem("member-1", { limitKind: "unlimited", limitCredits: null })]),
    );
    setMemberOverrideMock.mockResolvedValue({
      workspaceId: "workspace-1",
      membershipId: "member-1",
      defaultLimit: { limitKind: "limited", limitCredits: 100 },
      overrideLimit: null,
      effectiveLimit: { limitKind: "limited", limitCredits: 100 },
      configurationRevision: 5,
      replayed: false,
    });
    const { result } = renderController();
    await waitFor(() => expect(result.current.query.data).toBeDefined());

    await act(async () => {
      await result.current.saveOverride("member-1", { action: "clear" });
    });

    expect(setMemberOverrideMock).toHaveBeenCalledWith("workspace-1", "member-1", {
      action: "clear",
      expectedRevision: 4,
      idempotencyKey: "override-key-1",
    });
  });

  it("reuses idempotency only for the same target, revision, action, and value", async () => {
    let key = 0;
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => `override-key-${++key}`) });
    listMemberLimitsMock.mockResolvedValue(
      limitsPage([limitItem("member-1"), limitItem("owner-membership")]),
    );
    setMemberOverrideMock.mockRejectedValue(new Error("offline"));
    const { result } = renderController();
    await waitFor(() => expect(result.current.query.data).toBeDefined());

    for (const [membershipId, input] of [
      ["member-1", { action: "set", limitKind: "limited", limitCredits: 250 }],
      ["member-1", { action: "set", limitKind: "limited", limitCredits: 250 }],
      ["member-1", { action: "set", limitKind: "unlimited", limitCredits: null }],
      ["owner-membership", { action: "set", limitKind: "unlimited", limitCredits: null }],
    ] as const) {
      await act(async () => {
        await result.current.saveOverride(membershipId, input).catch(() => undefined);
      });
    }

    expect(setMemberOverrideMock.mock.calls.map((call) => call[2].idempotencyKey)).toEqual([
      "override-key-1",
      "override-key-1",
      "override-key-2",
      "override-key-3",
    ]);
  });

  it("refreshes canonical state and keeps conflict feedback visible", async () => {
    setMemberOverrideMock.mockRejectedValue(
      new ApiError({
        status: 409,
        error: "WORKSPACE_MEMBER_CREDIT_REVISION_STALE",
        message: "Changed",
      }),
    );
    const { result } = renderController();
    await waitFor(() => expect(result.current.query.data).toBeDefined());

    await act(async () => {
      await result.current.saveOverride("member-1", { action: "clear" }).catch(() => undefined);
    });

    await waitFor(() => expect(result.current.feedback).toBe("conflict"));
    await waitFor(() => expect(listMemberLimitsMock).toHaveBeenCalledTimes(2));
  });

  it("rejects a success envelope whose effective limit contradicts the override", async () => {
    setMemberOverrideMock.mockResolvedValue({
      workspaceId: "workspace-1",
      membershipId: "member-1",
      defaultLimit: { limitKind: "limited", limitCredits: 100 },
      overrideLimit: { limitKind: "limited", limitCredits: 250 },
      effectiveLimit: { limitKind: "limited", limitCredits: 999 },
      configurationRevision: 5,
      replayed: false,
    });
    const { result } = renderController();
    await waitFor(() => expect(result.current.query.data).toBeDefined());

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.saveOverride("member-1", {
          action: "set",
          limitKind: "limited",
          limitCredits: 250,
        });
      } catch (error) {
        caught = error;
      }
    });

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught).toMatchObject({ status: 500, error: "PRODUCT_API_RESPONSE_INVALID" });
    expect(result.current.feedback).toBe("error");
  });

  it("fails explicitly when pagination repeats or returns an incomplete snapshot", async () => {
    listMemberLimitsMock.mockResolvedValue(
      limitsPage([limitItem("member-1")], { page: 1, next: 1, total: 2 }),
    );

    await expect(listAllWorkspaceMemberCreditLimits("workspace-1")).rejects.toThrow(
      "Member Credit limits pagination repeated a page",
    );

    listMemberLimitsMock.mockResolvedValue(limitsPage([limitItem("member-1")], { total: 2 }));
    await expect(listAllWorkspaceMemberCreditLimits("workspace-1")).rejects.toThrow(
      "Member Credit limits pagination returned an incomplete snapshot",
    );
  });
});
