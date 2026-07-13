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
vi.mock("@/components/commerce/plan-selection-dialog", () => ({
  PlanSelectionDialog: () => null,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values ? `${key}:${Object.values(values).join(":")}` : key,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WorkspacePlanUsageView workspaceId="workspace-1" />
    </QueryClientProvider>,
  );
}

describe("WorkspacePlanUsageView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getWorkspaceCommerceOverview).mockResolvedValue({
      billingMode: "external_checkout",
      billingProvider: "stripe",
      checkoutEnabled: true,
      plan: {
        id: "plan-1",
        code: "premium",
        tier: "premium",
        name: "Premium",
        description: "Production plan",
        creditGrantAmount: 10_000,
        creditRefreshInterval: "monthly",
        creditValueMicros: 1_000,
        priceMonthlyMicros: 19_000_000,
        priceYearlyMicros: 190_000_000,
        currency: "USD",
        features: [],
        isActive: true,
        isDefault: false,
        sortOrder: 20,
        createdAt: "2026-07-01T00:00:00Z",
        updatedAt: "2026-07-01T00:00:00Z",
      },
      subscription: {
        id: "subscription-1",
        status: "active",
        billingInterval: "monthly",
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
        lifetimeGranted: 20_000,
        lifetimeSpent: 12_000,
        periodGranted: 10_000,
        periodSpent: 2_000,
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
    });
  });

  it("presents the plan, real usage overview, period progress, and embedded ledger table", async () => {
    renderView();

    expect(await screen.findByText("Premium")).toBeVisible();
    expect(screen.getByText("commerce:CREDITS_AVAILABLE_LABEL")).toBeVisible();
    expect(screen.getByText("7,750")).toHaveClass("tabular-nums");
    expect(screen.getByText("24")).toHaveClass("tabular-nums");
    expect(screen.getByText("$2.00")).toHaveClass("tabular-nums");
    expect(
      screen.getByRole("progressbar", { name: "commerce:CREDITS_PERIOD_USAGE" }),
    ).toHaveAttribute("aria-valuenow", "20");
    expect(screen.getByTestId("credit-ledger-table")).toHaveTextContent("workspace-1");
  });
});
