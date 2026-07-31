import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { OperationalSignalDetailOut } from "@arclayer/platform-openapi";

import {
  assignOperationalSignal,
  claimOperationalSignal,
  getOperationalSignal,
  listOperationalSignalEligibleAssignees,
  PlatformOperationsApiError,
  remindOperationalSignalLater,
} from "@/operations/operations-api";
import { SignalInvestigation } from "@/operations/signal-investigation";
import { SignalQueueWithAssignees } from "@/operations/signal-queue";
import { SignalDetailSheet } from "@/operations/signal-detail-sheet";
import { SignalTriageActions } from "@/operations/signal-triage-actions";
import { initializePlatformI18n, i18n } from "@/lib/i18n";

const detail: OperationalSignalDetailOut = {
  allowedTriageActions: ["claim"],
  copy: {
    explanationKey: "inbox:BACKGROUND_JOB_FAILED_EXPLANATION",
    impactKey: "inbox:BACKGROUND_JOB_FAILED_IMPACT",
    titleKey: "inbox:BACKGROUND_JOB_FAILED_TITLE",
  },
  destination: {
    labelKey: "inbox:BACKGROUND_JOB_DESTINATION",
    path: "/operations/jobs?jobId=signal-1",
  },
  detectedAt: "2026-07-31T02:00:00Z",
  evidence: {
    attemptCount: 3,
    errorCode: "SOURCE_FAILED",
    jobType: "site_publish",
    workloadClass: "background",
  },
  freshness: {
    ageSeconds: 60,
    observedAt: "2026-07-31T03:00:00Z",
    sourceUpdatedAt: "2026-07-31T02:59:00Z",
  },
  id: "signal-1",
  priority: { rank: 1, reasonKeys: ["inbox:BACKGROUND_JOB_FAILED_PRIORITY"] },
  requiredPermission: "platform:jobs:manage",
  resolutionConditionKey: "inbox:BACKGROUND_JOB_RESOLUTION_CONDITION",
  severity: "high",
  signalType: "background_job_failed",
  sourceDomain: "jobs",
  sourceLifecycle: "unresolved",
  sourceReference: { id: "source-1", type: "background_job" },
  triage: { revision: 7, state: "needs_attention" },
  triageHistory: [],
};

function updatedDetail(next: Partial<OperationalSignalDetailOut> = {}) {
  return {
    ...detail,
    ...next,
    triage: { ...detail.triage, revision: 8 },
  };
}

function renderActions(current: OperationalSignalDetailOut = detail) {
  const onReload = vi.fn();
  const onUpdated = vi.fn();
  render(<SignalTriageActions detail={current} onReload={onReload} onUpdated={onUpdated} />);
  return { onReload, onUpdated };
}

beforeAll(async () => {
  await initializePlatformI18n("en-US");
});

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("en-US");
});

describe("Operational Signal triage actions", () => {
  it("renders only actions authorized by the server projection", () => {
    renderActions({ ...detail, allowedTriageActions: ["claim", "remind_later"] });

    expect(screen.getByRole("button", { name: "Claim" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Set reminder" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Assign item" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark in progress" })).not.toBeInTheDocument();
  });

  it("sends the current revision and applies the returned detail immediately", async () => {
    const next = updatedDetail({ allowedTriageActions: ["in_progress"] });
    vi.mocked(claimOperationalSignal).mockResolvedValueOnce(next);
    const user = userEvent.setup();
    const { onUpdated } = renderActions();

    await user.click(screen.getByRole("button", { name: "Claim" }));

    await waitFor(() => expect(claimOperationalSignal).toHaveBeenCalledWith("signal-1", 7));
    expect(onUpdated).toHaveBeenCalledWith(next);
    expect(await screen.findByText("Work coordination was updated.")).toBeVisible();
  });

  it("assigns only to an operator returned by the eligible-assignees projection", async () => {
    vi.mocked(listOperationalSignalEligibleAssignees).mockResolvedValueOnce([
      { displayName: "Ada Operator", userId: "operator-1", username: "ada" },
    ]);
    vi.mocked(assignOperationalSignal).mockResolvedValueOnce(updatedDetail());
    const user = userEvent.setup();
    renderActions({ ...detail, allowedTriageActions: ["assign"] });

    await user.click(await screen.findByRole("combobox", { name: "Operator" }));
    await user.click(screen.getByRole("option", { name: "Ada Operator" }));
    await user.click(screen.getByRole("button", { name: "Assign item" }));

    await waitFor(() =>
      expect(assignOperationalSignal).toHaveBeenCalledWith("signal-1", "operator-1", 7),
    );
  });

  it("requires a future reminder time and a reason before mutation", async () => {
    vi.mocked(remindOperationalSignalLater).mockResolvedValueOnce(updatedDetail());
    const user = userEvent.setup();
    renderActions({ ...detail, allowedTriageActions: ["remind_later"] });

    await user.click(screen.getByRole("button", { name: "Set reminder" }));
    expect(screen.getByText("Choose a future return time.")).toBeVisible();
    expect(screen.getByText("Explain why this item should return later.")).toBeVisible();
    expect(remindOperationalSignalLater).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Return time"), {
      target: { value: "2099-01-02T12:30" },
    });
    await user.type(screen.getByLabelText("Reason"), "Check whether the owning job recovered");
    await user.click(screen.getByRole("button", { name: "Set reminder" }));

    await waitFor(() =>
      expect(remindOperationalSignalLater).toHaveBeenCalledWith(
        "signal-1",
        7,
        new Date("2099-01-02T12:30").toISOString(),
        "Check whether the owning job recovered",
      ),
    );
  });

  it("surfaces revision conflicts and reloads instead of retrying the stale mutation", async () => {
    vi.mocked(claimOperationalSignal).mockRejectedValueOnce(
      new PlatformOperationsApiError("OPERATIONAL_SIGNAL_REVISION_CONFLICT", 409),
    );
    const user = userEvent.setup();
    const { onReload } = renderActions();

    await user.click(screen.getByRole("button", { name: "Claim" }));

    expect(await screen.findByText("This item changed while you were working")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Reload current item" }));
    expect(onReload).toHaveBeenCalledOnce();
    expect(claimOperationalSignal).toHaveBeenCalledOnce();
  });

  it("hides stale actions until a conflict reload returns the current revision", async () => {
    let resolveReload!: (value: OperationalSignalDetailOut) => void;
    const reloaded = new Promise<OperationalSignalDetailOut>((resolve) => {
      resolveReload = resolve;
    });
    vi.mocked(getOperationalSignal)
      .mockResolvedValueOnce({ ...detail, destination: { ...detail.destination, path: "/other" } })
      .mockReturnValueOnce(reloaded);
    vi.mocked(claimOperationalSignal).mockRejectedValueOnce(
      new PlatformOperationsApiError("OPERATIONAL_SIGNAL_REVISION_CONFLICT", 409),
    );
    const user = userEvent.setup();
    render(<SignalDetailSheet onClose={vi.fn()} onQueueRefresh={vi.fn()} signalId="signal-1" />);

    await user.click(await screen.findByRole("button", { name: "Claim" }));
    await user.click(await screen.findByRole("button", { name: "Reload current item" }));
    expect(screen.queryByRole("button", { name: "Claim" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Loading operational work details")).toBeVisible();

    await act(async () => {
      resolveReload(
        updatedDetail({
          allowedTriageActions: ["in_progress"],
          destination: { ...detail.destination, path: "/other" },
        }),
      );
    });
    expect(await screen.findByRole("button", { name: "Mark in progress" })).toBeVisible();
  });

  it("keeps source-resolved work read-only with no manual close action", () => {
    render(
      <SignalInvestigation
        actions={<button type="button">Forbidden coordination action</button>}
        detail={{ ...detail, allowedTriageActions: [], sourceLifecycle: "resolved" }}
        showDestination={false}
      />,
    );

    expect(screen.getByText("The owning service confirmed resolution")).toBeVisible();
    expect(screen.queryByText("Forbidden coordination action")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /dismiss|close|resolve/i }),
    ).not.toBeInTheDocument();
  });

  it("shows eligible operator names in the queue without exposing raw user IDs", async () => {
    vi.mocked(listOperationalSignalEligibleAssignees).mockResolvedValueOnce([
      { displayName: "Ada Operator", userId: "operator-1", username: "ada" },
    ]);
    const { triageHistory: _history, ...signal } = detail;
    render(
      <SignalQueueWithAssignees
        data={{
          items: [
            {
              ...signal,
              allowedTriageActions: ["assign"],
              triage: { ...signal.triage, assigneeUserId: "operator-1" },
            },
          ],
          next: null,
          page: 1,
          pages: 1,
          prev: null,
          size: 20,
          total: 1,
        }}
        onOpen={vi.fn()}
        onPageChange={vi.fn()}
      />,
    );

    expect(await screen.findByText("Ada Operator")).toBeVisible();
    expect(screen.queryByText("operator-1")).not.toBeInTheDocument();
  });

  it("uses natural fallback copy when an assigned operator is no longer eligible", async () => {
    vi.mocked(listOperationalSignalEligibleAssignees).mockResolvedValueOnce([]);
    const { triageHistory: _history, ...signal } = detail;
    render(
      <SignalQueueWithAssignees
        data={{
          items: [
            {
              ...signal,
              allowedTriageActions: ["assign"],
              triage: { ...signal.triage, assigneeUserId: "former-operator" },
            },
          ],
          next: null,
          page: 1,
          pages: 1,
          prev: null,
          size: 20,
          total: 1,
        }}
        onOpen={vi.fn()}
        onPageChange={vi.fn()}
      />,
    );

    expect(await screen.findByText("Assigned to an operator")).toBeVisible();
    expect(screen.queryByText("former-operator")).not.toBeInTheDocument();
  });
});
