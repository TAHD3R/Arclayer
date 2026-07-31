import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createWorkspaceCustomerPortalSession,
  getWorkspaceCommercialAccess,
  getWorkspacePaymentRecovery,
} from "@/api/commerce";
import { PaymentRestrictedNotice } from "@/components/commerce/payment-restricted-notice";

vi.mock("@/api/commerce", () => ({
  createWorkspaceCustomerPortalSession: vi.fn(),
  getWorkspaceCommercialAccess: vi.fn(),
  getWorkspacePaymentRecovery: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const locationAssign = vi.fn();

function renderNotice() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PaymentRestrictedNotice workspaceId="workspace-1" />
    </QueryClientProvider>,
  );
}

describe("PaymentRestrictedNotice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign: locationAssign },
    });
    vi.mocked(getWorkspaceCommercialAccess).mockResolvedValue({
      workspaceId: "workspace-1",
      state: "payment_restricted",
      explanationKey: "commerce:PAYMENT_RESTRICTED",
      billingContactRequired: true,
    });
  });

  it("shows every member a sanitized persistent notice without a recovery action", async () => {
    vi.mocked(getWorkspacePaymentRecovery).mockRejectedValue(new Error("forbidden"));
    renderNotice();

    expect(await screen.findByTestId("payment-restricted-notice")).toBeVisible();
    expect(screen.getByText("commerce:PAYMENT_RESTRICTED_CONTACT_BILLING")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "commerce:PAYMENT_RESTRICTED_RECOVERY_ACTION" }),
    ).toBeNull();
  });

  it("opens the portal only after the typed recovery response permits it", async () => {
    const user = userEvent.setup();
    vi.mocked(getWorkspacePaymentRecovery).mockResolvedValue({
      workspaceId: "workspace-1",
      state: "payment_restricted",
      permittedRecoveryAction: "open_payment_recovery",
    });
    vi.mocked(createWorkspaceCustomerPortalSession).mockResolvedValue({
      url: "https://billing.test/portal",
    });
    renderNotice();

    await user.click(
      await screen.findByRole("button", { name: "commerce:PAYMENT_RESTRICTED_RECOVERY_ACTION" }),
    );
    expect(createWorkspaceCustomerPortalSession).toHaveBeenCalledWith("workspace-1");
    expect(locationAssign).toHaveBeenCalledWith("https://billing.test/portal");
  });
});
