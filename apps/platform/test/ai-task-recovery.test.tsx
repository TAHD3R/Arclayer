import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PageDataPlatformAiTaskOut, PlatformAiTaskOut } from "@arclayer/platform-openapi";

import { executeAiTaskAction, listAiTasks, PlatformAiServicesApiError } from "@/ai/ai-services-api";
import { initializePlatformI18n, i18n } from "@/lib/i18n";
import { AiTasksPage } from "@/pages/ai-services";

vi.mock("@/ai/ai-services-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/ai/ai-services-api")>();
  return { ...actual, executeAiTaskAction: vi.fn(), listAiTasks: vi.fn() };
});

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function action(
  actionName: PlatformAiTaskOut["actions"][number]["action"],
  available: boolean,
  stateEligible: boolean,
  reasonCode: string | null = null,
): PlatformAiTaskOut["actions"][number] {
  return { action: actionName, available, reasonCode, stateEligible };
}

function task(overrides: Partial<PlatformAiTaskOut> = {}): PlatformAiTaskOut {
  return {
    actions: [
      action("retry", false, false, "AI_PLATFORM_TASK_RETRY_PORT_UNAVAILABLE"),
      action("cancel", true, true),
      action("reconcile", false, false, "AI_PLATFORM_TASK_RECONCILE_PORT_UNAVAILABLE"),
    ],
    createdAt: "2026-08-01T00:00:00Z",
    durableJobStatus: "running",
    errorCode: null,
    evidenceUpdatedAt: "2026-08-01T00:00:00Z",
    executionMode: "build",
    id: "task-1",
    interruptReason: null,
    jobId: "job-1",
    lastSequence: 4,
    outcome: "active",
    progressCompleted: 1,
    progressTotal: 3,
    projectId: "project-1",
    status: "running",
    statusKey: "AI_AGENT_RUN_STATUS_RUNNING",
    terminalAt: null,
    updatedAt: "2026-08-01T00:00:00Z",
    waitingForWorkspaceApproval: false,
    workspaceId: "workspace-1",
    ...overrides,
  };
}

function page(items: PlatformAiTaskOut[]): PageDataPlatformAiTaskOut {
  return { items, next: null, page: 1, pages: 1, prev: null, size: 50, total: items.length };
}

beforeAll(async () => {
  await initializePlatformI18n("en-US");
});

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("en-US");
});

afterEach(cleanup);

describe("AI task recovery", () => {
  it("shows unavailable owned recovery ports and the returned durable task state", async () => {
    vi.mocked(listAiTasks).mockResolvedValue(page([task()]));
    vi.mocked(executeAiTaskAction).mockResolvedValue(
      task({ lastSequence: 5, status: "cancellation_requested" }),
    );
    const user = userEvent.setup();

    render(<AiTasksPage />);

    const retry = await screen.findByRole("button", { name: "Retry" });
    expect(retry).toBeDisabled();
    expect(screen.getByText("Retry is not currently offered for this task.")).toBeVisible();
    expect(screen.getByText("Running")).toBeVisible();
    expect(screen.getByText("Build")).toBeVisible();
    expect(screen.queryByText("AI_AGENT_RUN_STATUS_RUNNING")).not.toBeInTheDocument();
    expect(screen.queryByText("AI_PLATFORM_TASK_RETRY_PORT_UNAVAILABLE")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(executeAiTaskAction).toHaveBeenCalledWith("task-1", "cancel", {
        idempotencyKey: expect.any(String),
      }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Current task status", {
        description: "After Cancel, the task status is In progress. Latest recorded update: 5.",
      }),
    );
  });

  it("reuses the same idempotency key after an unconfirmed task action", async () => {
    vi.mocked(listAiTasks).mockResolvedValue(page([task()]));
    vi.mocked(executeAiTaskAction)
      .mockRejectedValueOnce(
        new PlatformAiServicesApiError("AI_PLATFORM_TASK_CANCEL_NOT_ELIGIBLE", 409),
      )
      .mockResolvedValueOnce(task({ lastSequence: 5, status: "cancellation_requested" }));
    const user = userEvent.setup();

    render(<AiTasksPage />);

    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Action result not confirmed", {
        description: "This task cannot be safely cancelled in its current state.",
      }),
    );
    expect(screen.queryByText("AI_PLATFORM_TASK_CANCEL_NOT_ELIGIBLE")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));

    const firstKey = vi.mocked(executeAiTaskAction).mock.calls[0]?.[2].idempotencyKey;
    const secondKey = vi.mocked(executeAiTaskAction).mock.calls[1]?.[2].idempotencyKey;
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBe(firstKey);
  });
});
