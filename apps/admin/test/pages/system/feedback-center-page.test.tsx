import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FeedbackPage } from "@/api/feedback";
import { listSystemFeedback, updateSystemFeedback } from "@/api/feedback";
import { SystemFeedbackCenterPage } from "@/pages/system/feedback/page";

vi.mock("@/api/feedback", () => ({
  listSystemFeedback: vi.fn(),
  updateSystemFeedback: vi.fn(),
}));
vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
  notifySuccessText: vi.fn(),
}));
vi.mock("@/hooks/use-admin-date-time-formatter", () => ({
  useAdminDateTimeFormatter: () => ({ formatDateTime: (value: string) => `date:${value}` }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      if (typeof values?.message === "string") return `${key}:${values.message}`;
      if (typeof values?.count === "number") return `${key}:${values.count}`;
      if (values?.page && values?.pages) return `${key}:${values.page}/${values.pages}`;
      return key;
    },
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));
vi.mock("@/layouts/page-shell/default-page", () => ({
  DefaultPage: ({
    title,
    description,
    extra,
    children,
  }: {
    title?: React.ReactNode;
    description?: React.ReactNode;
    extra?: React.ReactNode;
    children?: React.ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {extra}
      {children}
    </main>
  ),
}));
vi.mock("@/layouts/page-shell/page-extra-toolbar", () => ({
  PageExtraToolbar: ({
    leading,
    trailing,
  }: {
    leading?: React.ReactNode;
    trailing?: React.ReactNode;
  }) => (
    <div>
      {leading}
      {trailing}
    </div>
  ),
}));
vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: ({
    loading,
    error,
    empty,
    emptyTitle,
    onRetry,
    children,
  }: {
    loading: boolean;
    error?: unknown;
    empty?: boolean;
    emptyTitle?: React.ReactNode;
    onRetry?: () => void;
    children?: React.ReactNode;
  }) => {
    if (loading) return <div role="status">loading</div>;
    if (error) {
      return (
        <div role="alert">
          request error
          <button type="button" onClick={onRetry}>
            retry
          </button>
        </div>
      );
    }
    if (empty) return <div>{emptyTitle}</div>;
    return <>{children}</>;
  },
}));
vi.mock("@/components/common/data-table-search-input", () => ({
  DataTableSearchInput: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
  }) => (
    <input
      aria-label={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));
vi.mock("@/pages/system/feedback/components/feedback-detail-sheet", () => ({
  FeedbackDetailSheet: ({ feedbackId }: { feedbackId: string | null }) =>
    feedbackId ? <div role="dialog">detail:{feedbackId}</div> : null,
}));

const ITEM = {
  id: "feedback-1",
  clientRequestId: "request-1",
  source: "header",
  contextType: "project",
  intent: "problem",
  legacyCategory: null,
  messagePreview: "Publishing needs clearer confirmation",
  rating: 4,
  status: "new",
  priority: "high",
  workspaceId: "workspace-1",
  projectId: "project-1",
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
  assignee: {
    id: "admin-1",
    email: "owner@example.com",
    username: "owner",
    displayName: "Owner One",
    avatarUrl: null,
    status: "active",
    isSuperAdmin: true,
    lastLoginAt: "2026-07-12T07:30:00Z",
    createdAt: "2025-12-12T08:30:00Z",
  },
  messageCount: 0,
  lastActivityAt: "2026-07-12T08:30:00Z",
  firstResponseAt: null,
  resolvedAt: null,
  closedAt: null,
  createdAt: "2026-07-12T08:30:00Z",
  updatedAt: "2026-07-12T08:30:00Z",
} as const;

function page(
  items: FeedbackPage["items"] = [ITEM],
  overrides: Partial<FeedbackPage> = {},
): FeedbackPage {
  return {
    items,
    total: items.length,
    page: 1,
    size: 20,
    pages: 1,
    next: null,
    prev: null,
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SystemFeedbackCenterPage />
    </QueryClientProvider>,
  );
}

describe("SystemFeedbackCenterPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("PointerEvent", MouseEvent);
    vi.mocked(updateSystemFeedback).mockImplementation(
      async (_id, payload) =>
        ({
          ...ITEM,
          ...payload,
          message: ITEM.messagePreview,
          contextUrl: null,
          context: {},
          messages: [],
        }) as never,
    );
  });

  it("exposes loading, error retry, and empty states", async () => {
    let rejectRequest: ((reason: Error) => void) | undefined;
    vi.mocked(listSystemFeedback).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectRequest = reject;
        }),
    );
    renderPage();
    expect(screen.getByText("loading", { selector: "div" })).toBeInTheDocument();

    rejectRequest?.(new Error("network"));
    expect(await screen.findByRole("alert")).toHaveTextContent("request error");

    vi.mocked(listSystemFeedback).mockResolvedValueOnce(page([]));
    await userEvent.setup().click(screen.getByRole("button", { name: "retry" }));
    expect(await screen.findByText("platform:FEEDBACK_EMPTY_TITLE")).toBeInTheDocument();
  });

  it("renders live rows and opens details through a real keyboard-operable button", async () => {
    vi.mocked(listSystemFeedback).mockResolvedValue(page());
    const user = userEvent.setup();
    renderPage();

    const viewButton = await screen.findByRole("button", {
      name: "platform:FEEDBACK_ACTION_DETAILS",
    });
    const row = viewButton.closest("tr");
    expect(row).not.toBeNull();
    expect(row).not.toHaveAttribute("tabindex");
    expect(within(row!).getByText(ITEM.messagePreview)).toHaveClass("truncate");
    expect(screen.queryByText("platform:FEEDBACK_ACTION_VIEW")).not.toBeInTheDocument();

    viewButton.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog")).toHaveTextContent("detail:feedback-1");
  });

  it("shows user identity cards and supports row plus bulk handling actions", async () => {
    vi.mocked(listSystemFeedback).mockResolvedValue(page());
    const user = userEvent.setup();
    renderPage();

    const reporter = await screen.findByRole("button", { name: "Reporter One" });
    expect(screen.getByRole("button", { name: "Owner One" })).toBeVisible();
    await user.hover(reporter);
    expect(await screen.findByText("reporter@example.com")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "platform:FEEDBACK_ACTION_MORE" }));
    await user.click(screen.getByRole("menuitem", { name: "platform:FEEDBACK_ACTION_START" }));
    await waitFor(() =>
      expect(updateSystemFeedback).toHaveBeenCalledWith("feedback-1", {
        status: "in_progress",
      }),
    );
    expect(await screen.findByText("platform:STATUS_IN_PROGRESS")).toBeVisible();

    await user.click(
      screen.getByRole("checkbox", {
        name: `platform:FEEDBACK_SELECT_ROW:${ITEM.messagePreview}`,
      }),
    );
    await waitFor(() =>
      expect(screen.getByText("platform:FEEDBACK_SELECTED_COUNT:1")).toBeVisible(),
    );
    await user.click(screen.getByRole("button", { name: "platform:FEEDBACK_ACTION_RESOLVE" }));
    await waitFor(() =>
      expect(updateSystemFeedback).toHaveBeenLastCalledWith("feedback-1", {
        status: "resolved",
      }),
    );
  });

  it("sends ordering and search through the shared DataTable query", async () => {
    vi.mocked(listSystemFeedback).mockResolvedValue(page());
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(ITEM.messagePreview);

    expect(screen.getByRole("button", { name: "platform:FEEDBACK_FILTER_TITLE" })).toBeVisible();
    await user.click(screen.getByRole("combobox", { name: "platform:FEEDBACK_ORDER_LABEL" }));
    await user.click(
      screen.getByRole("option", { name: "platform:FEEDBACK_ORDER_CREATED_NEWEST" }),
    );
    await waitFor(() =>
      expect(listSystemFeedback).toHaveBeenLastCalledWith(
        expect.objectContaining({ ordering: "-created_at", page: 1 }),
      ),
    );

    await user.type(
      screen.getByRole("textbox", { name: "platform:FEEDBACK_FILTER_SEARCH_PLACEHOLDER" }),
      "publishing",
    );
    await waitFor(
      () =>
        expect(listSystemFeedback).toHaveBeenLastCalledWith(
          expect.objectContaining({ search: "publishing", ordering: "-created_at" }),
        ),
      { timeout: 1_000 },
    );

    expect(await screen.findByText("Reporter One")).toHaveClass("truncate");
  });
});
