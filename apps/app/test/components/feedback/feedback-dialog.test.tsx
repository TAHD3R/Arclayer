import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { submitFeedback } from "@/api/feedback";
import { FeedbackComposer, HeaderFeedbackPopover } from "@/components/feedback/feedback-dialog";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

vi.mock("@/api/feedback", () => ({ submitFeedback: vi.fn() }));
vi.mock("@/lib/notifications", () => ({
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  notifySuccessText: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: (options: { select: (state: unknown) => unknown }) =>
    options.select({ location: { pathname: "/projects/project-1", searchStr: "?tab=details" } }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number }) =>
      values?.count === undefined ? key : `${key}:${String(values.count)}`,
  }),
}));

function renderWithQueryClient(node: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
  return {
    ...render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>),
    invalidateQueries,
  };
}

function renderHeaderFeedback(reportContext?: {
  requestId?: string;
  status?: number;
  errorCode?: string;
}) {
  return renderWithQueryClient(
    <HeaderFeedbackPopover
      trigger={<button type="button">Open feedback</button>}
      reportContext={reportContext}
    />,
  );
}

describe("feedback entry surfaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState({
      currentWorkspaceId: "workspace-1",
      lastWorkspaceId: "workspace-1",
      currentProjectId: "project-1",
      lastProjectId: "project-1",
    });
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "019f6ec1-c45b-7558-9ee6-c6dcf53f4042",
    );
    vi.mocked(submitFeedback).mockResolvedValue({ id: "feedback-1" } as never);
  });

  it("renders card feedback without Header icons while keeping the cancel action", () => {
    renderWithQueryClient(
      <FeedbackComposer source="ai_sidebar" variant="card" autoFocus={false} onCancel={vi.fn()} />,
    );

    const composerHeader = screen.getByText("feedback:FEEDBACK_COMPOSER_TITLE").parentElement
      ?.parentElement;
    const intentOptions = screen.getByRole("radiogroup", {
      name: "feedback:FEEDBACK_DIALOG_INTENT_LABEL",
    });
    expect(composerHeader?.querySelector("svg")).toBeNull();
    expect(intentOptions).toHaveClass("grid-cols-2");
    expect(intentOptions).not.toHaveClass("sm:grid-cols-4");
    expect(screen.queryByRole("button", { name: "common:CLOSE" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "common:CANCEL" })).toBeInTheDocument();
  });

  it("does not focus the active card input when auto focus is disabled", () => {
    renderWithQueryClient(
      <FeedbackComposer
        source="ai_sidebar"
        initialIntent="problem"
        variant="card"
        active
        autoFocus={false}
      />,
    );

    expect(screen.getByLabelText("feedback:FEEDBACK_DIALOG_MESSAGE_LABEL")).not.toHaveFocus();
  });

  it("renders Header feedback as a popover instead of a dialog", async () => {
    const user = userEvent.setup();
    renderHeaderFeedback();

    await user.click(screen.getByRole("button", { name: "Open feedback" }));

    expect(document.querySelector("[data-slot='popover-content']")).toBeInTheDocument();
    expect(document.querySelector("[data-slot='dialog-content']")).not.toBeInTheDocument();
    expect(document.querySelector("[data-slot='popover-content']")).toHaveClass(
      "w-[min(22rem,calc(100vw-2rem))]",
    );
    await waitFor(() => expect(screen.getByText("feedback:FEEDBACK_COMPOSER_TITLE")).toBeVisible());
    expect(
      screen.getByRole("radiogroup", { name: "feedback:FEEDBACK_DIALOG_INTENT_LABEL" }),
    ).toBeVisible();
    expect(
      screen.getByRole("radiogroup", { name: "feedback:FEEDBACK_DIALOG_INTENT_LABEL" }),
    ).toHaveClass("grid-cols-2");
    expect(
      screen.getByRole("radiogroup", { name: "feedback:FEEDBACK_DIALOG_INTENT_LABEL" }),
    ).not.toHaveClass("sm:grid-cols-4");
    expect(screen.getByRole("radio", { name: "feedback:FEEDBACK_INTENT_PROBLEM" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.queryByRole("button", { name: "common:CLOSE" })).not.toBeInTheDocument();
    const composerHeader = screen.getByText("feedback:FEEDBACK_COMPOSER_TITLE").parentElement
      ?.parentElement;
    expect(composerHeader?.querySelector("svg")).toBeNull();
    await waitFor(() =>
      expect(
        screen.getByPlaceholderText("feedback:FEEDBACK_DIALOG_MESSAGE_PLACEHOLDER"),
      ).toBeVisible(),
    );
    expect(screen.getByLabelText("feedback:FEEDBACK_DIALOG_MESSAGE_LABEL")).not.toHaveFocus();
  });

  it("requires an intent and validates the compact Header form before submitting", async () => {
    const user = userEvent.setup();
    renderHeaderFeedback();

    await user.click(screen.getByRole("button", { name: "Open feedback" }));
    expect(screen.getByRole("button", { name: "feedback:ACTION_SUBMIT_FEEDBACK" })).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "feedback:FEEDBACK_INTENT_PROBLEM" }));
    await user.type(screen.getByLabelText("feedback:FEEDBACK_DIALOG_MESSAGE_LABEL"), "short");
    await user.click(screen.getByRole("button", { name: "feedback:ACTION_SUBMIT_FEEDBACK" }));

    expect(
      await screen.findByText("feedback:FEEDBACK_VALIDATION_MIN_LENGTH:10"),
    ).toBeInTheDocument();
    expect(submitFeedback).not.toHaveBeenCalled();
  });

  it("submits Header feedback with project and route context", async () => {
    const user = userEvent.setup();
    const { invalidateQueries } = renderHeaderFeedback();

    await user.click(screen.getByRole("button", { name: "Open feedback" }));
    await user.click(screen.getByRole("radio", { name: "feedback:FEEDBACK_INTENT_IDEA" }));
    await user.type(
      screen.getByLabelText("feedback:FEEDBACK_DIALOG_MESSAGE_LABEL"),
      "The publishing flow needs a clearer confirmation state.",
    );
    await user.click(screen.getByRole("button", { name: "feedback:ACTION_SUBMIT_FEEDBACK" }));

    await waitFor(() => expect(submitFeedback).toHaveBeenCalledTimes(1));
    expect(vi.mocked(submitFeedback).mock.calls[0]?.[0]).toEqual({
      clientRequestId: "019f6ec1-c45b-7558-9ee6-c6dcf53f4042",
      source: "header",
      contextType: "project",
      workspaceId: "workspace-1",
      projectId: "project-1",
      intent: "idea",
      message: "The publishing flow needs a clearer confirmation state.",
      contextUrl: "/projects/project-1?tab=details",
      context: { route: "/projects/project-1?tab=details" },
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["dataTable", "system-feedback-center"],
    });
  });

  it("attaches toast request metadata when reporting a server error", async () => {
    const user = userEvent.setup();
    renderHeaderFeedback({ requestId: "req_456", status: 500, errorCode: "INTERNAL_ERROR" });

    await user.click(screen.getByRole("button", { name: "Open feedback" }));
    expect(screen.queryByText("req_456")).not.toBeInTheDocument();
    expect(screen.queryByText("common:TOAST_REQUEST_ID_VALUE")).not.toBeInTheDocument();
    await user.type(
      screen.getByLabelText("feedback:FEEDBACK_DIALOG_MESSAGE_LABEL"),
      "Saving this page failed after I changed the title.",
    );
    await user.click(screen.getByRole("button", { name: "feedback:ACTION_SUBMIT_FEEDBACK" }));

    await waitFor(() => expect(submitFeedback).toHaveBeenCalledTimes(1));
    expect(vi.mocked(submitFeedback).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        intent: "problem",
        context: {
          route: "/projects/project-1?tab=details",
          requestId: "req_456",
          httpStatus: 500,
          errorCode: "INTERNAL_ERROR",
        },
      }),
    );
  });

  it("reuses the idempotency key when a submission is retried", async () => {
    vi.mocked(submitFeedback)
      .mockRejectedValueOnce(new Error("Network interrupted"))
      .mockResolvedValueOnce({ id: "feedback-1" } as never);
    const user = userEvent.setup();
    renderHeaderFeedback();

    await user.click(screen.getByRole("button", { name: "Open feedback" }));
    await user.click(screen.getByRole("radio", { name: "feedback:FEEDBACK_INTENT_QUESTION" }));
    await user.type(
      screen.getByLabelText("feedback:FEEDBACK_DIALOG_MESSAGE_LABEL"),
      "The assistant response omitted the requested rollout risk.",
    );
    await user.click(screen.getByRole("button", { name: "feedback:ACTION_SUBMIT_FEEDBACK" }));
    expect(await screen.findByText("Network interrupted")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "feedback:ACTION_SUBMIT_FEEDBACK" }));

    await waitFor(() => expect(submitFeedback).toHaveBeenCalledTimes(2));
    expect(
      vi.mocked(submitFeedback).mock.calls.map(([payload]) => payload.clientRequestId),
    ).toEqual(["019f6ec1-c45b-7558-9ee6-c6dcf53f4042", "019f6ec1-c45b-7558-9ee6-c6dcf53f4042"]);
  });
});
