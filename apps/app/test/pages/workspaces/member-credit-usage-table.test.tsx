import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listWorkspaceMemberCreditUsage } from "@/api/commerce";
import { MemberCreditUsageTable } from "@/pages/workspaces/settings/workspace/plan-usage/member-credit-usage-table";

vi.mock("@/api/commerce", () => ({ listWorkspaceMemberCreditUsage: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

function renderTable() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemberCreditUsageTable workspaceId="workspace-1" />
    </QueryClientProvider>,
  );
}

describe("MemberCreditUsageTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listWorkspaceMemberCreditUsage).mockResolvedValue({
      periodStart: "2026-07-01T00:00:00Z",
      periodEnd: "2026-08-01T00:00:00Z",
      items: [
        {
          membershipId: "membership-owner",
          user: {
            userId: "user-owner",
            username: "alice",
            displayName: "Alice Chen",
            email: "alice@example.com",
            avatarUrl: null,
          },
          isOwner: true,
          effectiveLimit: { limitKind: "limited", limitCredits: 1_000 },
          reservedCredits: 25,
          committedCredits: 250,
          availableCredits: 725,
        },
        {
          membershipId: "membership-private",
          user: {
            userId: "018f0000-0000-7000-8000-000000000002",
            username: "",
            displayName: null,
            email: null,
            avatarUrl: null,
          },
          isOwner: false,
          effectiveLimit: { limitKind: "unlimited", limitCredits: null },
          reservedCredits: 0,
          committedCredits: 5,
          availableCredits: null,
        },
      ],
      total: 2,
      page: 1,
      size: 20,
      pages: 1,
      next: null,
      prev: null,
    });
  });

  it("renders canonical limited and unlimited member Usage without exposing raw IDs", async () => {
    renderTable();

    expect(await screen.findByText("Alice Chen")).toBeVisible();
    expect(screen.getByText("alice@example.com")).toBeVisible();
    expect(screen.getByText("commerce:MEMBER_USAGE_OWNER")).toBeVisible();
    expect(screen.getByText("1,000")).toHaveClass("tabular-nums");
    expect(screen.getByText("725")).toHaveClass("tabular-nums");
    expect(screen.getAllByText("commerce:MEMBER_LIMIT_UNLIMITED")).toHaveLength(2);
    expect(screen.getByText("common:ORG_MEMBERS_TABLE_MEMBER")).toBeVisible();
    expect(screen.queryByText("018f0000-0000-7000-8000-000000000002")).not.toBeInTheDocument();
    expect(listWorkspaceMemberCreditUsage).toHaveBeenCalledWith("workspace-1", {
      page: 1,
      size: 20,
    });
  });

  it("shows the explicit empty state", async () => {
    vi.mocked(listWorkspaceMemberCreditUsage).mockResolvedValue({
      periodStart: "2026-07-01T00:00:00Z",
      periodEnd: "2026-08-01T00:00:00Z",
      items: [],
      total: 0,
      page: 1,
      size: 20,
      pages: 0,
      next: null,
      prev: null,
    });

    renderTable();

    expect(await screen.findByText("commerce:MEMBER_USAGE_EMPTY_TITLE")).toBeVisible();
    expect(screen.getByText("commerce:MEMBER_USAGE_EMPTY_DESCRIPTION")).toBeVisible();
  });
});
