import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  listWorkspaceCommercePlans,
  requestWorkspacePlanChange,
  type WorkspacePlanOption,
} from "@/api/commerce";
import { PlanSelectionDialog } from "@/components/commerce/plan-selection-dialog";

vi.mock("@/api/commerce", () => ({
  listWorkspaceCommercePlans: vi.fn(),
  requestWorkspacePlanChange: vi.fn(),
}));
vi.mock("@/lib/notifications", () => ({ notifySuccessText: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number }) =>
      values?.count === undefined ? key : `${key}:${String(values.count)}`,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

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

function renderDialog(onOpenChange = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <PlanSelectionDialog
        workspaceId="workspace-1"
        open
        onOpenChange={onOpenChange}
        pendingPlanCode="enterprise"
      />
    </QueryClientProvider>,
  );
  return { invalidateQueries, onOpenChange };
}

describe("PlanSelectionDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listWorkspaceCommercePlans).mockResolvedValue({
      billingMode: "operator_managed",
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
        plan({ code: "enterprise", name: "Enterprise", tier: "enterprise", sortOrder: 3 }),
      ],
    });
    vi.mocked(requestWorkspacePlanChange).mockResolvedValue({
      id: "request-1",
      workspaceId: "workspace-1",
      requestedByUserId: "user-1",
      planCode: "premium",
      planName: "高级版",
      billingInterval: "monthly",
      reason: null,
      status: "pending",
      reviewedByUserId: null,
      reviewedAt: null,
      reviewNote: null,
      createdAt: "2026-07-12T00:00:00Z",
      updatedAt: "2026-07-12T00:00:00Z",
    });
  });

  it("marks the current and pending plans without presenting either as selectable", async () => {
    renderDialog();

    const freeCard = (await screen.findByText("Free")).closest(
      "[data-slot], .rounded-xl",
    )?.parentElement;
    expect(screen.getByText("Enterprise")).toBeInTheDocument();
    expect(screen.getAllByText("commerce:PLAN_PENDING")).toHaveLength(2);
    const currentButtons = screen.getAllByRole("button", { name: "commerce:PLAN_CURRENT" });
    expect(currentButtons).toHaveLength(1);
    expect(currentButtons[0]).toBeDisabled();
    expect(screen.getByRole("button", { name: "commerce:PLAN_PENDING" })).toBeDisabled();
    expect(freeCard).not.toBeUndefined();
  });

  it("submits the selected plan with the active billing interval and closes after success", async () => {
    const user = userEvent.setup();
    const { invalidateQueries, onOpenChange } = renderDialog();

    const premiumTitle = await screen.findByText("Premium");
    const premiumCard = premiumTitle.closest(".rounded-xl") as HTMLElement | null;
    expect(premiumCard).not.toBeNull();
    const requestButton = within(premiumCard!).getByRole("button", {
      name: "commerce:PLAN_REQUEST_CHANGE",
    });
    await user.click(screen.getByRole("tab", { name: "commerce:BILLING_YEARLY" }));
    await user.click(requestButton);

    await waitFor(() =>
      expect(requestWorkspacePlanChange).toHaveBeenCalledWith("workspace-1", {
        planCode: "premium",
        billingInterval: "yearly",
      }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["system", "commerce", "subscription-change-requests"],
    });
  });
});
