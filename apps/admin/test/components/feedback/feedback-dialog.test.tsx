import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { submitFeedback } from "@/api/feedback";
import { FeedbackDialog } from "@/components/feedback/feedback-dialog";
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

function renderDialog(props: { conversationId?: string; source?: "header" | "ai_sidebar" } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
  const view = render(
    <QueryClientProvider client={queryClient}>
      <FeedbackDialog
        source={props.source ?? "header"}
        conversationId={props.conversationId}
        trigger={<button type="button">Open feedback</button>}
      />
    </QueryClientProvider>,
  );
  return { ...view, invalidateQueries };
}

describe("FeedbackDialog", () => {
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

  it("validates product feedback before submitting", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Open feedback" }));
    await user.click(screen.getByRole("button", { name: "platform:ACTION_SUBMIT_FEEDBACK" }));

    expect(await screen.findByText("platform:FEEDBACK_VALIDATION_REQUIRED")).toBeInTheDocument();
    expect(submitFeedback).not.toHaveBeenCalled();
  });

  it("enforces the product minimum length before sending a request", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Open feedback" }));
    await user.type(screen.getByLabelText("platform:FEEDBACK_DIALOG_MESSAGE_LABEL"), "Too short");
    await user.click(screen.getByRole("button", { name: "platform:ACTION_SUBMIT_FEEDBACK" }));

    expect(
      await screen.findByText("platform:FEEDBACK_VALIDATION_MIN_LENGTH:10"),
    ).toBeInTheDocument();
    expect(submitFeedback).not.toHaveBeenCalled();
  });

  it("submits an idempotent project-scoped payload with route context", async () => {
    const user = userEvent.setup();
    const { invalidateQueries } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Open feedback" }));
    await user.type(
      screen.getByLabelText("platform:FEEDBACK_DIALOG_MESSAGE_LABEL"),
      "The publishing flow needs a clearer confirmation state.",
    );
    await user.click(screen.getByRole("radio", { name: "platform:RATING_4" }));
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
      rating: 4,
      contextUrl: "/projects/project-1?tab=details",
      context: {
        route: "/projects/project-1?tab=details",
      },
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["system", "feedback", "list"],
    });
  });

  it("reuses the client request id when a submission is retried", async () => {
    vi.mocked(submitFeedback)
      .mockRejectedValueOnce(new Error("Network interrupted"))
      .mockResolvedValueOnce({ id: "feedback-1" } as never);
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Open feedback" }));
    await user.type(
      screen.getByLabelText("platform:FEEDBACK_DIALOG_MESSAGE_LABEL"),
      "The publishing flow needs a clearer confirmation state.",
    );
    await user.click(screen.getByRole("button", { name: "platform:ACTION_SUBMIT_FEEDBACK" }));

    expect(await screen.findByText("Network interrupted")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "platform:ACTION_SUBMIT_FEEDBACK" }));
    await waitFor(() => expect(submitFeedback).toHaveBeenCalledTimes(2));

    const requestIds = vi
      .mocked(submitFeedback)
      .mock.calls.map(([payload]) => payload.clientRequestId);
    expect(requestIds).toEqual([
      "019f6ec1-c45b-7558-9ee6-c6dcf53f4042",
      "019f6ec1-c45b-7558-9ee6-c6dcf53f4042",
    ]);
    expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      name: "workspace",
      workspaceId: "workspace-1",
      projectId: null,
      conversationId: undefined,
      source: "header" as const,
      contextType: "workspace",
    },
    {
      name: "global",
      workspaceId: null,
      projectId: null,
      conversationId: undefined,
      source: "header" as const,
      contextType: "global",
    },
    {
      name: "AI conversation",
      workspaceId: "workspace-1",
      projectId: "project-1",
      conversationId: "conversation-9",
      source: "ai_sidebar" as const,
      contextType: "ai_conversation",
    },
  ])("submits $name context without losing route attribution", async (scenario) => {
    useWorkspaceStore.setState({
      currentWorkspaceId: scenario.workspaceId,
      lastWorkspaceId: scenario.workspaceId,
      currentProjectId: scenario.projectId,
      lastProjectId: scenario.projectId,
    });
    const user = userEvent.setup();
    renderDialog({ conversationId: scenario.conversationId, source: scenario.source });

    await user.click(screen.getByRole("button", { name: "Open feedback" }));
    await user.type(
      screen.getByLabelText("platform:FEEDBACK_DIALOG_MESSAGE_LABEL"),
      "Please improve the confirmation state for this workflow.",
    );
    await user.click(screen.getByRole("button", { name: "platform:ACTION_SUBMIT_FEEDBACK" }));

    await waitFor(() => expect(submitFeedback).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(submitFeedback).mock.calls[0]?.[0];
    expect(payload).toEqual(
      expect.objectContaining({
        clientRequestId: "019f6ec1-c45b-7558-9ee6-c6dcf53f4042",
        source: scenario.source,
        contextType: scenario.contextType,
        contextUrl: "/projects/project-1?tab=details",
        context: expect.objectContaining({
          route: "/projects/project-1?tab=details",
          ...(scenario.conversationId ? { conversationId: scenario.conversationId } : {}),
        }),
      }),
    );

    expect(payload?.workspaceId).toBe(scenario.workspaceId ?? undefined);
    expect(payload?.projectId).toBe(scenario.projectId ?? undefined);
  });
});
