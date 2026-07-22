import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSystemFeedback, updateSystemFeedback, type FeedbackDetail } from "@/api/feedback";
import { FeedbackDetailSheet } from "@/pages/system/feedback/components/feedback-detail-sheet";

vi.mock("@/api/feedback", () => ({
  getSystemFeedback: vi.fn(),
  updateSystemFeedback: vi.fn(),
}));
vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
  notifySuccessText: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));
vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: ({
    loading,
    error,
    onRetry,
    children,
  }: {
    loading: boolean;
    error?: unknown;
    onRetry?: () => void;
    children?: React.ReactNode;
  }) => {
    if (loading) return <div role="status">loading detail</div>;
    if (error) {
      return (
        <div role="alert">
          detail error
          <button type="button" onClick={onRetry}>
            retry detail
          </button>
        </div>
      );
    }
    return <>{children}</>;
  },
}));
vi.mock("@/pages/system/feedback/components/feedback-user-picker", () => ({
  FeedbackUserPicker: ({
    id,
    onChange,
  }: {
    id?: string;
    onChange: (user: FeedbackDetail["assignee"]) => void;
  }) => (
    <div>
      <button
        id={id}
        type="button"
        onClick={() =>
          onChange({
            id: "admin-2",
            email: "owner@example.com",
            username: "owner",
            displayName: "Owner Two",
            avatarUrl: null,
            status: "active",
            isSuperAdmin: true,
            lastLoginAt: null,
            createdAt: "2026-01-10T08:30:00Z",
          })
        }
      >
        assign owner
      </button>
      <button type="button" onClick={() => onChange(null)}>
        clear owner
      </button>
    </div>
  ),
}));

const DETAIL: FeedbackDetail = {
  id: "feedback-1",
  clientRequestId: "request-1",
  source: "header",
  contextType: "project",
  intent: "problem",
  legacyCategory: null,
  message: "Publishing needs clearer confirmation after a release is created.",
  rating: 4,
  status: "new",
  priority: "normal",
  workspaceId: "workspace-1",
  projectId: "project-1",
  contextUrl: "/projects/project-1/releases",
  context: { route: "/projects/project-1/releases" },
  reporter: {
    id: "user-1",
    email: "reporter@example.com",
    username: "reporter",
    displayName: "Reporter One",
    avatarUrl: null,
    status: "active",
    isSuperAdmin: false,
    lastLoginAt: "2026-07-11T08:30:00Z",
    createdAt: "2026-01-12T08:30:00Z",
  },
  assignee: null,
  messages: [],
  lastActivityAt: "2026-07-12T08:30:00Z",
  firstResponseAt: null,
  resolvedAt: null,
  closedAt: null,
  createdAt: "2026-07-12T08:30:00Z",
  updatedAt: "2026-07-12T08:30:00Z",
};

function renderSheet() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FeedbackDetailSheet feedbackId="feedback-1" onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("FeedbackDetailSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSystemFeedback).mockResolvedValue(DETAIL);
    vi.mocked(updateSystemFeedback).mockResolvedValue(DETAIL);
  });

  it("updates status, priority, assignment, and explicit assignment clearing", async () => {
    const user = userEvent.setup();
    renderSheet();
    expect(await screen.findByText(DETAIL.message)).toBeVisible();
    expect(screen.getByLabelText("platform:FEEDBACK_COLUMN_ASSIGNEE")).toHaveTextContent(
      "assign owner",
    );

    await user.click(screen.getByRole("button", { name: "platform:FEEDBACK_COLUMN_ASSIGNEE" }));
    await waitFor(() =>
      expect(updateSystemFeedback).toHaveBeenCalledWith("feedback-1", {
        assigneeUserId: "admin-2",
      }),
    );
    await user.click(screen.getByRole("button", { name: "clear owner" }));
    await waitFor(() =>
      expect(updateSystemFeedback).toHaveBeenCalledWith("feedback-1", { clearAssignee: true }),
    );

    await user.click(screen.getByRole("combobox", { name: "platform:FEEDBACK_COLUMN_STATUS" }));
    await user.click(screen.getByRole("option", { name: "platform:STATUS_IN_PROGRESS" }));
    await waitFor(() =>
      expect(updateSystemFeedback).toHaveBeenCalledWith("feedback-1", {
        status: "in_progress",
      }),
    );

    await user.click(screen.getByRole("combobox", { name: "platform:FEEDBACK_COLUMN_PRIORITY" }));
    await user.click(screen.getByRole("option", { name: "platform:PRIORITY_URGENT" }));
    await waitFor(() =>
      expect(updateSystemFeedback).toHaveBeenCalledWith("feedback-1", { priority: "urgent" }),
    );
  });

  it("shows technical submission context without conversation or reply controls", async () => {
    renderSheet();
    await screen.findByText(DETAIL.message);
    await userEvent.setup().click(screen.getByText("platform:FEEDBACK_DETAIL_TECHNICAL_CONTEXT"));
    expect(screen.getByText("request-1")).toBeVisible();
    expect(screen.getByText("workspace-1")).toBeVisible();
    expect(screen.getByText("project-1")).toBeVisible();
    expect(screen.queryByRole("button", { name: "platform:ACTION_SEND" })).not.toBeInTheDocument();
    expect(screen.queryByText("platform:FEEDBACK_DETAIL_ACTIVITY")).not.toBeInTheDocument();
  });
});
