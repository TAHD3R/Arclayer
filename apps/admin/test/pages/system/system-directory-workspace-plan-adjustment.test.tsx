import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspacePlanAdjustmentDialog } from "@/pages/system/directory/workspaces/workspace-plan-adjustment-dialog";
import type { WorkspaceCommerceOverview } from "@/api/commerce";

const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn(), onOpenChange: vi.fn() }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options?.workspace ? `${key}:${String(options.workspace)}` : key,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@arclayer/ui/setting-dialog", () => ({
  SettingDialog: ({
    open,
    title,
    description,
    children,
    footer,
  }: {
    open: boolean;
    title: React.ReactNode;
    description?: React.ReactNode;
    children?: React.ReactNode;
    footer?: React.ReactNode;
  }) =>
    open ? (
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
        {children}
        {footer}
      </div>
    ) : null,
}));

vi.mock("@/pages/system/directory/workspaces/workspace-operations-hooks", () => ({
  useSystemCommercePlanCatalog: () => ({
    data: {
      items: [
        {
          id: "plan-free",
          code: "free",
          tier: "free",
          name: "Free",
          description: "Free plan",
          creditGrantAmount: 100,
          creditRefreshInterval: "monthly",
          creditValueMicros: 1_000,
          priceMonthlyMicros: 0,
          priceYearlyMicros: 0,
          currency: "USD",
          features: [],
          isActive: true,
          isDefault: true,
          sortOrder: 1,
          createdAt: "2026-07-01T00:00:00Z",
          updatedAt: "2026-07-01T00:00:00Z",
        },
        {
          id: "plan-premium",
          code: "premium",
          tier: "premium",
          name: "Premium",
          description: "Premium plan",
          creditGrantAmount: 1_000,
          creditRefreshInterval: "monthly",
          creditValueMicros: 1_000,
          priceMonthlyMicros: 20_000_000,
          priceYearlyMicros: 200_000_000,
          currency: "USD",
          features: [],
          isActive: true,
          isDefault: false,
          sortOrder: 2,
          createdAt: "2026-07-01T00:00:00Z",
          updatedAt: "2026-07-01T00:00:00Z",
        },
      ],
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useSetSystemWorkspaceSubscription: () => ({
    isPending: false,
    mutateAsync: mocks.mutateAsync,
  }),
}));

const currentOverview: WorkspaceCommerceOverview = {
  billingMode: "external_checkout",
  billingProvider: "stripe",
  checkoutEnabled: true,
  plan: {
    id: "plan-free",
    code: "free",
    tier: "free",
    name: "Free",
    description: "Free plan",
    creditGrantAmount: 100,
    creditRefreshInterval: "monthly",
    creditValueMicros: 1_000,
    priceMonthlyMicros: 0,
    priceYearlyMicros: 0,
    currency: "USD",
    features: [],
    isActive: true,
    isDefault: true,
    sortOrder: 1,
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
    balance: 100,
    reserved: 10,
    available: 90,
    lifetimeGranted: 100,
    lifetimeSpent: 0,
    periodGranted: 100,
    periodSpent: 0,
    periodStart: "2026-07-01T00:00:00Z",
    periodEnd: "2026-08-01T00:00:00Z",
    nextRefreshAt: "2026-08-01T00:00:00Z",
  },
  usage: { periodCostMicros: 0, requests: 0, promptTokens: 0, completionTokens: 0 },
};

describe("WorkspacePlanAdjustmentDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mutateAsync.mockResolvedValue(currentOverview);
  });

  it("shows the before/after review and explicit immediate effects", () => {
    render(
      <WorkspacePlanAdjustmentDialog
        open
        workspaceId="workspace-1"
        workspaceName="Studio"
        overview={currentOverview}
        onOpenChange={mocks.onOpenChange}
      />,
    );

    expect(
      screen.getByText("settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_ADJUST_TITLE:Studio"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Free").length).toBeGreaterThan(0);
    expect(
      screen.getByText("settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_EFFECT_CREDITS"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_EFFECT_PROVIDER"),
    ).toBeInTheDocument();
  });

  it("submits the current subscription values through the canonical mutation", async () => {
    const user = userEvent.setup();
    render(
      <WorkspacePlanAdjustmentDialog
        open
        workspaceId="workspace-1"
        workspaceName="Studio"
        overview={currentOverview}
        onOpenChange={mocks.onOpenChange}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_SYSTEM_DIRECTORY_PLAN_CONFIRM",
      }),
    );

    await waitFor(() =>
      expect(mocks.mutateAsync).toHaveBeenCalledWith({
        workspaceId: "workspace-1",
        planCode: "free",
        status: "active",
        billingInterval: "monthly",
        cancelAtPeriodEnd: false,
      }),
    );
    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
  });
});
