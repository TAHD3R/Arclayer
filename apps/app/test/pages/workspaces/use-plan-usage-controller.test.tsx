import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MemberCreditLimitsPage, WorkspaceCommerceOverview } from "@/api/commerce";
import { ApiError } from "@/lib/http";
import {
  MEMBER_CREDIT_USAGE_TABLE_ID,
  usePlanUsageController,
} from "@/pages/workspaces/settings/workspace/plan-usage/use-plan-usage-controller";

const {
  createWorkspaceCustomerPortalSessionMock,
  getWorkspaceCommerceOverviewMock,
  listWorkspaceMemberCreditLimitsMock,
  setWorkspaceDefaultMemberCreditLimitMock,
  workspacePermissionAccessMock,
} = vi.hoisted(() => ({
  createWorkspaceCustomerPortalSessionMock: vi.fn(),
  getWorkspaceCommerceOverviewMock: vi.fn(),
  listWorkspaceMemberCreditLimitsMock: vi.fn(),
  setWorkspaceDefaultMemberCreditLimitMock: vi.fn(),
  workspacePermissionAccessMock: vi.fn(),
}));

vi.mock("@/api/commerce", () => ({
  createWorkspaceCustomerPortalSession: (...args: unknown[]) =>
    createWorkspaceCustomerPortalSessionMock(...args),
  getWorkspaceCommerceOverview: (...args: unknown[]) => getWorkspaceCommerceOverviewMock(...args),
  listWorkspaceMemberCreditLimits: (...args: unknown[]) =>
    listWorkspaceMemberCreditLimitsMock(...args),
  setWorkspaceDefaultMemberCreditLimit: (...args: unknown[]) =>
    setWorkspaceDefaultMemberCreditLimitMock(...args),
}));

vi.mock("@/hooks/use-workspace-permission-access", () => ({
  useWorkspacePermissionAccess: (...args: unknown[]) => workspacePermissionAccessMock(...args),
}));

vi.mock("@/lib/notifications", () => ({ notifyError: vi.fn() }));

function overview(managementEntitlement = false): WorkspaceCommerceOverview {
  return {
    planRevision: {
      id: "revision-1",
      planId: "plan-1",
      planCode: "premium",
      sequence: 2,
      nameI18NKey: "commerce:PLAN_DEFAULT_PREMIUM_NAME",
      descriptionI18NKey: "commerce:PLAN_DEFAULT_PREMIUM_DESCRIPTION",
      entitlements: managementEntitlement
        ? [
            {
              key: "workspace.roles.manage",
              isIncluded: true,
              allocationMode: null,
              seatLimitKind: null,
              seatLimitValue: null,
            },
          ]
        : [],
      prices: [],
      resourceAllowances: [],
      creditGrantAmount: 10_000,
      creditRefreshInterval: "monthly",
      creditValueMicros: 1_000,
      currency: "USD",
      isSelling: true,
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-01T00:00:00Z",
    },
    subscription: {
      id: "subscription-1",
      planRevisionId: "revision-1",
      subscriptionRevision: 1,
      status: "active",
      billingCycle: "monthly",
      currentPeriodStart: "2026-07-01T00:00:00Z",
      currentPeriodEnd: "2026-08-01T00:00:00Z",
      cancelAtPeriodEnd: false,
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-01T00:00:00Z",
    },
    credits: {
      accountRevision: 1,
      balance: 8_000,
      reserved: 250,
      available: 7_750,
      periodStart: "2026-07-01T00:00:00Z",
      periodEnd: "2026-08-01T00:00:00Z",
      nextRefreshAt: "2026-08-01T00:00:00Z",
    },
    usage: {
      periodCostMicros: 2_000_000,
      requests: 24,
      promptTokens: 1_000,
      completionTokens: 500,
    },
  };
}

function limitsPage(revision = 4): MemberCreditLimitsPage {
  return {
    configurationRevision: revision,
    defaultLimit: { limitKind: "limited", limitCredits: 100 },
    periodStart: "2026-07-01T00:00:00Z",
    periodEnd: "2026-08-01T00:00:00Z",
    items: [],
    total: 0,
    page: 1,
    size: 1,
    pages: 0,
    next: null,
    prev: null,
  };
}

function permissionAccess(options: {
  owner?: boolean;
  permission?: boolean;
  status?: "success" | "loading" | "error";
}) {
  const status = options.status ?? "success";
  return {
    authzQuery: {
      data:
        status === "success"
          ? { isWorkspaceOwner: options.owner, isSuperuser: false, permissionCodes: [] }
          : undefined,
      error: status === "error" ? new Error("authz failed") : null,
      isPending: status === "loading",
      isSuccess: status === "success",
      isError: status === "error",
      refetch: vi.fn(),
    },
    isSuperuser: false,
    hasPermission: vi.fn(() => Boolean(options.permission)),
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
    ...renderHook(() => usePlanUsageController("workspace-1"), { wrapper }),
  };
}

describe("usePlanUsageController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "command-key-1") });
    getWorkspaceCommerceOverviewMock.mockResolvedValue(overview());
    listWorkspaceMemberCreditLimitsMock.mockResolvedValue(limitsPage());
    createWorkspaceCustomerPortalSessionMock.mockResolvedValue({ url: "https://billing.example" });
    workspacePermissionAccessMock.mockReturnValue(permissionAccess({ owner: true }));
  });

  it("gives the Workspace Owner management access without entitlement or RBAC permission", async () => {
    const { result } = renderController();

    await waitFor(() => expect(result.current.managementAccessStatus).toBe("manage"));

    expect(result.current.canManageCommerce).toBe(true);
    expect(listWorkspaceMemberCreditLimitsMock).toHaveBeenCalledWith(
      "workspace-1",
      { page: 1, size: 1 },
      expect.any(AbortSignal),
    );
  });

  it("requires both the management entitlement and exact permission for a non-Owner", async () => {
    workspacePermissionAccessMock.mockReturnValue(permissionAccess({ permission: true }));
    getWorkspaceCommerceOverviewMock.mockResolvedValue(overview(true));

    const { result } = renderController();
    await waitFor(() => expect(result.current.managementAccessStatus).toBe("manage"));

    workspacePermissionAccessMock.mockReturnValue(permissionAccess({ permission: false }));
    const viewer = renderController();
    await waitFor(() => expect(viewer.result.current.managementAccessStatus).toBe("view"));
  });

  it("keeps ordinary members on the self-only view and does not load configuration", async () => {
    workspacePermissionAccessMock.mockReturnValue(permissionAccess({ permission: false }));
    const { result } = renderController();

    await waitFor(() => expect(result.current.overviewQuery.isSuccess).toBe(true));

    expect(result.current.managementAccessStatus).toBe("view");
    expect(result.current.canManageCommerce).toBe(false);
    expect(listWorkspaceMemberCreditLimitsMock).not.toHaveBeenCalled();
  });

  it("writes the exact revision-bound command and refreshes limit and Usage queries", async () => {
    setWorkspaceDefaultMemberCreditLimitMock.mockResolvedValue({
      workspaceId: "workspace-1",
      membershipId: null,
      defaultLimit: { limitKind: "limited", limitCredits: 250 },
      overrideLimit: null,
      effectiveLimit: { limitKind: "limited", limitCredits: 250 },
      configurationRevision: 5,
      replayed: false,
    });
    const { client, result } = renderController();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    await waitFor(() => expect(result.current.limitsQuery.data).toBeDefined());

    await act(async () => {
      await result.current.saveDefaultLimit({ limitKind: "limited", limitCredits: 250 });
    });

    expect(setWorkspaceDefaultMemberCreditLimitMock).toHaveBeenCalledWith("workspace-1", {
      limitKind: "limited",
      limitCredits: 250,
      expectedRevision: 4,
      idempotencyKey: "command-key-1",
    });
    expect(result.current.defaultLimitFeedback).toBe("saved");
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["dataTable", MEMBER_CREDIT_USAGE_TABLE_ID],
    });
  });

  it("shows a revision conflict and refreshes the canonical configuration", async () => {
    setWorkspaceDefaultMemberCreditLimitMock.mockRejectedValue(
      new ApiError({
        status: 409,
        error: "WORKSPACE_MEMBER_CREDIT_REVISION_STALE",
        message: "Changed",
      }),
    );
    const { result } = renderController();
    await waitFor(() => expect(result.current.limitsQuery.data).toBeDefined());

    await act(async () => {
      await result.current
        .saveDefaultLimit({ limitKind: "limited", limitCredits: 250 })
        .catch(() => undefined);
    });

    await waitFor(() => expect(result.current.defaultLimitFeedback).toBe("conflict"));
    await waitFor(() => expect(listWorkspaceMemberCreditLimitsMock).toHaveBeenCalledTimes(2));
  });

  it("reuses the idempotency key only when retrying the same failed payload", async () => {
    let key = 0;
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => `command-key-${++key}`) });
    setWorkspaceDefaultMemberCreditLimitMock.mockRejectedValue(new Error("offline"));
    const { result } = renderController();
    await waitFor(() => expect(result.current.limitsQuery.data).toBeDefined());

    for (const input of [
      { limitKind: "limited" as const, limitCredits: 250 },
      { limitKind: "limited" as const, limitCredits: 250 },
      { limitKind: "unlimited" as const, limitCredits: null },
    ]) {
      await act(async () => {
        await result.current.saveDefaultLimit(input).catch(() => undefined);
      });
    }

    const payloads = setWorkspaceDefaultMemberCreditLimitMock.mock.calls.map((call) => call[1]);
    expect(payloads.map((payload) => payload.idempotencyKey)).toEqual([
      "command-key-1",
      "command-key-1",
      "command-key-2",
    ]);
  });

  it("exposes permission loading and error states independently from the Commerce overview", async () => {
    workspacePermissionAccessMock.mockReturnValue(permissionAccess({ status: "loading" }));
    const loading = renderController();
    expect(loading.result.current.managementAccessStatus).toBe("loading");

    workspacePermissionAccessMock.mockReturnValue(permissionAccess({ status: "error" }));
    const failed = renderController();
    await waitFor(() => expect(failed.result.current.overviewQuery.isSuccess).toBe(true));
    expect(failed.result.current.managementAccessStatus).toBe("error");
    expect(failed.result.current.permissionError).toEqual(new Error("authz failed"));
  });
});
