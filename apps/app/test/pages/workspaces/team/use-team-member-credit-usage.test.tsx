import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listWorkspaceMemberCreditUsage } from "@/api/commerce";
import { peopleMemberCreditUsageQueryKey } from "@/lib/commerce/member-credit-contracts";
import { useTeamMemberCreditUsage } from "@/pages/workspaces/team/members/use-team-member-credit-usage";

vi.mock("@/api/commerce", () => ({ listWorkspaceMemberCreditUsage: vi.fn() }));

function usageItem(membershipId: string) {
  return {
    membershipId,
    user: { userId: `user-${membershipId}`, username: membershipId },
    isOwner: false,
    effectiveLimit: { limitKind: "limited" as const, limitCredits: 100 },
    reservedCredits: 5,
    committedCredits: 20,
    availableCredits: 75,
  };
}

function renderUsage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useTeamMemberCreditUsage("workspace-1"), { wrapper });
}

describe("useTeamMemberCreditUsage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads each canonical Usage page once and indexes rows by membership ID", async () => {
    vi.mocked(listWorkspaceMemberCreditUsage)
      .mockResolvedValueOnce({
        periodStart: "2026-08-01T00:00:00Z",
        periodEnd: "2026-09-01T00:00:00Z",
        items: [usageItem("member-1")],
        total: 2,
        page: 1,
        size: 200,
        pages: 2,
        next: 2,
        prev: null,
      })
      .mockResolvedValueOnce({
        periodStart: "2026-08-01T00:00:00Z",
        periodEnd: "2026-09-01T00:00:00Z",
        items: [usageItem("member-2")],
        total: 2,
        page: 2,
        size: 200,
        pages: 2,
        next: null,
        prev: 1,
      });

    const { result } = renderUsage();
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));

    expect(result.current.byMembershipId.get("member-1")?.committedCredits).toBe(20);
    expect(result.current.byMembershipId.get("member-2")?.availableCredits).toBe(75);
    expect(listWorkspaceMemberCreditUsage).toHaveBeenNthCalledWith(
      1,
      "workspace-1",
      { page: 1, size: 200 },
      expect.any(AbortSignal),
    );
    expect(listWorkspaceMemberCreditUsage).toHaveBeenNthCalledWith(
      2,
      "workspace-1",
      { page: 2, size: 200 },
      expect.any(AbortSignal),
    );
  });

  it("uses a Workspace-only query key rather than People search or sort state", () => {
    expect(peopleMemberCreditUsageQueryKey("workspace-1")).toEqual([
      "commerce",
      "workspace",
      "workspace-1",
      "member-usage",
      "people",
    ]);
  });

  it("surfaces invalid duplicate pagination instead of silently overwriting a member", async () => {
    vi.mocked(listWorkspaceMemberCreditUsage).mockResolvedValue({
      periodStart: "2026-08-01T00:00:00Z",
      periodEnd: "2026-09-01T00:00:00Z",
      items: [usageItem("member-1")],
      total: 2,
      page: 1,
      size: 200,
      pages: 2,
      next: 2,
      prev: null,
    });

    const { result } = renderUsage();
    await waitFor(() => expect(result.current.query.isError).toBe(true));

    expect(result.current.query.error).toEqual(
      new Error("Member Credit usage pagination returned a duplicate membership"),
    );
  });
});
