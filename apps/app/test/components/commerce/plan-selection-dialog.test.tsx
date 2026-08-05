import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceCommerceOverview, WorkspacePlanOption } from "@/api/commerce";
import type { ConvergencePreview } from "@/api/plan-access-convergence";
import {
  createWorkspaceCheckoutSession,
  getWorkspaceCommerceOverview,
  listWorkspaceCommercePlans,
} from "@/api/commerce";
import {
  createPlanAccessConvergencePreview,
  schedulePlanAccessConvergence,
} from "@/api/plan-access-convergence";
import { PlanSelectionDialog } from "@/components/commerce/plan-selection-dialog";
import { ApiError } from "@/lib/http";

const convergenceMocks = vi.hoisted(() => ({
  createPreview: vi.fn(),
  schedule: vi.fn(),
}));

vi.mock("@/api/commerce", () => ({
  createWorkspaceCheckoutSession: vi.fn(),
  getWorkspaceCommerceOverview: vi.fn(),
  listWorkspaceCommercePlans: vi.fn(),
}));
vi.mock("@/api/plan-access-convergence", () => ({
  createPlanAccessConvergencePreview: convergenceMocks.createPreview,
  schedulePlanAccessConvergence: convergenceMocks.schedule,
  planAccessConvergenceApi: {
    createPreview: convergenceMocks.createPreview,
    schedule: convergenceMocks.schedule,
  },
}));

const localizedCopy: Readonly<Record<string, string>> = {
  "featureAccess:AI_WRITING_NAME": "AI writing",
  "featureAccess:AI_WRITING_DESCRIPTION": "Create and refine content with AI.",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${Object.values(values).join(":")}` : key,
    i18n: {
      language: "en-US",
      resolvedLanguage: "en-US",
      exists: (key: string) => key in localizedCopy,
      t: (key: string) => localizedCopy[key] ?? key,
    },
  }),
}));

const locationAssign = vi.fn();
const workspaceId = "workspace-1";
const effectiveAt = "2026-08-01T00:00:00Z";

function plan(input: Partial<WorkspacePlanOption> & Pick<WorkspacePlanOption, "planCode">) {
  const { planCode, ...overrides } = input;
  return {
    id: `revision-${planCode}`,
    planId: `plan-${planCode}`,
    planCode,
    sequence: 1,
    nameI18NKey: `commerce:PLAN_${planCode.toUpperCase()}_NAME`,
    descriptionI18NKey: `commerce:PLAN_${planCode.toUpperCase()}_DESCRIPTION`,
    creditGrantAmount: 1_000,
    creditRefreshInterval: "monthly" as const,
    creditValueMicros: 1_000,
    currency: "USD",
    entitlements: [],
    prices: [],
    resourceAllowances: [],
    isSelling: true,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    isCurrent: false,
    canSelect: true,
    ...overrides,
  } satisfies WorkspacePlanOption;
}

function overview(): WorkspaceCommerceOverview {
  return {
    planRevision: plan({ planCode: "free", isCurrent: true, canSelect: false }),
    subscription: {
      id: "subscription-1",
      planRevisionId: "revision-free",
      billingCycle: "monthly",
      status: "active",
      cancelAtPeriodEnd: false,
      currentPeriodStart: "2026-07-01T00:00:00Z",
      currentPeriodEnd: effectiveAt,
      subscriptionRevision: 17,
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-01T00:00:00Z",
    },
    credits: {
      accountRevision: 1,
      available: 1_000,
      balance: 1_000,
      reserved: 0,
      nextRefreshAt: effectiveAt,
      periodStart: "2026-07-01T00:00:00Z",
      periodEnd: effectiveAt,
    },
    usage: {
      requests: 0,
      promptTokens: 0,
      completionTokens: 0,
      periodCostMicros: 0,
    },
  } satisfies WorkspaceCommerceOverview;
}

function convergencePreview(
  requiresConvergence: boolean,
  retainedAssignmentIds: string[] = [],
): ConvergencePreview {
  return {
    id: "preview-1",
    previewRevision: 4,
    snapshotHash: "snapshot-hash",
    effectiveAt,
    retainedAssignmentIds,
    idempotencyKey: "server-preview-command",
    correlationId: "server-preview-correlation",
    snapshot: {
      workspaceId,
      ownerUserId: "user-owner",
      subscriptionRevision: 17,
      requiresConvergence,
      sourceRevision: {
        id: "revision-free",
        planId: "plan-free",
        code: "free",
        isFree: true,
        rolesManageIncluded: true,
        memberSeatLimits: { "feature.ai": 1 },
      },
      targetRevision: {
        id: "revision-premium",
        planId: "plan-premium",
        code: "premium",
        isFree: false,
        rolesManageIncluded: true,
        memberSeatLimits: { "feature.ai": 1 },
      },
      activeMembers: requiresConvergence
        ? [{ membershipId: "membership-alice", userId: "user-alice", displayName: "Alice Chen" }]
        : [],
      roleResponsibilities: [],
      customRoles: [],
      billingManagers: [],
      featureSeatManagers: [],
      featureAssignments: requiresConvergence
        ? [
            {
              assignmentId: "feature-assignment-alice",
              membershipId: "membership-alice",
              userId: "user-alice",
              entitlementKey: "feature.ai",
              nameI18NKey: "featureAccess:AI_WRITING_NAME",
              descriptionI18NKey: "featureAccess:AI_WRITING_DESCRIPTION",
            },
          ]
        : [],
      featureAllocationScopeRevisions: [],
      emailInvitations: [],
      reusableInvitationLinks: [],
      queuedEffects: [],
    },
  };
}

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <PlanSelectionDialog workspaceId={workspaceId} open onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

async function selectPremiumPlan(user: ReturnType<typeof userEvent.setup>) {
  const premiumCard = (await screen.findByText("commerce:PLAN_PREMIUM_NAME")).closest(
    ".rounded-xl",
  ) as HTMLElement;
  await user.click(within(premiumCard).getByRole("button", { name: /PLAN_REVIEW_CHANGE_ACTION/ }));
}

describe("PlanSelectionDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign: locationAssign },
    });
    vi.mocked(listWorkspaceCommercePlans).mockResolvedValue({
      billingProvider: "stripe",
      checkoutEnabled: true,
      items: [
        plan({ planCode: "free", isCurrent: true, canSelect: false }),
        plan({ planCode: "premium", sequence: 2 }),
      ],
    });
    vi.mocked(getWorkspaceCommerceOverview).mockResolvedValue(overview());
    vi.mocked(createWorkspaceCheckoutSession).mockResolvedValue({
      url: "https://checkout.stripe.test/session",
    });
    vi.mocked(createPlanAccessConvergencePreview).mockImplementation(async (_workspace, body) =>
      convergencePreview(false, body.retainedAssignmentIds),
    );
    vi.mocked(schedulePlanAccessConvergence).mockResolvedValue({
      transitionId: "transition-1",
      providerScheduleId: "provider-schedule-1",
      effectiveAt,
      correlationId: "schedule-correlation",
      convergenceId: "preview-1",
    });
  });

  it("marks the current revision and waits for the commerce overview before selection", async () => {
    renderDialog();

    expect(await screen.findByText("commerce:PLAN_FREE_NAME")).toBeVisible();
    expect(screen.getByText("commerce:EXTERNAL_CHECKOUT_TITLE")).toBeVisible();
    expect(screen.getByRole("button", { name: "commerce:PLAN_CURRENT" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /commerce:PLAN_REVIEW_CHANGE_ACTION/ }),
    ).toBeEnabled();
    expect(getWorkspaceCommerceOverview).toHaveBeenCalledWith(workspaceId, expect.any(AbortSignal));
  });

  it("previews first and opens checkout only when the server requires no convergence", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("tab", { name: "commerce:BILLING_YEARLY" }));
    await selectPremiumPlan(user);
    await user.click(screen.getByRole("button", { name: "planChange:REVIEW_PLAN_CHANGE" }));

    await waitFor(() => {
      expect(createPlanAccessConvergencePreview).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({
          sourceRevisionId: "revision-free",
          targetRevisionId: "revision-premium",
          expectedSubscriptionRevision: 17,
          effectiveAt,
        }),
      );
      expect(createWorkspaceCheckoutSession).toHaveBeenCalledWith(
        workspaceId,
        {
          planCode: "premium",
          billingInterval: "yearly",
        },
        expect.any(String),
      );
    });
    expect(schedulePlanAccessConvergence).not.toHaveBeenCalled();
    expect(locationAssign).toHaveBeenCalledWith("https://checkout.stripe.test/session");
  });

  it("requires named access review and only reports a scheduled convergence", async () => {
    const user = userEvent.setup();
    vi.mocked(createPlanAccessConvergencePreview).mockImplementation(async (_workspace, body) =>
      convergencePreview(true, body.retainedAssignmentIds),
    );
    renderDialog();

    await selectPremiumPlan(user);
    await user.click(screen.getByRole("button", { name: "planChange:REVIEW_PLAN_CHANGE" }));
    const retainedAccess = await screen.findByRole("checkbox", {
      name: /RETAIN_MEMBER_ACCESS_LABEL:Alice Chen:AI writing/,
    });
    await user.click(retainedAccess);
    await user.click(screen.getByRole("button", { name: "planChange:UPDATE_REVIEW" }));
    await user.click(await screen.findByLabelText("planChange:RETAINED_ACCESS_ACKNOWLEDGEMENT"));
    await user.click(screen.getByRole("button", { name: "planChange:SCHEDULE_PLAN_CHANGE" }));

    expect(await screen.findByText("planChange:CHANGE_SCHEDULED_TITLE")).toBeVisible();
    expect(createWorkspaceCheckoutSession).not.toHaveBeenCalled();
    expect(locationAssign).not.toHaveBeenCalled();
    expect(screen.queryByText(/CHANGE_APPLIED|权限已生效/i)).toBeNull();
  });

  it("requires a fresh preview after a stale schedule and never opens checkout", async () => {
    const user = userEvent.setup();
    vi.mocked(createPlanAccessConvergencePreview).mockImplementation(async (_workspace, body) =>
      convergencePreview(true, body.retainedAssignmentIds),
    );
    vi.mocked(schedulePlanAccessConvergence).mockRejectedValueOnce(
      new ApiError({
        status: 409,
        error: "SUBSCRIPTION_TRANSITION_PREVIEW_STALE",
        message: "Subscription changed",
      }),
    );
    renderDialog();

    await selectPremiumPlan(user);
    await user.click(screen.getByRole("button", { name: "planChange:REVIEW_PLAN_CHANGE" }));
    await user.click(await screen.findByLabelText("planChange:RETAINED_ACCESS_ACKNOWLEDGEMENT"));
    await user.click(screen.getByRole("button", { name: "planChange:SCHEDULE_PLAN_CHANGE" }));

    expect(await screen.findByText("planChange:ACCESS_INFORMATION_CHANGED_TITLE")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "planChange:REVIEW_CURRENT_PLAN_CHANGE" }),
    ).toBeVisible();
    expect(createWorkspaceCheckoutSession).not.toHaveBeenCalled();
    expect(locationAssign).not.toHaveBeenCalled();
  });
});
