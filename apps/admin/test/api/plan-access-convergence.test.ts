import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http", () => ({
  api: { post: vi.fn() },
}));

import {
  createPlanAccessConvergencePreview,
  type ConvergencePreviewRequest,
  type RenewalTransitionScheduleRequest,
  schedulePlanAccessConvergence,
} from "@/api/plan-access-convergence";
import { api } from "@/lib/http";

describe("plan access convergence API contract", () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset();
    vi.mocked(api.post).mockResolvedValue({});
  });

  it("posts the generated preview DTO to the Product workspace route unchanged", async () => {
    const payload: ConvergencePreviewRequest = {
      workspaceId: "workspace-1",
      sourceRevisionId: "revision-current",
      targetRevisionId: "revision-target",
      expectedSubscriptionRevision: 17,
      effectiveAt: "2026-08-01T00:00:00Z",
      retainedAssignmentIds: ["assignment-2"],
      idempotencyKey: "preview-command",
      correlationId: "preview-correlation",
    };

    await createPlanAccessConvergencePreview("workspace-1", payload);

    expect(api.post).toHaveBeenCalledWith(
      "/workspaces/workspace-1/commerce/access-convergence/previews",
      payload,
    );
  });

  it("posts the generated schedule DTO to the exact reviewed preview route", async () => {
    const payload: RenewalTransitionScheduleRequest = {
      previewId: "preview/with slash",
      expectedPreviewRevision: 4,
      convergenceId: "preview/with slash",
      idempotencyKey: "schedule-command",
      correlationId: "schedule-correlation",
    };

    await schedulePlanAccessConvergence("workspace-1", "preview/with slash", payload);

    expect(api.post).toHaveBeenCalledWith(
      "/workspaces/workspace-1/commerce/access-convergence/previews/preview%2Fwith%20slash/schedule",
      payload,
    );
  });
});
