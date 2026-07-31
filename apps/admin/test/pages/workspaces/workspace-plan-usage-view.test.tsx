import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getWorkspaceCommerceOverview } from "@/api/commerce";
import { WorkspacePlanUsageView } from "@/pages/workspaces/settings/workspace/plan-usage/plan-usage-view";

vi.mock("@/api/commerce", () => ({ getWorkspaceCommerceOverview: vi.fn() }));
vi.mock("@/components/commerce/credit-ledger-table", () => ({
  CreditLedgerTable: ({ workspaceId }: { workspaceId: string }) => (
    <div data-testid="credit-ledger-table">{workspaceId}</div>
  ),
}));
vi.mock("@/components/commerce/plan-selection-dialog", () => ({ PlanSelectionDialog: () => null }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values ? `${key}:${Object.values(values).join(":")}` : key,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

function overview() {
  return {
    planRevision: {
      id: "revision-1",
      planId: "plan-1",
      planCode: "premium",
      sequence: 2,
      nameI18NKey: "commerce:PLAN_PREMIUM_NAME",
      descriptionI18NKey: "commerce:PLAN_PREMIUM_DESCRIPTION",
      entitlements: [],
      prices: [],
      resourceAllowances: [],
      creditGrantAmount: 10_000,
      creditRefreshInterval: "monthly" as const,
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
      status: "active" as const,
      billingCycle: "monthly" as const,
      currentPeriodStart: "2026-07-01T00:00:00Z",
      currentPeriodEnd: "2026-08-01T00:00:00Z",
      cancelAtPeriodEnd: false,
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-01T00:00:00Z",
    },
    credits: {
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

describe("WorkspacePlanUsageView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getWorkspaceCommerceOverview).mockResolvedValue(overview());
  });

  it("presents the revision, projected usage, subscription lifecycle, and ledger", async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <WorkspacePlanUsageView workspaceId="workspace-1" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("commerce:PLAN_PREMIUM_NAME")).toBeVisible();
    expect(screen.getByText("commerce:CREDITS_AVAILABLE_LABEL")).toBeVisible();
    expect(screen.getByText("7,750")).toHaveClass("tabular-nums");
    expect(screen.getByText("24")).toHaveClass("tabular-nums");
    expect(screen.getByText("$2.00")).toHaveClass("tabular-nums");
    expect(screen.getByText("commerce:PLAN_ALLOWANCES_NOT_PROJECTED")).toBeVisible();
    expect(screen.getByTestId("credit-ledger-table")).toHaveTextContent("workspace-1");
  });
});
