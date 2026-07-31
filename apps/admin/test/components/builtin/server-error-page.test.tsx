import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { submitFeedback } from "@/api/feedback";
import { ServerErrorView } from "@/components/builtin/server-error-page";
import { ApiError } from "@/lib/http";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

vi.mock("@/api/feedback", () => ({ submitFeedback: vi.fn() }));
vi.mock("@/components/Aurora", () => ({
  default: () => <div data-testid="aurora-canvas" />,
}));
vi.mock("@/lib/notifications", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/notifications")>();
  return { ...actual, notifySuccessText: vi.fn() };
});
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ navigate: vi.fn() }),
  useRouterState: (options: { select: (state: unknown) => unknown }) =>
    options.select({ location: { pathname: "/login", searchStr: "?redirect=%2F" } }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number }) =>
      values?.count === undefined ? key : `${key}:${String(values.count)}`,
  }),
}));

function renderServerError(error: unknown) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ServerErrorView variant="fullscreen" error={error} />
    </QueryClientProvider>,
  );
}

describe("ServerErrorView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState({
      currentWorkspaceId: null,
      lastWorkspaceId: null,
      currentProjectId: null,
      lastProjectId: null,
    });
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "019f6ec1-c45b-7558-9ee6-c6dcf53f4042",
    );
    vi.mocked(submitFeedback).mockResolvedValue({ id: "feedback-1" } as never);
  });

  it("renders the fullscreen visual hierarchy, Aurora background, and recovery actions", () => {
    const { container } = renderServerError(new Error("boom"));

    const fullscreen = container.firstElementChild;
    expect(fullscreen).toHaveClass(
      "fixed",
      "inset-0",
      "isolate",
      "overflow-y-auto",
      "bg-background",
    );
    expect(screen.getByTestId("fullscreen-result-aurora")).toHaveClass("h-1/2", "opacity-30");
    expect(screen.getByTestId("fullscreen-result-aurora")).toContainElement(
      screen.getByTestId("aurora-canvas"),
    );

    const heading = screen.getByRole("heading", {
      level: 1,
      name: "common:PAGE_SERVER_ERROR_TITLE",
    });
    expect(heading).toHaveClass("text-[clamp(2.5rem,6vw,4.5rem)]", "leading-[1.08]");
    expect(container.querySelector("[data-slot='empty-description']")).toHaveClass(
      "text-[clamp(1rem,1.6vw,1.25rem)]",
      "leading-relaxed",
    );
    expect(container.querySelector("[data-slot='empty-icon']")).toHaveAttribute(
      "data-variant",
      "icon",
    );
    expect(container.querySelector("[data-slot='empty-icon'] svg")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "common:REFRESH" })).toHaveAttribute(
      "data-size",
      "lg",
    );
    expect(screen.getByRole("button", { name: "common:REPORT_PROBLEM" })).toHaveAttribute(
      "data-size",
      "lg",
    );
  });

  it("submits the original server error metadata from the fullscreen report action", async () => {
    const user = userEvent.setup();
    renderServerError(
      new ApiError({
        status: 500,
        message: "server error",
        error: "INTERNAL_ERROR",
        meta: { traceId: "req_456" },
      }),
    );

    await user.click(screen.getByRole("button", { name: "common:REPORT_PROBLEM" }));
    await user.type(
      screen.getByLabelText("feedback:FEEDBACK_DIALOG_MESSAGE_LABEL"),
      "The full-screen error appeared while opening the application.",
    );
    await user.click(screen.getByRole("button", { name: "feedback:ACTION_SUBMIT_FEEDBACK" }));

    await waitFor(() => expect(submitFeedback).toHaveBeenCalledTimes(1));
    expect(vi.mocked(submitFeedback).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        source: "content_guard",
        contextType: "global",
        contextUrl: "/login?redirect=%2F",
        context: {
          route: "/login?redirect=%2F",
          requestId: "req_456",
          httpStatus: 500,
          errorCode: "INTERNAL_ERROR",
        },
      }),
    );
  });
});
