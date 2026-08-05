import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  assignWorkspaceFeatureAccess,
  readWorkspaceFeatureAccess,
  revokeWorkspaceFeatureAccess,
} from "@/api/feature-access";
import { getWorkspaceCommercialAccess } from "@/api/commerce";
import { ApiError } from "@/lib/http";
import { useMemberFeatureAccess } from "@/pages/workspaces/team/members/use-member-feature-access";
import type { WorkspaceTeamMemberOut as TeamMember } from "@arclayer/openapi";

vi.mock("@/api/feature-access", () => ({
  assignWorkspaceFeatureAccess: vi.fn(),
  readWorkspaceFeatureAccess: vi.fn(),
  revokeWorkspaceFeatureAccess: vi.fn(),
}));
vi.mock("@/api/commerce", () => ({ getWorkspaceCommercialAccess: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "featureAccess:AGENT_ACCESS_NAME": "AI agent tools",
        "featureAccess:AGENT_ACCESS_DESCRIPTION": "Use AI agents for workspace work.",
        "featureAccess:MEMBER_FALLBACK": "Member",
      })[key] ?? key,
    i18n: { exists: () => true },
  }),
}));

const alice: TeamMember = {
  id: "member-row-alice",
  membershipId: "membership-alice",
  membershipStatus: "active",
  isOwner: false,
  userId: "user-alice",
  username: "alice",
  email: "alice@example.com",
  displayName: "Alice Chen",
  avatarUrl: null,
  userStatus: "active",
  lastLoginAt: null,
  roleCodes: [],
};
const bob: TeamMember = {
  ...alice,
  id: "member-row-bob",
  membershipId: "membership-bob",
  userId: "user-bob",
  username: "bob",
  email: "bob@example.com",
  displayName: "Bob Stone",
};

function managerRead(assignedMembershipIds: string[] = []) {
  return {
    workspaceId: "workspace-1",
    capabilities: [
      {
        projection: "manager" as const,
        entitlementKey: "agents.use",
        metadata: {
          entitlementKey: "agents.use",
          nameI18NKey: "featureAccess:AGENT_ACCESS_NAME",
          descriptionI18NKey: "featureAccess:AGENT_ACCESS_DESCRIPTION",
        },
        capacity: { kind: "limited" as const, limit: 2 },
        revision: 7,
        assignedCount: assignedMembershipIds.length,
        availableCount: 2 - assignedMembershipIds.length,
        assignedMembershipIds,
      },
    ],
  };
}

function renderController(currentUserId = "user-manager") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useMemberFeatureAccess({ workspaceId: "workspace-1", currentUserId }), {
    wrapper,
  });
}

describe("useMemberFeatureAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getWorkspaceCommercialAccess).mockResolvedValue({
      workspaceId: "workspace-1",
      state: "normal",
      explanationKey: "commerce:ACTIVE",
      billingContactRequired: false,
    });
  });

  it("updates manager projection from the returned allocation without optimistic success", async () => {
    vi.mocked(readWorkspaceFeatureAccess).mockResolvedValue(managerRead());
    vi.mocked(assignWorkspaceFeatureAccess).mockResolvedValue({
      operation: "assign",
      replayed: false,
      allocation: {
        workspaceId: "workspace-1",
        featureKey: "agents.use",
        revision: 8,
        capacity: { kind: "limited", limit: 2 },
        assignedCount: 1,
        availableCount: 1,
        assignedMembershipIds: [alice.membershipId],
      },
    });
    const { result } = renderController();
    await waitFor(() => expect(result.current.actionStateFor(alice)).toBe("manage"));
    act(() => result.current.openForMember(alice));
    const item = result.current.dialogProps.items[0]!;

    act(() => result.current.dialogProps.onAssign(item));

    expect(result.current.dialogProps.items[0]?.assigned).toBe(false);
    await waitFor(() => expect(result.current.dialogProps.items[0]?.assigned).toBe(true));
    expect(result.current.dialogProps.items[0]?.change?.action).toBe("revoke");
    expect(assignWorkspaceFeatureAccess).toHaveBeenCalledWith(
      "workspace-1",
      "agents.use",
      { membershipId: alice.membershipId, expectedRevision: 7 },
      expect.any(String),
    );
    expect(readWorkspaceFeatureAccess).toHaveBeenCalledTimes(1);
  });

  it("refetches and exposes a conflict when the expected revision is stale", async () => {
    vi.mocked(readWorkspaceFeatureAccess).mockResolvedValue(managerRead([alice.membershipId]));
    vi.mocked(revokeWorkspaceFeatureAccess).mockRejectedValue(
      new ApiError({ status: 409, error: "FEATURE_ACCESS_REVISION_STALE", message: "Changed" }),
    );
    const { result } = renderController();
    await waitFor(() => expect(result.current.actionStateFor(alice)).toBe("manage"));
    act(() => result.current.openForMember(alice));

    act(() => result.current.dialogProps.onRevoke(result.current.dialogProps.items[0]!));

    await waitFor(() => expect(result.current.dialogProps.changeError).toBe("conflict"));
    await waitFor(() => expect(readWorkspaceFeatureAccess).toHaveBeenCalledTimes(2));
  });

  it("shows member projection only to the current member without mutation controls", async () => {
    vi.mocked(readWorkspaceFeatureAccess).mockResolvedValue({
      workspaceId: "workspace-1",
      capabilities: [
        {
          projection: "member",
          entitlementKey: "agents.use",
          metadata: {
            entitlementKey: "agents.use",
            nameI18NKey: "featureAccess:AGENT_ACCESS_NAME",
            descriptionI18NKey: "featureAccess:AGENT_ACCESS_DESCRIPTION",
          },
          capacity: { kind: "unlimited" },
          revision: 2,
          assignedCount: 3,
          availableCount: null,
          currentMembershipAssigned: false,
        },
      ],
    });
    const { result } = renderController(alice.userId);
    await waitFor(() => expect(result.current.actionStateFor(alice)).toBe("view"));
    expect(result.current.actionStateFor(bob)).toBe("hidden");

    act(() => result.current.openForMember(alice));

    expect(result.current.dialogProps.canManage).toBe(false);
    expect(result.current.dialogProps.items[0]).toMatchObject({
      name: "AI agent tools",
      assigned: false,
      change: null,
    });
    expect(result.current.dialogProps.items[0]?.name).not.toBe("agents.use");
  });

  it("disables assign but preserves revoke during payment recovery", async () => {
    vi.mocked(readWorkspaceFeatureAccess).mockResolvedValue(managerRead([alice.membershipId]));
    vi.mocked(getWorkspaceCommercialAccess).mockResolvedValue({
      workspaceId: "workspace-1",
      state: "payment_restricted",
      explanationKey: "commerce:PAYMENT_RESTRICTED",
      billingContactRequired: true,
    });
    const { result } = renderController();
    await waitFor(() => expect(result.current.actionStateFor(alice)).toBe("manage"));

    act(() => result.current.openForMember(bob));
    expect(result.current.dialogProps.items[0]?.change).toEqual({
      action: "assign",
      availability: { status: "unavailable", reason: "payment-recovery" },
      pending: false,
    });

    act(() => result.current.openForMember(alice));
    expect(result.current.dialogProps.items[0]?.change).toEqual({
      action: "revoke",
      availability: { status: "available" },
      pending: false,
    });
  });
});
