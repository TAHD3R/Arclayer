import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SystemPlatformOverviewPage } from "@/pages/system/overview/page";

const { overviewHook, trendHook } = vi.hoisted(() => ({
  overviewHook: vi.fn(),
  trendHook: vi.fn(),
}));

vi.mock("@/pages/system/observability/hooks", () => ({
  useSystemObservabilityOverview: (...args: unknown[]) => overviewHook(...args),
  useSystemObservabilityTrend: (...args: unknown[]) => trendHook(...args),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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
vi.mock("@/pages/system/observability/components/page-controls", () => ({
  ObservabilityPageControls: ({
    days,
    onDaysChange,
  }: {
    days: number;
    onDaysChange: (days: 14) => void;
  }) => (
    <button type="button" onClick={() => onDaysChange(14)}>
      period:{days}
    </button>
  ),
}));
vi.mock("@/pages/system/overview/dashboard-widgets", () => ({
  usePlatformDashboardSummaryWidgets: (options: {
    overview?: { resources: { activeWorkspaces: number } };
    loading: boolean;
    error: unknown;
  }) =>
    options.overview
      ? [
          {
            id: "summary-workspaces",
            title: "summary",
            content: <div>summary-workspaces:{options.overview.resources.activeWorkspaces}</div>,
          },
        ]
      : [
          {
            id: "summary-state",
            title: "summary state",
            content: <div>{options.loading ? "overview loading" : "overview error"}</div>,
          },
        ],
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
        <div key={widget.id}>{widget.content}</div>
      ))}
    </section>
  ),
}));
vi.mock("@/pages/system/observability/components/trend-card", () => ({
  ObservabilityTrendCard: ({
    title,
    points,
  }: {
    title: string;
    points?: Array<{ value: number }>;
  }) => (
    <div>
      trend:{title}:{points?.[0]?.value}
    </div>
  ),
}));

const METRIC_VALUES: Record<string, number> = {
  httpErrors: 101,
  cost: 303,
  auditEvents: 404,
};

function queryResult(data: unknown) {
  return {
    data,
    error: null,
    isLoading: false,
    isFetching: false,
    refetch: vi.fn().mockResolvedValue(undefined),
  };
}

describe("SystemPlatformOverviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    overviewHook.mockReturnValue(queryResult({ resources: { activeWorkspaces: 17 } }));
    trendHook.mockImplementation((_days: number, metric: string) =>
      queryResult({ points: [{ date: "2026-07-12", value: METRIC_VALUES[metric] }] }),
    );
  });

  it("combines the live overview with every commercial and operational trend", () => {
    const onDaysChange = vi.fn();
    render(<SystemPlatformOverviewPage days={30} onDaysChange={onDaysChange} />);

    expect(overviewHook).toHaveBeenCalledWith(30);
    expect(trendHook.mock.calls).toEqual([
      [30, "httpErrors"],
      [30, "cost"],
      [30, "auditEvents"],
    ]);
    expect(screen.getByText("summary-workspaces:17")).toBeInTheDocument();
    expect(screen.getByText("trend:TREND_HTTP_ERRORS:101")).toBeInTheDocument();
    expect(screen.getByText("trend:TREND_COST:303")).toBeInTheDocument();
    expect(screen.getByText("trend:TREND_AUDIT_EVENTS:404")).toBeInTheDocument();
  });

  it("keeps overview loading and error states explicit", () => {
    overviewHook.mockReturnValueOnce({ ...queryResult(undefined), isLoading: true });
    const { rerender } = render(<SystemPlatformOverviewPage days={30} onDaysChange={vi.fn()} />);
    expect(screen.getByText("overview loading")).toBeInTheDocument();

    overviewHook.mockReturnValueOnce({ ...queryResult(undefined), error: new Error("network") });
    rerender(<SystemPlatformOverviewPage days={30} onDaysChange={vi.fn()} />);
    expect(screen.getByText("overview error")).toBeInTheDocument();
  });
});
