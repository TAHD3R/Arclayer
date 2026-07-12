import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  listSystemCommercePlans,
  upsertSystemCommercePlan,
  type CommercePlan,
} from "@/api/commerce";
import { SystemSettingsBillingPage } from "@/pages/system/billing/page";

vi.mock("@/api/commerce", () => ({
  listSystemCommercePlans: vi.fn(),
  upsertSystemCommercePlan: vi.fn(),
}));

vi.mock("@/pages/system/billing/change-request-review", () => ({
  SubscriptionChangeRequestReview: () => <div data-testid="change-request-review" />,
}));

vi.mock("@/lib/notifications", () => ({
  notifyErrorText: vi.fn(),
  notifySuccessText: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

const savedPlan: CommercePlan = {
  id: "plan-precision",
  code: "precision-plan",
  tier: "premium",
  name: "Precision plan",
  description: "A plan with exact microdollar prices.",
  creditGrantAmount: 0,
  creditRefreshInterval: "monthly",
  creditValueMicros: 1_000,
  priceMonthlyMicros: 1,
  priceYearlyMicros: 123_456_789,
  currency: "USD",
  features: [],
  isActive: true,
  isDefault: false,
  sortOrder: 100,
  createdAt: "2026-07-12T00:00:00Z",
  updatedAt: "2026-07-12T00:00:00Z",
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SystemSettingsBillingPage />
    </QueryClientProvider>,
  );
}

describe("SystemSettingsBillingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listSystemCommercePlans).mockResolvedValue({
      billingMode: "operator_managed",
      items: [],
    });
    vi.mocked(upsertSystemCommercePlan).mockResolvedValue(savedPlan);
  });

  it("opens the plan editor from an empty catalog and preserves microdollar precision", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("commerce:SETTINGS_EMPTY_TITLE")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "commerce:SETTINGS_ADD_PLAN" }));

    const dialog = await screen.findByRole("dialog");
    const scope = within(dialog);
    expect(scope.getByRole("heading", { name: "commerce:SETTINGS_ADD_PLAN" })).toBeInTheDocument();

    await user.type(scope.getByLabelText("commerce:SETTINGS_PLAN_CODE"), "precision-plan");
    await user.type(scope.getByLabelText("commerce:SETTINGS_PLAN_NAME"), "Precision plan");
    await user.type(
      scope.getByLabelText("commerce:SETTINGS_PLAN_DESCRIPTION"),
      "A plan with exact microdollar prices.",
    );
    await user.clear(scope.getByLabelText("commerce:SETTINGS_PRICE_MONTHLY"));
    await user.type(scope.getByLabelText("commerce:SETTINGS_PRICE_MONTHLY"), "0.000001");
    await user.clear(scope.getByLabelText("commerce:SETTINGS_PRICE_YEARLY"));
    await user.type(scope.getByLabelText("commerce:SETTINGS_PRICE_YEARLY"), "123.456789");
    await user.click(scope.getByRole("button", { name: "commerce:SETTINGS_SAVE" }));

    await waitFor(() => {
      expect(upsertSystemCommercePlan).toHaveBeenCalledWith("precision-plan", {
        tier: "premium",
        name: "Precision plan",
        description: "A plan with exact microdollar prices.",
        creditGrantAmount: 0,
        creditRefreshInterval: "monthly",
        creditValueMicros: 1_000,
        priceMonthlyMicros: 1,
        priceYearlyMicros: 123_456_789,
        currency: "USD",
        isActive: true,
        isDefault: false,
        sortOrder: 100,
        features: [],
      });
    });
  });
});
