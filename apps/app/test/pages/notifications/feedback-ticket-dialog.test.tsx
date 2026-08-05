import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FeedbackTicketDialog } from "@/pages/notifications/components/feedback-ticket-dialog";

const { getMyFeedbackDetailMock } = vi.hoisted(() => ({
  getMyFeedbackDetailMock: vi.fn(),
}));

vi.mock("@/api/feedback", () => ({
  getMyFeedbackDetail: (...args: unknown[]) => getMyFeedbackDetailMock(...args),
}));

vi.mock("@/hooks/use-admin-date-time-formatter", () => ({
  useAdminDateTimeFormatter: () => ({
    formatDateTime: (value: string | null | undefined) => `date:${value ?? "none"}`,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { date?: string }) =>
      options?.date ? `${key}:${options.date}` : key,
  }),
}));

const detail = {
  id: "AbCdEfGhIjKlMnOpQrStUv",
  clientRequestId: "feedback-request-1",
  source: "page",
  contextType: "global",
  intent: "problem",
  legacyCategory: null,
  message: "The original feedback",
  rating: null,
  status: "in_progress",
  priority: "high",
  revision: 2,
  workspaceId: null,
  projectId: null,
  contextUrl: null,
  context: {},
  reporter: {
    id: "BcDeFgHiJkLmNoPqRsTuVw",
    email: "reporter@example.test",
    username: "reporter",
    displayName: "Reporter",
    avatarUrl: null,
    status: "active",
    lastLoginAt: null,
    createdAt: "2026-08-01T00:00:00.000Z",
  },
  assignee: null,
  messages: [
    {
      id: "CdEfGhIjKlMnOpQrStUvWx",
      kind: "reply",
      body: "A real support reply",
      author: {
        id: "DeFgHiJkLmNoPqRsTuVwXy",
        email: "support@example.test",
        username: "support",
        displayName: "Support Agent",
        avatarUrl: null,
        status: "active",
        lastLoginAt: null,
        createdAt: "2026-08-01T00:00:00.000Z",
      },
      deliveryState: "sent",
      deliveryFailureCode: null,
      deliveryIsRetryable: null,
      createdAt: "2026-08-02T01:00:00.000Z",
    },
  ],
  lastActivityAt: "2026-08-02T01:00:00.000Z",
  firstResponseAt: "2026-08-02T01:00:00.000Z",
  resolvedAt: null,
  closedAt: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-02T01:00:00.000Z",
} as const;

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  function Wrapper(props: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>;
  }
  return render(<FeedbackTicketDialog ticketId={detail.id} onClose={vi.fn()} />, {
    wrapper: Wrapper,
  });
}

describe("FeedbackTicketDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads the reporter-owned ticket and renders the persisted conversation", async () => {
    getMyFeedbackDetailMock.mockResolvedValue(detail);

    renderDialog();

    expect(await screen.findByText("The original feedback")).toBeVisible();
    expect(screen.getByText("A real support reply")).toBeVisible();
    expect(screen.getByText("Support Agent")).toBeVisible();
    expect(getMyFeedbackDetailMock).toHaveBeenCalledWith(detail.id);
  });

  it("exposes a retry action and recovers from an explicit load failure", async () => {
    getMyFeedbackDetailMock
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(detail);
    const user = userEvent.setup();

    renderDialog();

    expect(await screen.findByText("feedback:FEEDBACK_TICKET_LOAD_FAILED_TITLE")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "common:RETRY" }));

    expect(await screen.findByText("A real support reply")).toBeVisible();
    expect(getMyFeedbackDetailMock).toHaveBeenCalledTimes(2);
  });
});
