import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listWorkspaceCreditLedger, type CreditLedgerEntry } from "@/api/commerce";
import { CreditLedgerTable } from "@/components/commerce/credit-ledger-table";

vi.mock("@/api/commerce", () => ({ listWorkspaceCreditLedger: vi.fn() }));
vi.mock("@/hooks/use-admin-date-time-formatter", () => ({
  useAdminDateTimeFormatter: () => ({ formatDateTime: (value: string) => `date:${value}` }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      values ? `${key}:${Object.values(values).join(":")}` : key,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

function entry(input: Partial<CreditLedgerEntry> = {}): CreditLedgerEntry {
  return {
    id: "ledger-1",
    workspaceId: "workspace-1",
    accountId: "account-1",
    subscriptionId: "subscription-1",
    planRevisionId: "revision-1",
    entryType: "period_grant",
    requestId: null,
    providerPeriodIdentity: "period-2026-07",
    estimatedCostMicros: null,
    actualCostMicros: null,
    appliedCreditValueMicros: 1_000,
    reservedCredits: 0,
    committedCredits: 0,
    deltaBalanceCredits: 1_000,
    deltaReservedCredits: 0,
    balanceAfterCredits: 1_000,
    reservedAfterCredits: 0,
    actorUserId: null,
    descriptionKey: "LEDGER_PERIOD_GRANT",
    createdAt: "2026-07-12T12:00:00Z",
    updatedAt: "2026-07-12T12:00:00Z",
    ...input,
  };
}

function renderTable() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CreditLedgerTable workspaceId="workspace-1" />
    </QueryClientProvider>,
  );
}

describe("CreditLedgerTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listWorkspaceCreditLedger).mockResolvedValue({
      items: [
        entry(),
        entry({
          id: "ledger-2",
          entryType: "commit",
          deltaBalanceCredits: -250,
          deltaReservedCredits: -300,
          balanceAfterCredits: 750,
          reservedAfterCredits: 0,
          requestId: "018f0000-0000-7000-8000-000000000002",
          providerPeriodIdentity: null,
          estimatedCostMicros: 300_000,
          actualCostMicros: 250_000,
          reservedCredits: 300,
          committedCredits: 250,
          descriptionKey: "LEDGER_AI_COMMIT",
        }),
        entry({
          id: "ledger-3",
          entryType: "top_up",
          deltaBalanceCredits: 2_000,
          balanceAfterCredits: 2_750,
          providerPeriodIdentity: null,
          descriptionKey: "LEDGER_TOP_UP",
        }),
      ],
      total: 3,
      page: 1,
      size: 20,
      pages: 1,
      next: null,
      prev: null,
    });
  });

  it("renders customer-facing credit activity with reconciled balance and reservation deltas", async () => {
    renderTable();

    expect(await screen.findByText("commerce:LEDGER_TYPE_PERIOD_GRANT")).toBeVisible();
    expect(screen.getByRole("button", { name: "commerce:CREDITS_AVAILABLE_LABEL" })).toBeVisible();
    expect(screen.getByText("commerce:LEDGER_TYPE_COMMIT")).toBeVisible();
    expect(screen.getByText("commerce:LEDGER_PERIOD_GRANT")).toHaveClass("truncate");
    expect(screen.getByText("commerce:LEDGER_TYPE_TOP_UP")).toBeVisible();
    expect(screen.getByText("commerce:LEDGER_TOP_UP")).toHaveClass("truncate");
    expect(screen.getByText("−250").closest(".tabular-nums")).not.toBeNull();
    expect(screen.getByText("commerce:LEDGER_RESERVED_SHORT:−300")).toBeVisible();
    expect(screen.getByText("commerce:LEDGER_REFERENCE_AI_REQUEST")).toBeVisible();
    expect(screen.queryByText("018f0000-0000-7000-8000-000000000002")).not.toBeInTheDocument();
    expect(screen.getAllByText(/date:2026-07-12/)).toHaveLength(3);
    expect(listWorkspaceCreditLedger).toHaveBeenCalledWith("workspace-1", {
      page: 1,
      size: 20,
    });
  });
});
