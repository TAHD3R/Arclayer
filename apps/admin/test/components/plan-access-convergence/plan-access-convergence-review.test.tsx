import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ConvergencePreview,
  RenewalTransitionScheduleOut,
} from "@/api/plan-access-convergence";
import {
  createPlanAccessConvergencePreview,
  schedulePlanAccessConvergence,
} from "@/api/plan-access-convergence";
import { PlanAccessConvergenceReview } from "@/components/plan-access-convergence";
import { ApiError } from "@/lib/http";

vi.mock("@/api/plan-access-convergence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/plan-access-convergence")>();
  return {
    ...actual,
    createPlanAccessConvergencePreview: vi.fn(),
    schedulePlanAccessConvergence: vi.fn(),
  };
});

const localizedFeatureCopy: Readonly<Record<string, string>> = {
  "featureAccess:AI_WRITING_NAME": "AI writing",
  "featureAccess:AI_WRITING_DESCRIPTION": "Create and refine content with AI.",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key} ${Object.values(values).join(" ")}` : key,
    i18n: {
      language: "en-US",
      resolvedLanguage: "en-US",
      exists: (key: string) => key in localizedFeatureCopy,
      t: (key: string) => localizedFeatureCopy[key] ?? key,
    },
  }),
}));

const intent = {
  workspaceId: "workspace-1",
  sourceRevisionId: "revision-current",
  targetRevisionId: "revision-target",
  expectedSubscriptionRevision: 17,
  effectiveAt: "2026-08-01T00:00:00Z",
} as const;

function preview(retainedAssignmentIds: string[] = []): ConvergencePreview {
  return {
    id: "preview-1",
    previewRevision: 4,
    snapshotHash: "snapshot-hash",
    effectiveAt: intent.effectiveAt,
    retainedAssignmentIds,
    idempotencyKey: "server-preview-command",
    correlationId: "server-preview-correlation",
    snapshot: {
      workspaceId: intent.workspaceId,
      ownerUserId: "user-owner",
      subscriptionRevision: intent.expectedSubscriptionRevision,
      requiresConvergence: true,
      sourceRevision: {
        id: intent.sourceRevisionId,
        planId: "plan-premium",
        code: "premium",
        isFree: false,
        rolesManageIncluded: true,
        memberSeatLimits: { "feature.ai": 2 },
      },
      targetRevision: {
        id: intent.targetRevisionId,
        planId: "plan-free",
        code: "free",
        isFree: true,
        rolesManageIncluded: false,
        memberSeatLimits: { "feature.ai": 1 },
      },
      activeMembers: [
        { membershipId: "membership-alice", userId: "user-alice", displayName: "Alice Chen" },
        { membershipId: "membership-bob", userId: "user-bob", displayName: "Bob Stone" },
        { membershipId: "membership-lin", userId: "user-lin", displayName: "Lin Zhang" },
        { membershipId: "membership-maya", userId: "user-maya", displayName: "Maya Lee" },
      ],
      roleResponsibilities: [
        {
          assignmentId: "role-assignment-1",
          membershipId: "membership-alice",
          userId: "user-alice",
          roleId: "role-editor",
          roleName: "Content editor",
        },
      ],
      customRoles: [{ roleId: "role-reviewer", roleName: "Release reviewer" }],
      billingManagers: [
        { membershipId: "membership-lin", userId: "user-lin", displayName: "Lin Zhang" },
      ],
      featureSeatManagers: [
        { membershipId: "membership-maya", userId: "user-maya", displayName: "Maya Lee" },
      ],
      featureAssignments: [
        {
          assignmentId: "feature-assignment-alice",
          membershipId: "membership-alice",
          userId: "user-alice",
          entitlementKey: "feature.ai",
          nameI18NKey: "featureAccess:AI_WRITING_NAME",
          descriptionI18NKey: "featureAccess:AI_WRITING_DESCRIPTION",
        },
        {
          assignmentId: "feature-assignment-bob",
          membershipId: "membership-bob",
          userId: "user-bob",
          entitlementKey: "feature.ai",
          nameI18NKey: "featureAccess:AI_WRITING_NAME",
          descriptionI18NKey: "featureAccess:AI_WRITING_DESCRIPTION",
        },
      ],
      featureAllocationScopeRevisions: [{ entitlementKey: "feature.ai", revision: 9 }],
      emailInvitations: [
        {
          invitationId: "invitation-email",
          recipientLabel: "guest@example.com",
          roleId: "role-editor",
        },
      ],
      reusableInvitationLinks: [
        {
          invitationId: "invitation-link",
          recipientLabel: "Editors invitation link",
          roleId: "role-editor",
        },
      ],
      queuedEffects: [
        { effectId: "queued-1", actorUserId: "user-bob", effectType: "site.generate" },
      ],
    },
  };
}

function renderReview(
  options: Readonly<{
    onScheduled?: (result: RenewalTransitionScheduleOut) => void;
  }> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PlanAccessConvergenceReview
        intent={intent}
        sourcePlanName="Premium"
        targetPlanName="Free"
        services={{
          createPreview: createPlanAccessConvergencePreview,
          schedule: schedulePlanAccessConvergence,
        }}
        resolveQueuedEffectLabel={(type) => (type === "site.generate" ? "Site generation" : type)}
        {...(options.onScheduled ? { onScheduled: options.onScheduled } : {})}
      />
    </QueryClientProvider>,
  );
}

describe("PlanAccessConvergenceReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createPlanAccessConvergencePreview).mockImplementation(async (_workspaceId, body) =>
      preview(body.retainedAssignmentIds),
    );
    vi.mocked(schedulePlanAccessConvergence).mockResolvedValue({
      transitionId: "transition-1",
      providerScheduleId: "provider-schedule-1",
      effectiveAt: intent.effectiveAt,
      correlationId: "schedule-correlation",
      convergenceId: "preview-1",
    });
  });

  it("renders every named impact instead of reducing the review to counts", async () => {
    const user = userEvent.setup();
    const { container } = renderReview();

    await user.click(screen.getByRole("button", { name: "planChange:REVIEW_PLAN_CHANGE" }));

    expect(await screen.findAllByText("Alice Chen")).not.toHaveLength(0);
    expect(screen.getByText(/Content editor/)).toBeVisible();
    expect(screen.getByText("Release reviewer")).toBeVisible();
    expect(screen.getAllByText("Lin Zhang")).not.toHaveLength(0);
    expect(screen.getAllByText("Maya Lee")).not.toHaveLength(0);
    expect(screen.getByText("guest@example.com")).toBeVisible();
    expect(screen.getByText("Editors invitation link")).toBeVisible();
    expect(screen.getByText("Site generation")).toBeVisible();
    expect(screen.getAllByText("AI writing")).toHaveLength(2);
    expect(screen.getAllByText("Create and refine content with AI.")).toHaveLength(2);
    expect(container.textContent).not.toContain("feature.ai");
    expect(container.textContent).not.toContain("site.generate");
    expect(container.textContent).not.toMatch(/\b(?:RBAC|Entitlement|seat|provider)\b/i);
  });

  it("schedules the exact reviewed convergence and reports only the scheduled outcome", async () => {
    const user = userEvent.setup();
    const onScheduled = vi.fn();
    const { container } = renderReview({ onScheduled });

    await user.click(screen.getByRole("button", { name: "planChange:REVIEW_PLAN_CHANGE" }));
    const aliceAccess = await screen.findByRole("checkbox", {
      name: /planChange:RETAIN_MEMBER_ACCESS_LABEL Alice Chen AI writing/,
    });
    const bobAccess = screen.getByRole("checkbox", {
      name: /planChange:RETAIN_MEMBER_ACCESS_LABEL Bob Stone AI writing/,
    });
    expect(aliceAccess).not.toBeChecked();
    expect(bobAccess).not.toBeChecked();

    await user.click(aliceAccess);
    expect(aliceAccess).toBeChecked();
    expect(bobAccess).toBeDisabled();
    expect(screen.getByRole("button", { name: "planChange:SCHEDULE_PLAN_CHANGE" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "planChange:UPDATE_REVIEW" }));
    await waitFor(() => expect(createPlanAccessConvergencePreview).toHaveBeenCalledTimes(2));
    expect(createPlanAccessConvergencePreview).toHaveBeenLastCalledWith(
      intent.workspaceId,
      expect.objectContaining({ retainedAssignmentIds: ["feature-assignment-alice"] }),
    );

    await user.click(screen.getByLabelText("planChange:RETAINED_ACCESS_ACKNOWLEDGEMENT"));
    const confirm = screen.getByRole("button", { name: "planChange:SCHEDULE_PLAN_CHANGE" });
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => {
      expect(schedulePlanAccessConvergence).toHaveBeenCalledWith(intent.workspaceId, "preview-1", {
        previewId: "preview-1",
        expectedPreviewRevision: 4,
        convergenceId: "preview-1",
        idempotencyKey: expect.any(String),
        correlationId: expect.any(String),
      });
    });
    expect(onScheduled).toHaveBeenCalledWith({
      transitionId: "transition-1",
      providerScheduleId: "provider-schedule-1",
      effectiveAt: intent.effectiveAt,
      correlationId: "schedule-correlation",
      convergenceId: "preview-1",
    });
    expect(await screen.findByText("planChange:CHANGE_SCHEDULED_TITLE")).toBeVisible();
    expect(container.textContent).not.toMatch(/CHANGE_APPLIED|已应用|权限已生效/i);
    expect(confirm).toBeDisabled();
  });

  it("surfaces stale state and waits for an explicit new review without retrying automatically", async () => {
    const user = userEvent.setup();
    vi.mocked(createPlanAccessConvergencePreview).mockResolvedValueOnce({
      ...preview(),
      snapshot: { ...preview().snapshot, featureAssignments: [] },
    });
    vi.mocked(schedulePlanAccessConvergence).mockRejectedValueOnce(
      new ApiError({
        status: 409,
        error: "SUBSCRIPTION_TRANSITION_PREVIEW_STALE",
        message: "Assignments changed",
      }),
    );
    renderReview();

    await user.click(screen.getByRole("button", { name: "planChange:REVIEW_PLAN_CHANGE" }));
    await user.click(await screen.findByLabelText("planChange:RETAINED_ACCESS_ACKNOWLEDGEMENT"));
    await user.click(screen.getByRole("button", { name: "planChange:SCHEDULE_PLAN_CHANGE" }));

    expect(await screen.findByText("planChange:ACCESS_INFORMATION_CHANGED_TITLE")).toBeVisible();
    expect(createPlanAccessConvergencePreview).toHaveBeenCalledTimes(1);
    expect(schedulePlanAccessConvergence).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "planChange:REVIEW_CURRENT_PLAN_CHANGE" }));
    await waitFor(() => expect(createPlanAccessConvergencePreview).toHaveBeenCalledTimes(2));
    expect(createPlanAccessConvergencePreview).toHaveBeenLastCalledWith(
      intent.workspaceId,
      expect.objectContaining({ retainedAssignmentIds: [] }),
    );
  });

  it("schedules without access review when the server says convergence is not required", async () => {
    const user = userEvent.setup();
    vi.mocked(createPlanAccessConvergencePreview).mockResolvedValueOnce({
      ...preview(),
      snapshot: {
        ...preview().snapshot,
        requiresConvergence: false,
        activeMembers: [],
        roleResponsibilities: [],
        customRoles: [],
        billingManagers: [],
        featureSeatManagers: [],
        featureAssignments: [],
        featureAllocationScopeRevisions: [],
        emailInvitations: [],
        reusableInvitationLinks: [],
        queuedEffects: [],
      },
    });
    vi.mocked(schedulePlanAccessConvergence).mockResolvedValueOnce({
      transitionId: "transition-2",
      providerScheduleId: "provider-schedule-2",
      effectiveAt: intent.effectiveAt,
      correlationId: "schedule-correlation-2",
      convergenceId: null,
    });
    const { container } = renderReview();

    await user.click(screen.getByRole("button", { name: "planChange:REVIEW_PLAN_CHANGE" }));
    expect(await screen.findByText("planChange:NO_ACCESS_CHANGES_TITLE")).toBeVisible();
    expect(screen.queryByLabelText("planChange:RETAINED_ACCESS_ACKNOWLEDGEMENT")).toBeNull();
    expect(container.textContent).not.toContain("planChange:ACTIVE_MEMBERS_TITLE");

    await user.click(screen.getByRole("button", { name: "planChange:SCHEDULE_PLAN_CHANGE" }));

    await waitFor(() => {
      expect(schedulePlanAccessConvergence).toHaveBeenCalledWith(intent.workspaceId, "preview-1", {
        previewId: "preview-1",
        expectedPreviewRevision: 4,
        convergenceId: null,
        idempotencyKey: expect.any(String),
        correlationId: expect.any(String),
      });
    });
  });

  it("reuses the same schedule identity for an explicit retry after a network failure", async () => {
    const user = userEvent.setup();
    vi.mocked(schedulePlanAccessConvergence).mockRejectedValueOnce(
      new Error("Network unavailable"),
    );
    renderReview();

    await user.click(screen.getByRole("button", { name: "planChange:REVIEW_PLAN_CHANGE" }));
    await user.click(await screen.findByLabelText("planChange:RETAINED_ACCESS_ACKNOWLEDGEMENT"));
    const schedule = screen.getByRole("button", { name: "planChange:SCHEDULE_PLAN_CHANGE" });
    await user.click(schedule);
    expect(await screen.findByText("planChange:SCHEDULE_FAILED_TITLE")).toBeVisible();
    const firstPayload = vi.mocked(schedulePlanAccessConvergence).mock.calls[0]?.[2];

    await user.click(schedule);
    await waitFor(() => expect(schedulePlanAccessConvergence).toHaveBeenCalledTimes(2));
    const secondPayload = vi.mocked(schedulePlanAccessConvergence).mock.calls[1]?.[2];
    expect(secondPayload?.idempotencyKey).toBe(firstPayload?.idempotencyKey);
    expect(secondPayload?.correlationId).toBe(firstPayload?.correlationId);
  });
});
