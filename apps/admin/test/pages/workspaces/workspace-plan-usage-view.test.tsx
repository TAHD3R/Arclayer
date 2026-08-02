import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getWorkspaceCommerceOverview } from "@/api/commerce";
import { WorkspacePlanUsageView } from "@/pages/workspaces/settings/workspace/plan-usage/plan-usage-view";

vi.mock("@/api/commerce", () => ({
  createWorkspaceCustomerPortalSession: vi.fn(),
  getWorkspaceCommerceOverview: vi.fn(),
}));
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

describe("WorkspacePlanUsageView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getWorkspaceCommerceOverview).mockResolvedValue(overview());
  });

  it("presents the active plan, customer-facing usage, subscription lifecycle, and credit activity", async () => {
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
    expect(screen.getByRole("button", { name: "commerce:PLAN_MANAGE_SUBSCRIPTION" })).toBeVisible();
    expect(screen.getByRole("button", { name: "commerce:PLAN_COMPARE_ACTION" })).toBeVisible();
    expect(screen.getByText("commerce:LEDGER_DIALOG_TITLE")).toBeVisible();
    expect(
      screen.queryByText(
        /PLAN_REVISION|PLAN_ALLOWANCES_NOT_PROJECTED|USAGE_TOKEN_TOTAL|USAGE_ACTUAL_COST/,
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("credit-ledger-table")).toHaveTextContent("workspace-1");
  });

  it("does not render an infinite renewal date or billing management for the free plan", async () => {
    vi.mocked(getWorkspaceCommerceOverview).mockResolvedValue({
      ...overview(),
      planRevision: { ...overview().planRevision, planCode: "free" },
      subscription: {
        ...overview().subscription,
        currentPeriodEnd: "9999-12-31T23:59:59.999999Z",
      },
      credits: { ...overview().credits, nextRefreshAt: null },
    });

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <WorkspacePlanUsageView workspaceId="workspace-1" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("commerce:PLAN_FREE_NO_EXPIRATION")).toBeVisible();
    expect(screen.queryByText(/9999|10000/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "commerce:PLAN_MANAGE_SUBSCRIPTION" }),
    ).not.toBeInTheDocument();
  });

  it("shows a Free plan daily credit refresh when the API provides one", async () => {
    vi.mocked(getWorkspaceCommerceOverview).mockResolvedValue({
      ...overview(),
      planRevision: {
        ...overview().planRevision,
        planCode: "free",
        creditRefreshInterval: "daily",
      },
    });

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <WorkspacePlanUsageView workspaceId="workspace-1" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/commerce:CREDITS_REFRESH_DATE:/)).toBeVisible();
    expect(screen.queryByText("commerce:PLAN_FREE_NO_EXPIRATION")).not.toBeInTheDocument();
  });

  it("does not derive used credits from the plan grant and current balance", async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <WorkspacePlanUsageView workspaceId="workspace-1" />
      </QueryClientProvider>,
    );

    await screen.findByText("commerce:PLAN_PREMIUM_NAME");

    expect(screen.queryByText("commerce:CREDITS_PERIOD_SPENT")).not.toBeInTheDocument();
    expect(screen.queryByText("2,000")).not.toBeInTheDocument();
  });
});
