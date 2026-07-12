import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listSystemActivity } from "@/api/activity";
import { listSystemDirectoryUsers, listSystemDirectoryWorkspaces } from "@/api/system-directory";
import { SystemAuditLogPage } from "@/pages/system/audit-log/page";
import type { ActivityEvent } from "@arclayer/openapi/admin-types";

const { infiniteScrollState } = vi.hoisted(() => ({
  infiniteScrollState: {
    options: null as null | { fetchNextPage: () => Promise<unknown>; hasNextPage: boolean },
  },
}));

vi.mock("@/api/activity", () => ({ listSystemActivity: vi.fn() }));
vi.mock("@/api/system-directory", () => ({
  listSystemDirectoryUsers: vi.fn(),
  listSystemDirectoryWorkspaces: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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
    if (loading) return <div>audit loading</div>;
    if (error)
      return (
        <div role="alert">
          audit error
          <button type="button" onClick={onRetry}>
            retry audit
          </button>
        </div>
      );
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
vi.mock("@/pages/workspaces/shared/activity/components/activity-filter-popover", () => ({
  ActivityFilterPopover: ({
    onApply,
    fetchUserOptions,
  }: {
    onApply: (value: { workspaceId: string; actorUserId: string }) => void;
    fetchUserOptions: (workspaceId: string, query: string) => Promise<unknown>;
  }) => (
    <div>
      <button
        type="button"
        onClick={() => onApply({ workspaceId: "workspace-2", actorUserId: "user-2" })}
      >
        apply audit filters
      </button>
      <button type="button" onClick={() => void fetchUserOptions("workspace-2", "alex")}>
        load actor options
      </button>
    </div>
  ),
}));
vi.mock("@/pages/workspaces/shared/activity/components/activity-timeline", async () => {
  const { resolveCatalogEntry } = await vi.importActual<
    typeof import("@/pages/workspaces/shared/activity/constants")
  >("@/pages/workspaces/shared/activity/constants");

  return {
    ActivityTimeline: ({
      items,
      onSelect,
    }: {
      items: ActivityEvent[];
      onSelect: (event: ActivityEvent) => void;
    }) => (
      <div>
        {items.map((item) => {
          const catalog = resolveCatalogEntry(item.eventName);
          return (
            <button
              key={item.id}
              type="button"
              aria-label={`event:${item.eventName}`}
              onClick={() => onSelect(item)}
            >
              {catalog ? `catalog:${catalog.titleKey}` : `unmapped:${item.eventName}`}
            </button>
          );
        })}
      </div>
    ),
  };
});
vi.mock("@/pages/workspaces/shared/activity/components/activity-detail-dialog", () => ({
  ActivityDetailDialog: ({
    open,
    event,
    workspaceLabelById,
  }: {
    open: boolean;
    event: ActivityEvent | null;
    workspaceLabelById: Record<string, string>;
  }) =>
    open && event ? (
      <div role="dialog">
        detail:{event.id}:{workspaceLabelById[event.workspaceId ?? ""]}
      </div>
    ) : null,
}));
vi.mock("@/pages/workspaces/shared/activity/hooks/use-activity-infinite-scroll", () => ({
  useActivityInfiniteScroll: (options: {
    fetchNextPage: () => Promise<unknown>;
    hasNextPage: boolean;
  }) => {
    infiniteScrollState.options = options;
  },
}));

const EVENT = {
  id: "event-1",
  eventName: "auth.login.succeeded",
  source: "auth",
  occurredAt: "2026-07-12T08:30:00Z",
  workspaceId: "workspace-1",
  actorUserId: "user-1",
  subjectUserId: null,
  entityType: null,
  entityId: null,
  traceId: "trace-1",
  properties: {},
  actor: null,
  subject: null,
} as ActivityEvent;

const PRODUCTIZED_AUDIT_ACTIONS = [
  "commerce.subscription_change.rejected",
  "commerce.subscription_change.requested",
  "commerce.subscription_change.approved",
  "auth.login",
  "project.archived",
  "content.model.created",
  "deployment.promoted",
  "release.published",
  "content.item.published",
  "content.item.created",
  "project.settings.updated",
  "project.created",
] as const;

const WORKSPACE = {
  workspaceId: "workspace-1",
  name: "Production workspace",
  description: null,
  owner: null,
  isActive: true,
  isArchived: false,
  memberCount: 2,
  projectCount: 1,
  createdAt: "2026-07-01T00:00:00Z",
};

function activityPage(items: ActivityEvent[], next: number | null = null) {
  return {
    items,
    total: items.length,
    page: next ? 1 : 2,
    size: 20,
    pages: next ? 2 : 2,
    next,
    prev: null,
  };
}

function workspacePage(items = [WORKSPACE], next: number | null = null) {
  return {
    items,
    total: items.length,
    page: next ? 1 : 2,
    size: 100,
    pages: next ? 2 : 2,
    next,
    prev: null,
  } as never;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SystemAuditLogPage />
    </QueryClientProvider>,
  );
}

describe("SystemAuditLogPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    infiniteScrollState.options = null;
    vi.mocked(listSystemDirectoryWorkspaces).mockResolvedValue(workspacePage());
    vi.mocked(listSystemDirectoryUsers).mockResolvedValue({
      items: [
        {
          userId: "user-2",
          username: "alex",
          displayName: "Alex",
          email: "alex@example.com",
          avatarUrl: null,
        },
      ],
      total: 1,
      page: 1,
      size: 20,
      pages: 1,
      next: null,
      prev: null,
    } as never);
  });

  it("exposes loading, error retry, and empty audit states", async () => {
    let rejectRequest: ((reason: Error) => void) | undefined;
    vi.mocked(listSystemActivity).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectRequest = reject;
        }),
    );
    renderPage();
    expect(screen.getByText("audit loading")).toBeInTheDocument();

    await act(async () => rejectRequest?.(new Error("network")));
    expect(await screen.findByRole("alert")).toHaveTextContent("audit error");
    vi.mocked(listSystemActivity).mockResolvedValueOnce(activityPage([]));
    await userEvent.setup().click(screen.getByRole("button", { name: "retry audit" }));
    expect(await screen.findByText("platform:AUDIT_EMPTY_TITLE")).toBeInTheDocument();
  });

  it("applies search/workspace/actor filters and opens event details with workspace attribution", async () => {
    vi.mocked(listSystemActivity).mockResolvedValue(activityPage([EVENT]));
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("button", { name: "event:auth.login.succeeded" });

    await user.type(
      screen.getByRole("textbox", { name: "activity:ACTIVITY_FILTER_EVENT_NAME_PLACEHOLDER" }),
      "settings.updated",
    );
    await waitFor(() =>
      expect(listSystemActivity).toHaveBeenLastCalledWith(
        expect.objectContaining({ eventName: "settings.updated" }),
      ),
    );

    await user.click(screen.getByRole("button", { name: "apply audit filters" }));
    await waitFor(() =>
      expect(listSystemActivity).toHaveBeenLastCalledWith(
        expect.objectContaining({ workspaceId: "workspace-2", actorUserId: "user-2" }),
      ),
    );
    await user.click(screen.getByRole("button", { name: "load actor options" }));
    await waitFor(() =>
      expect(listSystemDirectoryUsers).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: "workspace-2", q: "alex" }),
      ),
    );

    await user.click(screen.getByRole("button", { name: "event:auth.login.succeeded" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("detail:event-1:Production workspace");
  });

  it("loads every workspace page and requests the next audit page through infinite scrolling", async () => {
    vi.mocked(listSystemDirectoryWorkspaces)
      .mockResolvedValueOnce(workspacePage([WORKSPACE], 2))
      .mockResolvedValueOnce(
        workspacePage([{ ...WORKSPACE, workspaceId: "workspace-2", name: "Staging workspace" }]),
      );
    vi.mocked(listSystemActivity)
      .mockResolvedValueOnce(activityPage([EVENT], 2))
      .mockResolvedValueOnce(
        activityPage([{ ...EVENT, id: "event-2", eventName: "settings.updated" }]),
      );
    renderPage();
    await screen.findByRole("button", { name: "event:auth.login.succeeded" });

    await waitFor(() => expect(listSystemDirectoryWorkspaces).toHaveBeenCalledTimes(2));
    expect(listSystemDirectoryWorkspaces).toHaveBeenNthCalledWith(2, {
      page: 2,
      size: 100,
      ordering: "name",
    });
    expect(infiniteScrollState.options?.hasNextPage).toBe(true);
    await act(async () => {
      await infiniteScrollState.options?.fetchNextPage();
    });
    expect(
      await screen.findByRole("button", { name: "event:settings.updated" }),
    ).toBeInTheDocument();
    expect(listSystemActivity).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
  });

  it("renders common platform audit actions through productized catalog entries", async () => {
    vi.mocked(listSystemActivity).mockResolvedValue(
      activityPage(
        PRODUCTIZED_AUDIT_ACTIONS.map(
          (eventName, index) =>
            ({ ...EVENT, id: `event-productized-${index}`, eventName }) as ActivityEvent,
        ),
      ),
    );

    renderPage();

    expect(await screen.findAllByText(/^catalog:ACTIVITY_EVENT_/)).toHaveLength(
      PRODUCTIZED_AUDIT_ACTIONS.length,
    );
    expect(screen.queryByText(/^unmapped:/)).not.toBeInTheDocument();
  });
});
