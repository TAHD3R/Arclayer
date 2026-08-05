import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { BuilderCompositionSagaOut, BuilderGenerationOut } from "@arclayer/openapi";

import { CompositionSagaPhaseRail } from "@/pages/projects/editor/composition-saga-phase-rail";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const ACTIVE_STATUSES: BuilderCompositionSagaOut["status"][] = [
  "planning_queued",
  "planning_running",
  "planning_review_pending",
  "composition_queued",
  "composition_running",
  "composition_review_pending",
  "completed",
  "failed",
  "cancelled",
];

function generation(
  phase: "planning" | "composition",
  status: BuilderGenerationOut["status"] = "running",
): BuilderGenerationOut {
  return {
    generationId: `${phase}-generation-1`,
    jobId: `${phase}-job-1`,
    targetStage: phase === "planning" ? "planning" : "wireframe",
    targets: [{ kind: "page", itemId: "page-1" }],
    baseRevisionId: phase === "planning" ? "revision-1" : "revision-2",
    baseEtag: `sha256:${"a".repeat(64)}`,
    agentRunId: null,
    agentId: "agent-1",
    agentVersionId: "agent-version-1",
    agentAssignmentId: "assignment-1",
    status,
    jobStatus: status === "running" ? "running" : "succeeded",
    phase,
    statusKey: null,
    progressCompleted: status === "running" ? 0 : 1,
    progressTotal: 1,
    candidates: [],
    failures: [],
    cancelRequestedAt: null,
    cancellationAcknowledgedAt: null,
    createdAt: "2026-07-22T00:00:00Z",
    updatedAt: "2026-07-22T00:00:01Z",
  };
}

function saga(
  status: BuilderCompositionSagaOut["status"],
  terminalPhase: "planning" | "composition" = "planning",
): BuilderCompositionSagaOut {
  const compositionStarted = status.startsWith("composition_") || status === "completed";
  const hasComposition = compositionStarted || terminalPhase === "composition";
  return {
    sagaId: "saga-1",
    status,
    currentPhase:
      status === "completed" ? "completed" : hasComposition ? "composition" : "planning",
    initialBaseRevisionId: "revision-1",
    initialBaseEtag: `sha256:${"a".repeat(64)}`,
    targets: [{ kind: "page", itemId: "page-1" }],
    planningTargets: [{ kind: "page", itemId: "page-1" }],
    agentRunId: null,
    agentId: "agent-1",
    agentVersionId: "agent-version-1",
    agentAssignmentId: "assignment-1",
    waitingReason: null,
    planningGeneration: generation("planning", "succeeded"),
    planningChangeSetId: "planning-change-set-1",
    planningResultRevisionId: hasComposition ? "revision-2" : null,
    compositionGeneration: hasComposition ? generation("composition") : null,
    compositionChangeSetId: hasComposition ? "composition-change-set-1" : null,
    compositionResultRevisionId: status === "completed" ? "revision-3" : null,
    failure:
      status === "failed"
        ? { code: "BUILDER_COMPOSITION_FAILED", messageKey: "BUILDER_COMPOSITION_FAILED" }
        : null,
    cancelRequestedAt: status === "cancelled" ? "2026-07-22T00:00:02Z" : null,
    createdAt: "2026-07-22T00:00:00Z",
    updatedAt: "2026-07-22T00:00:02Z",
  };
}

describe("CompositionSagaPhaseRail", () => {
  it.each(ACTIVE_STATUSES)("projects the persisted %s product state", (status) => {
    render(<CompositionSagaPhaseRail saga={saga(status)} />);

    expect(
      screen.getByText(`CREATION_EDITOR_COMPOSITION_SAGA_STATUS_${status.toUpperCase()}`),
    ).toBeVisible();
  });

  it("keeps planning complete when composition fails", () => {
    render(<CompositionSagaPhaseRail saga={saga("failed", "composition")} />);

    const rail = screen.getByRole("status", {
      name: "CREATION_EDITOR_COMPOSITION_SAGA_PHASE_RAIL",
    });
    const phases = within(rail).getAllByRole("listitem");
    expect(phases[0]).toHaveAttribute("data-state", "complete");
    expect(phases[1]).toHaveAttribute("data-state", "terminal");
  });
});
