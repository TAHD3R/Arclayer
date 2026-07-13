import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listSystemDirectoryWorkspaces } from "@/api/system-directory";
import { SystemAuditLogPage } from "@/pages/system/audit-log/page";
import type { ActivityEvent } from "@arclayer/openapi/admin-types";

const observability = vi.hoisted(() => ({
  overviewRefetch: vi.fn(async () => undefined),
  trendRefetch: vi.fn(async () => undefined),
}));

vi.mock("@/api/system-directory", () => ({ listSystemDirectoryWorkspaces: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));
vi.mock("@/layouts/page-shell/default-page", () => ({
  DefaultPage: ({
    title,
    description,
    action,
    children,
  }: {
    title?: React.ReactNode;
    description?: React.ReactNode;
    action?: React.ReactNode;
    children?: React.ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {action}
      {children}
    </main>
  ),
}));
vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/pages/system/observability/hooks", () => ({
  useSystemObservabilityOverview: () => ({
    data: {
      http: {
        requests: 120,
        errorRequests: 4,
        errorRate: 4 / 120,
        avgLatencyMs: 32,
      },
    },
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: observability.overviewRefetch,
  }),
  useSystemObservabilityTrend: (_days: number, metric: string) => ({
    data: { points: [{ date: "2026-07-13", value: 12 }] },
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: observability.trendRefetch,
    metric,
  }),
}));
vi.mock("@/pages/system/observability/components/metric-card", () => ({
  ObservabilityMetricSection: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ObservabilityMetricCard: ({ label, value }: { label: string; value: string }) => (
    <div>
      {label}:{value}
    </div>
  ),
}));
vi.mock("@/pages/system/observability/components/trend-card", () => ({
  ObservabilityTrendCard: ({ title }: { title: string }) => <div>trend:{title}</div>,
}));
vi.mock("@/pages/system/observability/components/page-controls", () => ({
  ObservabilityPageControls: ({ onRefresh }: { onRefresh: () => void }) => (
    <button type="button" onClick={onRefresh}>
      refresh audit
    </button>
  ),
}));
vi.mock("@/pages/system/audit-log/request-groups-table", () => ({
  RequestGroupsTable: ({ days }: { days: number }) => <div>request-groups:{days}</div>,
}));
vi.mock("@/pages/system/audit-log/audit-events-table", () => ({
  AuditEventsTable: ({ onSelect }: { onSelect: (event: ActivityEvent) => void }) => (
    <button
      type="button"
      onClick={() =>
        onSelect({
          id: "event-1",
          eventName: "auth.login",
          occurredAt: "2026-07-13T01:00:00Z",
          workspaceId: "workspace-1",
        } as ActivityEvent)
      }
    >
      select event
    </button>
  ),
}));
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
    vi.mocked(listSystemDirectoryWorkspaces).mockResolvedValue({
      items: [{ workspaceId: "workspace-1", name: "Production" }],
      total: 1,
      page: 1,
      size: 100,
      pages: 1,
      next: null,
      prev: null,
    } as never);
  });

  it("opens on the request analysis workbench with persisted metrics and route groups", async () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "platform:AUDIT_TITLE" })).toBeInTheDocument();
    expect(screen.getByText("request-groups:30")).toBeInTheDocument();
    expect(screen.getByText("trend:platform:TREND_HTTP_REQUESTS")).toBeInTheDocument();
    expect(screen.getByText(/platform:METRIC_HTTP_REQUESTS:120/)).toBeInTheDocument();
  });

  it("switches to canonical events and opens correlated event detail", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("tab", { name: "platform:AUDIT_VIEW_EVENTS" }));
    expect(screen.getByText("trend:platform:TREND_AUDIT_EVENTS")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "select event" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("detail:event-1:Production");
  });

  it("refreshes the overview and every trend source from one control", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "refresh audit" }));
    expect(observability.overviewRefetch).toHaveBeenCalledTimes(1);
    expect(observability.trendRefetch).toHaveBeenCalledTimes(3);
  });
});
