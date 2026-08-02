import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  adjustWorkspaceCredits,
  getWorkspaceCommerceOverview,
  PlatformCommerceApiError,
} from "@/commerce/commerce-api";
import { initializePlatformI18n, i18n } from "@/lib/i18n";
import { CommerceCreditsPage } from "@/pages/commerce-credits";

vi.mock("@/commerce/commerce-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/commerce/commerce-api")>();
  return { ...actual, adjustWorkspaceCredits: vi.fn(), getWorkspaceCommerceOverview: vi.fn() };
});

beforeAll(async () => {
  await initializePlatformI18n("en-US");
});

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("en-US");
});

afterEach(cleanup);

describe("Commerce credits lookup", () => {
  const overview = (accountRevision = 4, balance = 100) =>
    ({
      credits: {
        accountRevision,
        available: balance - 25,
        balance,
        nextRefreshAt: null,
        periodEnd: "2026-08-31T00:00:00Z",
        periodStart: "2026-08-01T00:00:00Z",
        reserved: 25,
      },
    }) as Awaited<ReturnType<typeof getWorkspaceCommerceOverview>>;

  it("waits for a Workspace id and loads the submitted Workspace once", async () => {
    vi.mocked(getWorkspaceCommerceOverview).mockResolvedValue(overview());
    const user = userEvent.setup();

    render(<CommerceCreditsPage />);

    expect(getWorkspaceCommerceOverview).not.toHaveBeenCalled();
    await user.type(screen.getByRole("textbox", { name: "Workspace" }), "workspace-1");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    await waitFor(() => expect(getWorkspaceCommerceOverview).toHaveBeenCalledTimes(1));
    expect(getWorkspaceCommerceOverview).toHaveBeenCalledWith("workspace-1");
    expect(await screen.findByText("75")).toBeVisible();
    await waitFor(() => expect(getWorkspaceCommerceOverview).toHaveBeenCalledTimes(1));
  });

  it("submits an audited revision-bound adjustment and reloads server state", async () => {
    vi.mocked(getWorkspaceCommerceOverview)
      .mockResolvedValueOnce(overview())
      .mockResolvedValueOnce(overview(5, 110));
    vi.mocked(adjustWorkspaceCredits).mockResolvedValue({
      accountRevision: 5,
      auditEventId: "audit-1",
      available: 85,
      balance: 110,
      ledgerEntryId: "ledger-1",
      reserved: 25,
      workspaceId: "workspace-1",
    });
    const user = userEvent.setup();

    render(<CommerceCreditsPage />);
    await user.type(screen.getByRole("textbox", { name: "Workspace" }), "workspace-1");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await user.click(await screen.findByRole("button", { name: "Adjust Credits" }));
    await user.type(screen.getByLabelText("Credit change"), "10");
    await user.type(screen.getByLabelText("Reason"), "Support correction");
    await user.type(screen.getByLabelText("Evidence reference"), "case-42");
    await user.click(screen.getByRole("button", { name: "Apply adjustment" }));

    await waitFor(() =>
      expect(adjustWorkspaceCredits).toHaveBeenCalledWith("workspace-1", {
        deltaCredits: 10,
        evidenceReference: "case-42",
        expectedAccountRevision: 4,
        idempotencyKey: expect.any(String),
        reason: "Support correction",
      }),
    );
    expect(await screen.findByText("Credit adjustment applied")).toBeVisible();
    expect(screen.getByText(/balance from 100 to 110/)).toBeVisible();
    await waitFor(() => expect(getWorkspaceCommerceOverview).toHaveBeenCalledTimes(2));
  });

  it("reuses the idempotency key on retry and exposes stale-state diagnostics", async () => {
    vi.mocked(getWorkspaceCommerceOverview).mockResolvedValue(overview());
    vi.mocked(adjustWorkspaceCredits)
      .mockRejectedValueOnce(new Error("network"))
      .mockRejectedValueOnce(
        new PlatformCommerceApiError("WORKSPACE_CREDIT_ACCOUNT_REVISION_STALE", 409),
      );
    const user = userEvent.setup();

    render(<CommerceCreditsPage />);
    await user.type(screen.getByRole("textbox", { name: "Workspace" }), "workspace-1");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await user.click(await screen.findByRole("button", { name: "Adjust Credits" }));
    await user.type(screen.getByLabelText("Credit change"), "-5");
    await user.type(screen.getByLabelText("Reason"), "Expiry correction");
    await user.type(screen.getByLabelText("Evidence reference"), "reconcile-9");
    await user.click(screen.getByRole("button", { name: "Apply adjustment" }));
    expect(await screen.findByText("The Credit adjustment was not confirmed")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Apply adjustment" }));
    expect(
      await screen.findByText("The Credit account changed before this adjustment was applied"),
    ).toBeVisible();
    const firstKey = vi.mocked(adjustWorkspaceCredits).mock.calls[0]?.[1].idempotencyKey;
    const secondKey = vi.mocked(adjustWorkspaceCredits).mock.calls[1]?.[1].idempotencyKey;
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBe(firstKey);
    expect(screen.getByText("WORKSPACE_CREDIT_ACCOUNT_REVISION_STALE")).toBeVisible();
  });
});
