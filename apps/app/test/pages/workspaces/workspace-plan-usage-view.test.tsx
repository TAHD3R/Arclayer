import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MemberCreditLimitsPage, WorkspaceCommerceOverview } from "@/api/commerce";
import { WorkspacePlanUsageView } from "@/pages/workspaces/settings/workspace/plan-usage/plan-usage-view";

const { controllerMock, retryPermissionMock } = vi.hoisted(() => ({
  controllerMock: vi.fn(),
  retryPermissionMock: vi.fn(),
}));

vi.mock("@/pages/workspaces/settings/workspace/plan-usage/use-plan-usage-controller", () => ({
  usePlanUsageController: (...args: unknown[]) => controllerMock(...args),
}));
vi.mock("@/components/commerce/credit-ledger-table", () => ({
  CreditLedgerTable: ({ workspaceId }: { workspaceId: string }) => (
    <div data-testid="credit-ledger-table">{workspaceId}</div>
  ),
}));
vi.mock("@/components/commerce/plan-selection-dialog", () => ({
  PlanSelectionDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="plan-selection-dialog" /> : null,
}));
vi.mock(
  "@/pages/workspaces/settings/workspace/plan-usage/default-member-credit-limit-editor",
  () => ({
    DefaultMemberCreditLimitEditor: (props: {
      limit: { limitKind: string };
      configurationRevision: number;
    }) => (
      <div data-testid="default-limit-editor">
        {props.limit.limitKind}:{props.configurationRevision}
      </div>
    ),
  }),
);
vi.mock("@/pages/workspaces/settings/workspace/plan-usage/member-credit-usage-table", () => ({
  MemberCreditUsageTable: ({ workspaceId }: { workspaceId: string }) => (
    <div data-testid="member-credit-usage-table">{workspaceId}</div>
  ),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      values ? `${key}:${Object.values(values).join(":")}` : key,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

function overview(): WorkspaceCommerceOverview {
  return {
    planRevision: {
      id: "revision-1",
      planId: "plan-1",
      planCode: "premium",
      sequence: 2,
      nameI18NKey: "commerce:PLAN_DEFAULT_PREMIUM_NAME",
      descriptionI18NKey: "commerce:PLAN_DEFAULT_PREMIUM_DESCRIPTION",
      entitlements: [],
      prices: [],
      resourceAllowances: [],
      creditGrantAmount: 10_000,
      creditRefreshInterval: "monthly",
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
      status: "active",
      billingCycle: "monthly",
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

function limits(): MemberCreditLimitsPage {
  return {
    configurationRevision: 4,
    defaultLimit: { limitKind: "limited", limitCredits: 100 },
    periodStart: "2026-07-01T00:00:00Z",
    periodEnd: "2026-08-01T00:00:00Z",
    items: [],
    total: 0,
    page: 1,
    size: 1,
    pages: 0,
    next: null,
    prev: null,
  };
}

function controller(
  options: {
    canManage?: boolean;
    accessStatus?: "loading" | "error" | "view" | "manage";
    currentOverview?: WorkspaceCommerceOverview;
  } = {},
) {
  const currentOverview = options.currentOverview ?? overview();
  const canManage = options.canManage ?? true;
  return {
    overviewQuery: {
      data: currentOverview,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    },
    limitsQuery: {
      data: limits(),
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    },
    managementAccessStatus: options.accessStatus ?? (canManage ? "manage" : "view"),
    canManageCommerce: canManage,
    permissionError: options.accessStatus === "error" ? new Error("authz") : null,
    retryPermission: retryPermissionMock,
    billingPortalMutation: { isPending: false, mutate: vi.fn() },
    defaultLimitFeedback: "idle",
    defaultLimitPending: false,
    saveDefaultLimit: vi.fn(),
    clearDefaultLimitFeedback: vi.fn(),
  };
}

function renderView() {
  return render(<WorkspacePlanUsageView workspaceId="workspace-1" />);
}

describe("WorkspacePlanUsageView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    controllerMock.mockReturnValue(controller());
  });

  it("shows manager actions, canonical member Usage, default limits, and secondary ledger evidence", () => {
    renderView();

    expect(screen.getByText("commerce:PLAN_DEFAULT_PREMIUM_NAME")).toBeVisible();
    expect(screen.getByRole("button", { name: "commerce:PLAN_MANAGE_SUBSCRIPTION" })).toBeVisible();
    expect(screen.getByRole("button", { name: "commerce:PLAN_COMPARE_ACTION" })).toBeVisible();
    expect(screen.getByText(/commerce:CREDITS_REFRESH_DATE:/)).toBeVisible();
    expect(screen.getByText(/commerce:SUBSCRIPTION_RENEWS_AT:/)).toBeVisible();
    expect(screen.getByTestId("default-limit-editor")).toHaveTextContent("limited:4");
    expect(screen.getByText("commerce:MEMBER_USAGE_WORKSPACE_DESCRIPTION")).toBeVisible();
    expect(screen.getByTestId("member-credit-usage-table")).toHaveTextContent("workspace-1");
    expect(screen.getByText("commerce:LEDGER_SECONDARY_DESCRIPTION")).toBeVisible();
    expect(screen.getByTestId("credit-ledger-table")).toHaveTextContent("workspace-1");
  });

  it("keeps ordinary members on self Usage without billing or configuration controls", () => {
    controllerMock.mockReturnValue(controller({ canManage: false, accessStatus: "view" }));

    renderView();

    expect(screen.getByText("commerce:MEMBER_USAGE_SELF_DESCRIPTION")).toBeVisible();
    expect(screen.getByTestId("member-credit-usage-table")).toBeVisible();
    expect(screen.queryByTestId("default-limit-editor")).not.toBeInTheDocument();
    expect(screen.queryByTestId("credit-ledger-table")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "commerce:PLAN_MANAGE_SUBSCRIPTION" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "commerce:PLAN_COMPARE_ACTION" }),
    ).not.toBeInTheDocument();
  });

  it("keeps permission projection failures visible and retryable", () => {
    controllerMock.mockReturnValue(controller({ canManage: false, accessStatus: "error" }));

    renderView();
    fireEvent.click(screen.getByRole("button", { name: "common:RETRY" }));

    expect(screen.getByText("commerce:PLAN_MANAGEMENT_ACCESS_ERROR_TITLE")).toBeVisible();
    expect(screen.getByText("commerce:PLAN_MANAGEMENT_ACCESS_ERROR_DESCRIPTION")).toBeVisible();
    expect(retryPermissionMock).toHaveBeenCalledTimes(1);
  });

  it("does not render a fake renewal lifecycle for the Free plan", () => {
    controllerMock.mockReturnValue(
      controller({
        currentOverview: {
          ...overview(),
          planRevision: { ...overview().planRevision, planCode: "free" },
          subscription: {
            ...overview().subscription,
            currentPeriodEnd: "9999-12-31T23:59:59.999999Z",
          },
          credits: { ...overview().credits, nextRefreshAt: null },
        },
      }),
    );

    renderView();

    expect(screen.getByText("commerce:CREDITS_NO_AUTOMATIC_REFRESH")).toBeVisible();
    expect(screen.queryByText("commerce:SUBSCRIPTION_STATUS_LABEL")).not.toBeInTheDocument();
    expect(screen.queryByText(/9999|10000/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "commerce:PLAN_MANAGE_SUBSCRIPTION" }),
    ).not.toBeInTheDocument();
  });

  it("shows cancellation separately from the next Credit refresh", () => {
    controllerMock.mockReturnValue(
      controller({
        currentOverview: {
          ...overview(),
          subscription: { ...overview().subscription, cancelAtPeriodEnd: true },
        },
      }),
    );

    renderView();

    expect(screen.getByText(/commerce:CREDITS_REFRESH_DATE:/)).toBeVisible();
    expect(screen.getByText(/commerce:SUBSCRIPTION_CANCELS_AT:/)).toBeVisible();
  });

  it("does not derive used Credits from the plan grant and current balance", () => {
    renderView();

    expect(screen.queryByText("commerce:CREDITS_PERIOD_SPENT")).not.toBeInTheDocument();
    expect(screen.queryByText("2,000")).not.toBeInTheDocument();
  });
});
