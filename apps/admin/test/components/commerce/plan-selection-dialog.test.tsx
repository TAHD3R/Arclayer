import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createWorkspaceCheckoutSession,
  createWorkspaceCustomerPortalSession,
  listWorkspaceCommercePlans,
  type WorkspacePlanOption,
} from "@/api/commerce";
import { PlanSelectionDialog } from "@/components/commerce/plan-selection-dialog";

vi.mock("@/api/commerce", () => ({
  createWorkspaceCheckoutSession: vi.fn(),
  createWorkspaceCustomerPortalSession: vi.fn(),
  listWorkspaceCommercePlans: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number }) =>
      values?.count === undefined ? key : `${key}:${String(values.count)}`,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

const locationAssign = vi.fn();

function plan(input: Partial<WorkspacePlanOption> & Pick<WorkspacePlanOption, "code" | "name">) {
  return {
    id: `plan-${input.code}`,
    tier: "premium" as const,
    description: `${input.name} description`,
    creditGrantAmount: 1_000,
    creditRefreshInterval: "monthly" as const,
    creditValueMicros: 1_000,
    priceMonthlyMicros: 10_000_000,
    priceYearlyMicros: 100_000_000,
    currency: "USD",
    features: [{ key: "ai", label: "AI access", description: null, included: true, value: null }],
    isActive: true,
    isDefault: false,
    sortOrder: 10,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    isCurrent: false,
    canSelect: true,
    ...input,
  } satisfies WorkspacePlanOption;
}

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <PlanSelectionDialog workspaceId="workspace-1" open onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("PlanSelectionDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign: locationAssign },
    });
    vi.mocked(listWorkspaceCommercePlans).mockResolvedValue({
      billingMode: "external_checkout",
      billingProvider: "stripe",
      checkoutEnabled: true,
      items: [
        plan({
          code: "free",
          name: "Free",
          tier: "free",
          isCurrent: true,
          canSelect: false,
          sortOrder: 1,
        }),
        plan({ code: "premium", name: "Premium", sortOrder: 2 }),
      ],
    });
    vi.mocked(createWorkspaceCheckoutSession).mockResolvedValue({
      url: "https://checkout.stripe.test/session",
    });
    vi.mocked(createWorkspaceCustomerPortalSession).mockResolvedValue({
      url: "https://billing.stripe.test/portal",
    });
  });

  it("marks the current plan and explains provider-hosted checkout", async () => {
    renderDialog();

    expect(await screen.findByText("Free")).toBeVisible();
    expect(screen.getByText("commerce:EXTERNAL_CHECKOUT_TITLE")).toBeVisible();
    expect(screen.getByRole("button", { name: "commerce:PLAN_CURRENT" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /commerce:PLAN_CHECKOUT_ACTION/ })).toBeEnabled();
  });

  it("creates a checkout session for the selected interval and redirects without applying locally", async () => {
    const user = userEvent.setup();
    renderDialog();

    const premiumCard = (await screen.findByText("Premium")).closest(".rounded-xl") as HTMLElement;
    await user.click(screen.getByRole("tab", { name: "commerce:BILLING_YEARLY" }));
    await user.click(
      within(premiumCard).getByRole("button", { name: /commerce:PLAN_CHECKOUT_ACTION/ }),
    );

    await waitFor(() => {
      expect(createWorkspaceCheckoutSession).toHaveBeenCalledWith("workspace-1", {
        planCode: "premium",
        billingInterval: "yearly",
      });
    });
    expect(locationAssign).toHaveBeenCalledWith("https://checkout.stripe.test/session");
  });

  it("disables selection explicitly when no provider is configured", async () => {
    vi.mocked(listWorkspaceCommercePlans).mockResolvedValue({
      billingMode: "external_checkout",
      billingProvider: "disabled",
      checkoutEnabled: false,
      items: [plan({ code: "premium", name: "Premium" })],
    });
    renderDialog();

    expect(await screen.findByText("commerce:BILLING_PROVIDER_UNAVAILABLE_TITLE")).toBeVisible();
    expect(await screen.findByText("Premium")).toBeVisible();
    expect(screen.getByRole("button", { name: /commerce:PLAN_CHECKOUT_ACTION/ })).toBeDisabled();
  });
});
