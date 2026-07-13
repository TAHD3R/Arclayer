import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { submitFeedback } from "@/api/feedback";
import {
  AIConversationFeedbackPanel,
  HeaderFeedbackPopover,
} from "@/components/feedback/feedback-dialog";
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

function renderHeaderFeedback() {
  return renderWithQueryClient(
    <HeaderFeedbackPopover trigger={<button type="button">Open feedback</button>} />,
  );
}

function renderAIFeedback(conversationId = "conversation-9") {
  return renderWithQueryClient(
    <AIConversationFeedbackPanel
      conversationId={conversationId}
      onCancel={vi.fn()}
      onSubmitted={vi.fn()}
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

  it("renders Header feedback as a popover instead of a dialog", async () => {
    const user = userEvent.setup();
    renderHeaderFeedback();

    await user.click(screen.getByRole("button", { name: "Open feedback" }));

    expect(document.querySelector("[data-slot='popover-content']")).toBeInTheDocument();
    expect(document.querySelector("[data-slot='dialog-content']")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByPlaceholderText("platform:FEEDBACK_HEADER_PLACEHOLDER")).toBeVisible(),
    );
  });

  it("validates the compact Header form before submitting", async () => {
    const user = userEvent.setup();
    renderHeaderFeedback();

    await user.click(screen.getByRole("button", { name: "Open feedback" }));
    await user.click(screen.getByRole("button", { name: "platform:ACTION_SUBMIT_FEEDBACK" }));

    expect(await screen.findByText("platform:FEEDBACK_VALIDATION_REQUIRED")).toBeInTheDocument();
    expect(submitFeedback).not.toHaveBeenCalled();
  });

  it("submits Header feedback with project and route context", async () => {
    const user = userEvent.setup();
    const { invalidateQueries } = renderHeaderFeedback();

    await user.click(screen.getByRole("button", { name: "Open feedback" }));
    await user.type(
      screen.getByLabelText("platform:FEEDBACK_DIALOG_MESSAGE_LABEL"),
      "The publishing flow needs a clearer confirmation state.",
    );
    await user.click(screen.getByRole("button", { name: "platform:ACTION_SUBMIT_FEEDBACK" }));

    await waitFor(() => expect(submitFeedback).toHaveBeenCalledTimes(1));
    expect(vi.mocked(submitFeedback).mock.calls[0]?.[0]).toEqual({
      clientRequestId: "019f6ec1-c45b-7558-9ee6-c6dcf53f4042",
      source: "header",
      contextType: "project",
      workspaceId: "workspace-1",
      projectId: "project-1",
      category: "usability",
      message: "The publishing flow needs a clearer confirmation state.",
      contextUrl: "/projects/project-1?tab=details",
      context: { route: "/projects/project-1?tab=details" },
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["system", "feedback", "list"],
    });
  });

  it("renders AI feedback inline and submits conversation attribution", async () => {
    const user = userEvent.setup();
    renderAIFeedback();

    expect(screen.getByText("platform:FEEDBACK_AI_TITLE")).toBeVisible();
    expect(document.querySelector("[data-slot='dialog-content']")).not.toBeInTheDocument();
    await user.type(
      screen.getByLabelText("platform:FEEDBACK_DIALOG_MESSAGE_LABEL"),
      "The assistant response omitted the requested rollout risk.",
    );
    await user.click(screen.getByRole("button", { name: "platform:FEEDBACK_AI_SEND" }));

    await waitFor(() => expect(submitFeedback).toHaveBeenCalledTimes(1));
    expect(vi.mocked(submitFeedback).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        source: "ai_sidebar",
        contextType: "ai_conversation",
        context: {
          conversationId: "conversation-9",
          route: "/projects/project-1?tab=details",
        },
      }),
    );
  });

  it("reuses the idempotency key when a submission is retried", async () => {
    vi.mocked(submitFeedback)
      .mockRejectedValueOnce(new Error("Network interrupted"))
      .mockResolvedValueOnce({ id: "feedback-1" } as never);
    const user = userEvent.setup();
    renderAIFeedback();

    await user.type(
      screen.getByLabelText("platform:FEEDBACK_DIALOG_MESSAGE_LABEL"),
      "The assistant response omitted the requested rollout risk.",
    );
    await user.click(screen.getByRole("button", { name: "platform:FEEDBACK_AI_SEND" }));
    expect(await screen.findByText("Network interrupted")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "platform:FEEDBACK_AI_SEND" }));

    await waitFor(() => expect(submitFeedback).toHaveBeenCalledTimes(2));
    expect(
      vi.mocked(submitFeedback).mock.calls.map(([payload]) => payload.clientRequestId),
    ).toEqual(["019f6ec1-c45b-7558-9ee6-c6dcf53f4042", "019f6ec1-c45b-7558-9ee6-c6dcf53f4042"]);
  });
});
