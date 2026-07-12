import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listWorkspaceCreditLedger, type CreditLedgerEntry } from "@/api/commerce";
import { CreditLedgerDialog } from "@/components/commerce/credit-ledger-dialog";

vi.mock("@/api/commerce", () => ({ listWorkspaceCreditLedger: vi.fn() }));
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
    entryType: "period_grant",
    deltaBalanceCredits: 1_000,
    deltaReservedCredits: 0,
    balanceAfterCredits: 1_000,
    reservedAfterCredits: 0,
    referenceType: "subscription",
    referenceId: "018f0000-0000-7000-8000-000000000001",
    actorUserId: null,
    descriptionKey: "LEDGER_PERIOD_GRANT",
    description: "Credits granted for the new period.",
    details: { planCode: "premium" },
    createdAt: "2026-07-12T12:00:00Z",
    updatedAt: "2026-07-12T12:00:00Z",
    ...input,
  };
}

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CreditLedgerDialog workspaceId="workspace-1" open onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("CreditLedgerDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listWorkspaceCreditLedger).mockResolvedValue({
      items: [
        entry(),
        entry({
          id: "ledger-reservation",
          entryType: "reservation",
          deltaBalanceCredits: 0,
          deltaReservedCredits: 300,
          balanceAfterCredits: 1_000,
          reservedAfterCredits: 300,
          referenceType: "ai_request",
          referenceId: "018f0000-0000-7000-8000-000000000010",
          description: "Credits reserved for the AI request.",
        }),
        entry({
          id: "ledger-2",
          entryType: "commit",
          deltaBalanceCredits: -250,
          deltaReservedCredits: -300,
          balanceAfterCredits: 750,
          reservedAfterCredits: 0,
          referenceType: "ai_request",
          referenceId: "018f0000-0000-7000-8000-000000000002",
          description: "Actual AI request credit usage settled.",
        }),
        entry({
          id: "ledger-release",
          entryType: "release",
          deltaBalanceCredits: 0,
          deltaReservedCredits: -50,
          balanceAfterCredits: 750,
          reservedAfterCredits: 0,
          referenceType: "ai_request",
          referenceId: "018f0000-0000-7000-8000-000000000011",
          description: "The AI request credit reservation was released.",
        }),
        entry({
          id: "ledger-expiration",
          entryType: "expiration",
          deltaBalanceCredits: -100,
          deltaReservedCredits: 0,
          balanceAfterCredits: 650,
          reservedAfterCredits: 0,
          referenceType: "subscription_period",
          referenceId: "018f0000-0000-7000-8000-000000000012",
          description: "Unused credits from the previous period expired.",
        }),
        entry({
          id: "ledger-adjustment",
          entryType: "adjustment",
          deltaBalanceCredits: 500,
          deltaReservedCredits: 0,
          balanceAfterCredits: 1_150,
          reservedAfterCredits: 0,
          referenceType: "operator_adjustment",
          referenceId: "018f0000-0000-7000-8000-000000000013",
          description: "Operator credit correction.",
        }),
      ],
      total: 22,
      page: 1,
      size: 20,
      pages: 2,
      next: 2,
      prev: null,
    });
  });

  it("renders immutable ledger events, exact deltas, balances, references, and timestamps", async () => {
    renderDialog();

    expect(await screen.findByText("LEDGER_TYPE_PERIOD_GRANT")).toBeInTheDocument();
    expect(screen.getByText("LEDGER_TYPE_RESERVATION")).toBeInTheDocument();
    expect(screen.getByText("LEDGER_TYPE_COMMIT")).toBeInTheDocument();
    expect(screen.getByText("LEDGER_TYPE_RELEASE")).toBeInTheDocument();
    expect(screen.getByText("LEDGER_TYPE_EXPIRATION")).toBeInTheDocument();
    expect(screen.getByText("LEDGER_TYPE_ADJUSTMENT")).toBeInTheDocument();
    expect(screen.getByText("+1,000")).toBeInTheDocument();
    expect(screen.getByText("−250")).toBeInTheDocument();
    expect(screen.getByText("+300")).toBeInTheDocument();
    expect(screen.getByText("−50")).toBeInTheDocument();
    expect(screen.getByText("−100")).toBeInTheDocument();
    expect(screen.getByText("+500")).toBeInTheDocument();
    expect(screen.getByText("018f0000-0000-7000-8000-000000000002")).toBeInTheDocument();
    expect(screen.getByText("Actual AI request credit usage settled.")).toBeInTheDocument();
    expect(screen.getAllByText(/Jul 12, 2026/)).toHaveLength(6);
  });

  it("requests the next immutable ledger page from the backend", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(await screen.findByRole("button", { name: "LEDGER_NEXT" }));

    await waitFor(() =>
      expect(listWorkspaceCreditLedger).toHaveBeenLastCalledWith(
        "workspace-1",
        { page: 2, size: 20 },
        expect.any(AbortSignal),
      ),
    );
  });
});
