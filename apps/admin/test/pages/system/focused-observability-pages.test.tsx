import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SystemObservabilityActivityPage } from "@/pages/system/observability/activity/page";
import { SystemObservabilityAIUsagePage } from "@/pages/system/observability/ai-usage/page";
import { SystemObservabilityRequestsPage } from "@/pages/system/observability/requests/page";

const hooks = vi.hoisted(() => ({
  overview: vi.fn(),
  trend: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, search }: React.PropsWithChildren<{ to: string; search?: unknown }>) => (
    <a href={to} data-search={JSON.stringify(search)}>
      {children}
    </a>
  ),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));
vi.mock("@/pages/system/observability/hooks", () => ({
  useSystemObservabilityOverview: (...args: unknown[]) => hooks.overview(...args),
  useSystemObservabilityTrend: (...args: unknown[]) => hooks.trend(...args),
}));
vi.mock("@/layouts/page-shell/default-page", () => ({
  DefaultPage: ({
    title,
    action,
    children,
  }: React.PropsWithChildren<{ title: string; action?: React.ReactNode }>) => (
    <main>
      <h1>{title}</h1>
      {action}
      {children}
    </main>
  ),
}));
vi.mock("@/pages/system/observability/components/page-controls", () => ({
  ObservabilityPageControls: ({
    days,
    onDaysChange,
  }: {
    days: number;
    onDaysChange: (days: 7) => void;
  }) => (
    <button type="button" onClick={() => onDaysChange(7)}>
      period:{days}
    </button>
  ),
}));
vi.mock("@/pages/system/observability/components/dashboard-layout", () => ({
  ConfigurableDashboard: ({
    widgets,
    ariaLabel,
  }: {
    widgets: Array<{ id: string; content: React.ReactNode }>;
    ariaLabel: string;
  }) => (
    <section aria-label={ariaLabel}>
      {widgets.map((widget) => (
        <div data-widget-id={widget.id} key={widget.id}>
          {widget.content}
        </div>
      ))}
    </section>
  ),
}));
vi.mock("@/pages/system/observability/components/snapshot-state-card", () => ({
  ObservabilitySnapshotStateCard: ({ error }: { error: unknown }) => (
    <div>{error ? "snapshot error" : "snapshot loading"}</div>
  ),
}));
vi.mock("@/pages/system/observability/components/metric-card", () => ({
  ObservabilityMetricCard: ({ label }: { label: string }) => <div>metric:{label}</div>,
}));
vi.mock("@/pages/system/observability/components/trend-card", () => ({
  ObservabilityTrendCard: ({ title, error }: { title: string; error?: unknown }) => (
    <div>
      trend:{title}:{error ? "error" : "ready"}
    </div>
  ),
}));
vi.mock("@/pages/system/audit-log/request-groups-table", () => ({
  RequestGroupsTable: ({ days }: { days: number }) => <div>request groups:{days}</div>,
}));
vi.mock("@/pages/system/audit-log/request-group-detail-dialog", () => ({
  RequestGroupDetailDialog: () => null,
}));
vi.mock("@/pages/system/observability/ai-usage/ai-usage-groups-table", () => ({
  AIUsageGroupsTable: ({ days }: { days: number }) => <div>AI groups:{days}</div>,
}));
vi.mock("@/pages/system/observability/ai-usage/ai-usage-detail-dialog", () => ({
  AIUsageDetailDialog: () => null,
}));

function queryResult(data: unknown, error: unknown = null) {
  return {
    data,
    error,
    isLoading: false,
    isFetching: false,
    refetch: vi.fn().mockResolvedValue(undefined),
  };
}

describe("focused observability pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooks.overview.mockReturnValue(queryResult(undefined, new Error("snapshot unavailable")));
    hooks.trend.mockReturnValue(queryResult({ points: [{ date: "2026-07-22", value: 4 }] }));
  });

  it("keeps request trends and groups available when the overview snapshot fails", async () => {
    const user = userEvent.setup();
    const onDaysChange = vi.fn();
    render(<SystemObservabilityRequestsPage days={14} onDaysChange={onDaysChange} />);

    expect(screen.getByText("snapshot error")).toBeInTheDocument();
    expect(screen.getByText("trend:TREND_HTTP_REQUESTS:ready")).toBeInTheDocument();
    expect(screen.getByText("trend:TREND_HTTP_ERRORS:ready")).toBeInTheDocument();
    expect(screen.getByText("request groups:14")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "period:14" }));
    expect(onDaysChange).toHaveBeenCalledWith(7);
  });

  it("keeps AI trends and grouped usage available when the overview snapshot fails", () => {
    render(<SystemObservabilityAIUsagePage days={90} onDaysChange={vi.fn()} />);

    expect(screen.getByText("snapshot error")).toBeInTheDocument();
    expect(screen.getByText("trend:TREND_REQUESTS:ready")).toBeInTheDocument();
    expect(screen.getByText("trend:TREND_TOKENS:ready")).toBeInTheDocument();
    expect(screen.getByText("trend:TREND_COST:ready")).toBeInTheDocument();
    expect(screen.getByText("AI groups:90")).toBeInTheDocument();
  });

  it("keeps Activity context available when the event trend fails", () => {
    hooks.overview.mockReturnValue(
      queryResult({
        operations: { auditEvents: 18 },
        dataAvailability: {
          auditProjectAttribution: { coverageRate: 0.75, totalRecords: 20 },
        },
      }),
    );
    hooks.trend.mockReturnValue(queryResult(undefined, new Error("trend unavailable")));

    render(<SystemObservabilityActivityPage days={30} onDaysChange={vi.fn()} />);

    expect(screen.getByText("trend:TREND_AUDIT_EVENTS:error")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
    const eventsLink = screen.getByRole("link", { name: /ACTIVITY_OPEN_EVENTS/ });
    expect(eventsLink).toHaveAttribute("href", "/system/audit-log");
    expect(eventsLink).toHaveAttribute(
      "data-search",
      JSON.stringify({ view: "events", days: undefined }),
    );
  });
});
