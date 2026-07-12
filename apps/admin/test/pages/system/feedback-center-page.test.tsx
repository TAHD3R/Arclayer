import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FeedbackPage } from "@/api/feedback";
import { listSystemFeedback } from "@/api/feedback";
import { SystemFeedbackCenterPage } from "@/pages/system/feedback/page";

vi.mock("@/api/feedback", () => ({ listSystemFeedback: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      if (typeof values?.message === "string") return `${key}:${values.message}`;
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
  category: "usability",
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
  },
  assignee: null,
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
      name: `platform:FEEDBACK_ACTION_VIEW_ARIA:${ITEM.messagePreview}`,
    });
    const row = viewButton.closest("tr");
    expect(row).not.toBeNull();
    expect(row).not.toHaveAttribute("tabindex");
    expect(within(row!).getByText(ITEM.messagePreview)).toBeInTheDocument();

    viewButton.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog")).toHaveTextContent("detail:feedback-1");
  });

  it("sends status, search, and pagination filters to the live query", async () => {
    vi.mocked(listSystemFeedback).mockResolvedValue(page([ITEM], { total: 21, pages: 2, next: 2 }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(ITEM.messagePreview);

    await user.click(screen.getByRole("combobox", { name: "platform:FEEDBACK_COLUMN_STATUS" }));
    await user.click(screen.getByRole("option", { name: "platform:STATUS_NEW" }));
    await waitFor(() =>
      expect(listSystemFeedback).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "new", page: 1 }),
      ),
    );

    await user.type(
      screen.getByRole("textbox", { name: "platform:FEEDBACK_FILTER_SEARCH_PLACEHOLDER" }),
      "publishing",
    );
    await waitFor(
      () =>
        expect(listSystemFeedback).toHaveBeenLastCalledWith(
          expect.objectContaining({ search: "publishing", status: "new" }),
        ),
      { timeout: 1_000 },
    );

    await user.click(screen.getByRole("button", { name: "common:NEXT" }));
    await waitFor(() =>
      expect(listSystemFeedback).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, search: "publishing", status: "new" }),
      ),
    );
  });
});
